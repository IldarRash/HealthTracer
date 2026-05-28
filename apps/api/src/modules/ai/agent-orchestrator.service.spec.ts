import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentContextPacket } from "@health/types";
import {
  createFallbackMessageUnderstandingResult,
  createFallbackTurnDecisionResult,
  createFallbackPreprocessorResult,
  turnDecisionRequestSchema,
  turnDecisionOutputSchema,
  turnDecisionResultSchema,
  buildProposalExplainerTurnContext,
  getCapabilityConfig,
  messageUnderstandingOutputSchema,
  messageUnderstandingRequestSchema,
  messageUnderstandingResultSchema,
} from "@health/types";
import { ActionResolverService } from "./action-resolver.service.js";
import { AgentOrchestratorService } from "./agent-orchestrator.service.js";
import { ContextCompressionService } from "../coaching-context/context-compression.service.js";
import { ContextExpansionPolicyService } from "../coaching-context/context-expansion-policy.service.js";
import { ResponseModeExecutorService } from "./response-mode-executor.service.js";
import { StubContextCompressionProvider } from "../coaching-context/stub-context-compression.provider.js";
import { createAiPolicyTestStack } from "./test-ai-behavior-fixtures.js";
import * as coachProviderFactory from "./coach-provider.factory.js";
import {
  buildAgentPromptContextFromPacket,
  LEGACY_BROAD_COACHING_CONTEXT_KEYS,
} from "../coaching-context/agent-prompt-context.js";

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

function createFallbackUnderstandingResultForTests(
  overrides: {
    capabilityId?: "adjust_workout" | "general";
    confidence?: number;
    hintConfidence?: number;
    source?: "llm" | "fallback";
  } = {},
) {
  const request = messageUnderstandingRequestSchema.parse({
    originalText: "Can you adapt my workout plan this week?",
    normalizedText: "can you adapt my workout plan this week?",
    preprocessor: createFallbackPreprocessorResult({
      userMessage: "Can you adapt my workout plan this week?",
    }),
    attachmentContextSummaries: [],
    recentMessageHints: [],
    catalogHints: [],
  });

  if (overrides.source === "fallback") {
    return createFallbackMessageUnderstandingResult(request, ["forced fallback"]);
  }

  return messageUnderstandingResultSchema.parse({
    output: messageUnderstandingOutputSchema.parse({
      signals: ["request_change"],
      entities: [],
      capabilityHints: [
        {
          capabilityId: overrides.capabilityId ?? "adjust_workout",
          confidence: overrides.hintConfidence ?? 0.84,
        },
      ],
      complexity: "moderate",
      directCommand: { detected: false },
      safetyFlags: ["fatigue"],
      needsContext: ["active_workout_plan"],
      confidence: overrides.confidence ?? 0.84,
    }),
    source: "llm",
    validationErrors: [],
  });
}

function createFallbackTurnDecisionResultForTests() {
  const request = turnDecisionRequestSchema.parse({
    originalText: "Can you adapt my workout plan this week?",
    normalizedText: "can you adapt my workout plan this week",
    preprocessor: createFallbackPreprocessorResult({
      userMessage: "Can you adapt my workout plan this week?",
    }),
    attachmentContextSummaries: [],
    recentMessageHints: [],
    catalogHints: [],
    availableTools: [],
  });

  return createFallbackTurnDecisionResult(request, ["forced fallback"]);
}

function createConfidentTurnDecisionResultForTests(
  overrides: {
    capabilityId?: "adjust_workout" | "adjust_nutrition" | "general" | "attachment_food_photo";
    confidence?: number;
    hintConfidence?: number;
    source?: "llm" | "fallback";
  } = {},
) {
  const request = turnDecisionRequestSchema.parse({
    originalText: "Can you adapt my workout plan this week?",
    normalizedText: "can you adapt my workout plan this week?",
    preprocessor: createFallbackPreprocessorResult({
      userMessage: "Can you adapt my workout plan this week?",
    }),
    attachmentContextSummaries: [],
    recentMessageHints: [],
    catalogHints: [],
    availableTools: [],
  });

  if (overrides.source === "fallback") {
    return createFallbackTurnDecisionResult(request, ["forced fallback"]);
  }

  return turnDecisionResultSchema.parse({
    output: turnDecisionOutputSchema.parse({
      signals: ["request_change"],
      entities: [],
      routeCapabilityHints: [
        {
          capabilityId: overrides.capabilityId ?? "adjust_workout",
          confidence: overrides.hintConfidence ?? 0.84,
        },
      ],
      complexity: "moderate",
      directCommand: { detected: false },
      safetyFlags: ["fatigue"],
      contextNeeds: ["active_workout_plan"],
      attachmentHints: [],
      toolNeeds: [],
      confidence: overrides.confidence ?? 0.84,
    }),
    source: "llm",
    validationErrors: [],
  });
}

