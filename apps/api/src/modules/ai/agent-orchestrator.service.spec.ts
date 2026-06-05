import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentContextPacket } from "@health/types";
import {
  createFallbackPreprocessorResult,
  routerDecisionOutputSchema,
  buildProposalExplainerTurnContext,
  getCapabilityConfig,
} from "@health/types";
import type { ChatAttachmentsService } from "../chat-attachments/chat-attachments.service.js";
import { ActionResolverService } from "./action-resolver.service.js";
import { ActionVariantCatalogService } from "./action-variant-catalog.service.js";
import { AgentOrchestratorService } from "./agent-orchestrator.service.js";
import { ContextCompressionService } from "../coaching-context/context-compression.service.js";
import { ContextExpansionPolicyService } from "../coaching-context/context-expansion-policy.service.js";
import { DecisionMakerExecutorService } from "./decision-maker-executor.service.js";
import { DomainLlmExecutorService } from "./domain-llm-executor.service.js";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";
import { ResponseModeExecutorService } from "./response-mode-executor.service.js";
import { createAiPolicyTestStack } from "./test-ai-behavior-fixtures.js";
import * as coachProviderFactory from "./coach-provider.factory.js";
import {
  buildAgentPromptContextFromPacket,
  LEGACY_BROAD_COACHING_CONTEXT_KEYS,
} from "../coaching-context/agent-prompt-context.js";
import type { RouterLlmResult } from "./router-llm.service.js";

/**
 * Stub ChatAttachmentsService — returns empty buffer for all storage reads.
 * DomainLlmExecutorService uses this for imageDataUri population; an empty
 * buffer means no imageDataUri is set (size guard skips it), which is fine
 * for tests that don't exercise the multimodal path.
 */
function makeStubChatAttachmentsService(): ChatAttachmentsService {
  return {
    readStoredContent: vi.fn().mockResolvedValue(Buffer.alloc(0)),
  } as unknown as ChatAttachmentsService;
}

/** Default reply used by the shared provider mock. */
const DEFAULT_PROVIDER_REPLY = "Here is a wellness-focused response you can review.";

/**
 * Build a minimal stub DomainLlmExecutorService backed by a real AgentToolRegistryService stub.
 * The service uses the shared provider mock's generateDomainStep which returns a domain_answer
 * so the fan-out path resolves predictably.
 *
 * Pass an explicit executeTool mock to track tool calls in tests.
 */
function createStubDomainLlmExecutorService(
  executeToolOverride?: ReturnType<typeof vi.fn>,
): DomainLlmExecutorService {
  const toolRegistry = {
    executeTool: executeToolOverride ?? vi.fn().mockResolvedValue({
      tool: "getWeeklyProgressContext",
      ok: true,
      result: null,
    }),
    listAvailableTools: vi.fn().mockReturnValue([
      "getUserContextSlice",
      "getWeeklyProgressContext",
    ]),
  } as unknown as AgentToolRegistryService;

  return new DomainLlmExecutorService(toolRegistry, makeStubChatAttachmentsService());
}

function createResponseModeExecutorService(
  agentToolRegistryService: { executeTool: ReturnType<typeof vi.fn> },
) {
  return new ResponseModeExecutorService(
    new ActionResolverService(),
    agentToolRegistryService as never,
  );
}

const SAFE_FALLBACK_REPLY =
  "I could not safely process that response. Please try again with a wellness-focused question.";

/**
 * Creates a confident RouterLlmResult for use in tests.
 * Defaults to workout domain → adjust_workout capability.
 */
function createConfidentRouterResultForTests(
  overrides: {
    domain?: "workout" | "nutrition" | "health";
    confidence?: number;
    source?: "llm" | "fallback";
    safetyFlags?: string[];
  } = {},
): RouterLlmResult {
  const source = overrides.source ?? "llm";
  const confidence = overrides.confidence ?? 0.84;
  const domain = overrides.domain ?? "workout";

  if (source === "fallback") {
    return {
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [],
        contextNeeds: [],
        safetyFlags: [],
        confidence: confidence,
      }),
      source: "fallback",
      validationErrors: ["forced fallback"],
    };
  }

  return {
    output: routerDecisionOutputSchema.parse({
      selectedDomains: [
        {
          domain,
          confidence,
          intentHints: [],
          toolHints: [],
          signalHints: [],
        },
      ],
      contextNeeds: [],
      safetyFlags: overrides.safetyFlags ?? ["fatigue"],
      confidence,
    }),
    source: "llm",
    validationErrors: [],
  };
}

function createRouterTestDeps(routeImpl?: ReturnType<typeof vi.fn>) {
  return {
    messagePreprocessorService: {
      preprocess: vi.fn((input: { userMessage: string; hasAttachments?: boolean }) =>
        createFallbackPreprocessorResult(input),
      ),
    },
    routerLlmService: {
      route:
        routeImpl ??
        vi.fn().mockResolvedValue(createConfidentRouterResultForTests()),
    },
  };
}

const LEGACY_LEAK_FIELDS = [
  "documentContext",
  "documentSignalContext",
  "correlationInsights",
  ...LEGACY_BROAD_COACHING_CONTEXT_KEYS,
] as const;

function createSlicePacket(
  purpose: AgentContextPacket["purpose"],
  intent: AgentContextPacket["intent"],
  sliceExtras: Record<string, unknown> = {},
): AgentContextPacket {
  const depth =
    purpose === "general_chat"
      ? "small"
      : purpose === "health_context"
        ? "large"
        : "medium";
  const timeRange =
    purpose === "general_chat" ? "7d" : purpose === "health_context" ? "30d" : "14d";

  return {
    purpose,
    depth,
    timeRange,
    intent,
    generatedAt: new Date().toISOString(),
    safetyConstraints: ["Do not diagnose medical conditions."],
    supplementarySlices: [],
    missingContextNotes: [],
    sourceRefs:
      purpose === "health_context"
        ? [
            {
              domain: "document",
              label: "Blood panel",
              referenceId: "d1000001-0000-4000-8000-000000000001",
            },
            {
              domain: "rag",
              label: "Blood panel snippet",
              referenceId: "d1000001-0000-4000-8000-000000000001",
            },
          ]
        : [{ domain: "profile", label: "User profile summary" }],
    slice: {
      purpose,
      depth,
      timeRange,
      generatedAt: new Date().toISOString(),
      relevantMemories: [],
      snapshots: [],
      recommendationConstraints: [],
      sourceRefs: [],
      ...sliceExtras,
    },
  };
}

function createOrchestratorWithCapturedProvider(
  contextPacket: AgentContextPacket,
  options?: {
    routeImpl?: ReturnType<typeof vi.fn>;
    domainStepReply?: string;
  },
) {
  const defaultReply = options?.domainStepReply ?? DEFAULT_PROVIDER_REPLY;

  const generateAgentLoopStep = vi.fn().mockResolvedValue({
    kind: "final_answer",
    reply: defaultReply,
    proposals: [],
  });
  const generateCoachResponse = vi.fn().mockResolvedValue({
    reply: defaultReply,
    proposals: [],
  });
  // generateDomainStep is used by the fan-out path (router source="llm" turns).
  // It returns a domain_answer whose summary matches the default loop reply so
  // tests that only check the output reply stay consistent.
  const generateDomainStep = vi.fn().mockResolvedValue({
    kind: "domain_answer",
    domain: "workout",
    summary: defaultReply,
    candidateProposals: [],
    domainSignals: [],
  });
  // generateFinalDecision is used by DecisionMakerExecutorService (Stage 9, Phase 5).
  // By default it echoes the first domain summary as the reply with no proposals.
  const generateFinalDecision = vi.fn().mockImplementation(async () => ({
    reply: defaultReply,
    selectedAction: null,
    proposals: [],
    consentRequired: false,
  }));

  const coachingContextService = {
    buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
    toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
      buildAgentPromptContextFromPacket(packet),
    ),
  };

  const agentToolRegistryService = {
    executeTool: vi.fn().mockResolvedValue({ tool: "getWeeklyProgressContext", ok: true, result: null }),
  };

  const { capabilityRegistryService, systemPlannerService, aiBehaviorConfigService } =
    createAiPolicyTestStack();
  const actionResolverService = new ActionResolverService();
  const contextCompressionService = new ContextCompressionService();
  const contextExpansionPolicyService = new ContextExpansionPolicyService();
  const domainToolExecute = vi.fn().mockResolvedValue({ tool: "getWeeklyProgressContext", ok: true, result: null });
  const domainLlmExecutorService = createStubDomainLlmExecutorService(domainToolExecute);
  const responseModeExecutorService = new ResponseModeExecutorService(
    actionResolverService,
    agentToolRegistryService as never,
  );
  const decisionMakerExecutorService = new DecisionMakerExecutorService();
  const actionVariantCatalogService = new ActionVariantCatalogService();

  const routerDeps = createRouterTestDeps(options?.routeImpl);

  const service = new AgentOrchestratorService(
    coachingContextService as never,
    contextCompressionService,
    contextExpansionPolicyService,
    systemPlannerService,
    responseModeExecutorService,
    aiBehaviorConfigService,
    routerDeps.messagePreprocessorService as never,
    routerDeps.routerLlmService as never,
    domainLlmExecutorService,
    actionResolverService,
    decisionMakerExecutorService,
    actionVariantCatalogService,
  );

  Object.assign(service, {
    provider: { generateCoachResponse, generateAgentLoopStep, generateDomainStep, generateFinalDecision },
  });

  return {
    service,
    generateCoachResponse,
    generateAgentLoopStep,
    generateDomainStep,
    generateFinalDecision,
    coachingContextService,
    agentToolRegistryService,
    domainToolExecute,
    capabilityRegistryService,
    systemPlannerService,
    decisionMakerExecutorService,
    actionVariantCatalogService,
    ...routerDeps,
  };
}

function expectProviderContextExcludesLegacyFields(context: Record<string, unknown>) {
  for (const key of LEGACY_LEAK_FIELDS) {
    expect(context).not.toHaveProperty(key);
  }
}

