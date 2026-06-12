/**
 * AgentOrchestratorService — fan-out integration tests (Item 3a)
 *
 * Covers the fan-out turn path through orchestrateCoachTurn with all
 * collaborating services mocked at the boundary. Tests focus on:
 *
 *  1. Happy path: domain candidate → cand_<domain>_<index> →
 *     decision-maker selects the id → resolved canonical proposal appears
 *     in the final AiStructuredOutput.
 *
 *  2. Cross-domain leak: a selectedProposalId whose intent is outside the
 *     union allowlist of selected domains → filtered out, proposals empty,
 *     diagnostic recorded in parseErrors.
 *
 *  3. recentMessages cap: 7 messages with >4000-char content →
 *     decision-maker request receives at most 6 messages, each content ≤4000 chars.
 */

import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_CONTEXT_BUDGET_POLICY,
  createFallbackDomainAnswer,
} from "@health/types";
import type {
  AgentContextPacket,
  IntentRouteResult,
  ResolvedCapabilityPresentationMetadata,
} from "@health/types";
import { createCoachAiProviderMock } from "@health/ai/testing";
import type { ClerkAuthContext } from "../../auth.types.js";
import type { CoachingContextService } from "../coaching-context/coaching-context.service.js";
import type { ContextCompressionService } from "../coaching-context/context-compression.service.js";
import type { ContextExpansionPolicyService } from "../coaching-context/context-expansion-policy.service.js";
import type { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import type { MessagePreprocessorService } from "./message-preprocessor.service.js";
import type { RouterLlmService } from "./router-llm.service.js";
import type { ActionVariantCatalogService } from "./action-variant-catalog.service.js";
import { ActionResolverService } from "./action-resolver.service.js";
import { DecisionMakerExecutorService } from "./decision-maker-executor.service.js";
import { DomainLlmExecutorService } from "./domain-llm-executor.service.js";
import { SystemPlannerService } from "./system-planner.service.js";
import {
  AgentOrchestratorService,
  type OrchestrateCoachTurnInput,
} from "./agent-orchestrator.service.js";
import type { DomainFanoutEntry, DomainFanoutPlan } from "./system-planner.service.js";
import type { DomainLlmExecutorResult } from "./domain-llm-executor.service.js";
import type { FinalDecisionRequest } from "@health/types";

// ---------------------------------------------------------------------------
// vi.mock — replace createCoachAiProvider to avoid real OpenAI initialization
// ---------------------------------------------------------------------------

vi.mock("./coach-provider.factory.js", () => ({
  createCoachAiProvider: vi.fn(() =>
    createCoachAiProviderMock({
      generateDomainStep: vi.fn(),
      generateRouterDecision: vi.fn(),
      generateFinalDecision: vi.fn(),
    }),
  ),
  resolveAiCoachProviderMode: vi.fn(() => "openai" as const),
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeAuth(): ClerkAuthContext {
  return { clerkUserId: "clerk_001", email: "test@example.com", displayName: "Test" };
}

/**
 * Numeric-only progress-history summary fixture (Phase 4 deep-review tests).
 * Worst per-domain sufficiency is "partial" → expected derived dataQuality.
 */
const PROGRESS_HISTORY_SUMMARY = {
  requestedPeriodDays: 365,
  grantedPeriodDays: 180,
  granularity: "weekly" as const,
  buckets: [],
  planChangeMarkers: [],
  dataSufficiency: {
    workout: "sufficient" as const,
    habits: "partial" as const,
    recovery: "sufficient" as const,
    wellbeing: "sufficient" as const,
  },
  coveredDays: 120,
  noteCodes: [],
};

function makeContextPacket(opts: { withProgressHistory?: boolean } = {}): AgentContextPacket {
  return {
    purpose: "workout_adaptation",
    depth: "medium",
    timeRange: "7d",
    intent: "adjust_workout",
    generatedAt: new Date().toISOString(),
    safetyConstraints: [],
    missingContextNotes: [],
    sourceRefs: [],
    supplementarySlices: opts.withProgressHistory
      ? [
          {
            purpose: "progress_history_review",
            depth: "large",
            timeRange: "1y",
            generatedAt: new Date().toISOString(),
            relevantMemories: [],
            snapshots: [],
            recommendationConstraints: [],
            sourceRefs: [],
            progressHistory: PROGRESS_HISTORY_SUMMARY,
          },
        ]
      : [],
    slice: {
      purpose: "workout_adaptation",
      depth: "medium",
      timeRange: "7d",
      generatedAt: new Date().toISOString(),
      relevantMemories: [],
      snapshots: [],
      recommendationConstraints: [],
      sourceRefs: [],
    } as unknown as AgentContextPacket["slice"],
  } as unknown as AgentContextPacket;
}

function makeRoute(): IntentRouteResult {
  return {
    intent: "adjust_workout",
    catalogIntentId: "adjust_workout",
    confidence: 0.9,
    isConfident: true,
    purpose: "workout_adaptation",
    depth: "medium",
    timeRange: "7d",
    includeDocuments: false,
    routingMethod: "llm_router",
    requiredContextSlices: [{ purpose: "workout_adaptation", depth: "medium", timeRange: "7d" }],
    safetyFlags: [],
    expectedResponseMode: "proposal_only",
  } as unknown as IntentRouteResult;
}

function makeDomainFanoutEntry(
  domain: "workout" | "nutrition",
  allowedProposalIntents: string[],
): DomainFanoutEntry {
  return {
    domain,
    capabilityId: domain === "workout" ? "adjust_workout" : "adjust_nutrition",
    allowedTools: ["getUserContextSlice"] as DomainFanoutEntry["allowedTools"],
    allowedProposalIntents: allowedProposalIntents as unknown as DomainFanoutEntry["allowedProposalIntents"],
    contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY,
    executorMode: "proposal_flow",
  };
}

function makePresentationMetadata(): ResolvedCapabilityPresentationMetadata {
  return {
    primaryCapabilityId: "adjust_workout",
    selectedCapabilityIds: ["adjust_workout"],
    compositionStrategy: "single",
    widgetDescriptors: [],
    actionDescriptors: [],
  } as unknown as ResolvedCapabilityPresentationMetadata;
}

/**
 * Build a minimal DomainFanoutPlan that routes to a single workout domain.
 * isDeterministicResponseModeExecutorMode(plan.executorMode) must be false
 * so the orchestrator enters the fan-out path rather than the gate-miss path.
 */
function makeFanoutPlan(
  selectedDomains: DomainFanoutEntry[],
  opts: {
    lowConfidenceRoute?: boolean;
    /** Phase 4: deep_history review plan with the given lookbacks. */
    deepReviewPlan?: { requestedLookbackDays: number | null; grantedLookbackDays: number | null };
    requiresCompression?: boolean;
  } = {},
): DomainFanoutPlan {
  return {
    route: makeRoute(),
    executorMode: "proposal_flow",
    requiresCompression: opts.requiresCompression ?? false,
    contextBudget: opts.deepReviewPlan
      ? { ...DEFAULT_CONTEXT_BUDGET_POLICY, profile: "deep_history" as const }
      : DEFAULT_CONTEXT_BUDGET_POLICY,
    requestedLookbackDays: opts.deepReviewPlan?.requestedLookbackDays ?? null,
    grantedLookbackDays: opts.deepReviewPlan?.grantedLookbackDays ?? null,
    presentationMetadata: makePresentationMetadata(),
    intentDefinition: {} as DomainFanoutPlan["intentDefinition"],
    catalogIntentId: "adjust_workout",
    primaryCapabilityId: "adjust_workout",
    selectedCapabilities: ["adjust_workout"],
    expectedResponseMode: "proposal_only",
    fanout: {
      selectedDomains,
      isMultiDomain: selectedDomains.length > 1,
      lowConfidenceRoute: opts.lowConfidenceRoute ?? false,
    },
  } as unknown as DomainFanoutPlan;
}

/**
 * Build the minimal mock orchestrator with every service mocked except
 * ActionResolverService and DecisionMakerExecutorService, which use their
 * real implementations to exercise the integrated resolution path.
 */
function makeOrchestrator(opts: {
  domainResults: DomainLlmExecutorResult[];
  selectedDomains: DomainFanoutEntry[];
  /** decision-maker output: which ids to select and what selectedAction */
  decisionOutput: {
    reply: string;
    selectedAction: string | null;
    selectedProposalIds: string[];
    consentRequired: boolean;
  };
  /** Override to capture the generateFinalDecision call. */
  captureFinalDecisionRequest?: (req: FinalDecisionRequest) => void;
  /** Forward lowConfidenceRoute into the fanout plan metadata. */
  lowConfidenceRoute?: boolean;
  /** Phase 4: deep_history review plan with the given lookbacks. */
  deepReviewPlan?: { requestedLookbackDays: number | null; grantedLookbackDays: number | null };
  /** Phase 4: include the progress_history_review slice on the context packet. */
  withProgressHistory?: boolean;
  /** Phase 4: compression summary returned by the mocked compression service. */
  compressionSummary?: { dataQuality?: "sufficient" | "partial" | "insufficient" };
  /** Phase 4: capture every DomainLlmExecutorService.runDomainLoop input. */
  captureDomainLoopInput?: (input: { deepReview?: unknown }) => void;
  /** F5: spy on the once-per-turn progress-history aggregation. */
  progressHistoryAggregateSpies?: {
    buildReviewSummaryForAuth: ReturnType<typeof vi.fn>;
  };
  /** F5: capture every CoachingContextService.buildAgentContext options arg. */
  captureBuildAgentContextOptions?: (options: unknown) => void;
}): AgentOrchestratorService {
  const contextPacket = makeContextPacket({ withProgressHistory: opts.withProgressHistory });

  const coachingContextService = {
    buildAgentContext: vi
      .fn()
      .mockImplementation((_auth, _request, _route, options: unknown) => {
        opts.captureBuildAgentContextOptions?.(options);

        return Promise.resolve(contextPacket);
      }),
    toAgentPromptContext: vi.fn().mockReturnValue({ agentContext: {} }),
  } as unknown as CoachingContextService;

  const contextCompressionService = {
    compressForTurn: vi.fn().mockResolvedValue({
      summary: opts.compressionSummary ?? null,
      notes: [],
    }),
  } as unknown as ContextCompressionService;

  const contextExpansionPolicyService = {
    createPolicySnapshot: vi.fn().mockReturnValue({}),
  } as unknown as ContextExpansionPolicyService;

  const plan = makeFanoutPlan(opts.selectedDomains, {
    lowConfidenceRoute: opts.lowConfidenceRoute,
    deepReviewPlan: opts.deepReviewPlan,
    requiresCompression: opts.compressionSummary !== undefined,
  });

  const systemPlannerService = {
    planTurn: vi.fn().mockResolvedValue(plan),
  } as unknown as SystemPlannerService;

  const aiBehaviorConfigService = {
    getCompiledPromptTemplates: vi.fn().mockReturnValue({}),
  } as unknown as AiBehaviorConfigService;

  const messagePreprocessorService = {
    preprocess: vi.fn().mockReturnValue({
      userMessage: "Test",
      responseLanguage: null,
      signals: [],
      directPathCandidate: null,
    }),
  } as unknown as MessagePreprocessorService;

  const routerLlmService = {
    route: vi.fn().mockResolvedValue({
      source: "llm" as const,
      output: {
        confidence: 0.9,
        selectedDomains: opts.selectedDomains.map((d) => ({ domain: d.domain, confidence: 0.9 })),
      },
      validationErrors: [],
    }),
  } as unknown as RouterLlmService;

  // DomainLlmExecutorService is mocked to return the specified domain results.
  const domainResultQueue = [...opts.domainResults];
  const domainLlmExecutorService = {
    runDomainLoop: vi.fn().mockImplementation((input: { deepReview?: unknown }) => {
      opts.captureDomainLoopInput?.(input);

      return Promise.resolve(domainResultQueue.shift() ?? {
        domainAnswer: createFallbackDomainAnswer("workout"),
        candidateMap: new Map(),
        degraded: true,
        degradedReasons: ["No more domain results in queue."],
        loopIterations: 0,
        toolsInvoked: [],
      });
    }),
  } as unknown as DomainLlmExecutorService;

  // Real ActionResolverService — exercises the integrated resolution path.
  const actionResolverService = new ActionResolverService();

  // Real DecisionMakerExecutorService with provider mocked to return our test output.
  const decisionMakerExecutorService = new DecisionMakerExecutorService();

  // Replace the provider on the decision-maker executor to return our test output.
  // We inject the provider via the DecisionMakerInput.provider argument in the execute() call,
  // so we need to intercept it via the orchestrator's provider field.
  // Instead, we mock the decisionMakerExecutorService.execute directly:
  vi.spyOn(decisionMakerExecutorService, "execute").mockImplementation(async (input) => {
    opts.captureFinalDecisionRequest?.({
      userMessage: input.userMessage,
      domainOutputs: input.domainOutputs,
      candidateProposalSummaries: input.candidateProposalSummaries,
      actionVariantCatalog: input.actionVariantCatalog,
      safetyFlags: input.safetyFlags ?? [],
      safetyConstraints: input.safetyConstraints ?? [],
      responseLanguage: input.responseLanguage ?? null,
      recentMessages: input.recentMessages ?? [],
      deepReview: input.deepReview,
    } as unknown as FinalDecisionRequest);

    return {
      output: opts.decisionOutput,
      degraded: false,
      degradedReasons: [],
    };
  });

  const actionVariantCatalogService = {
    buildCatalog: vi.fn().mockReturnValue([
      { id: "plain_reply", label: "Plain reply", requiresConsent: false },
      { id: "adapt_workout_plan", label: "Adapt workout plan", requiresConsent: false },
      { id: "log_nutrition_incident", label: "Log nutrition incident", requiresConsent: false },
    ]),
  } as unknown as ActionVariantCatalogService;

  const attachmentTextExtractionService = {
    extractTurnAttachmentTexts: vi.fn().mockResolvedValue(new Map()),
  };

  const progressHistoryAggregateService = (opts.progressHistoryAggregateSpies ?? {
    buildReviewSummaryForAuth: vi.fn(),
  }) as never;

  return new AgentOrchestratorService(
    coachingContextService,
    contextCompressionService,
    contextExpansionPolicyService,
    systemPlannerService,
    aiBehaviorConfigService,
    messagePreprocessorService,
    routerLlmService,
    domainLlmExecutorService,
    actionResolverService,
    decisionMakerExecutorService,
    actionVariantCatalogService,
    attachmentTextExtractionService as never,
    progressHistoryAggregateService,
  );
}

const WORKOUT_PROPOSAL = {
  intent: "adapt_workout_plan",
  targetDomain: "workout",
  title: "Reduce load",
  reason: "Recovery signals are low.",
  proposedChanges: {
    title: "Strength base",
    summary: "Lighter session.",
    days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
    notes: [],
  },
} as const;

const NUTRITION_PROPOSAL = {
  intent: "log_nutrition_incident",
  targetDomain: "nutrition",
  title: "Log post-workout meal",
  reason: "Nutrition tracking.",
  proposedChanges: {
    incidentDateTime: "2026-05-26T18:00:00.000Z",
    items: [{ name: "Protein shake", quantity: "1 serving", calories: 220 }],
    estimatedCalories: 220,
    estimatedMacros: { proteinGrams: 30, carbsGrams: 10, fatGrams: 4 },
    confidence: "medium" as const,
    provenance: { source: "text_estimate" as const, providerId: "chat_trigger" },
    imageRefs: [],
  },
} as const;

function makeOrchestratorInput(
  userMessage = "Adjust my workout",
  recentMessages: OrchestrateCoachTurnInput["recentMessages"] = [],
): OrchestrateCoachTurnInput {
  return {
    auth: makeAuth(),
    userMessage,
    recentMessages,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentOrchestratorService — fan-out: happy path (Item 3a)", () => {
  it("resolves a domain candidate via cand_workout_0 into the final AiStructuredOutput proposals", async () => {
    const workoutDomainResult: DomainLlmExecutorResult = {
      domainAnswer: {
        ...createFallbackDomainAnswer("workout"),
        domain: "workout",
        summary: "Lighter session recommended.",
        candidateProposals: [WORKOUT_PROPOSAL as unknown as Record<string, unknown>],
      },
      // candidateMap is built by the executor: cand_workout_0 → WORKOUT_PROPOSAL
      candidateMap: new Map([["cand_workout_0", WORKOUT_PROPOSAL as unknown as Record<string, unknown>]]),
      degraded: false,
      degradedReasons: [],
      loopIterations: 1,
      toolsInvoked: [],
    };

    const orchestrator = makeOrchestrator({
      domainResults: [workoutDomainResult],
      selectedDomains: [makeDomainFanoutEntry("workout", ["adapt_workout_plan"])],
      decisionOutput: {
        reply: "I recommend a lighter session today.",
        selectedAction: "adapt_workout_plan",
        selectedProposalIds: ["cand_workout_0"],
        consentRequired: false,
      },
    });

    const result = await orchestrator.orchestrateCoachTurn(makeOrchestratorInput());

    // The final output must contain the resolved workout proposal.
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");
    expect(result.output.proposals[0]?.title).toBe("Reduce load");
    expect(result.output.reply).toBe("I recommend a lighter session today.");
    // No parse errors on the happy path.
    expect(result.parseErrors.filter((e) => e.startsWith("Resolver:"))).toHaveLength(0);
  });

  it("surfaces resolver parseErrors to the orchestrator parseErrors channel when an unknown id is selected", async () => {
    const workoutDomainResult: DomainLlmExecutorResult = {
      domainAnswer: {
        ...createFallbackDomainAnswer("workout"),
        domain: "workout",
        summary: "Lighter session.",
        candidateProposals: [WORKOUT_PROPOSAL as unknown as Record<string, unknown>],
      },
      candidateMap: new Map([["cand_workout_0", WORKOUT_PROPOSAL as unknown as Record<string, unknown>]]),
      degraded: false,
      degradedReasons: [],
      loopIterations: 1,
      toolsInvoked: [],
    };

    const orchestrator = makeOrchestrator({
      domainResults: [workoutDomainResult],
      selectedDomains: [makeDomainFanoutEntry("workout", ["adapt_workout_plan"])],
      decisionOutput: {
        reply: "Here is your plan.",
        selectedAction: "adapt_workout_plan",
        // cand_workout_0 is valid; cand_workout_99 is unknown
        selectedProposalIds: ["cand_workout_0", "cand_workout_99"],
        consentRequired: false,
      },
    });

    const result = await orchestrator.orchestrateCoachTurn(makeOrchestratorInput());

    // cand_workout_0 resolves; cand_workout_99 is dropped.
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");

    // The resolver diagnostic must appear in the orchestrator's parseErrors.
    const resolverErrors = result.parseErrors.filter((e) => e.startsWith("Resolver:"));
    expect(resolverErrors).toHaveLength(1);
    expect(resolverErrors[0]).toContain("cand_workout_99");

    // The resolution diagnostics in agentMetadata must record idResolutionDropCount.
    const resolution = result.agentMetadata.fanOut?.resolution;
    expect(resolution?.idResolutionDropCount).toBe(1);
    // droppedByAllowlist must be 0 — the valid candidate passed the allowlist.
    expect(resolution?.droppedByAllowlist).toBe(0);
  });
});

describe("AgentOrchestratorService — fan-out: cross-domain allowlist leak (Item 3a)", () => {
  it("filters a selected id whose intent is outside the union allowlist of selected domains", async () => {
    // Workout domain only: allowedProposalIntents = ["adapt_workout_plan"].
    // The nutrition proposal (intent: "log_nutrition_incident") is NOT in the workout allowlist.
    const workoutDomainResult: DomainLlmExecutorResult = {
      domainAnswer: {
        ...createFallbackDomainAnswer("workout"),
        domain: "workout",
        summary: "Workout reviewed.",
        candidateProposals: [WORKOUT_PROPOSAL as unknown as Record<string, unknown>],
      },
      candidateMap: new Map([
        ["cand_workout_0", WORKOUT_PROPOSAL as unknown as Record<string, unknown>],
        // A nutrition proposal smuggled into the workout candidate map (adversarial scenario).
        ["cand_workout_1", NUTRITION_PROPOSAL as unknown as Record<string, unknown>],
      ]),
      degraded: false,
      degradedReasons: [],
      loopIterations: 1,
      toolsInvoked: [],
    };

    const orchestrator = makeOrchestrator({
      domainResults: [workoutDomainResult],
      // Only the workout domain is selected — union allowlist = ["adapt_workout_plan"].
      selectedDomains: [makeDomainFanoutEntry("workout", ["adapt_workout_plan"])],
      decisionOutput: {
        reply: "Workout plan updated.",
        selectedAction: "adapt_workout_plan",
        // Decision-maker selects both ids — but cand_workout_1 has intent "log_nutrition_incident"
        // which is outside the workout-only union allowlist.
        selectedProposalIds: ["cand_workout_0", "cand_workout_1"],
        consentRequired: false,
      },
    });

    const result = await orchestrator.orchestrateCoachTurn(makeOrchestratorInput());

    // Only the workout proposal (adapt_workout_plan) passes the allowlist filter.
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");

    // The nutrition proposal (log_nutrition_incident) must have been filtered out.
    const hasNutritionProposal = result.output.proposals.some(
      (p) => p.intent === "log_nutrition_incident",
    );
    expect(hasNutritionProposal).toBe(false);

    // droppedByAllowlist reflects the filtered cross-domain proposal.
    const resolution = result.agentMetadata.fanOut?.resolution;
    expect(resolution?.droppedByAllowlist).toBeGreaterThanOrEqual(1);
    // No id-resolution drops (both ids were found in the map).
    expect(resolution?.idResolutionDropCount).toBe(0);
  });
});

describe("AgentOrchestratorService — fan-out: recentMessages cap (Item 3a)", () => {
  it("caps recentMessages to 6 messages and truncates each content to 4000 chars for the decision-maker", async () => {
    // Build 7 messages each with content well over 4000 chars.
    const longContent = "A".repeat(5000); // 5000 chars — exceeds the 4000 cap
    const recentMessages = Array.from({ length: 7 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `Message ${i}: ${longContent}`,
    }));

    let capturedDecisionRequest: FinalDecisionRequest | undefined;

    const workoutDomainResult: DomainLlmExecutorResult = {
      domainAnswer: {
        ...createFallbackDomainAnswer("workout"),
        domain: "workout",
        summary: "Workout reviewed.",
        candidateProposals: [],
      },
      candidateMap: new Map(),
      degraded: false,
      degradedReasons: [],
      loopIterations: 1,
      toolsInvoked: [],
    };

    const orchestrator = makeOrchestrator({
      domainResults: [workoutDomainResult],
      selectedDomains: [makeDomainFanoutEntry("workout", ["adapt_workout_plan"])],
      decisionOutput: {
        reply: "Here is your plan.",
        selectedAction: null,
        selectedProposalIds: [],
        consentRequired: false,
      },
      captureFinalDecisionRequest: (req) => {
        capturedDecisionRequest = req;
      },
    });

    await orchestrator.orchestrateCoachTurn(makeOrchestratorInput("Adjust my workout", recentMessages));

    // Verify the decision-maker received at most 6 messages (the last 6).
    expect(capturedDecisionRequest).toBeDefined();
    const decidedMessages = capturedDecisionRequest!.recentMessages ?? [];
    expect(decidedMessages.length).toBeLessThanOrEqual(6);

    // Every message content must be ≤4000 chars.
    for (const msg of decidedMessages) {
      expect((msg as { content: string }).content.length).toBeLessThanOrEqual(4000);
    }

    // We sent 7 messages — the cap should have dropped 1, leaving 6.
    expect(decidedMessages.length).toBe(6);
  });

  it("does not truncate messages that are already within the 4000-char limit", async () => {
    const shortContent = "B".repeat(100); // well under 4000
    const recentMessages = Array.from({ length: 3 }, (_, i) => ({
      role: "user" as const,
      content: `${shortContent} ${i}`,
    }));

    let capturedDecisionRequest: FinalDecisionRequest | undefined;

    const workoutDomainResult: DomainLlmExecutorResult = {
      domainAnswer: {
        ...createFallbackDomainAnswer("workout"),
        domain: "workout",
        summary: "Workout reviewed.",
        candidateProposals: [],
      },
      candidateMap: new Map(),
      degraded: false,
      degradedReasons: [],
      loopIterations: 1,
      toolsInvoked: [],
    };

    const orchestrator = makeOrchestrator({
      domainResults: [workoutDomainResult],
      selectedDomains: [makeDomainFanoutEntry("workout", ["adapt_workout_plan"])],
      decisionOutput: {
        reply: "All good.",
        selectedAction: null,
        selectedProposalIds: [],
        consentRequired: false,
      },
      captureFinalDecisionRequest: (req) => {
        capturedDecisionRequest = req;
      },
    });

    await orchestrator.orchestrateCoachTurn(makeOrchestratorInput("Check my workout", recentMessages));

    const decidedMessages = capturedDecisionRequest!.recentMessages ?? [];
    expect(decidedMessages.length).toBe(3);

    // Short content must not be truncated.
    for (const msg of decidedMessages) {
      const content = (msg as { content: string }).content;
      expect(content.length).toBeGreaterThan(100); // still has the content
      expect(content.length).toBeLessThanOrEqual(4000);
    }
  });
});

describe("AgentOrchestratorService — fan-out: lowConfidenceRoute in decision diagnostics (Slice 5)", () => {
  it("surfaces lowConfidenceRoute=true in fanOut.decision diagnostics when planner emits it", async () => {
    const workoutDomainResult: DomainLlmExecutorResult = {
      domainAnswer: {
        ...createFallbackDomainAnswer("workout"),
        domain: "workout",
        summary: "Workout reviewed.",
        candidateProposals: [],
      },
      candidateMap: new Map(),
      degraded: false,
      degradedReasons: [],
      loopIterations: 1,
      toolsInvoked: [],
    };

    const orchestrator = makeOrchestrator({
      domainResults: [workoutDomainResult],
      selectedDomains: [makeDomainFanoutEntry("workout", ["adapt_workout_plan"])],
      decisionOutput: {
        reply: "I am not sure what you mean — could you clarify?",
        selectedAction: null,
        selectedProposalIds: [],
        consentRequired: false,
      },
      lowConfidenceRoute: true,
    });

    const result = await orchestrator.orchestrateCoachTurn(makeOrchestratorInput());

    // lowConfidenceRoute must be forwarded into the fanOut.decision diagnostics block.
    const decision = result.agentMetadata.fanOut?.decision;
    expect(decision).toBeDefined();
    expect(decision?.lowConfidenceRoute).toBe(true);
  });

  it("omits lowConfidenceRoute from fanOut.decision diagnostics when plan has lowConfidenceRoute=false", async () => {
    const workoutDomainResult: DomainLlmExecutorResult = {
      domainAnswer: {
        ...createFallbackDomainAnswer("workout"),
        domain: "workout",
        summary: "Workout reviewed.",
        candidateProposals: [],
      },
      candidateMap: new Map(),
      degraded: false,
      degradedReasons: [],
      loopIterations: 1,
      toolsInvoked: [],
    };

    const orchestrator = makeOrchestrator({
      domainResults: [workoutDomainResult],
      selectedDomains: [makeDomainFanoutEntry("workout", ["adapt_workout_plan"])],
      decisionOutput: {
        reply: "Here is your plan.",
        selectedAction: null,
        selectedProposalIds: [],
        consentRequired: false,
      },
      // lowConfidenceRoute defaults to false — the field is conditionally spread only
      // when !== undefined (falsy false is NOT spread), so decision.lowConfidenceRoute
      // should be absent (undefined) on confident routes.
    });

    const result = await orchestrator.orchestrateCoachTurn(makeOrchestratorInput());

    const decision = result.agentMetadata.fanOut?.decision;
    expect(decision).toBeDefined();
    expect(decision?.lowConfidenceRoute).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — deepReview threading (domain requests + decision request + diagnostics)
// ---------------------------------------------------------------------------

describe("AgentOrchestratorService — fan-out: deepReview block (Phase 4)", () => {
  function makeReviewDomainResult(): DomainLlmExecutorResult {
    return {
      domainAnswer: {
        ...createFallbackDomainAnswer("workout"),
        domain: "workout",
        summary: "Long-range review summary.",
        candidateProposals: [],
      },
      candidateMap: new Map(),
      degraded: false,
      degradedReasons: [],
      loopIterations: 1,
      toolsInvoked: [],
    };
  }

  it("builds the deepReview block on a deep_history turn: plan lookbacks + worst-of dataQuality", async () => {
    const domainLoopInputs: Array<{ deepReview?: unknown }> = [];
    let capturedDecisionRequest: FinalDecisionRequest | undefined;

    const orchestrator = makeOrchestrator({
      domainResults: [makeReviewDomainResult()],
      selectedDomains: [makeDomainFanoutEntry("workout", ["adapt_workout_plan"])],
      decisionOutput: {
        reply: "Over the last 180 days your adherence dropped.",
        selectedAction: null,
        selectedProposalIds: [],
        consentRequired: false,
      },
      deepReviewPlan: { requestedLookbackDays: 365, grantedLookbackDays: 180 },
      withProgressHistory: true,
      captureDomainLoopInput: (input) => domainLoopInputs.push(input),
      captureFinalDecisionRequest: (req) => {
        capturedDecisionRequest = req;
      },
    });

    const result = await orchestrator.orchestrateCoachTurn(
      makeOrchestratorInput("проанализируй последние полгода"),
    );

    // Worst of {sufficient, partial, sufficient, sufficient} = partial (fixture).
    const expectedDeepReview = {
      requestedPeriodDays: 365,
      grantedPeriodDays: 180,
      dataQuality: "partial",
    };

    // Every domain request carries the same deepReview block.
    expect(domainLoopInputs).toHaveLength(1);
    expect(domainLoopInputs[0]?.deepReview).toEqual(expectedDeepReview);

    // The decision request carries the same block.
    expect(capturedDecisionRequest?.deepReview).toEqual(expectedDeepReview);

    // Diagnostics surface a boolean only (no period numbers, no health data).
    expect(result.agentMetadata.fanOut?.decision?.deepReview).toBe(true);
  });

  it("compression dataQuality degrades the deepReview dataQuality (worst-of)", async () => {
    let capturedDecisionRequest: FinalDecisionRequest | undefined;

    const orchestrator = makeOrchestrator({
      domainResults: [makeReviewDomainResult()],
      selectedDomains: [makeDomainFanoutEntry("workout", ["adapt_workout_plan"])],
      decisionOutput: {
        reply: "Honest but limited review.",
        selectedAction: null,
        selectedProposalIds: [],
        consentRequired: false,
      },
      deepReviewPlan: { requestedLookbackDays: 365, grantedLookbackDays: 180 },
      withProgressHistory: true,
      compressionSummary: { dataQuality: "insufficient" },
      captureFinalDecisionRequest: (req) => {
        capturedDecisionRequest = req;
      },
    });

    await orchestrator.orchestrateCoachTurn(
      makeOrchestratorInput("проанализируй последние полгода"),
    );

    expect(capturedDecisionRequest?.deepReview).toEqual({
      requestedPeriodDays: 365,
      grantedPeriodDays: 180,
      dataQuality: "insufficient",
    });
  });

  it("does NOT build deepReview on a default turn (no review profile, no progress-history slice)", async () => {
    const domainLoopInputs: Array<{ deepReview?: unknown }> = [];
    let capturedDecisionRequest: FinalDecisionRequest | undefined;

    const orchestrator = makeOrchestrator({
      domainResults: [makeReviewDomainResult()],
      selectedDomains: [makeDomainFanoutEntry("workout", ["adapt_workout_plan"])],
      decisionOutput: {
        reply: "Here is your plan.",
        selectedAction: null,
        selectedProposalIds: [],
        consentRequired: false,
      },
      captureDomainLoopInput: (input) => domainLoopInputs.push(input),
      captureFinalDecisionRequest: (req) => {
        capturedDecisionRequest = req;
      },
    });

    const result = await orchestrator.orchestrateCoachTurn(makeOrchestratorInput());

    expect(domainLoopInputs[0]?.deepReview).toBeUndefined();
    expect(capturedDecisionRequest?.deepReview).toBeUndefined();
    expect(result.agentMetadata.fanOut?.decision?.deepReview).toBeUndefined();
  });

  it("does NOT build deepReview when the profile is a review one but the packet lacks the progress-history slice", async () => {
    let capturedDecisionRequest: FinalDecisionRequest | undefined;

    const orchestrator = makeOrchestrator({
      domainResults: [makeReviewDomainResult()],
      selectedDomains: [makeDomainFanoutEntry("workout", ["adapt_workout_plan"])],
      decisionOutput: {
        reply: "Review without history slice.",
        selectedAction: null,
        selectedProposalIds: [],
        consentRequired: false,
      },
      deepReviewPlan: { requestedLookbackDays: 180, grantedLookbackDays: 180 },
      withProgressHistory: false,
      captureFinalDecisionRequest: (req) => {
        capturedDecisionRequest = req;
      },
    });

    const result = await orchestrator.orchestrateCoachTurn(
      makeOrchestratorInput("проанализируй последние полгода"),
    );

    expect(capturedDecisionRequest?.deepReview).toBeUndefined();
    expect(result.agentMetadata.fanOut?.decision?.deepReview).toBeUndefined();
  });

  it("aggregates progress history exactly ONCE on a 3-domain deep-review turn and threads it to every packet build (F5)", async () => {
    const reviewSlice = {
      type: "progress_history_review" as const,
      depth: "large" as const,
      timeRange: "1y" as const,
      includeDocuments: false,
    };
    const selectedDomains: DomainFanoutEntry[] = [
      {
        ...makeDomainFanoutEntry("workout", ["adapt_workout_plan"]),
        supplementaryContextSlices: [reviewSlice],
      },
      {
        ...makeDomainFanoutEntry("nutrition", ["log_nutrition_incident"]),
        supplementaryContextSlices: [reviewSlice],
      },
      {
        ...makeDomainFanoutEntry("nutrition", ["log_nutrition_incident"]),
        domain: "health",
        capabilityId: "longevity_overview",
        supplementaryContextSlices: [reviewSlice],
      },
    ];
    const buildReviewSummaryForAuth = vi.fn(async () => PROGRESS_HISTORY_SUMMARY);
    const capturedOptions: unknown[] = [];

    const orchestrator = makeOrchestrator({
      domainResults: [
        makeReviewDomainResult(),
        makeReviewDomainResult(),
        makeReviewDomainResult(),
      ],
      selectedDomains,
      decisionOutput: {
        reply: "Cross-domain review.",
        selectedAction: null,
        selectedProposalIds: [],
        consentRequired: false,
      },
      deepReviewPlan: { requestedLookbackDays: 365, grantedLookbackDays: 180 },
      withProgressHistory: true,
      progressHistoryAggregateSpies: { buildReviewSummaryForAuth },
      captureBuildAgentContextOptions: (options) => capturedOptions.push(options),
    });

    await orchestrator.orchestrateCoachTurn(
      makeOrchestratorInput("проанализируй последние полгода"),
    );

    // The identical 6-query aggregation runs once per turn — not once per packet.
    expect(buildReviewSummaryForAuth).toHaveBeenCalledTimes(1);
    expect(buildReviewSummaryForAuth).toHaveBeenCalledWith(expect.anything(), 180);

    // 1 primary + 3 domain packet builds, each handed the same precomputed summary.
    expect(capturedOptions).toHaveLength(4);
    for (const options of capturedOptions) {
      expect(
        (options as { progressHistoryLookback?: { precomputedSummary?: unknown } })
          .progressHistoryLookback?.precomputedSummary,
      ).toBe(PROGRESS_HISTORY_SUMMARY);
    }
  });
});