function createTurnDecisionTestDeps(decideImpl?: ReturnType<typeof vi.fn>) {
  return {
    messagePreprocessorService: {
      preprocess: vi.fn((input: { userMessage: string; hasAttachments?: boolean }) =>
        createFallbackPreprocessorResult(input),
      ),
    },
    turnDecisionService: {
      decide:
        decideImpl ??
        vi.fn().mockResolvedValue(createConfidentTurnDecisionResultForTests()),
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
    decideImpl?: ReturnType<typeof vi.fn>;
  },
) {
  const generateAgentLoopStep = vi.fn().mockResolvedValue({
    kind: "final_answer",
    reply: "Here is a wellness-focused response you can review.",
    proposals: [],
  });
  const generateCoachResponse = vi.fn().mockResolvedValue({
    reply: "Here is a wellness-focused response you can review.",
    proposals: [],
  });

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
  const responseModeExecutorService = new ResponseModeExecutorService(
    actionResolverService,
    agentToolRegistryService as never,
  );

  const understandingDeps = createTurnDecisionTestDeps(options?.decideImpl);

  const service = new AgentOrchestratorService(
    coachingContextService as never,
    contextCompressionService,
    contextExpansionPolicyService,
    systemPlannerService,
    responseModeExecutorService,
    aiBehaviorConfigService,
    understandingDeps.messagePreprocessorService as never,
    understandingDeps.turnDecisionService as never,
  );

  Object.assign(service, {
    provider: { generateCoachResponse, generateAgentLoopStep },
  });

  return {
    service,
    generateCoachResponse,
    generateAgentLoopStep,
    coachingContextService,
    agentToolRegistryService,
    capabilityRegistryService,
    systemPlannerService,
    ...understandingDeps,
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
    ["general chat", "How can I stay consistent this week?", "general_chat", "general"],
    ["workout adaptation", "Can you adapt my workout plan this week?", "workout_adaptation", "adjust_workout"],
    [
      "nutrition adaptation",
      "Can you adjust my nutrition plan for more protein?",
      "nutrition_adaptation",
      "adjust_nutrition",
    ],
  ] as const)(
    "excludes document and legacy broad context for %s",
    async (_label, userMessage, purpose, intent) => {
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

      const { service, generateAgentLoopStep, coachingContextService } =
        createOrchestratorWithCapturedProvider(contextPacket, {
          decideImpl: vi.fn().mockResolvedValue(
            createConfidentTurnDecisionResultForTests({
              capabilityId: intent === "general" ? "general" : intent === "adjust_nutrition" ? "adjust_nutrition" : "adjust_workout",
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

      expect(coachingContextService.buildAgentContext).toHaveBeenCalledTimes(1);
      expect(coachingContextService.toAgentPromptContext).toHaveBeenCalledWith(contextPacket);
      const providerRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
        coachingContext: Record<string, unknown>;
      };

      expectProviderContextExcludesLegacyFields(providerRequest.coachingContext);
      expect(providerRequest.coachingContext.agentContext).toMatchObject({
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

    const { service, generateAgentLoopStep } =
      createOrchestratorWithCapturedProvider(contextPacket);

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Please consider my lab results and medical background.",
      recentMessages: [],
    });

    const providerRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };

    expect(providerRequest.coachingContext.documentContext).toBeDefined();
    expect(providerRequest.coachingContext.ragResults).toEqual(
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

  it("routes normal text turns through confident turn decision", async () => {
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

  it("falls back to general when turn decision confidence is low", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const decide = vi.fn().mockResolvedValue(
      createConfidentTurnDecisionResultForTests({
        capabilityId: "general",
        confidence: 0.35,
        source: "fallback",
      }),
    );
    const { service, coachingContextService } = createOrchestratorWithCapturedProvider(
      contextPacket,
      { decideImpl: decide },
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

    expect(decide).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "unified_turn_decision",
        isConfident: false,
        confidence: 0.35,
        catalogIntentId: "general",
      }),
      expect.anything(),
    );
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(false);
  });

  it("filters final-answer proposals outside the active catalog allowlist before returning", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const coachReply = "Here is a lighter workout option you can review.";
    const { service, generateAgentLoopStep } = createOrchestratorWithCapturedProvider(contextPacket);

    generateAgentLoopStep.mockResolvedValue({
      kind: "final_answer",
      reply: coachReply,
      proposals: [
        {
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Reduce today's load",
          reason: "Recovery signals are low.",
          proposedChanges: {
            title: "Strength base",
            summary: "Lighter session today.",
            days: [{ day: "Day 1", focus: "Recovery", exercises: ["Walk"] }],
            notes: [],
          },
        },
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

    expect(result.output.reply).toBe(coachReply);
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");
    expect(result.agentMetadata.catalogIntentId).toBe("adjust_workout");
    expect(result.agentMetadata.safety.status).toBe("passed");
  });

  it("uses final coach output for user-facing replies", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const coachReply = "Final coach reply with a reviewable proposal draft.";
    const { service, generateAgentLoopStep } = createOrchestratorWithCapturedProvider(contextPacket);

    generateAgentLoopStep.mockResolvedValue({
      kind: "final_answer",
      reply: coachReply,
      proposals: [
        {
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Reduce today's load",
          reason: "Recovery signals are low.",
          proposedChanges: {
            title: "Strength base",
            summary: "Lighter session today.",
            days: [{ day: "Day 1", focus: "Recovery", exercises: ["Walk"] }],
            notes: [],
          },
        },
      ],
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

    expect(generateAgentLoopStep).toHaveBeenCalledTimes(1);
    expect(result.output.reply).toBe(coachReply);
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");
  });

  it("bypasses turn decision for proposal revision turns and passes revision context", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateAgentLoopStep } = createOrchestratorWithCapturedProvider(contextPacket);

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
            days: [{ day: "Day 1", focus: "Recovery", exercises: ["Walk"] }],
            notes: [],
          },
        },
      },
    });

    expect(generateAgentLoopStep).toHaveBeenCalled();
    const providerRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };
    expect(providerRequest.coachingContext.proposalRevision).toMatchObject({
      supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
      modificationFeedback: "Keep one strength exercise.",
    });
  });

  it("bypasses turn decision for proposal explainer turns and passes proposal context", async () => {
    const contextPacket = createSlicePacket("general_chat", "proposal_explainer");
    const workoutProposal = {
      intent: "adapt_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Should not surface",
      reason: "Blocked on explainer turns.",
      proposedChanges: {
        title: "Strength base",
        summary: "Lighter session today.",
        days: [{ day: "Day 1", focus: "Recovery", exercises: ["Walk"] }],
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
    const understandingDeps = createTurnDecisionTestDeps(
      vi.fn().mockResolvedValue(
        turnDecisionResultSchema.parse({
          output: turnDecisionOutputSchema.parse({
            signals: ["question"],
            entities: [],
            routeCapabilityHints: [{ capabilityId: "review_progress", confidence: 0.9 }],
            complexity: "complex",
            directCommand: { detected: false },
            safetyFlags: [],
            contextNeeds: ["weekly_progress"],
            attachmentHints: [],
            toolNeeds: [],
            confidence: 0.9,
          }),
          source: "llm",
          validationErrors: [],
        }),
      ),
    );
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService(agentToolRegistryService as never),
      aiBehaviorConfigService,
      understandingDeps.messagePreprocessorService as never,
      understandingDeps.turnDecisionService as never,
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

  it("routes attachment turns through turn decision instead of the llm router", async () => {
    const contextPacket = createSlicePacket("nutrition_adaptation", "adjust_nutrition");
    const decide = vi.fn().mockResolvedValue(
      turnDecisionResultSchema.parse({
        output: turnDecisionOutputSchema.parse({
          signals: ["attachment_reference"],
          entities: [],
          routeCapabilityHints: [{ capabilityId: "attachment_food_photo", confidence: 0.86 }],
          complexity: "moderate",
          directCommand: { detected: false },
          safetyFlags: [],
          contextNeeds: ["attachment_context"],
          attachmentHints: [],
          toolNeeds: [],
          confidence: 0.84,
        }),
        source: "llm",
        validationErrors: [],
      }),
    );
    const { service, generateAgentLoopStep, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket, { decideImpl: decide });

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
            status: "ready",
            recognition: { category: "food_photo" },
          },
        ],
      },
    });

    expect(decide).toHaveBeenCalled();
    expect(generateAgentLoopStep).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "unified_turn_decision",
        catalogIntentId: "attachment_food_photo",
      }),
      expect.anything(),
    );
    const providerRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };
    expect(providerRequest.coachingContext.attachmentTurn).toEqual({
      attachments: [
        {
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          category: "food_photo",
          status: "ready",
          recognition: { category: "food_photo" },
        },
      ],
    });
    expect(result.agentMetadata.catalogIntentId).toBe("attachment_food_photo");
    expect(result.agentMetadata.routing?.routingMethod).toBe("unified_turn_decision");
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(false);
  });

  it("routes mixed attachment turns through confident turn decision", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const decide = vi.fn().mockResolvedValue(
      turnDecisionResultSchema.parse({
        output: turnDecisionOutputSchema.parse({
          signals: ["attachment_reference"],
          entities: [],
          routeCapabilityHints: [{ capabilityId: "attachment_workout", confidence: 0.86 }],
          complexity: "moderate",
          directCommand: { detected: false },
          safetyFlags: [],
          contextNeeds: ["attachment_context"],
          attachmentHints: [],
          toolNeeds: [],
          confidence: 0.84,
        }),
        source: "llm",
        validationErrors: [],
      }),
    );
    const { service, generateAgentLoopStep, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket, { decideImpl: decide });

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
            status: "ready",
            recognition: { category: "food_photo" },
          },
          {
            attachmentRefId: "a1000002-0000-4000-8000-000000000002",
            category: "workout_attachment",
            status: "ready",
            recognition: { category: "workout_attachment" },
          },
        ],
      },
    });

    expect(decide).toHaveBeenCalled();
    expect(generateAgentLoopStep).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "unified_turn_decision",
        catalogIntentId: "attachment_workout",
      }),
      expect.anything(),
    );
    expect(result.agentMetadata.catalogIntentId).toBe("attachment_workout");
    expect(result.agentMetadata.routing?.routingMethod).toBe("unified_turn_decision");
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(false);
  });

  it("passes attachment context summaries without prepared proposals", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateAgentLoopStep } = createOrchestratorWithCapturedProvider(
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
            status: "ready",
            recognition: { category: "workout_attachment", sessionLabel: "Volleyball training" },
          },
        ],
        contextSummaries: [
          {
            attachmentRefId: "c1000004-0000-4000-8000-000000000004",
            category: "workout_attachment",
            status: "ready",
            routingCapabilityId: "attachment_workout",
            contextHint: null,
            recognitionPresent: true,
          },
        ],
      },
    });

    const providerRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: { attachmentTurn?: Record<string, unknown> };
    };

    expect(providerRequest.coachingContext.attachmentTurn).toMatchObject({
      attachments: [
        expect.objectContaining({
          attachmentRefId: "c1000004-0000-4000-8000-000000000004",
        }),
      ],
    });
    expect(providerRequest.coachingContext.attachmentTurn).not.toHaveProperty("preparedProposals");
  });

  it("passes intent-specific agentMetadata to the generation loop after turn decision routing", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateAgentLoopStep, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);
    const capabilityConfig = getCapabilityConfig("adjust_workout");

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

    const providerRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      agentMetadata: {
        catalogIntentId: string;
        intentDefinition: {
          id: string;
          promptInstructions: string;
          safetyGuidance: readonly string[];
        };
        allowedTools: string[];
        allowedProposalIntents: string[];
      };
    };

    expect(providerRequest.agentMetadata.catalogIntentId).toBe("adjust_workout");
    expect(providerRequest.agentMetadata.intentDefinition.id).toBe("adjust_workout");
    expect(providerRequest.agentMetadata.intentDefinition.promptInstructions).toBe(
      capabilityConfig.prompt,
    );
    expect(providerRequest.agentMetadata.intentDefinition.safetyGuidance).toEqual(
      capabilityConfig.safetyNotes,
    );
    expect(providerRequest.agentMetadata.allowedTools).toEqual(
      expect.arrayContaining(["getUserContextSlice", "getWeeklyProgressContext"]),
    );
    expect(providerRequest.agentMetadata.allowedProposalIntents).toEqual(
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

  it("invokes turn decision with registry-backed catalog hints", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const decide = vi.fn().mockResolvedValue(createConfidentTurnDecisionResultForTests());
    const { service } = createOrchestratorWithCapturedProvider(contextPacket, {
      decideImpl: decide,
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

    expect(decide).toHaveBeenCalledWith(
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

  it("falls back to general when unclassified attachments produce low-confidence turn decision", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const decide = vi.fn().mockResolvedValue(
      createConfidentTurnDecisionResultForTests({
        capabilityId: "general",
        confidence: 0.35,
        source: "fallback",
      }),
    );
    const { service, generateAgentLoopStep, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket, { decideImpl: decide });

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
            status: "needs_review",
            recognition: undefined,
          },
        ],
      },
    });

    expect(decide).toHaveBeenCalledTimes(1);
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

  it("orchestrates a stub coach turn with typed agent metadata", async () => {
    vi.spyOn(coachProviderFactory, "resolveAiCoachProviderMode").mockReturnValue("stub");

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
    expect(result.agentMetadata.provider).toBe("stub");
    expect(result.agentMetadata.purpose).toBe("workout_adaptation");
    expect(result.agentMetadata.safety.status).toBe("passed");
  });
});