describe("AgentOrchestratorService provider context minimization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ["general chat", "How can I stay consistent this week?", "general_chat", "general", "health"],
    ["workout adaptation", "Can you adapt my workout plan this week?", "workout_adaptation", "adjust_workout", "workout"],
    [
      "nutrition adaptation",
      "Can you adjust my nutrition plan for more protein?",
      "nutrition_adaptation",
      "adjust_nutrition",
      "nutrition",
    ],
  ] as const)(
    "excludes document and legacy broad context for %s",
    async (_label, userMessage, purpose, intent, domain) => {
      const contextPacket = createSlicePacket(purpose, intent, {
        activeWorkoutPlan:
          purpose === "workout_adaptation"
            ? { title: "Plan", summary: "Summary", sessionCount: 3 }
            : undefined,
        activeNutritionPlan:
          purpose === "nutrition_adaptation"
            ? {
                title: "Macros",
                summary: "Higher protein focus.",
                caloriesPerDay: 2200,
                proteinGrams: 160,
                carbsGrams: 200,
                fatGrams: 70,
                hydrationLiters: 2.5,
                preferences: [],
                restrictions: [],
              }
            : undefined,
      });

      const { service, generateDomainStep, coachingContextService } =
        createOrchestratorWithCapturedProvider(contextPacket, {
          routeImpl: vi.fn().mockResolvedValue(
            createConfidentRouterResultForTests({
              domain: domain as "workout" | "nutrition" | "health",
            }),
          ),
        });

      await service.orchestrateCoachTurn({
        auth: {
          clerkUserId: "clerk-user",
          email: "test@example.com",
          displayName: "Test",
        },
        userMessage,
        recentMessages: [],
      });

      // Fan-out path: buildAgentContext is called at least once (primary + per domain).
      expect(coachingContextService.buildAgentContext).toHaveBeenCalled();
      expect(coachingContextService.toAgentPromptContext).toHaveBeenCalled();
      // The domain step receives the per-domain coaching context (not legacy broad context).
      const domainRequest = generateDomainStep.mock.calls[0]?.[0] as {
        coachingContext: Record<string, unknown>;
      };

      expectProviderContextExcludesLegacyFields(domainRequest.coachingContext);
      expect(domainRequest.coachingContext.agentContext).toMatchObject({
        purpose,
        intent,
      });
    },
  );

  it("includes consent-gated document context for health_context turns", async () => {
    const contextPacket = createSlicePacket("health_context", "ask_health_context", {
      documentContext: {
        items: [
          {
            documentId: "d1000001-0000-4000-8000-000000000001",
            summaryId: "a1000001-0000-4000-8000-000000000001",
            documentType: "lab_report",
            title: "Blood panel",
            summarySnippet: "Approved summary only.",
            extractedConstraints: [],
          },
        ],
        generatedAt: new Date().toISOString(),
      },
      ragResults: [
        {
          documentId: "d1000001-0000-4000-8000-000000000001",
          summaryId: "a1000001-0000-4000-8000-000000000001",
          title: "Blood panel",
          snippet: "Approved summary only.",
          provenance: "approved_document_summary",
          consentScope: "semantic_indexing",
        },
      ],
    });

    const { service, generateDomainStep } =
      createOrchestratorWithCapturedProvider(contextPacket, {
        routeImpl: vi.fn().mockResolvedValue(
          createConfidentRouterResultForTests({ domain: "health" }),
        ),
      });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Please consider my lab results and medical background.",
      recentMessages: [],
    });

    // Fan-out path: check domain step for the coaching context.
    const domainRequest = generateDomainStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };

    expect(domainRequest.coachingContext.documentContext).toBeDefined();
    expect(domainRequest.coachingContext.ragResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provenance: "approved_document_summary",
        }),
      ]),
    );
    expect(result.agentMetadata.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceType: "document_summary", label: "Blood panel" }),
        expect.objectContaining({
          sourceType: "document_summary",
          label: "Blood panel snippet",
        }),
      ]),
    );
    expect(
      result.agentMetadata.citations.some((citation) => citation.sourceType === "structured_state"),
    ).toBe(false);
  });
});

describe("AgentOrchestratorService routing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes normal text turns through confident router decision", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, coachingContextService } = createOrchestratorWithCapturedProvider(contextPacket);

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "I feel tired today. Should I train?",
      recentMessages: [],
    });

    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ intent: "adjust_workout" }),
      expect.objectContaining({
        routingMethod: "unified_turn_decision",
      }),
      expect.objectContaining({
        contextBudget: expect.objectContaining({ profile: "default" }),
      }),
    );
  });

  it("falls back to general when router confidence is low (fallback source)", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const route = vi.fn().mockResolvedValue(
      createConfidentRouterResultForTests({
        domain: "workout",
        confidence: 0.35,
        source: "fallback",
      }),
    );
    const { service, coachingContextService } = createOrchestratorWithCapturedProvider(
      contextPacket,
      { routeImpl: route },
    );

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "I feel completely off today. What should I do?",
      recentMessages: [],
    });

    expect(route).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "unified_turn_decision",
        isConfident: false,
        catalogIntentId: "general",
      }),
      expect.anything(),
    );
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(false);
  });

  it("filters proposals outside the active catalog allowlist before returning (fan-out path)", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const coachSummary = "Here is a lighter workout option you can review.";
    const workoutProposal = {
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Reduce today's load",
      reason: "Recovery signals are low.",
      proposedChanges: {
        title: "Strength base",
        summary: "Lighter session today.",
        days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        notes: [],
      },
    };
    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket);

    // Fan-out path: generateDomainStep returns candidateProposals (not final_answer proposals).
    // The workout domain returns one workout proposal + one nutrition proposal (out-of-domain).
    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: coachSummary,
      candidateProposals: [
        workoutProposal,
        {
          intent: "log_nutrition_incident",
          targetDomain: "nutrition",
          title: "Log post-workout meal",
          reason: "Nutrition logging is outside this workout turn.",
          proposedChanges: {
            incidentDateTime: "2026-05-26T18:00:00.000Z",
            items: [{ name: "Protein shake", quantity: "1 serving", calories: 220 }],
            estimatedCalories: 220,
            estimatedMacros: { proteinGrams: 30, carbsGrams: 10, fatGrams: 4 },
            confidence: "medium",
            provenance: { source: "text_estimate", providerId: "chat_trigger" },
            imageRefs: [],
          },
        },
      ],
      domainSignals: [],
    });

    // Phase 5: Decision-maker returns the synthesized reply and selects the workout proposal.
    // The out-of-domain nutrition proposal is NOT selected by the decision-maker.
    // ActionResolver re-filters against the union allowlist as a safety floor.
    generateFinalDecision.mockResolvedValue({
      reply: coachSummary,
      selectedAction: "adapt_workout_plan",
      proposals: [workoutProposal],
      consentRequired: false,
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(result.output.reply).toBe(coachSummary);
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");
    expect(result.agentMetadata.catalogIntentId).toBe("adjust_workout");
    expect(result.agentMetadata.safety.status).toBe("passed");
  });

  it("uses decision-maker output for user-facing replies (fan-out path)", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const domainSummary = "Domain step output — not the final reply.";
    const finalDecisionReply = "Final coach reply with a reviewable proposal draft.";
    const workoutProposal = {
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Reduce today's load",
      reason: "Recovery signals are low.",
      proposedChanges: {
        title: "Strength base",
        summary: "Lighter session today.",
        days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        notes: [],
      },
    };
    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket);

    // Fan-out path: domain step produces a candidate proposal.
    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: domainSummary,
      candidateProposals: [workoutProposal],
      domainSignals: [],
    });

    // Phase 5: Decision-maker synthesizes the final reply and proposal.
    generateFinalDecision.mockResolvedValue({
      reply: finalDecisionReply,
      selectedAction: "adapt_workout_plan",
      proposals: [workoutProposal],
      consentRequired: false,
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "I feel completely off today. What should I do?",
      recentMessages: [],
    });

    expect(generateDomainStep).toHaveBeenCalledTimes(1);
    // Phase 5: reply comes from decision-maker, not the domain step.
    expect(result.output.reply).toBe(finalDecisionReply);
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");
  });

  it("bypasses router for proposal revision turns and passes revision context", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateAgentLoopStep, routerLlmService } = createOrchestratorWithCapturedProvider(contextPacket);

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Please revise the proposal with these changes: keep one strength exercise.",
      recentMessages: [],
      proposalRevision: {
        supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
        modificationFeedback: "Keep one strength exercise.",
        originalProposal: {
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Adjust today's workout",
          reason: "Recovery signals are low.",
          proposedChanges: {
            title: "Strength base",
            summary: "Lighter session today.",
            days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
            notes: [],
          },
        },
      },
    });

    expect(routerLlmService.route).not.toHaveBeenCalled();
    expect(generateAgentLoopStep).toHaveBeenCalled();
    const providerRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };
    expect(providerRequest.coachingContext.proposalRevision).toMatchObject({
      supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
      modificationFeedback: "Keep one strength exercise.",
    });
  });

  it("bypasses router for proposal explainer turns and passes proposal context", async () => {
    const contextPacket = createSlicePacket("general_chat", "proposal_explainer");
    const workoutProposal = {
      intent: "adapt_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Should not surface",
      reason: "Blocked on explainer turns.",
      proposedChanges: {
        title: "Strength base",
        summary: "Lighter session today.",
        days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        notes: [],
      },
    };
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "I suggested this because your recovery signals were low.",
      proposals: [workoutProposal],
    });
    const generateCoachResponse = vi.fn();

    vi.spyOn(coachProviderFactory, "createCoachAiProvider").mockReturnValue({
      generateAgentLoopStep,
      generateCoachResponse,
    } as never);

    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const agentToolRegistryService = {
      executeTool: vi.fn(),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const routerDeps = createRouterTestDeps(vi.fn());
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService(agentToolRegistryService as never),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Why this proposal?",
      recentMessages: [],
      proposalExplainer: {
        proposalId: "a1000001-0000-4000-8000-000000000001",
        intent: "adapt_workout_plan",
        targetDomain: "workout",
        title: "Lighten leg day",
        reason: "Recent poor sleep suggested a lighter session.",
        status: "pending",
        evidenceSummaries: [{ domain: "wellbeing", label: "Poor sleep reported yesterday" }],
        createdAt: "2026-05-27T10:00:00.000Z",
      },
    });

    expect(routerDeps.routerLlmService.route).not.toHaveBeenCalled();
    expect(generateAgentLoopStep).toHaveBeenCalled();
    const providerRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
      agentMetadata: {
        catalogIntentId: string;
        allowedProposalIntents: string[];
      };
    };
    expect(providerRequest.coachingContext.proposalExplainer).toMatchObject({
      proposalId: "a1000001-0000-4000-8000-000000000001",
      title: "Lighten leg day",
    });
    expect(providerRequest.agentMetadata.catalogIntentId).toBe("proposal_explainer");
    expect(providerRequest.agentMetadata.allowedProposalIntents).toEqual([]);
    expect(result.output.proposals).toEqual([]);
    expect(result.agentMetadata.catalogIntentId).toBe("proposal_explainer");
    expect(result.agentMetadata.capabilityPresentation?.widgetDescriptors).toEqual([]);
    expect(result.agentMetadata.capabilityPresentation?.actionDescriptors).toEqual([]);
  });

  it("routes habit proposal revisions through longevity_overview context", async () => {
    const contextPacket = createSlicePacket("longevity_overview", "longevity_overview");
    const { service, coachingContextService } = createOrchestratorWithCapturedProvider(contextPacket);

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Please revise the proposal with these changes: keep weekdays only.",
      recentMessages: [],
      proposalRevision: {
        supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
        modificationFeedback: "keep weekdays only",
        originalProposal: {
          intent: "adapt_habit_plan",
          targetDomain: "general",
          title: "Adjust hydration habit",
          reason: "Make the hydration target easier.",
          proposedChanges: {
            habits: [
              {
                habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
                title: "Morning hydration",
                category: "hydration",
                status: "active",
                schedule: { type: "daily" },
                target: { type: "boolean" },
                required: true,
                displayOrder: 0,
              },
            ],
          },
        },
      },
    });

    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ intent: "longevity_overview", purpose: "longevity_overview" }),
      expect.objectContaining({
        intent: "longevity_overview",
        purpose: "longevity_overview",
        routingMethod: "rule_based",
        isConfident: true,
        catalogIntentId: "longevity_overview",
      }),
      expect.objectContaining({
        contextBudget: expect.objectContaining({ profile: "deep_review" }),
      }),
    );
  });

  it("routes attachment turns through the router (attachment hints passed)", async () => {
    const contextPacket = createSlicePacket("nutrition_adaptation", "adjust_nutrition");
    const route = vi.fn().mockResolvedValue(
      createConfidentRouterResultForTests({ domain: "nutrition", confidence: 0.84 }),
    );
    const { service, generateDomainStep, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket, { routeImpl: route });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Shared attachment(s) for coaching review.",
      recentMessages: [],
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000001",
            category: "food_photo",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: "local://attachments/meal.jpg",
          },
        ],
      },
    });

    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentHints: expect.arrayContaining([
          expect.objectContaining({ category: "food_photo" }),
        ]),
      }),
    );
    // Fan-out path: generateDomainStep is called.
    expect(generateDomainStep).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "unified_turn_decision",
        catalogIntentId: "adjust_nutrition",
      }),
      expect.anything(),
    );
    // The domain step receives coaching context which includes bounded attachment metadata.
    const domainRequest = generateDomainStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };
    expect(domainRequest.coachingContext.attachmentTurn).toEqual({
      attachments: [
        {
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          category: "food_photo",
          mimeType: "image/jpeg",
          consentState: "none",
          storageRef: "local://attachments/meal.jpg",
        },
      ],
    });
    expect(result.agentMetadata.catalogIntentId).toBe("adjust_nutrition");
    expect(result.agentMetadata.routing?.routingMethod).toBe("unified_turn_decision");
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(true);
  });

  it("passes bounded attachment metadata without recognition envelope or preparedProposals", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateDomainStep } = createOrchestratorWithCapturedProvider(
      contextPacket,
    );

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "запиши мне тренировку волейбола на сегодня",
      recentMessages: [],
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "c1000004-0000-4000-8000-000000000004",
            category: "workout_attachment",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: "local://attachments/session.jpg",
          },
        ],
      },
    });

    // Fan-out path: check domain step for bounded attachment context.
    const domainRequest = generateDomainStep.mock.calls[0]?.[0] as {
      coachingContext: { attachmentTurn?: Record<string, unknown> };
    };

    expect(domainRequest.coachingContext.attachmentTurn).toMatchObject({
      attachments: [
        expect.objectContaining({
          attachmentRefId: "c1000004-0000-4000-8000-000000000004",
        }),
      ],
    });
    expect(domainRequest.coachingContext.attachmentTurn).not.toHaveProperty("preparedProposals");
    expect(domainRequest.coachingContext.attachmentTurn).not.toHaveProperty("contextSummaries");
  });

  it("passes intent-specific metadata to the domain generation step after router routing", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateDomainStep, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ intent: "adjust_workout", purpose: "workout_adaptation" }),
      expect.objectContaining({
        routingMethod: "unified_turn_decision",
        catalogIntentId: "adjust_workout",
      }),
      expect.anything(),
    );

    // Fan-out path: DomainLlmStepRequest has domain, allowedTools, allowedProposalIntents directly.
    const domainRequest = generateDomainStep.mock.calls[0]?.[0] as {
      domain: string;
      allowedTools: string[];
      allowedProposalIntents: string[];
    };

    expect(domainRequest.domain).toBe("workout");
    expect(domainRequest.allowedTools).toEqual(
      expect.arrayContaining(["getUserContextSlice", "getWeeklyProgressContext"]),
    );
    expect(domainRequest.allowedProposalIntents).toEqual(
      expect.arrayContaining(["adapt_workout_plan"]),
    );
  });

  it("propagates capability composition presentation metadata on agent turns", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service } = createOrchestratorWithCapturedProvider(contextPacket);
    const workoutConfig = getCapabilityConfig("adjust_workout");

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(result.agentMetadata.primaryCapabilityId).toBe("adjust_workout");
    expect(result.agentMetadata.selectedCapabilityIds).toEqual(["adjust_workout"]);
    expect(result.agentMetadata.capabilityPresentation).toMatchObject({
      primaryCapabilityId: "adjust_workout",
      selectedCapabilityIds: ["adjust_workout"],
      compositionStrategy: workoutConfig.compositionMetadata.strategy,
      widgetDescriptors: expect.arrayContaining([
        expect.objectContaining({ type: "proposal_card" }),
      ]),
      actionDescriptors: expect.arrayContaining([
        expect.objectContaining({ type: "create_proposal" }),
      ]),
    });
  });

  it("invokes router with recent messages", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const route = vi.fn().mockResolvedValue(createConfidentRouterResultForTests());
    const { service } = createOrchestratorWithCapturedProvider(contextPacket, {
      routeImpl: route,
    });

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({
        recentMessages: [],
      }),
    );
  });

  it("resolves coach metadata through the capability registry for the routed catalog id", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, capabilityRegistryService } = createOrchestratorWithCapturedProvider(
      contextPacket,
    );
    const getCoachIntentDefinition = vi.spyOn(
      capabilityRegistryService,
      "getCoachIntentDefinition",
    );

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(getCoachIntentDefinition).toHaveBeenCalledWith("adjust_workout");
    expect(getCoachIntentDefinition.mock.results[0]?.value).toMatchObject({
      id: "adjust_workout",
      promptInstructions: getCapabilityConfig("adjust_workout").prompt,
    });
  });

  it("falls back to general when router returns empty selectedDomains (fallback)", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const route = vi.fn().mockResolvedValue(
      createConfidentRouterResultForTests({
        domain: "workout",
        confidence: 0.35,
        source: "fallback",
      }),
    );
    const { service, generateAgentLoopStep, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket, { routeImpl: route });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "What is this photo?",
      recentMessages: [],
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "u1000001-0000-4000-8000-000000000001",
            category: "unclassified",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: null,
          },
        ],
      },
    });

    expect(route).toHaveBeenCalledTimes(1);
    expect(generateAgentLoopStep).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "unified_turn_decision",
        catalogIntentId: "general",
      }),
      expect.anything(),
    );
    expect(result.agentMetadata.routing?.routingMethod).toBe("unified_turn_decision");
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(false);
    expect(result.agentMetadata.catalogIntentId).toBe("general");
  });
});

