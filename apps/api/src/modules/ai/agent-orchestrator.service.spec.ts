/**
 * AgentOrchestratorService integration-style tests.
 *
 * All injected stage services are mocked. Tests assert BEHAVIOR: what stages
 * were called, what arguments they received, and what the orchestrator returns.
 *
 * Covers:
 *  - happy path: eligible turn → router selects domain → planner finalizes → domain LLMs
 *    invoked (only-selected, concurrently) → decision-maker synthesizes → action resolved
 *  - degraded domain: one domain executor fails → safe empty output, turn still completes
 *  - clamping: planner caps and filters domains; only selected domains invoked
 *  - proposal turn: decision-maker emits typed proposal → resolver filters to allowlist
 *  - proposal-revision / proposal-explainer turns skip the router
 *  - decision-maker failure → safe fallback reply, proposals empty
 *  - reply safety block → reply replaced, proposals zeroed, safety.status = reply_blocked
 *  - deterministic gate-miss: executorMode deterministic → canned reply, no LLM calls after router
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCoachAiProviderMock } from "@health/ai/testing";
import { createFallbackDomainAnswer, DEFAULT_CONTEXT_BUDGET_POLICY } from "@health/types";
import type {
  AgentContextPacket,
} from "@health/types";
import type { ClerkAuthContext } from "../../auth.types.js";
import type { CoachingContextService } from "../coaching-context/coaching-context.service.js";
import type { ContextCompressionService } from "../coaching-context/context-compression.service.js";
import type { ContextExpansionPolicyService } from "../coaching-context/context-expansion-policy.service.js";
import { AgentOrchestratorService } from "./agent-orchestrator.service.js";
import type { OrchestrateCoachTurnInput } from "./agent-orchestrator.service.js";
import type { ActionResolverService } from "./action-resolver.service.js";
import type { ActionVariantCatalogService } from "./action-variant-catalog.service.js";
import type { DecisionMakerExecutorService } from "./decision-maker-executor.service.js";
import type { DomainLlmExecutorService } from "./domain-llm-executor.service.js";
import type { MessagePreprocessorService } from "./message-preprocessor.service.js";
import type { RouterLlmService } from "./router-llm.service.js";
import type { SystemPlannerService } from "./system-planner.service.js";
import type { DomainFanoutEntry, DomainFanoutPlan } from "./system-planner.service.js";
import * as coachProviderFactory from "./coach-provider.factory.js";

// ---------------------------------------------------------------------------
// Shared fixture builders
// ---------------------------------------------------------------------------

function makeAuth(): ClerkAuthContext {
  return {
    clerkUserId: "clerk_orch_test_001",
    email: "orch@example.com",
    displayName: "Orch Test User",
  };
}

function makeContextPacket(overrides: Partial<AgentContextPacket> = {}): AgentContextPacket {
  return {
    purpose: "workout_adaptation",
    depth: "medium",
    timeRange: "7d",
    intent: "adjust_workout",
    generatedAt: new Date().toISOString(),
    safetyConstraints: ["No medical diagnosis language."],
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
    ...overrides,
  } as unknown as AgentContextPacket;
}

function makeDomainEntry(
  domain: "workout" | "nutrition" | "health",
  executorMode: DomainFanoutEntry["executorMode"] = "proposal_flow",
): DomainFanoutEntry {
  const capabilityId =
    domain === "workout"
      ? ("adjust_workout" as const)
      : domain === "nutrition"
        ? ("adjust_nutrition" as const)
        : ("ask_health_context" as const);
  const allowedProposalIntents =
    domain === "workout"
      ? (["adapt_workout_plan", "create_workout_plan"] as const)
      : domain === "nutrition"
        ? (["create_nutrition_plan", "adjust_nutrition_plan"] as const)
        : ([] as const);

  return {
    domain,
    capabilityId,
    allowedTools: ["getUserContextSlice"],
    allowedProposalIntents: allowedProposalIntents as unknown as DomainFanoutEntry["allowedProposalIntents"],
    contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY,
    executorMode,
  };
}

function makeFanoutPlan(
  selectedDomains: DomainFanoutEntry[],
  executorMode: DomainFanoutPlan["executorMode"] = "proposal_flow",
): DomainFanoutPlan {
  return {
    catalogIntentId: selectedDomains[0]?.capabilityId ?? "general",
    primaryCapabilityId: selectedDomains[0]?.capabilityId ?? "general",
    selectedCapabilities: selectedDomains.map((d) => d.capabilityId),
    presentationMetadata: {
      primaryCapabilityId: selectedDomains[0]?.capabilityId ?? "general",
      selectedCapabilityIds: selectedDomains.map((d) => d.capabilityId),
      compositionStrategy: "single" as const,
      widgetDescriptors: [],
      actionDescriptors: [],
    },
    route: {
      intent: "adjust_workout",
      catalogIntentId: selectedDomains[0]?.capabilityId ?? "general",
      purpose: "workout_adaptation",
      depth: "medium",
      timeRange: "7d",
      includeDocuments: false,
      confidence: 0.85,
      routingMethod: "unified_turn_decision",
      isConfident: true,
      safetyFlags: [],
      requiredContextSlices: ["workout_adaptation"],
      expectedResponseMode: "proposal",
    },
    executorMode,
    expectedResponseMode: "proposal",
    intentDefinition: {
      id: selectedDomains[0]?.capabilityId ?? "general",
      allowedTools: ["getUserContextSlice"],
      allowedProposalIntents: selectedDomains[0]?.allowedProposalIntents ?? [],
    },
    contextBudget: DEFAULT_CONTEXT_BUDGET_POLICY,
    requiresCompression: false,
    isMonthlyReview: false,
    isMultiDomainReview: false,
    isProgressReview: false,
    fanout: {
      selectedDomains,
      isMultiDomain: selectedDomains.length > 1,
    },
  } as unknown as DomainFanoutPlan;
}

/**
 * Build all mocked stage services with sensible defaults.
 * Each test configures only what it needs.
 */