describe("AgentOrchestratorService agent loop", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("executes an allowed tool request then returns a final answer on the next iteration", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const toolResult = {
      tool: "getWeeklyProgressContext" as const,
      ok: true as const,
      result: { weeklySummary: "Light week" },
    };
    const finalReply = "Based on your weekly progress, keep today's session lighter.";

    const { service, generateAgentLoopStep, agentToolRegistryService } =
      createOrchestratorWithCapturedProvider(contextPacket);

    const executeTool = vi.fn().mockResolvedValue(toolResult);
    Object.assign(agentToolRegistryService, { executeTool });

    generateAgentLoopStep
      .mockResolvedValueOnce({
        kind: "tool_request",
        tool: "getWeeklyProgressContext",
        input: {},
        rationale: "Need recent adherence before adapting.",
      })
      .mockResolvedValueOnce({
        kind: "final_answer",
        reply: finalReply,
        proposals: [],
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

    expect(generateAgentLoopStep).toHaveBeenCalledTimes(2);
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(executeTool).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tool: "getWeeklyProgressContext", input: {} }),
    );

    const secondLoopRequest = generateAgentLoopStep.mock.calls[1]?.[0] as {
      priorToolResults: Array<{ tool: string; ok: boolean }>;
      iteration: number;
    };
    expect(secondLoopRequest.iteration).toBe(2);
    expect(secondLoopRequest.priorToolResults).toEqual([toolResult]);

    expect(result.output.reply).toBe(finalReply);
    expect(result.agentMetadata.toolsInvoked).toEqual(["getWeeklyProgressContext"]);
    expect(result.agentMetadata.routing?.loopIterations).toBe(2);
    expect(result.agentMetadata.routing?.maxLoopIterations).toBe(3);
    expect(result.agentMetadata.safety.status).toBe("passed");
  });

  it("rejects disallowed tool requests without executing tools and returns a safe fallback", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const { service, generateAgentLoopStep, agentToolRegistryService } =
      createOrchestratorWithCapturedProvider(contextPacket, {
        decideImpl: vi.fn().mockResolvedValue(
          createConfidentTurnDecisionResultForTests({ capabilityId: "general" }),
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

    Object.assign(service, {
      provider: {
        generateAgentLoopStep: vi
          .fn()
          .mockRejectedValue(new Error("OpenAI coach provider request failed.")),
        generateCoachResponse: vi.fn(),
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

    expect(result.output.reply).toBe(SAFE_FALLBACK_REPLY);
    expect(result.output.proposals).toEqual([]);
    expect(result.agentMetadata.provider).toBe("openai");
    expect(result.agentMetadata.safety.status).toBe("provider_error");
    expect(result.agentMetadata.safety.blockedReasons).toContain(
      "OpenAI coach provider request failed.",
    );
    expect(result.parseErrors).toContain("OpenAI coach provider request failed.");
  });

  it("returns safe fallback without proposals when provider throws on attachment turns", async () => {
    vi.spyOn(coachProviderFactory, "resolveAiCoachProviderMode").mockReturnValue("openai");

    const contextPacket = createSlicePacket("nutrition_adaptation", "adjust_nutrition");
    const { service } = createOrchestratorWithCapturedProvider(contextPacket);

    Object.assign(service, {
      provider: {
        generateAgentLoopStep: vi
          .fn()
          .mockRejectedValue(new Error("OpenAI coach provider request failed.")),
        generateCoachResponse: vi.fn(),
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
            status: "recognized",
          },
        ],
      },
    });

    expect(result.output.reply).toBe(SAFE_FALLBACK_REPLY);
    expect(result.output.proposals).toEqual([]);
    expect(result.agentMetadata.safety.status).toBe("provider_error");
    expect(result.agentMetadata.unifiedTurnDecision?.ran).toBe(true);
  });
});

describe("AgentOrchestratorService compression review flow", () => {
  it("includes typed compression summary in coach context for monthly review turns", async () => {
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
    const generateCoachResponse = vi.fn();

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
    const understandingDeps = createTurnDecisionTestDeps(
      vi.fn().mockResolvedValue(
        turnDecisionResultSchema.parse({
          output: turnDecisionOutputSchema.parse({
            signals: ["question"],
            entities: [],
            routeCapabilityHints: [{ capabilityId: "review_progress", confidence: 0.9 }],
            complexity: "complex",
            directCommand: { detected: false },
            safetyFlags: [],
            contextNeeds: ["weekly_progress"],
            attachmentHints: [],
            toolNeeds: [],
            confidence: 0.9,
          }),
          source: "llm",
          validationErrors: [],
        }),
      ),
    );
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService(agentToolRegistryService as never),
      aiBehaviorConfigService,
      understandingDeps.messagePreprocessorService as never,
      understandingDeps.turnDecisionService as never,
    );

    Object.assign(service, {
      provider: { generateCoachResponse, generateAgentLoopStep },
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

    const loopRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };

    expect(loopRequest.coachingContext.contextCompressionSummary).toEqual(
      expect.objectContaining({
        reviewKind: "monthly_review",
        keyFindings: expect.arrayContaining([expect.any(String)]),
        focusAreas: expect.arrayContaining([expect.any(String)]),
      }),
    );
    expect(loopRequest.coachingContext.contextCompressionNotes).toEqual(
      expect.arrayContaining([expect.stringContaining("typed summary")]),
    );
    expect(
      (loopRequest.coachingContext.agentContext as Record<string, unknown>).contextCompressionApplied,
    ).toBe(true);
    expect(
      (loopRequest.coachingContext.agentContext as Record<string, unknown>).expansionPolicy,
    ).toEqual(
      expect.objectContaining({
        maxExpansionRounds: 2,
        maxSlicesPerRound: 3,
      }),
    );
  });

  it("uses stub compression fallback when the primary provider fails on review turns", async () => {
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
    const generateCoachResponse = vi.fn();

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
    const understandingDeps = createTurnDecisionTestDeps(
      vi.fn().mockResolvedValue(
        turnDecisionResultSchema.parse({
          output: turnDecisionOutputSchema.parse({
            signals: ["question"],
            entities: [],
            routeCapabilityHints: [{ capabilityId: "review_progress", confidence: 0.9 }],
            complexity: "complex",
            directCommand: { detected: false },
            safetyFlags: [],
            contextNeeds: ["weekly_progress"],
            attachmentHints: [],
            toolNeeds: [],
            confidence: 0.9,
          }),
          source: "llm",
          validationErrors: [],
        }),
      ),
    );
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(failingProvider as never, new StubContextCompressionProvider()),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService(agentToolRegistryService as never),
      aiBehaviorConfigService,
      understandingDeps.messagePreprocessorService as never,
      understandingDeps.turnDecisionService as never,
    );

    Object.assign(service, {
      provider: { generateCoachResponse, generateAgentLoopStep },
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

    const loopRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };

    expect(loopRequest.coachingContext.contextCompressionSummary).toEqual(
      expect.objectContaining({
        reviewKind: "monthly_review",
        keyFindings: expect.arrayContaining([expect.any(String)]),
      }),
    );
    expect(loopRequest.coachingContext.contextCompressionNotes).toEqual(
      expect.arrayContaining([expect.stringContaining("failed")]),
    );
    expect(
      (loopRequest.coachingContext.agentContext as Record<string, unknown>).contextCompressionApplied,
    ).toBe(true);
  });

  it("does not attach compression summary for routine coaching turns", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateAgentLoopStep } = createOrchestratorWithCapturedProvider(contextPacket);

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    const loopRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };

    expect(loopRequest.coachingContext).not.toHaveProperty("contextCompressionSummary");
    expect(
      (loopRequest.coachingContext.agentContext as Record<string, unknown>).contextCompressionApplied,
    ).toBeUndefined();
  });
});