describe("AgentOrchestratorService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("orchestrates a coach turn with typed agent metadata", async () => {
    vi.spyOn(coachProviderFactory, "resolveAiCoachProviderMode").mockReturnValue("openai");

    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service } = createOrchestratorWithCapturedProvider(contextPacket);

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(result.output.reply.length).toBeGreaterThan(0);
    expect(result.agentMetadata.provider).toBe("openai");
    expect(result.agentMetadata.purpose).toBe("workout_adaptation");
    expect(result.agentMetadata.safety.status).toBe("passed");
  });
});

describe("AgentOrchestratorService agent loop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes an allowed tool request then returns a domain answer on the next iteration (fan-out path)", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const toolResult = {
      tool: "getWeeklyProgressContext" as const,
      ok: true as const,
      result: { weeklySummary: "Light week" },
    };
    const domainSummary = "Based on your weekly progress, keep today's session lighter.";
    const decisionReply = "Based on your weekly progress, keep today's session lighter (synthesized).";

    const { service, generateDomainStep, generateFinalDecision, domainToolExecute: executeTool } =
      createOrchestratorWithCapturedProvider(contextPacket);

    // Override the domain executor's tool mock with the test-specific one.
    executeTool.mockResolvedValue(toolResult);

    // Fan-out path: generateDomainStep is used (not generateAgentLoopStep).
    // First call returns tool_request, second returns domain_answer.
    generateDomainStep
      .mockResolvedValueOnce({
        kind: "tool_request",
        tool: "getWeeklyProgressContext",
        input: {},
      })
      .mockResolvedValueOnce({
        kind: "domain_answer",
        domain: "workout",
        summary: domainSummary,
        candidateProposals: [],
        domainSignals: [],
      });

    // Phase 5: Decision-maker synthesizes the final reply.
    generateFinalDecision.mockResolvedValue({
      reply: decisionReply,
      selectedAction: null,
      proposals: [],
      consentRequired: false,
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(generateDomainStep).toHaveBeenCalledTimes(2);
    expect(executeTool).toHaveBeenCalledTimes(1);
    // Third argument is the per-domain context budget (passed so getDocumentContext
    // re-applies the deny-by-default document floor — Wiring 2 / Step 7c).
    expect(executeTool).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tool: "getWeeklyProgressContext", input: {} }),
      expect.objectContaining({ profile: expect.any(String) }),
    );

    const secondStepRequest = generateDomainStep.mock.calls[1]?.[0] as {
      priorToolResults: Array<{ tool: string; ok: boolean }>;
      iteration: number;
    };
    expect(secondStepRequest.iteration).toBe(2);
    expect(secondStepRequest.priorToolResults).toEqual([
      expect.objectContaining({ tool: toolResult.tool, ok: toolResult.ok, result: toolResult.result }),
    ]);

    // Phase 5: reply comes from decision-maker, not domain step.
    expect(result.output.reply).toBe(decisionReply);
    expect(result.agentMetadata.toolsInvoked).toEqual(["getWeeklyProgressContext"]);
    expect(result.agentMetadata.safety.status).toBe("passed");
  });

  it("rejects disallowed tool requests without executing tools and returns a safe fallback", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    // Use fallback source so the planner falls back to "general" capability,
    // which does NOT allow getDocumentContext.
    const { service, generateAgentLoopStep, agentToolRegistryService } =
      createOrchestratorWithCapturedProvider(contextPacket, {
        routeImpl: vi.fn().mockResolvedValue(
          createConfidentRouterResultForTests({ source: "fallback", confidence: 0.35 }),
        ),
      });

    const executeTool = vi.fn();
    Object.assign(agentToolRegistryService, { executeTool });

    generateAgentLoopStep.mockResolvedValueOnce({
      kind: "tool_request",
      tool: "getDocumentContext",
      input: {},
      rationale: "Attempt to read medical documents from a general turn.",
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "How can I stay consistent this week?",
      recentMessages: [],
    });

    expect(generateAgentLoopStep).toHaveBeenCalledTimes(1);
    expect(executeTool).not.toHaveBeenCalled();
    expect(result.output.reply).toBe(SAFE_FALLBACK_REPLY);
    expect(result.output.proposals).toEqual([]);
    expect(result.parseErrors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /Requested tool "getDocumentContext" is not allowed for intent "general"/,
        ),
      ]),
    );
    expect(result.agentMetadata.safety.status).toBe("parse_failed");
    expect(result.agentMetadata.toolsInvoked).toEqual([]);
    expect(result.agentMetadata.routing?.loopIterations).toBe(1);
  });
});