function buildMocks() {
  const contextPacket = makeContextPacket();

  const coachingContextService = {
    buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
    toAgentPromptContext: vi.fn().mockReturnValue({ agentContext: { test: true } }),
  } as unknown as CoachingContextService;

  const contextCompressionService = {
    compressForTurn: vi.fn().mockResolvedValue({ summary: null, notes: [] }),
  } as unknown as ContextCompressionService;

  const contextExpansionPolicyService = {
    createPolicySnapshot: vi.fn().mockReturnValue({}),
  } as unknown as ContextExpansionPolicyService;

  const messagePreprocessorService = {
    preprocess: vi.fn().mockReturnValue({
      originalText: "Adjust my workout",
      normalizedText: "adjust my workout",
      detectedLanguage: "en",
      responseLanguage: "en",
      hasAttachments: false,
      mentionedDates: [],
      simpleSignals: {},
      directPathCandidate: null,
    }),
  } as unknown as MessagePreprocessorService;

  const routerLlmService = {
    route: vi.fn().mockResolvedValue({
      output: {
        selectedDomains: [
          { domain: "workout", confidence: 0.85, intentHints: [], toolHints: [], signalHints: [] },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: 0.85,
      },
      source: "llm",
      validationErrors: [],
    }),
  } as unknown as RouterLlmService;

  const workoutDomainEntry = makeDomainEntry("workout");
  const fanoutPlan = makeFanoutPlan([workoutDomainEntry]);

  const systemPlannerService = {
    planTurn: vi.fn().mockResolvedValue(fanoutPlan),
  } as unknown as SystemPlannerService;

  const domainLlmExecutorService = {
    runDomainLoop: vi.fn().mockResolvedValue({
      domainAnswer: createFallbackDomainAnswer("workout"),
      candidateMap: new Map(),
      degraded: false,
      degradedReasons: [],
      loopIterations: 1,
      toolsInvoked: [],
    }),
  } as unknown as DomainLlmExecutorService;

  const actionVariantCatalogService = {
    buildCatalog: vi.fn().mockReturnValue([
      { id: "plain_reply", label: "Plain reply", requiresConsent: false },
      { id: "adapt_workout_plan", label: "Adapt workout plan", requiresConsent: false },
    ]),
  } as unknown as ActionVariantCatalogService;

  const decisionMakerExecutorService = {
    execute: vi.fn().mockResolvedValue({
      output: {
        reply: "Here is your adjusted workout plan.",
        selectedAction: null,
        selectedProposalIds: [],
        consentRequired: false,
      },
      degraded: false,
      degradedReasons: [],
    }),
  } as unknown as DecisionMakerExecutorService;

  const actionResolverService = {
    resolveFinalDecisionOutput: vi.fn().mockReturnValue({
      reply: "Here is your adjusted workout plan.",
      proposals: [],
      consentRequired: false,
      parseErrors: [],
      idResolutionDropCount: 0,
    }),
  } as unknown as ActionResolverService;

  const aiBehaviorConfigService = {
    getCompiledPromptTemplates: vi.fn().mockReturnValue({
      renderRouterDecision: vi.fn().mockReturnValue("router prompt"),
      renderDomainStep: vi.fn().mockReturnValue("domain prompt"),
      renderFinalDecision: vi.fn().mockReturnValue("final prompt"),
    }),
  };

  return {
    coachingContextService,
    contextCompressionService,
    contextExpansionPolicyService,
    messagePreprocessorService,
    routerLlmService,
    systemPlannerService,
    domainLlmExecutorService,
    actionVariantCatalogService,
    decisionMakerExecutorService,
    actionResolverService,
    aiBehaviorConfigService,
    fanoutPlan,
    workoutDomainEntry,
    contextPacket,
  };
}

function buildOrchestrator(mocks: ReturnType<typeof buildMocks>): AgentOrchestratorService {
  vi.spyOn(coachProviderFactory, "createCoachAiProvider").mockReturnValue(
    createCoachAiProviderMock({
      generateRouterDecision: vi.fn(),
      generateDomainStep: vi.fn(),
      generateFinalDecision: vi.fn(),
    }),
  );

  return new AgentOrchestratorService(
    mocks.coachingContextService,
    mocks.contextCompressionService,
    mocks.contextExpansionPolicyService,
    mocks.systemPlannerService,
    mocks.aiBehaviorConfigService as never,
    mocks.messagePreprocessorService,
    mocks.routerLlmService,
    mocks.domainLlmExecutorService,
    mocks.actionResolverService,
    mocks.decisionMakerExecutorService,
    mocks.actionVariantCatalogService,
  );
}

function makeInput(overrides: Partial<OrchestrateCoachTurnInput> = {}): OrchestrateCoachTurnInput {
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

describe("AgentOrchestratorService", () => {
  let mocks: ReturnType<typeof buildMocks>;

  beforeEach(() => {
    mocks = buildMocks();
    vi.spyOn(coachProviderFactory, "resolveAiCoachProviderMode").mockReturnValue("openai");
  });

  // -------------------------------------------------------------------------
  // Happy path: eligible turn — full fan-out
  // -------------------------------------------------------------------------

  describe("happy path — eligible turn (fan-out)", () => {
    it("runs preprocessor, router, planner, context, domain LLM, decision-maker, and resolver", async () => {
      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      expect(mocks.messagePreprocessorService.preprocess).toHaveBeenCalledOnce();
      expect(mocks.routerLlmService.route).toHaveBeenCalledOnce();
      expect(mocks.systemPlannerService.planTurn).toHaveBeenCalledOnce();
      expect(mocks.coachingContextService.buildAgentContext).toHaveBeenCalled();
      expect(mocks.domainLlmExecutorService.runDomainLoop).toHaveBeenCalledOnce();
      expect(mocks.decisionMakerExecutorService.execute).toHaveBeenCalledOnce();
      expect(mocks.actionResolverService.resolveFinalDecisionOutput).toHaveBeenCalledOnce();
      expect(result.output.reply).toBe("Here is your adjusted workout plan.");
    });

    it("returns the resolved reply and proposals in output", async () => {
      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());
      expect(result.output.reply).toBeTruthy();
      expect(Array.isArray(result.output.proposals)).toBe(true);
    });

    it("passes the router result to the system planner", async () => {
      const orchestrator = buildOrchestrator(mocks);
      await orchestrator.orchestrateCoachTurn(makeInput());

      const planTurnArgs = (mocks.systemPlannerService.planTurn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(planTurnArgs).toBeDefined();
      expect(planTurnArgs?.routerResult).toBeDefined();
      expect(planTurnArgs?.routerResult?.source).toBe("llm");
    });

    it("invokes only the selected domains (only-selected invariant)", async () => {
      // Two domains selected → two concurrent runDomainLoop calls
      const workoutEntry = makeDomainEntry("workout");
      const nutritionEntry = makeDomainEntry("nutrition");
      const multiPlan = makeFanoutPlan([workoutEntry, nutritionEntry]);

      (mocks.systemPlannerService.planTurn as ReturnType<typeof vi.fn>).mockResolvedValue(multiPlan);
      (mocks.domainLlmExecutorService.runDomainLoop as ReturnType<typeof vi.fn>)
        .mockImplementation(({ domainEntry }: { domainEntry: DomainFanoutEntry }) => {
          return Promise.resolve({
            domainAnswer: createFallbackDomainAnswer(domainEntry.domain),
            candidateMap: new Map(),
            degraded: false,
            degradedReasons: [],
            loopIterations: 1,
            toolsInvoked: [],
          });
        });

      const orchestrator = buildOrchestrator(mocks);
      await orchestrator.orchestrateCoachTurn(makeInput());

      // Exactly 2 domain loops invoked — workout and nutrition only
      expect(mocks.domainLlmExecutorService.runDomainLoop).toHaveBeenCalledTimes(2);
      const invocations = (mocks.domainLlmExecutorService.runDomainLoop as ReturnType<typeof vi.fn>).mock.calls;
      const invokedDomains = invocations.map((c: unknown[]) => (c[0] as { domainEntry: DomainFanoutEntry })?.domainEntry?.domain);
      expect(invokedDomains).toContain("workout");
      expect(invokedDomains).toContain("nutrition");
      expect(invokedDomains).not.toContain("health");
    });

    it("forwards workout calorie estimate from workout domain answer to ActionResolver", async () => {
      (mocks.domainLlmExecutorService.runDomainLoop as ReturnType<typeof vi.fn>).mockResolvedValue({
        domainAnswer: {
          ...createFallbackDomainAnswer("workout"),
          workoutCalorieEstimate: 320,
          workoutCaloriePerHourRate: 280,
        },
        candidateMap: new Map(),
        degraded: false,
        degradedReasons: [],
        loopIterations: 1,
        toolsInvoked: [],
      });

      const orchestrator = buildOrchestrator(mocks);
      await orchestrator.orchestrateCoachTurn(makeInput());

      const resolverArgs = (mocks.actionResolverService.resolveFinalDecisionOutput as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(resolverArgs?.workoutCalorieEstimate).toBe(320);
      expect(resolverArgs?.workoutCaloriePerHourRate).toBe(280);
    });

    it("passes selectedDomains to action variant catalog builder", async () => {
      const orchestrator = buildOrchestrator(mocks);
      await orchestrator.orchestrateCoachTurn(makeInput());

      expect(mocks.actionVariantCatalogService.buildCatalog).toHaveBeenCalledOnce();
      const catalogArgs = (mocks.actionVariantCatalogService.buildCatalog as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(catalogArgs?.selectedDomains).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Degraded domain — one fails, turn still completes
  // -------------------------------------------------------------------------

  describe("degraded domain", () => {
    it("completes the turn when one domain executor returns degraded=true", async () => {
      (mocks.domainLlmExecutorService.runDomainLoop as ReturnType<typeof vi.fn>).mockResolvedValue({
        domainAnswer: createFallbackDomainAnswer("workout"),
        candidateMap: new Map(),
        degraded: true,
        degradedReasons: ["OpenAI API rate limit"],
        loopIterations: 0,
        toolsInvoked: [],
      });

      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      // Turn must complete with a reply
      expect(result.output.reply).toBeTruthy();
      // parseErrors must mention the degraded domain
      expect(result.parseErrors.some((e) => e.includes("workout"))).toBe(true);
    });

    it("includes the degraded domain name in parseErrors", async () => {
      // nutrition domain degrades
      const nutritionEntry = makeDomainEntry("nutrition");
      const multiPlan = makeFanoutPlan([makeDomainEntry("workout"), nutritionEntry]);
      (mocks.systemPlannerService.planTurn as ReturnType<typeof vi.fn>).mockResolvedValue(multiPlan);

      (mocks.domainLlmExecutorService.runDomainLoop as ReturnType<typeof vi.fn>)
        .mockImplementation(({ domainEntry }: { domainEntry: DomainFanoutEntry }) => {
          const degraded = domainEntry.domain === "nutrition";
          return Promise.resolve({
            domainAnswer: createFallbackDomainAnswer(domainEntry.domain),
            candidateMap: new Map(),
            degraded,
            degradedReasons: degraded ? ["timeout"] : [],
            loopIterations: degraded ? 0 : 1,
            toolsInvoked: [],
          });
        });

      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      expect(result.parseErrors.join(" ")).toContain("nutrition");
    });

    it("does not include non-degraded domains in parseErrors", async () => {
      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());
      // No degraded domains → empty parseErrors (assuming no decision-maker degradation)
      expect(result.parseErrors).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Clamping — router/planner limits
  // -------------------------------------------------------------------------

  describe("clamping — only planner-finalized selected domains run", () => {
    it("invokes domain LLMs only for the plan's selectedDomains (not all 3 domains)", async () => {
      // Planner selects only 'health' — workout and nutrition must NOT run
      const healthEntry = makeDomainEntry("health");
      const healthPlan = makeFanoutPlan([healthEntry]);
      (mocks.systemPlannerService.planTurn as ReturnType<typeof vi.fn>).mockResolvedValue(healthPlan);
      (mocks.domainLlmExecutorService.runDomainLoop as ReturnType<typeof vi.fn>).mockResolvedValue({
        domainAnswer: createFallbackDomainAnswer("health"),
        candidateMap: new Map(),
        degraded: false,
        degradedReasons: [],
        loopIterations: 1,
        toolsInvoked: [],
      });

      const orchestrator = buildOrchestrator(mocks);
      await orchestrator.orchestrateCoachTurn(makeInput());

      expect(mocks.domainLlmExecutorService.runDomainLoop).toHaveBeenCalledTimes(1);
      const call = (mocks.domainLlmExecutorService.runDomainLoop as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { domainEntry: DomainFanoutEntry };
      expect(call?.domainEntry?.domain).toBe("health");
    });
  });

  // -------------------------------------------------------------------------
  // Proposal turn — decision-maker emits proposal
  // -------------------------------------------------------------------------

  describe("proposal turn", () => {
    it("returns proposals from ActionResolver when decision-maker emits a non-plain_reply action", async () => {
      const workoutProposal = {
        intent: "adapt_workout_plan",
        targetDomain: "workout",
        title: "Adjusted plan",
        reason: "User fatigue feedback",
        proposedChanges: { title: "Lighter plan", summary: "Reduced load", days: [], notes: [] },
      };

      (mocks.decisionMakerExecutorService.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        output: {
          reply: "Here is your adjusted workout plan.",
          selectedAction: "adapt_workout_plan",
          selectedProposalIds: ["cand_workout_0"],
          consentRequired: false,
        },
        degraded: false,
        degradedReasons: [],
      });

      (mocks.actionResolverService.resolveFinalDecisionOutput as ReturnType<typeof vi.fn>).mockReturnValue({
        reply: "Here is your adjusted workout plan.",
        proposals: [workoutProposal],
        consentRequired: false,
        parseErrors: [],
        idResolutionDropCount: 0,
      });

      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      expect(result.output.proposals).toHaveLength(1);
      expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");
    });

    it("passes selectedDomains to ActionResolver so it can filter to the capability allowlist", async () => {
      const orchestrator = buildOrchestrator(mocks);
      await orchestrator.orchestrateCoachTurn(makeInput());

      const resolverArgs = (mocks.actionResolverService.resolveFinalDecisionOutput as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(resolverArgs?.selectedDomains).toBeDefined();
      expect(resolverArgs?.selectedDomains.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Non-router exception paths — proposal-revision / proposal-explainer
  // -------------------------------------------------------------------------

  describe("non-router exception paths", () => {
    it("skips the router for proposal-revision turns", async () => {
      const orchestrator = buildOrchestrator(mocks);
      await orchestrator.orchestrateCoachTurn(
        makeInput({
          proposalRevision: {
            supersededProposalId: "aaaa0001-0000-4000-8000-000000000001",
            originalProposal: {
              intent: "adapt_workout_plan",
              targetDomain: "workout",
              title: "Old plan",
              reason: "Fatigue",
              proposedChanges: { title: "Old plan", summary: "", days: [], notes: [] },
            },
            modificationFeedback: "Make it lighter",
          },
        }),
      );

      expect(mocks.routerLlmService.route).not.toHaveBeenCalled();
      // Full fan-out still executes
      expect(mocks.domainLlmExecutorService.runDomainLoop).toHaveBeenCalledOnce();
      expect(mocks.decisionMakerExecutorService.execute).toHaveBeenCalledOnce();
    });

    it("skips the router for proposal-explainer turns", async () => {
      const orchestrator = buildOrchestrator(mocks);
      await orchestrator.orchestrateCoachTurn(
        makeInput({
          proposalExplainer: {
            proposalId: "bbbb0001-0000-4000-8000-000000000001",
            proposalTitle: "Workout plan",
            proposalSummary: "A lighter workout",
            proposalIntent: "adapt_workout_plan",
          } as unknown as OrchestrateCoachTurnInput["proposalExplainer"],
        }),
      );

      expect(mocks.routerLlmService.route).not.toHaveBeenCalled();
      expect(mocks.domainLlmExecutorService.runDomainLoop).toHaveBeenCalledOnce();
    });

    it("still passes routerResult=undefined to planner for revision turns", async () => {
      const orchestrator = buildOrchestrator(mocks);
      await orchestrator.orchestrateCoachTurn(
        makeInput({
          proposalRevision: {
            supersededProposalId: "cccc0001-0000-4000-8000-000000000001",
            originalProposal: {
              intent: "create_nutrition_plan",
              targetDomain: "nutrition",
              title: "Nutrition plan",
              reason: "User request",
              proposedChanges: {
                title: "Nutrition plan",
                summary: "",
                caloriesPerDay: null,
                proteinGrams: null,
                carbsGrams: null,
                fatGrams: null,
                hydrationLiters: null,
                mealStructure: [],
              },
            } as never,
            modificationFeedback: "Add more protein",
          },
        }),
      );

      const planTurnArgs = (mocks.systemPlannerService.planTurn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(planTurnArgs?.routerResult).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Decision-maker failure → safe fallback reply
  // -------------------------------------------------------------------------

  describe("decision-maker failure", () => {
    it("returns a safe fallback reply when decision-maker is degraded", async () => {
      (mocks.decisionMakerExecutorService.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        output: {
          reply: "I'm here to help with your wellness journey.",
          selectedAction: null,
          selectedProposalIds: [],
          consentRequired: false,
        },
        degraded: true,
        degradedReasons: ["Provider timeout"],
      });

      (mocks.actionResolverService.resolveFinalDecisionOutput as ReturnType<typeof vi.fn>).mockReturnValue({
        reply: "I'm here to help with your wellness journey.",
        proposals: [],
        consentRequired: false,
        parseErrors: [],
        idResolutionDropCount: 0,
      });

      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      expect(result.output.proposals).toHaveLength(0);
      expect(result.parseErrors.some((e) => e.includes("Decision-maker degraded"))).toBe(true);
    });

    it("includes the degradation reason in parseErrors", async () => {
      (mocks.decisionMakerExecutorService.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
        output: {
          reply: "Safe fallback.",
          selectedAction: null,
          selectedProposalIds: [],
          consentRequired: false,
        },
        degraded: true,
        degradedReasons: ["Zod parse failure on final decision output"],
      });

      (mocks.actionResolverService.resolveFinalDecisionOutput as ReturnType<typeof vi.fn>).mockReturnValue({
        reply: "Safe fallback.",
        proposals: [],
        consentRequired: false,
        parseErrors: [],
        idResolutionDropCount: 0,
      });

      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      expect(result.parseErrors.join(" ")).toContain("Zod parse failure");
    });
  });

  // -------------------------------------------------------------------------
  // Reply safety block
  // -------------------------------------------------------------------------

  describe("reply safety block", () => {
    it("replaces reply with safe fallback and zeros proposals when reply contains unsafe language", async () => {
      (mocks.actionResolverService.resolveFinalDecisionOutput as ReturnType<typeof vi.fn>).mockReturnValue({
        reply: "Based on your blood work, I diagnose you with iron deficiency anemia. Take 150mg iron supplements daily.",
        proposals: [],
        consentRequired: false,
        parseErrors: [],
        idResolutionDropCount: 0,
      });

      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      // Reply must be replaced with safe fallback (not the diagnosis text)
      expect(result.output.reply).not.toContain("diagnose");
      expect(result.output.proposals).toHaveLength(0);
      expect(result.replySafetyErrors.length).toBeGreaterThan(0);
      expect(result.agentMetadata.safety.status).toBe("reply_blocked");
    });

    it("does not forward consentRequired when reply is blocked", async () => {
      (mocks.actionResolverService.resolveFinalDecisionOutput as ReturnType<typeof vi.fn>).mockReturnValue({
        reply: "I prescribe metformin 500mg to treat your type 2 diabetes.",
        proposals: [],
        consentRequired: true,
        parseErrors: [],
        idResolutionDropCount: 0,
      });

      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      expect(result.consentRequired).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Deterministic gate-miss — executorMode deterministic
  // -------------------------------------------------------------------------

  describe("deterministic gate-miss", () => {
    it("returns canned reply without additional LLM calls when executorMode is deterministic_read", async () => {
      const detPlan = makeFanoutPlan([makeDomainEntry("workout")], "deterministic_read");
      (mocks.systemPlannerService.planTurn as ReturnType<typeof vi.fn>).mockResolvedValue(detPlan);

      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      // No domain LLM calls after the gate-miss
      expect(mocks.domainLlmExecutorService.runDomainLoop).not.toHaveBeenCalled();
      expect(mocks.decisionMakerExecutorService.execute).not.toHaveBeenCalled();
      expect(result.output.reply).toBeTruthy();
      expect(result.output.proposals).toHaveLength(0);
    });

    it("returns preAiGateDelegationMissed=true in responseModeExecution metadata", async () => {
      const detPlan = makeFanoutPlan([makeDomainEntry("workout")], "deterministic_write");
      (mocks.systemPlannerService.planTurn as ReturnType<typeof vi.fn>).mockResolvedValue(detPlan);

      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      expect(result.agentMetadata.responseModeExecution?.preAiGateDelegationMissed).toBe(true);
      expect(result.agentMetadata.responseModeExecution?.llmInvoked).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // agentMetadata shape — basic structural checks
  // -------------------------------------------------------------------------

  describe("agentMetadata", () => {
    it("includes routing.llmRouterInvoked=true when router ran and returned source=llm", async () => {
      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(true);
    });

    it("includes routing.llmRouterInvoked=false for revision turns (router was skipped)", async () => {
      const orchestrator = buildOrchestrator(mocks);
      const workoutProposedChanges = {
        title: "Plan",
        summary: "Lighter session",
        days: [],
        notes: [],
      };
      const result = await orchestrator.orchestrateCoachTurn(
        makeInput({
          proposalRevision: {
            supersededProposalId: "dddd0001-0000-4000-8000-000000000001",
            originalProposal: {
              intent: "adapt_workout_plan",
              targetDomain: "workout",
              title: "Plan",
              reason: "Feedback",
              proposedChanges: workoutProposedChanges,
            },
            modificationFeedback: "Lighter",
          },
        }),
      );

      expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(false);
    });

    it("includes fanOut diagnostics with per-domain entries", async () => {
      const orchestrator = buildOrchestrator(mocks);
      const result = await orchestrator.orchestrateCoachTurn(makeInput());

      const fanOut = result.agentMetadata.fanOut;
      expect(fanOut).toBeDefined();
      expect(fanOut?.domains).toHaveLength(1);
      expect(fanOut?.domains[0]?.domain).toBe("workout");
    });
  });
});
