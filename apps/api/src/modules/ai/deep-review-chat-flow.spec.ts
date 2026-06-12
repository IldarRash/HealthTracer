/**
 * Deep-review chat-flow tests (Phase 4) — table-driven, end-to-end mocked turns.
 *
 * Unlike agent-orchestrator-fanout.spec.ts (which mocks the planner and domain
 * executor), this harness runs the REAL deterministic spine:
 *
 *   MessagePreprocessorService (real, RU lookback detection)
 *     → SystemPlannerService (real, deep_history profile + slice injection)
 *       → DomainLlmExecutorService (real, per-domain loop + allowlists)
 *         → DecisionMakerExecutorService (real)
 *           → ActionResolverService + ActionVariantCatalogService (real)
 *
 * Only the boundaries are mocked: the router LLM result, the coaching-context
 * packet (DB-backed), compression, and the OpenAI provider (via
 * createCoachAiProviderMock from @health/ai/testing — no live LLM calls).
 *
 * Covers:
 *  1. RU «проанализируй последние полгода…» → both selected domains receive the
 *     progress-history slice + the deepReview block; the decision request carries
 *     the same block; review candidates under allowed intents survive resolution.
 *  2. "change my plan directly without asking" → the pipeline still produces a
 *     TYPED PROPOSAL (approval-gated), never a direct write; no deepReview block.
 *  3. Adversarial «какая болезнь это вызвала» → a diagnostic synthesized reply is
 *     blocked by the reply-safety floor (typed turnError, proposals zeroed).
 *  4. Floors: no documentContext/ragResults reach domain or decision requests on
 *     a deep-review turn (allowDocuments=false stays denied).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentContextPacket,
  DomainLlmStepRequest,
  FinalDecisionRequest,
  ProgressHistoryReviewSummary,
} from "@health/types";
import { routerDecisionOutputSchema } from "@health/types";
import type { ClerkAuthContext } from "../../auth.types.js";
import type { CoachingContextService } from "../coaching-context/coaching-context.service.js";
import type { ContextCompressionService } from "../coaching-context/context-compression.service.js";
import type { ContextExpansionPolicyService } from "../coaching-context/context-expansion-policy.service.js";
import { ActionResolverService } from "./action-resolver.service.js";
import { ActionVariantCatalogService } from "./action-variant-catalog.service.js";
import { AgentOrchestratorService } from "./agent-orchestrator.service.js";
import { DecisionMakerExecutorService } from "./decision-maker-executor.service.js";
import { DomainLlmExecutorService } from "./domain-llm-executor.service.js";
import { MessagePreprocessorService } from "./message-preprocessor.service.js";
import type { RouterLlmService, RouterLlmResult } from "./router-llm.service.js";
import { createAiPolicyTestStack } from "./test-ai-behavior-fixtures.js";
import type { AgentToolRegistryService } from "./agent-tool-registry.service.js";
import type { ChatAttachmentsService } from "../chat-attachments/chat-attachments.service.js";
import type { AttachmentTextExtractionService } from "../chat-attachments/attachment-text-extraction.service.js";

// ---------------------------------------------------------------------------
// Provider mock — shared vi.fn()s wired through the mocked factory so the
// orchestrator's internal provider delegates to per-test implementations.
// ---------------------------------------------------------------------------

const providerMocks = vi.hoisted(() => ({
  generateRouterDecision: vi.fn(),
  generateDomainStep: vi.fn(),
  generateFinalDecision: vi.fn(),
}));

vi.mock("./coach-provider.factory.js", async () => {
  const { createCoachAiProviderMock } = await import("@health/ai/testing");

  return {
    createCoachAiProvider: vi.fn(() => createCoachAiProviderMock(providerMocks)),
    resolveAiCoachProviderMode: vi.fn(() => "openai" as const),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAuth(): ClerkAuthContext {
  return { clerkUserId: "clerk_flow_001", email: "flow@example.com", displayName: "Flow" };
}

/** Numeric-only review summary: all-sufficient so compression drives the worst-of. */
const REVIEW_SUMMARY: ProgressHistoryReviewSummary = {
  requestedPeriodDays: 180,
  grantedPeriodDays: 180,
  granularity: "weekly",
  buckets: [],
  planChangeMarkers: [],
  dataSufficiency: {
    workout: "sufficient",
    habits: "sufficient",
    recovery: "sufficient",
    wellbeing: "sufficient",
  },
  coveredDays: 150,
  noteCodes: [],
};