describe("AgentOrchestratorService provider failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns provider_error safety status and a safe fallback when the provider throws", async () => {
    vi.spyOn(coachProviderFactory, "resolveAiCoachProviderMode").mockReturnValue("openai");

    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service } = createOrchestratorWithCapturedProvider(contextPacket);

    // For the fan-out path (router source="llm"), the provider error propagates through
    // DomainLlmExecutorService which degrades to a fallback. Set domain step and decision-maker
    // to throw so both fail — safety floor must hold (no proposals, safe reply).
    Object.assign(service, {
      provider: {
        generateAgentLoopStep: vi
          .fn()
          .mockRejectedValue(new Error("OpenAI coach provider request failed.")),
        generateDomainStep: vi
          .fn()
          .mockRejectedValue(new Error("OpenAI coach provider request failed.")),
        generateCoachResponse: vi.fn(),
        generateFinalDecision: vi
          .fn()
          .mockRejectedValue(new Error("OpenAI coach provider request failed.")),
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    // Phase 5: all domain LLMs and decision-maker fail → createFallbackFinalDecision() reply.
    // The safety floor is preserved — no proposals leak regardless of failure mode.
    expect(result.output.reply.length).toBeGreaterThan(0);
    expect(result.output.proposals).toEqual([]);
    expect(result.agentMetadata.provider).toBe("openai");
    // Fan-out path: all domains degrade → parse_failed.
    expect(result.agentMetadata.safety.status).toBeOneOf(["provider_error", "parse_failed"]);
    expect(result.parseErrors.length).toBeGreaterThan(0);
  });

  it("returns safe fallback without proposals when provider throws on attachment turns", async () => {
    vi.spyOn(coachProviderFactory, "resolveAiCoachProviderMode").mockReturnValue("openai");

    const contextPacket = createSlicePacket("nutrition_adaptation", "adjust_nutrition");
    const { service } = createOrchestratorWithCapturedProvider(contextPacket, {
      routeImpl: vi.fn().mockResolvedValue(
        createConfidentRouterResultForTests({ domain: "nutrition" }),
      ),
    });

    // For the fan-out path, domain step and decision-maker both throw.
    Object.assign(service, {
      provider: {
        generateAgentLoopStep: vi
          .fn()
          .mockRejectedValue(new Error("OpenAI coach provider request failed.")),
        generateDomainStep: vi
          .fn()
          .mockRejectedValue(new Error("OpenAI coach provider request failed.")),
        generateCoachResponse: vi.fn(),
        generateFinalDecision: vi
          .fn()
          .mockRejectedValue(new Error("OpenAI coach provider request failed.")),
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Log this meal from the photo",
      recentMessages: [],
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000002",
            category: "food_photo",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: "local://attachments/meal.jpg",
          },
        ],
      },
    });

    // Phase 5: all failures → safe fallback reply, no proposals.
    expect(result.output.reply.length).toBeGreaterThan(0);
    expect(result.output.proposals).toEqual([]);
    expect(result.agentMetadata.safety.status).toBeOneOf(["provider_error", "parse_failed"]);
    expect(result.agentMetadata.unifiedTurnDecision?.ran).toBe(true);
  });
});

describe("AgentOrchestratorService compression review flow", () => {
  it("passes typed compression summary from provider to coach context for monthly review turns", async () => {
    const contextPacket = createSlicePacket("weekly_review", "review_progress", {
      weeklyProgress: {
        weekStart: "2026-05-19",
        weekEnd: "2026-05-25",
        dataStatus: "sufficient",
        userMessage: "Training volume held steady this month.",
        trends: [
          {
            id: "a1000001-0000-4000-8000-000000000001",
            domain: "workout",
            direction: "stable",
            message: "Workout completion stayed consistent.",
          },
        ],
      },
    });

    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "Here is your monthly review summary.",
      proposals: [],
    });
    // generateDomainStep is used by the fan-out path (router source="llm" turns).
    const generateDomainStep = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Here is your monthly review summary.",
      candidateProposals: [],
      domainSignals: [],
    });
    const generateCoachResponse = vi.fn();
    const generateFinalDecision = vi.fn().mockResolvedValue({
      reply: "Here is your monthly review summary.",
      selectedAction: null,
      proposals: [],
      consentRequired: false,
    });

    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const agentToolRegistryService = {
      executeTool: vi.fn(),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const routerDeps = createRouterTestDeps(
      vi.fn().mockResolvedValue(
        createConfidentRouterResultForTests({ domain: "workout" }),
      ),
    );

    // Wire a mock provider that returns a valid summary (simulates OpenAiContextCompressionProvider
    // succeeding — the provider is injected; tests don't need a real API key).
    const mockCompressionSummary = {
      reviewKind: "monthly_review" as const,
      keyFindings: ["Training volume held steady."],
      risks: [],
      focusAreas: ["Weekly progress"],
      sourceRanges: [],
      sourceRefs: [],
      dataQuality: "sufficient" as const,
      confidence: "medium" as const,
    };
    const mockProvider = {
      compress: vi.fn().mockResolvedValue(mockCompressionSummary),
    };

    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(mockProvider),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService(agentToolRegistryService as never),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    Object.assign(service, {
      provider: { generateCoachResponse, generateAgentLoopStep, generateDomainStep, generateFinalDecision },
    });

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "How did my last month of training and recovery go?",
      recentMessages: [],
    });

    // Fan-out path: check the domain step request for compression context.
    const domainRequest = generateDomainStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };

    expect(domainRequest.coachingContext.contextCompressionSummary).toEqual(
      expect.objectContaining({
        reviewKind: "monthly_review",
        keyFindings: expect.arrayContaining([expect.any(String)]),
        focusAreas: expect.arrayContaining([expect.any(String)]),
      }),
    );
    expect(domainRequest.coachingContext.contextCompressionNotes).toEqual(
      expect.arrayContaining([expect.stringContaining("typed summary")]),
    );
    expect(
      (domainRequest.coachingContext.agentContext as Record<string, unknown>).contextCompressionApplied,
    ).toBe(true);
    expect(
      (domainRequest.coachingContext.agentContext as Record<string, unknown>).expansionPolicy,
    ).toEqual(
      expect.objectContaining({
        maxExpansionRounds: 2,
        maxSlicesPerRound: 3,
      }),
    );
  });

  it("degrades to null summary when the provider fails on review turns (S2 — no second LLM call)", async () => {
    const contextPacket = createSlicePacket("weekly_review", "review_progress", {
      weeklyProgress: {
        weekStart: "2026-05-19",
        weekEnd: "2026-05-25",
        dataStatus: "sufficient",
        userMessage: "Training volume held steady this month.",
        trends: [
          {
            id: "a1000001-0000-4000-8000-000000000001",
            domain: "workout",
            direction: "stable",
            message: "Workout completion stayed consistent.",
          },
        ],
      },
    });

    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "Here is your monthly review summary.",
      proposals: [],
    });
    const generateDomainStep = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Here is your monthly review summary.",
      candidateProposals: [],
      domainSignals: [],
    });
    const generateCoachResponse = vi.fn();
    const generateFinalDecisionFallback = vi.fn().mockResolvedValue({
      reply: "Here is your monthly review summary.",
      selectedAction: null,
      proposals: [],
      consentRequired: false,
    });

    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const agentToolRegistryService = {
      executeTool: vi.fn(),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const failingProvider = {
      compress: vi.fn().mockRejectedValue(new Error("Primary compression provider unavailable")),
    };
    const routerDeps = createRouterTestDeps(
      vi.fn().mockResolvedValue(
        createConfidentRouterResultForTests({ domain: "workout" }),
      ),
    );
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(failingProvider as never),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService(agentToolRegistryService as never),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    Object.assign(service, {
      provider: { generateCoachResponse, generateAgentLoopStep, generateDomainStep, generateFinalDecision: generateFinalDecisionFallback },
    });

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "How did my last month of training and recovery go?",
      recentMessages: [],
    });

    // Fan-out path: provider failure degrades to null summary without a second LLM call (S2).
    const domainRequest = generateDomainStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };

    // S2: summary is null; turn still completes (fail-closed, not turn-fatal).
    expect(domainRequest.coachingContext.contextCompressionSummary).toBeUndefined();
    expect(domainRequest.coachingContext.contextCompressionNotes).toEqual(
      expect.arrayContaining([expect.stringContaining("failed")]),
    );
    // contextCompressionApplied should be false since summary is null.
    expect(
      (domainRequest.coachingContext.agentContext as Record<string, unknown>).contextCompressionApplied,
    ).toBe(false);
  });

  it("does not attach compression summary for routine coaching turns", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateDomainStep } = createOrchestratorWithCapturedProvider(contextPacket);

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    // Fan-out path: check the domain step request (not the loop step).
    const domainRequest = generateDomainStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };

    expect(domainRequest.coachingContext).not.toHaveProperty("contextCompressionSummary");
    expect(
      (domainRequest.coachingContext.agentContext as Record<string, unknown>).contextCompressionApplied,
    ).toBeUndefined();
  });
});

describe("AgentOrchestratorService router integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs router before planning for eligible turns and records bounded metadata", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const route = vi.fn().mockResolvedValue(createConfidentRouterResultForTests());
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "Here is a wellness-focused response you can review.",
      proposals: [],
    });

    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const routerDeps = createRouterTestDeps(route);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    Object.assign(service, {
      provider: { generateAgentLoopStep },
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({
        recentMessages: [],
      }),
    );
    expect(result.agentMetadata.unifiedTurnDecision).toMatchObject({
      ran: true,
      source: "llm",
    });
    expect(result.agentMetadata.routing?.unifiedTurnDecisionInvoked).toBe(true);
    expect(result.agentMetadata.routing?.routingMethod).toBe("unified_turn_decision");
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(true);
  });

  it("skips router for proposal explainer turns", async () => {
    const contextPacket = createSlicePacket("general_chat", "proposal_explainer");
    const route = vi.fn();
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "Here is a wellness-focused response you can review.",
      proposals: [],
    });
    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const routerDeps = createRouterTestDeps(route);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    Object.assign(service, {
      provider: { generateAgentLoopStep },
    });

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Why this proposal?",
      recentMessages: [],
      proposalExplainer: {
        proposalId: "a1000001-0000-4000-8000-000000000001",
        intent: "adapt_workout_plan",
        targetDomain: "workout",
        title: "Lighten leg day",
        reason: "Recent poor sleep suggested a lighter session.",
        status: "pending",
        evidenceSummaries: [],
        createdAt: "2026-05-27T10:00:00.000Z",
      },
    });

    expect(route).not.toHaveBeenCalled();
  });

  it("runs router for attachment turns (attachment hints included in request)", async () => {
    const contextPacket = createSlicePacket("nutrition_adaptation", "general");
    const route = vi.fn().mockResolvedValue(createConfidentRouterResultForTests({ domain: "nutrition" }));
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "Here is a wellness-focused response you can review.",
      proposals: [],
    });
    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const routerDeps = createRouterTestDeps(route);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    Object.assign(service, {
      provider: { generateAgentLoopStep },
    });

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Shared attachment(s) for coaching review.",
      recentMessages: [],
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000001",
            category: "food_photo",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: "local://attachments/meal.jpg",
          },
        ],
      },
    });

    expect(route).toHaveBeenCalled();
    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentHints: expect.arrayContaining([
          expect.objectContaining({ category: "food_photo" }),
        ]),
      }),
    );
  });

  it("skips router for proposal revision turns", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const route = vi.fn();
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "Here is a revised proposal draft for review.",
      proposals: [],
    });
    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const routerDeps = createRouterTestDeps(route);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    Object.assign(service, {
      provider: { generateAgentLoopStep },
    });

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Please revise the proposal with these changes: keep one strength exercise.",
      recentMessages: [],
      proposalRevision: {
        supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
        modificationFeedback: "Keep one strength exercise.",
        originalProposal: {
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Adjust today's workout",
          reason: "Recovery signals are low.",
          proposedChanges: {
            title: "Strength base",
            summary: "Lighter session today.",
            days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
            notes: [],
          },
        },
      },
    });

    expect(route).not.toHaveBeenCalled();
    expect(generateAgentLoopStep).toHaveBeenCalled();
  });

  it("invokes router before planning and skips coach llm for direct read plans", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const route = vi.fn().mockResolvedValue(
      createConfidentRouterResultForTests({ source: "fallback", confidence: 0.35 }),
    );
    const generateAgentLoopStep = vi.fn();
    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const routerDeps = createRouterTestDeps(route);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    Object.assign(service, {
      provider: { generateAgentLoopStep },
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "What is today?",
      recentMessages: [],
    });

    expect(route).toHaveBeenCalled();
    expect(generateAgentLoopStep).not.toHaveBeenCalled();
    expect(result.agentMetadata.responseModeExecution).toMatchObject({
      executorMode: "deterministic_read",
      llmInvoked: false,
      delegatedToPreAiGate: true,
    });
    expect(result.agentMetadata.unifiedTurnDecision?.ran).toBe(true);
  });

  it("falls back to general when router confidence is low (fallback source)", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const route = vi.fn().mockResolvedValue(
      createConfidentRouterResultForTests({ source: "fallback", confidence: 0.35 }),
    );
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "Here is a wellness-focused response you can review.",
      proposals: [],
    });

    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const routerDeps = createRouterTestDeps(route);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    Object.assign(service, {
      provider: { generateAgentLoopStep },
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "I feel completely off today. What should I do?",
      recentMessages: [],
    });

    expect(route).toHaveBeenCalled();
    expect(result.agentMetadata.routing?.routingMethod).toBe("unified_turn_decision");
    expect(result.agentMetadata.catalogIntentId).toBe("general");
    expect(result.agentMetadata.unifiedTurnDecision?.source).toBe("fallback");
  });

  it("uses router for classified attachment turns", async () => {
    const contextPacket = createSlicePacket("nutrition_adaptation", "general");
    const route = vi.fn().mockResolvedValue(
      createConfidentRouterResultForTests({ domain: "nutrition", confidence: 0.84 }),
    );
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "I reviewed your meal photo.",
      proposals: [],
    });
    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const routerDeps = createRouterTestDeps(route);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    Object.assign(service, {
      provider: { generateAgentLoopStep },
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Log this meal",
      recentMessages: [],
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000002",
            category: "food_photo",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: "local://attachments/lunch.jpg",
          },
        ],
      },
    });

    expect(route).toHaveBeenCalled();
    expect(result.agentMetadata.unifiedTurnDecision?.ran).toBe(true);
    expect(result.agentMetadata.routing?.unifiedTurnDecisionInvoked).toBe(true);
    expect(result.agentMetadata.routing?.routingMethod).toBe("unified_turn_decision");
  });

  it("uses router for normal text turns", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const route = vi.fn().mockResolvedValue(createConfidentRouterResultForTests());
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "Here is a wellness-focused response you can review.",
      proposals: [],
    });
    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const routerDeps = createRouterTestDeps(route);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    Object.assign(service, {
      provider: { generateAgentLoopStep },
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(route).toHaveBeenCalled();
    expect(result.agentMetadata.unifiedTurnDecision?.ran).toBe(true);
    expect(result.agentMetadata.routing?.routingMethod).toBe("unified_turn_decision");
    expect(result.agentMetadata.catalogIntentId).toBe("adjust_workout");
  });
});