describe("AgentOrchestratorService turn decision integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs turn decision before planning for ambiguous text and records bounded metadata", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const decide = vi.fn().mockResolvedValue(createConfidentTurnDecisionResultForTests());
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
    const turnDecisionDeps = createTurnDecisionTestDeps(decide);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      turnDecisionDeps.messagePreprocessorService as never,
      turnDecisionDeps.turnDecisionService as never,
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

    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentContextSummaries: [],
        recentMessages: [],
      }),
    );
    expect(result.agentMetadata.unifiedTurnDecision).toMatchObject({
      ran: true,
      source: "llm",
    });
    expect(result.agentMetadata.routing?.unifiedTurnDecisionInvoked).toBe(true);
    expect(result.agentMetadata.routing?.routingMethod).toBe("unified_turn_decision");
  });

  it("skips turn decision for proposal explainer turns", async () => {
    const contextPacket = createSlicePacket("general_chat", "proposal_explainer");
    const decide = vi.fn();
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
    const turnDecisionDeps = createTurnDecisionTestDeps(decide);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      turnDecisionDeps.messagePreprocessorService as never,
      turnDecisionDeps.turnDecisionService as never,
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

    expect(decide).not.toHaveBeenCalled();
  });

  it("runs turn decision for classified attachment turns", async () => {
    const contextPacket = createSlicePacket("nutrition_adaptation", "general");
    const decide = vi.fn().mockResolvedValue(createConfidentTurnDecisionResultForTests());
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
    const turnDecisionDeps = createTurnDecisionTestDeps(decide);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      turnDecisionDeps.messagePreprocessorService as never,
      turnDecisionDeps.turnDecisionService as never,
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
            status: "ready",
          },
        ],
      },
    });

    expect(decide).toHaveBeenCalled();
  });

  it("skips turn decision for proposal revision turns", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const decide = vi.fn();
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
    const turnDecisionDeps = createTurnDecisionTestDeps(decide);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      turnDecisionDeps.messagePreprocessorService as never,
      turnDecisionDeps.turnDecisionService as never,
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
            days: [{ day: "Day 1", focus: "Recovery", exercises: ["Walk"] }],
            notes: [],
          },
        },
      },
    });

    expect(decide).not.toHaveBeenCalled();
    expect(generateAgentLoopStep).toHaveBeenCalled();
  });

  it("invokes turn decision before planning and skips coach llm for direct read plans", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const decide = vi
      .fn()
      .mockResolvedValue(createConfidentTurnDecisionResultForTests({ source: "fallback" }));
    const generateAgentLoopStep = vi.fn();
    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const turnDecisionDeps = createTurnDecisionTestDeps(decide);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      turnDecisionDeps.messagePreprocessorService as never,
      turnDecisionDeps.turnDecisionService as never,
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

    expect(decide).toHaveBeenCalled();
    expect(generateAgentLoopStep).not.toHaveBeenCalled();
    expect(result.agentMetadata.responseModeExecution).toMatchObject({
      executorMode: "deterministic_read",
      llmInvoked: false,
      delegatedToPreAiGate: true,
    });
    expect(result.agentMetadata.unifiedTurnDecision?.ran).toBe(true);
  });

  it("passes attachment context summaries into coach context when turn decision runs", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const decide = vi
      .fn()
      .mockResolvedValue(createConfidentTurnDecisionResultForTests({ source: "fallback" }));
    const generateAgentLoopStep = vi.fn().mockResolvedValue({
      kind: "final_answer",
      reply: "Here is a wellness-focused response you can review.",
      proposals: [],
    });
    const contextSummaries = [
      {
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
        category: "unclassified" as const,
        status: "ready",
        routingCapabilityId: null,
        contextHint: "Awaiting classification.",
        recognitionPresent: false,
      },
    ];

    const coachingContextService = {
      buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
      toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
        buildAgentPromptContextFromPacket(packet),
      ),
    };
    const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
    const turnDecisionDeps = createTurnDecisionTestDeps(decide);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      turnDecisionDeps.messagePreprocessorService as never,
      turnDecisionDeps.turnDecisionService as never,
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
      userMessage: "Please review this upload",
      recentMessages: [],
      attachmentTurn: {
        attachments: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000001",
            category: "unclassified",
            status: "ready",
          },
        ],
        contextSummaries,
      },
    });

    expect(decide).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentContextSummaries: contextSummaries,
      }),
    );

    const loopRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };

    expect(loopRequest.coachingContext.attachmentTurn).toMatchObject({
      contextSummaries,
    });
  });

  it("falls back to general when turn decision confidence is low", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const decide = vi
      .fn()
      .mockResolvedValue(createConfidentTurnDecisionResultForTests({ source: "fallback" }));
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
    const turnDecisionDeps = createTurnDecisionTestDeps(decide);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      turnDecisionDeps.messagePreprocessorService as never,
      turnDecisionDeps.turnDecisionService as never,
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

    expect(decide).toHaveBeenCalled();
    expect(result.agentMetadata.routing?.routingMethod).toBe("unified_turn_decision");
    expect(result.agentMetadata.catalogIntentId).toBe("general");
    expect(result.agentMetadata.unifiedTurnDecision?.source).toBe("fallback");
  });

  it("uses turn decision for classified attachment turns", async () => {
    const contextPacket = createSlicePacket("nutrition_adaptation", "general");
    const decide = vi.fn().mockResolvedValue(
      turnDecisionResultSchema.parse({
        output: turnDecisionOutputSchema.parse({
          signals: ["attachment_reference"],
          entities: [],
          routeCapabilityHints: [
            { capabilityId: "attachment_food_photo", confidence: 0.86 },
          ],
          complexity: "moderate",
          directCommand: { detected: false },
          safetyFlags: [],
          contextNeeds: ["attachment_context"],
          attachmentHints: [],
          toolNeeds: [],
          confidence: 0.84,
        }),
        source: "llm",
        validationErrors: [],
      }),
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
    const turnDecisionDeps = createTurnDecisionTestDeps(decide);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      turnDecisionDeps.messagePreprocessorService as never,
      turnDecisionDeps.turnDecisionService as never,
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
            status: "recognized",
          },
        ],
        contextSummaries: [
          {
            attachmentRefId: "a1000001-0000-4000-8000-000000000002",
            category: "food_photo",
            status: "recognized",
            routingCapabilityId: "attachment_food_photo",
            contextHint: "Lunch",
            recognitionPresent: true,
          },
        ],
      },
    });

    expect(decide).toHaveBeenCalled();
    expect(result.agentMetadata.unifiedTurnDecision?.ran).toBe(true);
    expect(result.agentMetadata.routing?.unifiedTurnDecisionInvoked).toBe(true);
    expect(result.agentMetadata.routing?.routingMethod).toBe("unified_turn_decision");
  });

  it("uses turn decision for normal text turns", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const decide = vi.fn().mockResolvedValue(createConfidentTurnDecisionResultForTests());
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
    const turnDecisionDeps = createTurnDecisionTestDeps(decide);
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      turnDecisionDeps.messagePreprocessorService as never,
      turnDecisionDeps.turnDecisionService as never,
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

    expect(decide).toHaveBeenCalled();
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
    const { service, generateAgentLoopStep } = createOrchestratorWithCapturedProvider(contextPacket);

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(generateAgentLoopStep).toHaveBeenCalled();
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
    const turnDecisionDeps = createTurnDecisionTestDeps(vi.fn());
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      systemPlannerService,
      createResponseModeExecutorService({ executeTool: vi.fn() }),
      aiBehaviorConfigService,
      turnDecisionDeps.messagePreprocessorService as never,
      turnDecisionDeps.turnDecisionService as never,
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
      const coachingContextService = {
        buildAgentContext: vi.fn().mockResolvedValue(contextPacket),
        toAgentPromptContext: vi.fn((packet: AgentContextPacket) =>
          buildAgentPromptContextFromPacket(packet),
        ),
      };
      const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();
      const turnDecisionDeps = createTurnDecisionTestDeps(
        vi.fn().mockResolvedValue(
          expectedExecutorMode === "proposal_flow"
            ? createConfidentTurnDecisionResultForTests()
            : expectedExecutorMode === "deterministic_read"
              ? createConfidentTurnDecisionResultForTests({ capabilityId: "general", source: "fallback", confidence: 0.35 })
              : createConfidentTurnDecisionResultForTests({ source: "fallback" }),
        ),
      );
      const service = new AgentOrchestratorService(
        coachingContextService as never,
        new ContextCompressionService(),
        new ContextExpansionPolicyService(),
        systemPlannerService,
        createResponseModeExecutorService({ executeTool: vi.fn() }),
        aiBehaviorConfigService,
        turnDecisionDeps.messagePreprocessorService as never,
        turnDecisionDeps.turnDecisionService as never,
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
        expect(generateAgentLoopStep).toHaveBeenCalled();
      } else {
        expect(generateAgentLoopStep).not.toHaveBeenCalled();
      }
    },
  );
});
