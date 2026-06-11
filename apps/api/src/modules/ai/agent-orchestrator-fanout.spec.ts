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

function makeContextPacket(): AgentContextPacket {
  return {
    purpose: "workout_adaptation",
    depth: "medium",
    timeRange: "7d",
    intent: "adjust_workout",
    generatedAt: new Date().toISOString(),
    safetyConstraints: [],
    missingContextNotes: [],
    sourceRefs: [],
    supplementarySlices: [],
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
  opts: { lowConfidenceRoute?: boolean } = {},
): DomainFanoutPlan {
  return {
    route: makeRoute(),
    executorMode: "proposal_flow",
    requiresCompression: false,
    contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY,
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
}): AgentOrchestratorService {
  const contextPacket = makeContextPacket();

  const coachingContextService = {
    buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
    toAgentPromptContext: vi.fn().mockReturnValue({ agentContext: {} }),
  } as unknown as CoachingContextService;

  const contextCompressionService = {
    compressForTurn: vi.fn().mockResolvedValue({ summary: null, notes: [] }),
  } as unknown as ContextCompressionService;

  const contextExpansionPolicyService = {
    createPolicySnapshot: vi.fn().mockReturnValue({}),
  } as unknown as ContextExpansionPolicyService;

  const plan = makeFanoutPlan(opts.selectedDomains, { lowConfidenceRoute: opts.lowConfidenceRoute });

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
    runDomainLoop: vi.fn().mockImplementation(() =>
      Promise.resolve(domainResultQueue.shift() ?? {
        domainAnswer: createFallbackDomainAnswer("workout"),
        candidateMap: new Map(),
        degraded: true,
        degradedReasons: ["No more domain results in queue."],
        loopIterations: 0,
        toolsInvoked: [],
      }),
    ),
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