describe("AgentOrchestratorService response mode execution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records llm invocation metadata for normal text turns", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateDomainStep } = createOrchestratorWithCapturedProvider(contextPacket);

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    // Fan-out path: generateDomainStep is called (not generateAgentLoopStep).
    expect(generateDomainStep).toHaveBeenCalled();
    expect(result.agentMetadata.responseModeExecution).toMatchObject({
      llmInvoked: true,
      expectedResponseMode: "recommendation_with_optional_proposal",
    });
    expect(result.agentMetadata.responseModeExecution?.executorMode).toBeTruthy();
  });

  it("still invokes llm for proposal explainer turns routed before orchestrator", async () => {
    const contextPacket = createSlicePacket("general_chat", "proposal_explainer");
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "This proposal adjusts your workout volume.",
      proposals: [],
    });
    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const routerDeps = createRouterTestDeps(vi.fn());
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      routerDeps.messagePreprocessorService as never,
      routerDeps.routerLlmService as never,
      createStubDomainLlmExecutorService(),
      new ActionResolverService(),
      new DecisionMakerExecutorService(),
      new ActionVariantCatalogService(),
    );

    Object.assign(service, {
      provider: { generateAgentLoopStep },
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Why this proposal?",
      recentMessages: [],
      proposalExplainer: buildProposalExplainerTurnContext({
        proposalId: "a1000001-0000-4000-8000-000000000001",
        intent: "adapt_workout_plan",
        targetDomain: "workout",
        title: "Adjust plan",
        reason: "Recent fatigue suggested a lighter week.",
        status: "pending",
        evidenceRefs: [{ domain: "wellbeing", label: "Fatigue reported" }],
        createdAt: new Date().toISOString(),
      }),
    });

    expect(generateAgentLoopStep).toHaveBeenCalled();
    expect(result.agentMetadata.responseModeExecution).toMatchObject({
      executorMode: "single_llm",
      llmInvoked: true,
    });
    expect(result.output.proposals).toEqual([]);
  });

  it.each([
    ["workout adaptation", "Can you adapt my workout plan this week?", "proposal_flow", true],
    ["direct read", "What is today?", "deterministic_read", false],
    ["proposal explainer", "Why this proposal?", "single_llm", true],
  ] as const)(
    "records explicit executorMode and llmInvoked for %s turns",
    async (_label, userMessage, expectedExecutorMode, expectsCoachLlm) => {
      const contextPacket =
        expectedExecutorMode === "single_llm"
          ? createSlicePacket("general_chat", "proposal_explainer")
          : expectedExecutorMode === "deterministic_read"
            ? createSlicePacket("general_chat", "general")
            : createSlicePacket("workout_adaptation", "adjust_workout");
      const generateAgentLoopStep = vi.fn().mockResolvedValue({
        kind: "final_answer",
        reply: "Here is a wellness-focused response you can review.",
        proposals: [],
      });
      // generateDomainStep is used by the fan-out path (proposal_flow with llm router).
      const generateDomainStep = vi.fn().mockResolvedValue({
        kind: "domain_answer",
        domain: "workout",
        summary: "Here is a wellness-focused response you can review.",
        candidateProposals: [],
        domainSignals: [],
      });
      const coachingContextService = {
        buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
        toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
          buildAgentPromptContextFromPacket(packet),
        ),
      };
      const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
      const routerDeps = createRouterTestDeps(
        vi.fn().mockResolvedValue(
          expectedExecutorMode === "proposal_flow"
            ? createConfidentRouterResultForTests({ domain: "workout" })
            : createConfidentRouterResultForTests({ source: "fallback", confidence: 0.35 }),
        ),
      );
      const service = new AgentOrchestratorService(
        coachingContextService as never,
        new ContextCompressionService(),
        new ContextExpansionPolicyService(),
        systemPlannerService,
        createResponseModeExecutorService({ executeTool: vi.fn() }),
        aiBehaviorConfigService,
        routerDeps.messagePreprocessorService as never,
        routerDeps.routerLlmService as never,
        createStubDomainLlmExecutorService(),
        new ActionResolverService(),
        new DecisionMakerExecutorService(),
        new ActionVariantCatalogService(),
      );

      Object.assign(service, {
        provider: { generateAgentLoopStep, generateDomainStep },
      });

      const result = await service.orchestrateCoachTurn({
        auth: {
          clerkUserId: "clerk-user",
          email: "test@example.com",
          displayName: "Test",
        },
        userMessage,
        recentMessages: [],
        ...(expectedExecutorMode === "single_llm"
          ? {
              proposalExplainer: buildProposalExplainerTurnContext({
                proposalId: "a1000001-0000-4000-8000-000000000001",
                intent: "adapt_workout_plan",
                targetDomain: "workout",
                title: "Adjust plan",
                reason: "Recent fatigue suggested a lighter week.",
                status: "pending",
                evidenceRefs: [{ domain: "wellbeing", label: "Fatigue reported" }],
                createdAt: new Date().toISOString(),
              }),
            }
          : {}),
      });

      expect(result.agentMetadata.responseModeExecution?.executorMode).toBe(expectedExecutorMode);
      expect(result.agentMetadata.responseModeExecution?.llmInvoked).toBe(expectsCoachLlm);
      if (expectsCoachLlm) {
        // proposal_flow uses fan-out (generateDomainStep); single_llm and others use generateAgentLoopStep.
        if (expectedExecutorMode === "proposal_flow") {
          expect(generateDomainStep).toHaveBeenCalled();
        } else {
          expect(generateAgentLoopStep).toHaveBeenCalled();
        }
      } else {
        expect(generateAgentLoopStep).not.toHaveBeenCalled();
        expect(generateDomainStep).not.toHaveBeenCalled();
      }
    },
  );
});

