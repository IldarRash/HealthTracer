/**
 * AgentOrchestratorService — onProgress callback tests (Slice 3)
 *
 * Covers:
 *  1. Fan-out turn emits routing → domains_running (with selected domain names) →
 *     synthesis in order, via the onProgress callback.
 *  2. domains_running event carries the correct selectedDomains array.
 *  3. A throwing onProgress callback does not affect the turn result.
 *  4. Pre-AI gate turns (proposal-revision, proposal-explainer) skip the router
 *     and do not emit a routing event — they emit domains_running then synthesis.
 */

import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_CONTEXT_BUDGET_POLICY,
  createFallbackDomainAnswer,
} from "@health/types";
import type {
  AgentContextPacket,
  IntentRouteResult,
  ProgressReporter,
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

function makeDomainFanoutEntry(domain: "workout" | "nutrition"): DomainFanoutEntry {
  return {
    domain,
    capabilityId: domain === "workout" ? "adjust_workout" : "adjust_nutrition",
    allowedTools: ["getUserContextSlice"] as DomainFanoutEntry["allowedTools"],
    allowedProposalIntents: [] as unknown as DomainFanoutEntry["allowedProposalIntents"],
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

function makeFanoutPlan(selectedDomains: DomainFanoutEntry[]): DomainFanoutPlan {
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
    },
  } as unknown as DomainFanoutPlan;
}

function makeDegradedDomainResult(domain: "workout" | "nutrition"): DomainLlmExecutorResult {
  return {
    domainAnswer: createFallbackDomainAnswer(domain),
    candidateMap: new Map(),
    degraded: true,
    degradedReasons: ["Test degradation."],
    loopIterations: 0,
    toolsInvoked: [],
  };
}

function makeOrchestrator(opts: {
  selectedDomains: DomainFanoutEntry[];
  skipRouter?: boolean;
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

  const plan = makeFanoutPlan(opts.selectedDomains);

  const systemPlannerService = {
    planTurn: vi.fn().mockResolvedValue(plan),
  } as unknown as SystemPlannerService;

  const aiBehaviorConfigService = {
    getCompiledPromptTemplates: vi.fn().mockReturnValue({}),
  } as unknown as AiBehaviorConfigService;

  const messagePreprocessorService = {
    preprocess: vi.fn().mockReturnValue({
      userMessage: "Adjust my workout",
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

  const domainLlmExecutorService = {
    runDomainLoop: vi.fn().mockImplementation(({ domainEntry }: { domainEntry: DomainFanoutEntry }) =>
      Promise.resolve(makeDegradedDomainResult(domainEntry.domain as "workout" | "nutrition")),
    ),
  } as unknown as DomainLlmExecutorService;

  const actionResolverService = new ActionResolverService();

  const decisionMakerExecutorService = new DecisionMakerExecutorService();
  vi.spyOn(decisionMakerExecutorService, "execute").mockResolvedValue({
    output: {
      reply: "Here is your updated plan.",
      selectedAction: null,
      selectedProposalIds: [],
      consentRequired: false,
    },
    degraded: false,
    degradedReasons: [],
  });

  const actionVariantCatalogService = {
    buildCatalog: vi.fn().mockReturnValue([
      { id: "plain_reply", label: "Plain reply", requiresConsent: false },
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

function makeBaseInput(overrides?: Partial<OrchestrateCoachTurnInput>): OrchestrateCoachTurnInput {
  return {
    auth: makeAuth(),
    userMessage: "Adjust my workout",
    recentMessages: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentOrchestratorService — onProgress callback (Slice 3)", () => {
  it("emits routing → domains_running (with selected domain names) → synthesis in order on a fan-out turn", async () => {
    const orchestrator = makeOrchestrator({
      selectedDomains: [makeDomainFanoutEntry("workout"), makeDomainFanoutEntry("nutrition")],
    });

    const events: Parameters<ProgressReporter>[0][] = [];
    const onProgress: ProgressReporter = (event) => {
      events.push(event);
    };

    await orchestrator.orchestrateCoachTurn(makeBaseInput({ onProgress }));

    const stages = events.map((e) => e.stage);
    expect(stages).toContain("routing");
    expect(stages).toContain("domains_running");
    expect(stages).toContain("synthesis");

    // routing must come before domains_running and synthesis
    expect(stages.indexOf("routing")).toBeLessThan(stages.indexOf("domains_running"));
    expect(stages.indexOf("domains_running")).toBeLessThan(stages.indexOf("synthesis"));
  });

  it("domains_running event carries the selectedDomains array with correct domain names", async () => {
    const selectedDomains = [makeDomainFanoutEntry("workout"), makeDomainFanoutEntry("nutrition")];
    const orchestrator = makeOrchestrator({ selectedDomains });

    const events: Parameters<ProgressReporter>[0][] = [];
    await orchestrator.orchestrateCoachTurn(
      makeBaseInput({ onProgress: (e) => events.push(e) }),
    );

    const domainsRunningEvent = events.find((e) => e.stage === "domains_running");
    expect(domainsRunningEvent).toBeDefined();
    expect(domainsRunningEvent?.selectedDomains).toEqual(
      expect.arrayContaining(["workout", "nutrition"]),
    );
    expect(domainsRunningEvent?.selectedDomains).toHaveLength(2);
  });

  it("does not emit a routing stage event on a proposal-revision turn (router is skipped)", async () => {
    const orchestrator = makeOrchestrator({
      selectedDomains: [makeDomainFanoutEntry("workout")],
    });

    const events: Parameters<ProgressReporter>[0][] = [];

    await orchestrator.orchestrateCoachTurn(
      makeBaseInput({
        onProgress: (e) => events.push(e),
        proposalRevision: {
          supersededProposalId: "aaaaaaaa-0000-4000-a000-000000000001",
          originalProposal: {
            intent: "adapt_workout_plan",
            targetDomain: "workout",
            title: "Old plan",
            reason: "Outdated",
            proposedChanges: {
              title: "Plan",
              summary: "Summary",
              days: [],
              notes: [],
            },
          } as unknown as import("@health/types").RawAiProposal,
          modificationFeedback: "Make it harder.",
        },
      }),
    );

    const stages = events.map((e) => e.stage);
    expect(stages).not.toContain("routing");
    // domains_running and synthesis still fire on the fan-out path
    expect(stages).toContain("domains_running");
    expect(stages).toContain("synthesis");
  });

  it("a throwing onProgress callback does not affect the turn result", async () => {
    const orchestrator = makeOrchestrator({
      selectedDomains: [makeDomainFanoutEntry("workout")],
    });

    const throwingProgress: ProgressReporter = () => {
      throw new Error("Progress callback exploded!");
    };

    // Must not throw and must return a valid result despite callback failure.
    const result = await orchestrator.orchestrateCoachTurn(
      makeBaseInput({ onProgress: throwingProgress }),
    );

    expect(result).toBeDefined();
    expect(result.output).toBeDefined();
    expect(result.output.reply).toBeTruthy();
  });

  it("does not crash when no onProgress callback is provided", async () => {
    const orchestrator = makeOrchestrator({
      selectedDomains: [makeDomainFanoutEntry("workout")],
    });

    const result = await orchestrator.orchestrateCoachTurn(makeBaseInput());

    expect(result).toBeDefined();
    expect(result.output).toBeDefined();
  });
});