function makeContextPacket(opts: { withProgressHistory: boolean }): AgentContextPacket {
  const generatedAt = new Date().toISOString();

  return {
    purpose: "weekly_review",
    depth: "large",
    timeRange: "30d",
    intent: "review_progress",
    generatedAt,
    safetyConstraints: ["Do not diagnose, prescribe, or claim to treat diseases."],
    missingContextNotes: [],
    sourceRefs: [],
    supplementarySlices: opts.withProgressHistory
      ? [
          {
            purpose: "progress_history_review",
            depth: "large",
            timeRange: "1y",
            generatedAt,
            relevantMemories: [],
            snapshots: [],
            recommendationConstraints: [],
            sourceRefs: [],
            progressHistory: REVIEW_SUMMARY,
          },
        ]
      : [],
    slice: {
      purpose: "weekly_review",
      depth: "large",
      timeRange: "30d",
      generatedAt,
      relevantMemories: [],
      snapshots: [],
      recommendationConstraints: [],
      sourceRefs: [],
    } as unknown as AgentContextPacket["slice"],
  } as unknown as AgentContextPacket;
}

function makeRouterResult(
  domains: Array<{ domain: "workout" | "nutrition" | "health"; intentHints?: string[] }>,
): RouterLlmResult {
  return {
    output: routerDecisionOutputSchema.parse({
      selectedDomains: domains.map((d) => ({
        domain: d.domain,
        confidence: 0.9,
        intentHints: d.intentHints ?? [],
        toolHints: [],
        signalHints: [],
      })),
      safetyFlags: [],
      confidence: 0.9,
    }),
    source: "llm",
    validationErrors: [],
  };
}

/** Review candidate citing concrete bucket evidence in its reason (catalog rule). */
const REVIEW_CANDIDATE = {
  intent: "adapt_workout_plan_from_progress",
  targetDomain: "workout",
  title: "Лёгкий восстановительный блок",
  reason:
    "С 2026-01-05 по 2026-03-30 выполнение тренировок упало с 85% до 40% при росте усталости — предлагаю снизить нагрузку.",
  proposedChanges: {
    plan: {
      title: "Восстановительный блок",
      summary: "Сниженная нагрузка на 4 недели.",
      days: [
        {
          weekday: "monday" as const,
          focus: "Recovery",
          exercises: [{ name: "Walk", sets: 1, reps: "30 min" }],
        },
      ],
      notes: [],
    },
  },
};

const DIRECT_MUTATION_CANDIDATE = {
  intent: "adapt_workout_plan",
  targetDomain: "workout",
  title: "Adjusted plan",
  reason: "User asked to change the plan; changes require approval.",
  proposedChanges: {
    title: "Adjusted plan",
    summary: "Lighter sessions.",
    days: [
      {
        weekday: "monday" as const,
        focus: "Recovery",
        exercises: [{ name: "Walk", sets: 1, reps: "30 min" }],
      },
    ],
    notes: [],
  },
};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeOrchestrator(opts: {
  routerResult: RouterLlmResult;
  contextPacket: AgentContextPacket;
}): AgentOrchestratorService {
  const stack = createAiPolicyTestStack();

  const coachingContextService = {
    buildAgentContext: vi.fn().mockResolvedValue(opts.contextPacket),
    toAgentPromptContext: vi.fn().mockImplementation((packet: AgentContextPacket) => {
      const progressHistory = [packet.slice, ...packet.supplementarySlices]
        .map((slice) => slice.progressHistory)
        .find((summary) => summary !== undefined);

      return {
        agentContext: {},
        ...(progressHistory !== undefined ? { progressHistory } : {}),
      };
    }),
  } as unknown as CoachingContextService;

  const contextCompressionService = {
    compressForTurn: vi.fn().mockResolvedValue({
      summary: { dataQuality: "partial" },
      notes: [],
    }),
  } as unknown as ContextCompressionService;

  const contextExpansionPolicyService = {
    createPolicySnapshot: vi.fn().mockReturnValue({}),
  } as unknown as ContextExpansionPolicyService;

  const routerLlmService = {
    route: vi.fn().mockResolvedValue(opts.routerResult),
  } as unknown as RouterLlmService;

  const messagePreprocessorService = new MessagePreprocessorService(
    stack.directChatPathMatcherService,
  );

  // Real domain executor — tool registry/attachments are unused in these turns.
  const domainLlmExecutorService = new DomainLlmExecutorService(
    { executeTool: vi.fn() } as unknown as AgentToolRegistryService,
    { readStoredContent: vi.fn() } as unknown as ChatAttachmentsService,
  );

  const attachmentTextExtractionService = {
    extractTurnAttachmentTexts: vi.fn().mockResolvedValue(new Map()),
  } as unknown as AttachmentTextExtractionService;

  return new AgentOrchestratorService(
    coachingContextService,
    contextCompressionService,
    contextExpansionPolicyService,
    stack.systemPlannerService,
    stack.aiBehaviorConfigService,
    messagePreprocessorService,
    routerLlmService,
    domainLlmExecutorService,
    new ActionResolverService(),
    new DecisionMakerExecutorService(),
    new ActionVariantCatalogService(),
    attachmentTextExtractionService,
    // Returns undefined → no precomputed summary; the mocked
    // coachingContextService already serves the progress-history packet.
    { buildReviewSummaryForAuth: vi.fn() } as never,
  );
}