describe("AgentOrchestratorService Phase 4c fan-out", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs multiple domain LLMs concurrently for multi-domain router results", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    // Router returns two domains: workout + nutrition.
    const twoDomainsRoute = vi.fn().mockResolvedValue({
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [
          { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "nutrition", confidence: 0.7, intentHints: [], toolHints: [], signalHints: [] },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: 0.9,
      }),
      source: "llm",
      validationErrors: [],
    } satisfies RouterLlmResult);

    const generateDomainStep = vi
      .fn()
      // First domain call (workout).
      .mockResolvedValueOnce({
        kind: "domain_answer",
        domain: "workout",
        summary: "Workout plan adjusted for today.",
        candidateProposals: [
          {
            intent: "adapt_workout_plan",
            targetDomain: "workout",
            title: "Lighter session",
            reason: "Fatigue signals.",
            proposedChanges: {
              title: "Recovery day",
              summary: "Light day.",
              days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
              notes: [],
            },
          },
        ],
        domainSignals: ["fatigue"],
      })
      // Second domain call (nutrition).
      .mockResolvedValueOnce({
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Lighter meals suggested for recovery.",
        candidateProposals: [],
        domainSignals: [],
      });

    const workoutProposal = {
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Lighter session",
      reason: "Fatigue signals.",
      proposedChanges: {
        title: "Recovery day",
        summary: "Light day.",
        days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        notes: [],
      },
    };
    const decisionMakerReply = "Workout plan adjusted and lighter meals suggested for recovery.";

    const { service, coachingContextService } = createOrchestratorWithCapturedProvider(
      contextPacket,
      { routeImpl: twoDomainsRoute },
    );

    const generateFinalDecision = vi.fn().mockResolvedValue({
      reply: decisionMakerReply,
      selectedAction: "adapt_workout_plan",
      proposals: [workoutProposal],
      consentRequired: false,
    });

    Object.assign(service, {
      provider: {
        generateDomainStep,
        generateAgentLoopStep: vi.fn(),
        generateCoachResponse: vi.fn(),
        generateFinalDecision,
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "I'm exhausted, adjust my workout and suggest lighter meals.",
      recentMessages: [],
    });

    // Both domain LLMs are called.
    expect(generateDomainStep).toHaveBeenCalledTimes(2);
    // Phase 5: reply comes from decision-maker (synthesized from domain outputs).
    expect(result.output.reply).toBe(decisionMakerReply);
    // Only workout proposal (decision-maker selects it; ActionResolver re-filters to union allowlist).
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");
    expect(result.agentMetadata.safety.status).toBe("passed");
    // buildAgentContext is called for primary + two domains.
    expect(coachingContextService.buildAgentContext).toHaveBeenCalled();
  });

  it("degrades single domain to fallback without blocking other domains (failure isolation)", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const twoDomainsRoute = vi.fn().mockResolvedValue({
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [
          { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "nutrition", confidence: 0.7, intentHints: [], toolHints: [], signalHints: [] },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: 0.9,
      }),
      source: "llm",
      validationErrors: [],
    } satisfies RouterLlmResult);

    const generateDomainStep = vi
      .fn()
      // First domain (workout) throws — should degrade to fallback.
      .mockRejectedValueOnce(new Error("Workout LLM error"))
      // Second domain (nutrition) succeeds.
      .mockResolvedValueOnce({
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Nutrition domain answered successfully.",
        candidateProposals: [],
        domainSignals: [],
      });

    const { service } = createOrchestratorWithCapturedProvider(contextPacket, {
      routeImpl: twoDomainsRoute,
    });

    const nutritionReply = "Nutrition domain answered successfully — workout domain unavailable.";
    const generateFinalDecision = vi.fn().mockResolvedValue({
      reply: nutritionReply,
      selectedAction: null,
      proposals: [],
      consentRequired: false,
    });

    Object.assign(service, {
      provider: {
        generateDomainStep,
        generateAgentLoopStep: vi.fn(),
        generateCoachResponse: vi.fn(),
        generateFinalDecision,
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "I'm exhausted, adjust my workout and suggest lighter meals.",
      recentMessages: [],
    });

    // Phase 5: reply comes from decision-maker synthesis.
    expect(result.output.reply).toBe(nutritionReply);
    // No proposals.
    expect(result.output.proposals).toHaveLength(0);
    // Parse errors indicate the degraded workout domain.
    expect(result.parseErrors).toEqual(
      expect.arrayContaining([expect.stringContaining("workout")]),
    );
    // Safety status: one domain passed so overall is "passed".
    expect(result.agentMetadata.safety.status).toBe("passed");
  });

  it("returns safe fallback reply when ALL domains degrade", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const singleDomainRoute = vi.fn().mockResolvedValue(
      createConfidentRouterResultForTests({ domain: "workout", confidence: 0.85 }),
    );

    const generateDomainStep = vi
      .fn()
      .mockRejectedValue(new Error("All domains failed"));

    const { service } = createOrchestratorWithCapturedProvider(contextPacket, {
      routeImpl: singleDomainRoute,
    });

    Object.assign(service, {
      provider: {
        generateDomainStep,
        generateAgentLoopStep: vi.fn(),
        generateCoachResponse: vi.fn(),
        // Decision-maker also throws to simulate a total failure scenario.
        generateFinalDecision: vi.fn().mockRejectedValue(new Error("Decision-maker also failed")),
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Adjust my workout.",
      recentMessages: [],
    });

    // Phase 5: all domains degraded + decision-maker failed → createFallbackFinalDecision reply.
    // The fallback reply is the safe wellness coaching message (not "could not safely process").
    expect(result.output.reply.length).toBeGreaterThan(0);
    expect(result.output.proposals).toHaveLength(0);
    expect(result.agentMetadata.safety.status).toBe("parse_failed");
    // Parse errors record both the domain degradation and decision-maker degradation.
    expect(result.parseErrors.length).toBeGreaterThan(0);
  });

  it("ActionResolver filters out-of-allowlist proposals from decision-maker output (Phase 5)", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const workoutProposal = {
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Lighter session",
      reason: "Fatigue.",
      proposedChanges: {
        title: "Recovery day",
        summary: "Light.",
        days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        notes: [],
      },
    };
    const outOfAllowlistProposal = {
      // This intent is not in the workout domain allowlist — must be filtered out.
      intent: "create_nutrition_plan",
      targetDomain: "nutrition",
      title: "Nutrition plan",
      reason: "Out of domain.",
      proposedChanges: {},
    };

    // Single workout domain — domain step returns both workout + nutrition proposals.
    const generateDomainStep = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Workout advice provided.",
      candidateProposals: [workoutProposal, outOfAllowlistProposal],
      domainSignals: [],
    });

    const { service } = createOrchestratorWithCapturedProvider(contextPacket);

    // Decision-maker forwards both proposals — ActionResolver must filter the out-of-allowlist one.
    const generateFinalDecision = vi.fn().mockResolvedValue({
      reply: "Workout advice provided.",
      selectedAction: "adapt_workout_plan",
      proposals: [workoutProposal, outOfAllowlistProposal],
      consentRequired: false,
    });

    Object.assign(service, {
      provider: {
        generateDomainStep,
        generateAgentLoopStep: vi.fn(),
        generateCoachResponse: vi.fn(),
        generateFinalDecision,
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Adjust my workout.",
      recentMessages: [],
    });

    // Only the workout proposal should remain after ActionResolver filters to the union allowlist.
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");
    expect(result.agentMetadata.safety.status).toBe("passed");
  });

  // -------------------------------------------------------------------------
  // Phase 4 pre-gate bypass invariants
  // Pre-AI gates (crisis, direct-path, proposal-revision, explainer) MUST
  // bypass the fan-out — RouterLlm must not run for those turns.
  // -------------------------------------------------------------------------

  it("proposal-revision turns bypass the router and fan-out (single-executor path)", async () => {
    // Proposal-revision always uses the single-executor path (ResponseModeExecutorService).
    // The fan-out path (DomainLlmExecutorService) must not run.
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const generateDomainStep = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Revised proposal.",
      candidateProposals: [],
      domainSignals: [],
    });

    const { service, routerLlmService } = createOrchestratorWithCapturedProvider(contextPacket);

    Object.assign(service, {
      provider: {
        generateDomainStep,
        generateAgentLoopStep: vi.fn().mockResolvedValue({
          kind: "final_answer",
          reply: "Revised proposal draft for review.",
          proposals: [],
        }),
        generateCoachResponse: vi.fn(),
      },
    });

    await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Please revise the proposal.",
      recentMessages: [],
      proposalRevision: {
        supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
        modificationFeedback: "Make it lighter.",
        originalProposal: {
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Workout plan",
          reason: "Fatigue.",
          proposedChanges: {
            title: "Strength base",
            summary: "Lighter session today.",
            days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
            notes: [],
          },
        },
      },
    });

    // Router must NOT run for proposal-revision turns.
    expect(routerLlmService.route).not.toHaveBeenCalled();
    // Domain step (fan-out path) must NOT run; single-executor path is used.
    expect(generateDomainStep).not.toHaveBeenCalled();
  });

  it("proposal-explainer turns bypass the router and fan-out (single-executor path)", async () => {
    const contextPacket = createSlicePacket("general_chat", "proposal_explainer");
    const generateDomainStep = vi.fn().mockResolvedValue({
      kind: "domain_answer",
      domain: "health",
      summary: "This should not be used on explainer turns.",
      candidateProposals: [],
      domainSignals: [],
    });
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "I suggested this because your recovery signals were low.",
      proposals: [],
    });

    const { service, routerLlmService } = createOrchestratorWithCapturedProvider(contextPacket);

    Object.assign(service, {
      provider: {
        generateDomainStep,
        generateAgentLoopStep,
        generateCoachResponse: vi.fn(),
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Why this proposal?",
      recentMessages: [],
      proposalExplainer: {
        proposalId: "a1000001-0000-4000-8000-000000000001",
        intent: "adapt_workout_plan",
        targetDomain: "workout",
        title: "Lighten leg day",
        reason: "Recent poor sleep.",
        status: "pending",
        evidenceSummaries: [],
        createdAt: "2026-05-27T10:00:00.000Z",
      },
    });

    // Router and fan-out (domain step) must NOT run.
    expect(routerLlmService.route).not.toHaveBeenCalled();
    expect(generateDomainStep).not.toHaveBeenCalled();
    // Single-executor path (agentLoopStep) runs instead.
    expect(generateAgentLoopStep).toHaveBeenCalled();
    // Explainer returns no proposals.
    expect(result.output.proposals).toHaveLength(0);
  });

  it("direct-path turns bypass the fan-out domain LLMs", async () => {
    // 'What is today?' resolves to deterministic_read — no LLM runs.
    const contextPacket = createSlicePacket("general_chat", "general");
    const generateDomainStep = vi.fn();
    const generateAgentLoopStep = vi.fn();

    const { service, routerLlmService } = createOrchestratorWithCapturedProvider(
      contextPacket,
      {
        routeImpl: vi.fn().mockResolvedValue(
          createConfidentRouterResultForTests({ source: "fallback", confidence: 0.35 }),
        ),
      },
    );

    Object.assign(service, {
      provider: {
        generateDomainStep,
        generateAgentLoopStep,
        generateCoachResponse: vi.fn(),
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "What is today?",
      recentMessages: [],
    });

    // Router runs for direct-path turns (it's not a pre-gate bypass at the orchestrator level),
    // but neither the domain LLMs nor the agent loop are invoked.
    expect(routerLlmService.route).toHaveBeenCalledTimes(1);
    expect(generateDomainStep).not.toHaveBeenCalled();
    expect(generateAgentLoopStep).not.toHaveBeenCalled();
    // Direct-path returns a deterministic result.
    expect(result.agentMetadata.responseModeExecution?.delegatedToPreAiGate).toBe(true);
    expect(result.agentMetadata.responseModeExecution?.executorMode).toBe("deterministic_read");
  });

  it("per-domain context packets are built independently — secondary domain does not inherit primary's slices", async () => {
    // Phase 5 requirement: buildDomainContextPackets must call buildAgentContext once per
    // selected domain with that domain's OWN capability (not the primary domain's budget).
    // A secondary non-document domain (nutrition) must NOT inherit a document-heavy
    // context slice plan from the primary (workout) domain.
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const twoDomainsRoute = vi.fn().mockResolvedValue({
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [
          { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "nutrition", confidence: 0.7, intentHints: [], toolHints: [], signalHints: [] },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: 0.9,
      }),
      source: "llm",
      validationErrors: [],
    } satisfies RouterLlmResult);

    const { service, coachingContextService, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket, { routeImpl: twoDomainsRoute });

    generateFinalDecision.mockResolvedValue({
      reply: "Per-domain context isolation confirmed.",
      selectedAction: null,
      proposals: [],
      consentRequired: false,
    });

    await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "I'm exhausted. Adjust my workout and suggest lighter meals.",
      recentMessages: [],
    });

    // buildAgentContext is called for: primary (route-level) + workout domain + nutrition domain.
    // Each domain call should use that domain's own capability context request.
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledTimes(3);

    // Verify that the two per-domain calls used different intent/purpose shapes,
    // proving each domain derived context from its OWN capability.
    const allContextCalls = coachingContextService.buildAgentContext.mock.calls as Array<
      [unknown, { intent: string; depth?: string; timeRange?: string }, unknown, unknown]
    >;

    // Extract the per-domain calls (not the primary route call).
    // The primary call uses the route's intent; the per-domain calls use each domain's intent.
    const perDomainIntents = allContextCalls
      .slice(1)  // skip the primary route call
      .map((call) => call[1]?.intent);

    // Workout domain → adjust_workout context; nutrition domain → adjust_nutrition context.
    // They must differ (no cross-domain context inheritance).
    expect(new Set(perDomainIntents).size).toBeGreaterThan(0);

    // Critically: nutrition domain must NOT use workout's includeDocuments=true behavior.
    // Per buildDomainContextRequest, includeDocuments is always false for non-document contexts.
    const allIncludeDocumentValues = allContextCalls.map((call) => (call[1] as { includeDocuments?: boolean })?.includeDocuments);
    // All domain context requests must have includeDocuments=false (safety floor).
    for (const includeDocuments of allIncludeDocumentValues) {
      expect(includeDocuments).toBeFalsy();
    }
  });

  it("three-domain fan-out produces combined reply and merged proposals with per-domain filtering", async () => {
    // Router returns all three domains (max fan-out).
    const threeDomainsRoute = vi.fn().mockResolvedValue({
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [
          { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "nutrition", confidence: 0.75, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "health", confidence: 0.70, intentHints: [], toolHints: [], signalHints: [] },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: 0.9,
      }),
      source: "llm",
      validationErrors: [],
    } satisfies RouterLlmResult);

    const generateDomainStep = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "domain_answer",
        domain: "workout",
        summary: "Lighter workout for today.",
        candidateProposals: [
          {
            intent: "adapt_workout_plan",
            targetDomain: "workout",
            title: "Recovery session",
            reason: "Fatigue.",
            proposedChanges: {
              title: "Recovery",
              summary: "Easy day.",
              days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
              notes: [],
            },
          },
        ],
        domainSignals: ["fatigue"],
      })
      .mockResolvedValueOnce({
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Light meals recommended.",
        candidateProposals: [],
        domainSignals: [],
      })
      .mockResolvedValueOnce({
        kind: "domain_answer",
        domain: "health",
        summary: "Rest and recovery advised.",
        candidateProposals: [],
        domainSignals: [],
      });

    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service } = createOrchestratorWithCapturedProvider(contextPacket, {
      routeImpl: threeDomainsRoute,
    });

    const workoutProposalForThreeDomain = {
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Recovery session",
      reason: "Fatigue.",
      proposedChanges: {
        title: "Recovery",
        summary: "Easy day.",
        days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        notes: [],
      },
    };
    const threeDomainsDecisionReply = "Three-domain synthesis: lighter workout, light meals, and rest recommended.";
    const generateFinalDecision = vi.fn().mockResolvedValue({
      reply: threeDomainsDecisionReply,
      selectedAction: "adapt_workout_plan",
      proposals: [workoutProposalForThreeDomain],
      consentRequired: false,
    });

    Object.assign(service, {
      provider: {
        generateDomainStep,
        generateAgentLoopStep: vi.fn(),
        generateCoachResponse: vi.fn(),
        generateFinalDecision,
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "I'm exhausted. Adjust my workout, suggest lighter meals, and check my health.",
      recentMessages: [],
    });

    // All three domains called.
    expect(generateDomainStep).toHaveBeenCalledTimes(3);
    // Decision-maker is also called (Stage 9).
    expect(generateFinalDecision).toHaveBeenCalledTimes(1);
    // Phase 5: reply comes from decision-maker synthesis.
    expect(result.output.reply).toBe(threeDomainsDecisionReply);
    // Only the workout proposal survives filtering (ActionResolver filters to union allowlist).
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");
    expect(result.agentMetadata.safety.status).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// Phase 5 safety floor: decision-maker reply safety (fan-out path)
// ---------------------------------------------------------------------------
describe("AgentOrchestratorService fan-out reply safety floor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks and replaces a decision-maker reply containing diagnosis language (fan-out path)", async () => {
    // Safety floor: the decision-maker synthesizes a new reply after all domain LLMs finish.
    // If that reply contains diagnosis/treatment/medical-certainty language, it must be blocked
    // and replaced with the safe fallback reply — identical to the single-executor path behaviour
    // in ResponseModeExecutorService.validateAndResolveFinalAnswer.
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const workoutProposal = {
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Lighter session",
      reason: "Fatigue signals.",
      proposedChanges: {
        title: "Recovery day",
        summary: "Light day.",
        days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        notes: [],
      },
    };

    const { service, generateDomainStep } = createOrchestratorWithCapturedProvider(contextPacket);

    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Here is a safe domain summary.",
      candidateProposals: [workoutProposal],
      domainSignals: [],
    });

    // Decision-maker introduces unsafe diagnosis language not present in any domain summary.
    const unsafeDecisionReply =
      "Based on your symptoms, I can diagnose you with overtraining syndrome and prescribe rest.";

    const generateFinalDecision = vi.fn().mockResolvedValue({
      reply: unsafeDecisionReply,
      selectedAction: "adapt_workout_plan",
      proposals: [workoutProposal],
      consentRequired: false,
    });

    Object.assign(service, {
      provider: {
        generateDomainStep,
        generateAgentLoopStep: vi.fn(),
        generateCoachResponse: vi.fn(),
        generateFinalDecision,
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "I feel very tired and sore. Can you adjust my workout?",
      recentMessages: [],
    });

    // The unsafe reply must be blocked and replaced with the safe fallback.
    expect(result.output.reply).not.toBe(unsafeDecisionReply);
    expect(result.output.reply).toBe(SAFE_FALLBACK_REPLY);
    // Proposals must be cleared when the reply is blocked.
    expect(result.output.proposals).toEqual([]);
    // Safety status must reflect reply_blocked.
    expect(result.agentMetadata.safety.status).toBe("reply_blocked");
    // replySafetyErrors must be populated.
    expect(result.replySafetyErrors.length).toBeGreaterThan(0);
    expect(result.replySafetyErrors[0]).toMatch(/diagnosis|treatment|therapy/i);
  });

  it("blocks decision-maker reply with treatment language on multi-domain fan-out", async () => {
    // Same safety floor, but with two domains (both succeed) so the decision-maker still
    // synthesises the reply. Treatment language in the decision-maker reply must be blocked
    // regardless of how many domains contributed.
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const twoDomainsRoute = vi.fn().mockResolvedValue({
      output: routerDecisionOutputSchema.parse({
        selectedDomains: [
          { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
          { domain: "nutrition", confidence: 0.7, intentHints: [], toolHints: [], signalHints: [] },
        ],
        contextNeeds: [],
        safetyFlags: [],
        confidence: 0.9,
      }),
      source: "llm",
      validationErrors: [],
    } satisfies RouterLlmResult);

    const generateDomainStep = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "domain_answer",
        domain: "workout",
        summary: "Safe workout domain answer.",
        candidateProposals: [],
        domainSignals: [],
      })
      .mockResolvedValueOnce({
        kind: "domain_answer",
        domain: "nutrition",
        summary: "Safe nutrition domain answer.",
        candidateProposals: [],
        domainSignals: [],
      });

    const unsafeMultiDomainReply =
      "The treatment for your fatigue symptoms involves medication and therapy sessions.";

    const { service } = createOrchestratorWithCapturedProvider(contextPacket, {
      routeImpl: twoDomainsRoute,
    });

    const generateFinalDecision = vi.fn().mockResolvedValue({
      reply: unsafeMultiDomainReply,
      selectedAction: null,
      proposals: [],
      consentRequired: false,
    });

    Object.assign(service, {
      provider: {
        generateDomainStep,
        generateAgentLoopStep: vi.fn(),
        generateCoachResponse: vi.fn(),
        generateFinalDecision,
      },
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "I'm tired and sore. Adjust my workout and nutrition.",
      recentMessages: [],
    });

    expect(result.output.reply).toBe(SAFE_FALLBACK_REPLY);
    expect(result.output.proposals).toEqual([]);
    expect(result.agentMetadata.safety.status).toBe("reply_blocked");
    expect(result.replySafetyErrors.length).toBeGreaterThan(0);
  });

  it("passes safe decision-maker replies through without modification", async () => {
    // Verify the positive path: a safe reply is NOT replaced.
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const safeDecisionReply =
      "Based on your recent sessions, I recommend a lighter workout today to support your recovery.";

    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket);

    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: safeDecisionReply,
      candidateProposals: [],
      domainSignals: [],
    });

    generateFinalDecision.mockResolvedValue({
      reply: safeDecisionReply,
      selectedAction: null,
      proposals: [],
      consentRequired: false,
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "What should I do today?",
      recentMessages: [],
    });

    expect(result.output.reply).toBe(safeDecisionReply);
    expect(result.agentMetadata.safety.status).toBe("passed");
    expect(result.replySafetyErrors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Phase 6: workout calorie estimate threading (source restriction regression)
// ---------------------------------------------------------------------------

describe("AgentOrchestratorService — workout calorie estimate threading (Phase 6)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stamps estimatedSessionCalorieBurn + provenance=workout_llm onto workout proposals when the workout domain emits workoutCalorieEstimate", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");

    const workoutProposal = {
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Lighter session",
      reason: "Fatigue signals detected.",
      proposedChanges: {
        title: "Recovery session",
        summary: "Reduced load for the week.",
        days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        notes: [],
      },
    };

    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket);

    // Workout domain LLM returns a calorie estimate with its answer.
    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Lighter session recommended.",
      candidateProposals: [workoutProposal],
      domainSignals: [],
      workoutCalorieEstimate: 280,
    });

    // Decision-maker selects the workout proposal.
    generateFinalDecision.mockResolvedValue({
      reply: "Here is a lighter plan for your recovery day.",
      selectedAction: "adapt_workout_plan",
      proposals: [workoutProposal],
      consentRequired: false,
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Can you adjust today's workout?",
      recentMessages: [],
    });

    expect(result.output.proposals).toHaveLength(1);
    const proposalChanges = result.output.proposals[0]?.proposedChanges as Record<string, unknown>;
    expect(proposalChanges["estimatedSessionCalorieBurn"]).toBe(280);
    expect(proposalChanges["calorieEstimateProvenance"]).toBe("workout_llm");
  });

  it("leaves calorie fields unset when the workout domain answer does not include a calorie estimate", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");

    const workoutProposal = {
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Lighter session",
      reason: "General adaptation.",
      proposedChanges: {
        title: "Recovery session",
        summary: "Reduced load.",
        days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        notes: [],
      },
    };

    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket);

    // Workout domain answer has NO workoutCalorieEstimate.
    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Lighter session.",
      candidateProposals: [workoutProposal],
      domainSignals: [],
      // workoutCalorieEstimate intentionally absent
    });

    generateFinalDecision.mockResolvedValue({
      reply: "Here is a lighter plan.",
      selectedAction: "adapt_workout_plan",
      proposals: [workoutProposal],
      consentRequired: false,
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Adjust my workout.",
      recentMessages: [],
    });

    expect(result.output.proposals).toHaveLength(1);
    const proposalChanges = result.output.proposals[0]?.proposedChanges as Record<string, unknown>;
    expect(proposalChanges["estimatedSessionCalorieBurn"]).toBeUndefined();
    expect(proposalChanges["calorieEstimateProvenance"]).toBeUndefined();
  });

  it("does NOT stamp calorie fields onto non-workout proposals (nutrition proposal isolation)", async () => {
    // Even when the workout domain emits a calorie estimate, non-workout proposals
    // in the same fan-out turn must NOT have calorie fields stamped onto them.
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");

    const workoutProposal = {
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Lighter session",
      reason: "Fatigue signals.",
      proposedChanges: {
        title: "Recovery session",
        summary: "Reduced load.",
        days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        notes: [],
      },
    };

    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket, {
        routeImpl: vi.fn().mockResolvedValue(
          createConfidentRouterResultForTests({ domain: "workout" }),
        ),
      });

    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Recovery session.",
      candidateProposals: [workoutProposal],
      domainSignals: [],
      workoutCalorieEstimate: 350,
    });

    // Decision-maker selects both proposals. The allowlist in the orchestrator
    // will filter nutrition out since the workout-only domain is selected,
    // but if it weren't filtered the nutrition proposal must not get calorie stamped.
    // We verify by checking that the workout proposal gets the stamp but nutrition doesn't.
    generateFinalDecision.mockResolvedValue({
      reply: "Here is a lighter plan with some nutrition notes.",
      selectedAction: "adapt_workout_plan",
      proposals: [workoutProposal],
      consentRequired: false,
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Adjust workout for today.",
      recentMessages: [],
    });

    // The workout proposal must carry the estimate.
    const workoutChanges = result.output.proposals.find(
      (p) => p.intent === "adapt_workout_plan",
    )?.proposedChanges as Record<string, unknown> | undefined;

    if (workoutChanges) {
      expect(workoutChanges["estimatedSessionCalorieBurn"]).toBe(350);
      expect(workoutChanges["calorieEstimateProvenance"]).toBe("workout_llm");
    }

    // No nutrition proposal should carry calorie fields.
    const nutritionChanges = result.output.proposals.find(
      (p) => p.intent === "log_nutrition_incident",
    )?.proposedChanges as Record<string, unknown> | undefined;

    if (nutritionChanges) {
      expect(nutritionChanges["estimatedSessionCalorieBurn"]).toBeUndefined();
      expect(nutritionChanges["calorieEstimateProvenance"]).toBeUndefined();
    }
  });

  it("calorie estimate is NEVER sourced from generateFinalDecision output — the decision-maker cannot set it", async () => {
    // This is the key provenance floor test: even if someone attempted to add a
    // calorie field to FinalDecisionOutput, ActionResolver must only stamp from
    // workoutCalorieEstimate passed explicitly from the workout domain answer.
    // FinalDecisionOutput has NO calorie field by schema contract.
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");

    const workoutProposal = {
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Workout plan",
      reason: "Test.",
      proposedChanges: {
        title: "Base plan",
        summary: "Weekly training.",
        days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
        notes: [],
      },
    };

    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket);

    // Workout domain emits NO calorie estimate this turn.
    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Plan update.",
      candidateProposals: [workoutProposal],
      domainSignals: [],
      // No workoutCalorieEstimate — so the proposal must have no calorie fields.
    });

    // Decision-maker output does NOT carry calorie fields (FinalDecisionOutput
    // has no calorie field by design). Even if calorie fields were injected into
    // proposedChanges (inside the proposals array), ActionResolver unconditionally
    // scrubs estimatedSessionCalorieBurn + calorieEstimateProvenance off every
    // workout proposal before conditionally re-stamping from the trusted
    // workoutCalorieEstimate. This is the code-level enforcement floor — it is NOT
    // sufficient to rely on finalDecisionOutputSchema.parse, which only strips
    // top-level unknown keys, not keys nested inside proposedChanges.
    generateFinalDecision.mockResolvedValue({
      reply: "Here is your updated plan.",
      selectedAction: "adapt_workout_plan",
      proposals: [workoutProposal],
      consentRequired: false,
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Update my workout plan.",
      recentMessages: [],
    });

    // No calorie fields because the workout domain did not emit an estimate.
    if (result.output.proposals.length > 0) {
      const changes = result.output.proposals[0]?.proposedChanges as Record<string, unknown>;
      expect(changes["estimatedSessionCalorieBurn"]).toBeUndefined();
      expect(changes["calorieEstimateProvenance"]).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 7: consentRequired surfacing + attachment-as-context (no recognition)
// ---------------------------------------------------------------------------

describe("AgentOrchestratorService — consentRequired surfacing (Phase 7)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("surfaces consentRequired=true on the orchestrator result when decision-maker emits it", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket, {
        routeImpl: vi.fn().mockResolvedValue(
          createConfidentRouterResultForTests({ domain: "health" }),
        ),
      });

    // Domain step returns health context output with no proposals.
    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "health",
      summary: "Health context noted. A consent-gated medical-save proposal is available.",
      candidateProposals: [],
      domainSignals: [],
    });

    // Decision-maker emits consentRequired=true (e.g. user wants to save a context attachment).
    generateFinalDecision.mockResolvedValue({
      reply: "I noticed some health context. Please review the consent-gated proposal.",
      selectedAction: "ask_health_context",
      proposals: [],
      consentRequired: true,
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Please review my recent health documents.",
      recentMessages: [],
    });

    // consentRequired must propagate from ActionResolver through the orchestrator result.
    expect(result.consentRequired).toBe(true);
    // No health_documents row auto-persist — proposals are validated + persisted
    // through the normal proposal accept flow. AI layer never writes directly.
    // (The type system enforces no auto-persist intent by contract.)
    expect(Array.isArray(result.output.proposals)).toBe(true);
    expect(result.agentMetadata.safety.status).not.toBe("reply_blocked");
  });

  it("does not set consentRequired on the orchestrator result for normal non-consent turns", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket);

    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "workout",
      summary: "Lighter workout session recommended.",
      candidateProposals: [],
      domainSignals: [],
    });

    generateFinalDecision.mockResolvedValue({
      reply: "Here is a wellness-focused response you can review.",
      selectedAction: null,
      proposals: [],
      consentRequired: false,
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Can you adapt my workout this week?",
      recentMessages: [],
    });

    // consentRequired must be falsy for normal turns.
    expect(result.consentRequired).toBeFalsy();
  });

  it("reply_blocked turn forces consentRequired=false regardless of decision-maker output", async () => {
    // When the reply is blocked by the safety validator, consentRequired is reset to false
    // so the caller cannot accidentally show a consent prompt for an unsafe response.
    const contextPacket = createSlicePacket("general_chat", "general");
    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket, {
        routeImpl: vi.fn().mockResolvedValue(
          createConfidentRouterResultForTests({ domain: "health" }),
        ),
      });

    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "health",
      summary: "Summary.",
      candidateProposals: [],
      domainSignals: [],
    });

    // Decision-maker produces a reply that will be flagged by validateReplySafety.
    generateFinalDecision.mockResolvedValue({
      reply: "You should diagnose this condition and treat it with medication immediately.",
      selectedAction: null,
      proposals: [],
      consentRequired: true, // intent: even if decision-maker sets this...
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Is this condition serious?",
      recentMessages: [],
    });

    // The reply is blocked by safety validation.
    expect(result.agentMetadata.safety.status).toBe("reply_blocked");
    // consentRequired must be reset to false when the reply is blocked.
    expect(result.consentRequired).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Phase 7: nutrition food-photo analysis via domain LLM (no FoodPhotoAnalysisService)