function mockDomainAnswers(
  capturedDomainRequests: DomainLlmStepRequest[],
  candidatesByDomain: Partial<Record<string, Array<Record<string, unknown>>>>,
): void {
  providerMocks.generateDomainStep.mockImplementation(
    async (request: DomainLlmStepRequest) => {
      capturedDomainRequests.push(request);

      return {
        output: {
          kind: "domain_answer" as const,
          domain: request.domain,
          summary: `Observed ${request.domain} trends over the analyzed range.`,
          candidateProposals: candidatesByDomain[request.domain] ?? [],
          domainSignals: [],
        },
      };
    },
  );
}

function mockFinalDecision(
  capture: (request: FinalDecisionRequest) => void,
  output: {
    reply: string;
    selectedAction: string | null;
    selectedProposalIds: string[];
  },
): void {
  providerMocks.generateFinalDecision.mockImplementation(
    async (request: FinalDecisionRequest) => {
      capture(request);

      return { output: { ...output, consentRequired: false } };
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("deep-review chat flow (Phase 4 — end-to-end mocked turns)", () => {
  beforeEach(() => {
    providerMocks.generateRouterDecision.mockReset();
    providerMocks.generateDomainStep.mockReset();
    providerMocks.generateFinalDecision.mockReset();
  });

  it("RU six-month review: both domains get the progress-history slice + deepReview; decision carries deepReview; review candidate survives resolution", async () => {
    const capturedDomainRequests: DomainLlmStepRequest[] = [];
    let capturedDecisionRequest: FinalDecisionRequest | undefined;

    mockDomainAnswers(capturedDomainRequests, {
      workout: [REVIEW_CANDIDATE as unknown as Record<string, unknown>],
      health: [],
    });
    mockFinalDecision(
      (request) => {
        capturedDecisionRequest = request;
      },
      {
        reply:
          "За последние 180 дней видно снижение выполнения тренировок при росте усталости. " +
          "Данные за этот период частичные — могу сузить разбор до последних 6 недель.",
        selectedAction: "adapt_workout_plan_from_progress",
        selectedProposalIds: ["cand_workout_0"],
      },
    );

    const orchestrator = makeOrchestrator({
      routerResult: makeRouterResult([
        { domain: "health", intentHints: [] },
        { domain: "workout", intentHints: ["review_workout_progress"] },
      ]),
      contextPacket: makeContextPacket({ withProgressHistory: true }),
    });

    const result = await orchestrator.orchestrateCoachTurn({
      auth: makeAuth(),
      userMessage: "проанализируй последние полгода — как тренировки повлияли на восстановление",
      recentMessages: [],
    });

    // Both selected domains ran (health + workout), each with one LLM step.
    const domains = capturedDomainRequests.map((r) => r.domain).sort();
    expect(domains).toEqual(["health", "workout"]);

    // The expected deepReview block: planner-detected «полгода» → 180/180; the
    // summary is all-sufficient so the compression "partial" drives the worst-of.
    const expectedDeepReview = {
      requestedPeriodDays: 180,
      grantedPeriodDays: 180,
      dataQuality: "partial",
    };

    for (const request of capturedDomainRequests) {
      // Every domain request carries the deepReview block...
      expect(request.deepReview).toEqual(expectedDeepReview);
      // ...and the progress-history numeric slice in its coaching context.
      expect(
        (request.coachingContext as Record<string, unknown>).progressHistory,
      ).toBeDefined();
    }

    // The decision request carries the same block.
    expect(capturedDecisionRequest?.deepReview).toEqual(expectedDeepReview);

    // The review candidate under the allowed review_progress intents survived
    // selection-by-ID + the union-allowlist filter into the final output.
    expect(result.turnError).toBeUndefined();
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan_from_progress");

    // The boolean-only diagnostic surfaces on the decision diagnostics.
    expect(result.agentMetadata.fanOut?.decision?.deepReview).toBe(true);
  });

  it("floors: no documentContext/ragResults text reaches domain or decision requests on a deep-review turn", async () => {
    const capturedDomainRequests: DomainLlmStepRequest[] = [];
    let capturedDecisionRequest: FinalDecisionRequest | undefined;

    mockDomainAnswers(capturedDomainRequests, { workout: [], health: [] });
    mockFinalDecision(
      (request) => {
        capturedDecisionRequest = request;
      },
      { reply: "Честный обзор по агрегатам.", selectedAction: null, selectedProposalIds: [] },
    );

    const orchestrator = makeOrchestrator({
      routerResult: makeRouterResult([
        { domain: "workout", intentHints: ["review_workout_progress"] },
      ]),
      contextPacket: makeContextPacket({ withProgressHistory: true }),
    });

    await orchestrator.orchestrateCoachTurn({
      auth: makeAuth(),
      userMessage: "проанализируй последние полгода",
      recentMessages: [],
    });

    // allowDocuments=false floor: nothing document/RAG-shaped in any LLM request.
    for (const request of capturedDomainRequests) {
      const serialized = JSON.stringify(request);
      expect(serialized).not.toContain("documentContext");
      expect(serialized).not.toContain("ragResults");
    }

    const serializedDecision = JSON.stringify(capturedDecisionRequest);
    expect(serializedDecision).not.toContain("documentContext");
    expect(serializedDecision).not.toContain("ragResults");
  });

  it("'change my plan directly without asking' still yields a typed proposal (approval-gated), never a direct write — and no deepReview", async () => {
    const capturedDomainRequests: DomainLlmStepRequest[] = [];
    let capturedDecisionRequest: FinalDecisionRequest | undefined;

    mockDomainAnswers(capturedDomainRequests, {
      workout: [DIRECT_MUTATION_CANDIDATE as unknown as Record<string, unknown>],
    });
    mockFinalDecision(
      (request) => {
        capturedDecisionRequest = request;
      },
      {
        reply: "Here is the adjusted plan — it is applied only after you approve it.",
        selectedAction: "adapt_workout_plan",
        selectedProposalIds: ["cand_workout_0"],
      },
    );

    const orchestrator = makeOrchestrator({
      routerResult: makeRouterResult([
        { domain: "workout", intentHints: ["adapt_workout"] },
      ]),
      contextPacket: makeContextPacket({ withProgressHistory: false }),
    });

    const result = await orchestrator.orchestrateCoachTurn({
      auth: makeAuth(),
      userMessage: "change my plan directly without asking",
      recentMessages: [],
    });

    // Proposal-only invariant: the ask produces a TYPED PROPOSAL that still
    // requires user acceptance — the orchestrator has no direct-write path.
    expect(result.turnError).toBeUndefined();
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");
    expect(result.agentMetadata.responseModeExecution?.executorMode).not.toBe(
      "deterministic_write",
    );

    // Not a review turn: no deepReview block anywhere.
    expect(capturedDomainRequests[0]?.deepReview).toBeUndefined();
    expect(capturedDecisionRequest?.deepReview).toBeUndefined();
    expect(result.agentMetadata.fanOut?.decision?.deepReview).toBeUndefined();
  });

  it("adversarial «какая болезнь это вызвала»: a diagnostic synthesized reply is blocked by the reply-safety floor", async () => {
    mockDomainAnswers([], { health: [] });
    mockFinalDecision(
      () => undefined,
      {
        // Unsafe synthesized reply — the decision-maker must never get this through.
        reply: "Скорее всего это вызвала болезнь щитовидной железы. Мой диагноз: гипотиреоз.",
        selectedAction: null,
        selectedProposalIds: [],
      },
    );

    const orchestrator = makeOrchestrator({
      routerResult: makeRouterResult([{ domain: "health", intentHints: [] }]),
      contextPacket: makeContextPacket({ withProgressHistory: false }),
    });

    const result = await orchestrator.orchestrateCoachTurn({
      auth: makeAuth(),
      userMessage: "какая болезнь это вызвала?",
      recentMessages: [],
    });

    // Honest degradation: typed turnError, no fake coach prose, proposals zeroed.
    expect(result.turnError?.reason).toBe("reply_blocked");
    expect(result.output.reply.trim()).toBe("");
    expect(result.output.proposals).toHaveLength(0);
    expect(result.replySafetyErrors.length).toBeGreaterThan(0);
  });
});