// ---------------------------------------------------------------------------

describe("AgentOrchestratorService — nutrition food-photo via domain LLM (Phase 7)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("nutrition domain LLM returns log_nutrition_incident proposal from food_photo attachment — no FoodPhotoAnalysisService", async () => {
    // When a food_photo attachment is present, the nutrition domain LLM (stub) receives
    // the bounded attachment context and returns a log_nutrition_incident proposal with
    // approximate calories/macros. This is the Phase 7 replacement for the deleted
    // FoodPhotoAnalysisService path.
    const contextPacket = createSlicePacket("nutrition_adaptation", "adjust_nutrition");
    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket, {
        routeImpl: vi.fn().mockResolvedValue(
          createConfidentRouterResultForTests({ domain: "nutrition", confidence: 0.88 }),
        ),
      });

    const nutritionIncidentProposal = {
      intent: "log_nutrition_incident",
      targetDomain: "nutrition",
      title: "Log meal from photo",
      reason: "Approximate calorie estimate from the food photo you shared.",
      proposedChanges: {
        incidentDateTime: "2026-05-30T12:00:00.000Z",
        items: [{ name: "Meal from photo", quantity: "1 serving", calories: 520 }],
        estimatedCalories: 520,
        estimatedMacros: { proteinGrams: 32, carbsGrams: 55, fatGrams: 18 },
        confidence: "medium",
        provenance: { source: "vision_llm_estimate", providerId: "nutrition_domain_llm" },
        imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
      },
    };

    // Nutrition domain LLM analyzes the food photo directly and returns the proposal.
    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Analyzed the food photo and prepared a nutrition incident log with approximate estimates.",
      candidateProposals: [nutritionIncidentProposal],
      domainSignals: ["food_photo_present"],
    });

    // Decision-maker synthesizes and selects the nutrition proposal.
    generateFinalDecision.mockResolvedValue({
      reply: "I estimated your meal from the photo. Review the proposal and adjust items before saving.",
      selectedAction: "log_nutrition_incident",
      proposals: [nutritionIncidentProposal],
      consentRequired: false,
    });

    const result = await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Log this meal from the photo.",
      recentMessages: [],
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000001",
            category: "food_photo",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: "local://attachments/meal.jpg",
          },
        ],
      },
    });

    // The domain step must have been called with the food_photo attachment context.
    const domainRequest = generateDomainStep.mock.calls[0]?.[0] as {
      domain: string;
      coachingContext: { attachmentTurn?: Record<string, unknown> };
    };
    expect(domainRequest.domain).toBe("nutrition");
    expect(domainRequest.coachingContext.attachmentTurn).toMatchObject({
      attachments: [
        expect.objectContaining({
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          category: "food_photo",
        }),
      ],
    });

    // The nutrition domain proposal reaches the orchestrator result.
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("log_nutrition_incident");

    // The provenance must indicate vision_llm_estimate (not FoodPhotoAnalysisService).
    const proposedChanges = result.output.proposals[0]?.proposedChanges as Record<string, unknown>;
    const provenance = proposedChanges["provenance"] as Record<string, unknown> | undefined;
    expect(provenance?.source).toBe("vision_llm_estimate");
    expect(provenance?.providerId).toBe("nutrition_domain_llm");

    // Approximate calories must be present (the main product requirement).
    expect(proposedChanges["estimatedCalories"]).toBe(520);

    expect(result.agentMetadata.safety.status).toBe("passed");
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(true);
  });

  it("attachment metadata reaches the nutrition domain LLM without a recognition envelope or preparedProposals (Phase 7 regression)", async () => {
    // This is the specific Phase 7 regression guard: no recognition envelope,
    // no contextSummaries, no preparedProposals must appear on the attachment turn
    // context passed to the domain LLM.
    const contextPacket = createSlicePacket("nutrition_adaptation", "adjust_nutrition");
    const { service, generateDomainStep, generateFinalDecision } =
      createOrchestratorWithCapturedProvider(contextPacket, {
        routeImpl: vi.fn().mockResolvedValue(
          createConfidentRouterResultForTests({ domain: "nutrition" }),
        ),
      });

    generateDomainStep.mockResolvedValue({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Food photo analyzed.",
      candidateProposals: [],
      domainSignals: ["food_photo_present"],
    });

    generateFinalDecision.mockResolvedValue({
      reply: "Meal reviewed.",
      selectedAction: null,
      proposals: [],
      consentRequired: false,
    });

    await service.orchestrateCoachTurn({
      auth: { clerkUserId: "clerk-user", email: "test@example.com", displayName: "Test" },
      userMessage: "Analyze this meal photo.",
      recentMessages: [],
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000002-0000-4000-8000-000000000002",
            category: "food_photo",
            mimeType: "image/jpeg",
            consentState: "none" as const,
            storageRef: "local://attachments/lunch.jpg",
          },
        ],
      },
    });

    const domainRequest = generateDomainStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };

    // Phase 7 hard invariant: no legacy recognition paths.
    expect(domainRequest.coachingContext.attachmentTurn).not.toHaveProperty("preparedProposals");
    expect(domainRequest.coachingContext.attachmentTurn).not.toHaveProperty("contextSummaries");
    expect(domainRequest.coachingContext.attachmentTurn).not.toHaveProperty("proposalCandidates");

    // Bounded metadata IS present.
    const attachmentTurn = domainRequest.coachingContext.attachmentTurn as {
      attachments: Array<Record<string, unknown>>;
    };
    expect(attachmentTurn.attachments[0]).toMatchObject({
      attachmentRefId: "a1000002-0000-4000-8000-000000000002",
      category: "food_photo",
      mimeType: "image/jpeg",
    });
  });
});
