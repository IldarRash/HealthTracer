import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentContextPacket } from "@health/types";
import { getCapabilityConfig } from "@health/types";
import { ActionResolverService } from "./action-resolver.service.js";
import { AgentOrchestratorService } from "./agent-orchestrator.service.js";
import { ContextCompressionService } from "../coaching-context/context-compression.service.js";
import { ContextExpansionPolicyService } from "../coaching-context/context-expansion-policy.service.js";
import { StubContextCompressionProvider } from "../coaching-context/stub-context-compression.provider.js";
import { createAiPolicyTestStack } from "./test-ai-behavior-fixtures.js";
import * as coachProviderFactory from "./coach-provider.factory.js";
import {
  buildAgentPromptContextFromPacket,
  LEGACY_BROAD_COACHING_CONTEXT_KEYS,
} from "../coaching-context/agent-prompt-context.js";

const SAFE_FALLBACK_REPLY =
  "I could not safely process that response. Please try again with a wellness-focused question.";

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

function createOrchestratorWithCapturedProvider(contextPacket: AgentContextPacket) {
  const generateAgentLoopStep = vi.fn().mockResolvedValue({
    kind: "final_answer",
    reply: "Here is a wellness-focused response you can review.",
    proposals: [],
  });
  const generateCoachResponse = vi.fn().mockResolvedValue({
    reply: "Here is a wellness-focused response you can review.",
    proposals: [],
  });
  const generateIntentRoute = vi.fn().mockResolvedValue({
    catalogIntentId: "adjust_workout",
    confidence: 0.84,
    routingMethod: "llm_router",
    requiredContextSlices: [
      { type: "workout_adaptation", depth: "medium", timeRange: "14d" },
      { type: "daily_checkin", depth: "small", timeRange: "7d" },
    ],
    safetyFlags: ["fatigue"],
    expectedResponseMode: "recommendation_with_optional_proposal",
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

  const {
    capabilityRegistryService,
    responseModePolicyService,
    contextBudgetPolicyService,
    systemPlannerService,
    aiBehaviorConfigService,
  } = createAiPolicyTestStack();
  const actionResolverService = new ActionResolverService();
  const contextCompressionService = new ContextCompressionService();
  const contextExpansionPolicyService = new ContextExpansionPolicyService();

  const service = new AgentOrchestratorService(
    coachingContextService as never,
    contextCompressionService,
    contextExpansionPolicyService,
    agentToolRegistryService as never,
    systemPlannerService,
    actionResolverService,
    aiBehaviorConfigService,
  );

  Object.assign(service, {
    provider: { generateCoachResponse, generateIntentRoute, generateAgentLoopStep },
  });

  return {
    service,
    generateCoachResponse,
    generateIntentRoute,
    generateAgentLoopStep,
    coachingContextService,
    agentToolRegistryService,
    capabilityRegistryService,
    systemPlannerService,
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
        createOrchestratorWithCapturedProvider(contextPacket);

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

  it("invokes the llm router for normal text turns including previously rule-confident routes", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateIntentRoute, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "I feel tired today. Should I train?",
      recentMessages: [],
    });

    expect(generateIntentRoute).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ intent: "adjust_workout" }),
      expect.objectContaining({
        routingMethod: "llm_router",
      }),
      expect.objectContaining({
        contextBudget: expect.objectContaining({ profile: "default" }),
      }),
    );
  });

  it("invokes the llm router once for ambiguous messages", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateIntentRoute, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "I feel completely off today. What should I do?",
      recentMessages: [],
    });

    expect(generateIntentRoute).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "llm_router",
        requiredContextSlices: expect.arrayContaining([
          expect.objectContaining({ type: "workout_adaptation" }),
        ]),
      }),
      expect.anything(),
    );
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(true);
  });

  it("invokes the llm router for nutrition adaptation text turns", async () => {
    const contextPacket = createSlicePacket("nutrition_adaptation", "adjust_nutrition", {
      activeNutritionPlan: {
        title: "Macros",
        summary: "Higher protein focus.",
        caloriesPerDay: 2200,
        proteinGrams: 160,
        carbsGrams: 200,
        fatGrams: 70,
        hydrationLiters: 2.5,
        preferences: [],
        restrictions: [],
      },
    });
    const { service, generateIntentRoute, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "What should I eat for dinner tonight?",
      recentMessages: [],
    });

    expect(generateIntentRoute).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "llm_router",
      }),
      expect.anything(),
    );
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

  it("uses final coach output for user-facing replies instead of router output", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const coachReply = "Final coach reply with a reviewable proposal draft.";
    const { service, generateAgentLoopStep, generateIntentRoute } =
      createOrchestratorWithCapturedProvider(contextPacket);

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

    expect(generateIntentRoute).toHaveBeenCalledTimes(1);
    expect(generateAgentLoopStep).toHaveBeenCalledTimes(1);
    expect(result.output.reply).toBe(coachReply);
    expect(result.output.proposals).toHaveLength(1);
    expect(result.output.proposals[0]?.intent).toBe("adapt_workout_plan");
  });

  it("falls back to the uncertain rule route when llm router output is invalid", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const { service, generateIntentRoute, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);

    generateIntentRoute.mockResolvedValue({
      catalogIntentId: "adjust_workout",
      confidence: 0.86,
      routingMethod: "llm_router",
      requiredContextSlices: [
        { type: "workout_adaptation", depth: "medium", timeRange: "14d" },
      ],
      safetyFlags: ["fatigue"],
      expectedResponseMode: "recommendation_with_optional_proposal",
      reply: "Skip training today.",
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

    expect(generateIntentRoute).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "llm_router",
        isConfident: false,
        confidence: 0.35,
      }),
      expect.anything(),
    );
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(true);
  });

  it("falls back to the uncertain rule route when llm router returns attachment-family ids", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const { service, generateIntentRoute, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);

    generateIntentRoute.mockResolvedValue({
      catalogIntentId: "attachment_food_photo",
      confidence: 0.95,
      routingMethod: "llm_router",
      requiredContextSlices: [
        { type: "nutrition_adaptation", depth: "medium", timeRange: "14d" },
      ],
      safetyFlags: [],
      expectedResponseMode: "recommendation_with_optional_proposal",
    });

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "What should I eat tonight?",
      recentMessages: [],
    });

    expect(generateIntentRoute).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "llm_router",
        isConfident: false,
        confidence: 0.35,
      }),
      expect.anything(),
    );
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(true);
  });

  it("bypasses the llm router for proposal revision turns and passes revision context", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateIntentRoute, generateAgentLoopStep } =
      createOrchestratorWithCapturedProvider(contextPacket);

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

    expect(generateIntentRoute).not.toHaveBeenCalled();
    const providerRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: Record<string, unknown>;
    };
    expect(providerRequest.coachingContext.proposalRevision).toMatchObject({
      supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
      modificationFeedback: "Keep one strength exercise.",
    });
  });

  it("bypasses the llm router for proposal explainer turns and passes proposal context", async () => {
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
    const generateIntentRoute = vi.fn();
    const generateCoachResponse = vi.fn();

    vi.spyOn(coachProviderFactory, "createCoachAiProvider").mockReturnValue({
      generateAgentLoopStep,
      generateCoachResponse,
      generateIntentRoute,
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
    const {
      capabilityRegistryService,
      responseModePolicyService,
      contextBudgetPolicyService,
      systemPlannerService,
      aiBehaviorConfigService,
    } = createAiPolicyTestStack();
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      agentToolRegistryService as never,
      systemPlannerService,
      new ActionResolverService(),
      aiBehaviorConfigService,
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

    expect(generateIntentRoute).not.toHaveBeenCalled();
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
    const { service, generateIntentRoute, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);

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

    expect(generateIntentRoute).not.toHaveBeenCalled();
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

  it("bypasses the llm router for attachment turns and routes to attachment families", async () => {
    const contextPacket = createSlicePacket("nutrition_adaptation", "adjust_nutrition");
    const { service, generateIntentRoute, generateAgentLoopStep, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);

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

    expect(generateIntentRoute).not.toHaveBeenCalled();
    expect(generateAgentLoopStep).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "attachment_family",
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
    expect(result.agentMetadata.routing?.routingMethod).toBe("attachment_family");
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(false);
  });

  it("routes mixed attachment turns by precedence and bypasses the llm router", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateIntentRoute, generateAgentLoopStep, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);

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

    expect(generateIntentRoute).not.toHaveBeenCalled();
    expect(generateAgentLoopStep).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "attachment_family",
        catalogIntentId: "attachment_workout",
      }),
      expect.anything(),
    );
    expect(result.agentMetadata.catalogIntentId).toBe("attachment_workout");
    expect(result.agentMetadata.routing?.routingMethod).toBe("attachment_family");
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(false);
  });

  it("passes prepared attachment proposal summaries into coaching context", async () => {
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
        preparedProposals: [
          {
            intent: "create_today_checklist",
            targetDomain: "today",
            title: "Add today's workout to Today",
          },
        ],
      },
    });

    const providerRequest = generateAgentLoopStep.mock.calls[0]?.[0] as {
      coachingContext: { attachmentTurn?: { preparedProposals?: unknown[] } };
    };

    expect(providerRequest.coachingContext.attachmentTurn?.preparedProposals).toEqual([
      {
        intent: "create_today_checklist",
        targetDomain: "today",
        title: "Add today's workout to Today",
      },
    ]);
  });

  it("passes intent-specific agentMetadata to the generation loop after llm catalog routing", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateIntentRoute, generateAgentLoopStep, coachingContextService } =
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

    expect(generateIntentRoute).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ intent: "adjust_workout", purpose: "workout_adaptation" }),
      expect.objectContaining({
        routingMethod: "llm_router",
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

  it("serializes router catalog through the capability registry", async () => {
    const contextPacket = createSlicePacket("workout_adaptation", "adjust_workout");
    const { service, generateIntentRoute, capabilityRegistryService } =
      createOrchestratorWithCapturedProvider(contextPacket);
    const serializeForRouter = vi.spyOn(capabilityRegistryService, "serializeForRouter");

    await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "Can you adapt my workout plan this week?",
      recentMessages: [],
    });

    expect(serializeForRouter).toHaveBeenCalledTimes(1);
    expect(generateIntentRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        intentCatalog: capabilityRegistryService.serializeForRouter(),
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

  it("uses llm router when all attachments are unclassified instead of attachment-family routing", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const { service, generateIntentRoute, generateAgentLoopStep, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);

    generateIntentRoute.mockResolvedValue({
      catalogIntentId: "general",
      confidence: 0.72,
      routingMethod: "llm_router",
      requiredContextSlices: [{ type: "general_chat", depth: "small", timeRange: "7d" }],
      safetyFlags: [],
      expectedResponseMode: "advice_only",
    });

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

    expect(generateIntentRoute).toHaveBeenCalledTimes(1);
    expect(generateAgentLoopStep).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "llm_router",
        catalogIntentId: "general",
      }),
      expect.anything(),
    );
    expect(result.agentMetadata.routing?.routingMethod).toBe("llm_router");
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(true);
    expect(result.agentMetadata.catalogIntentId).toBe("general");
  });

  it("falls back to the uncertain rule route when llm router provider throws", async () => {
    const contextPacket = createSlicePacket("general_chat", "general");
    const { service, generateIntentRoute, coachingContextService } =
      createOrchestratorWithCapturedProvider(contextPacket);

    generateIntentRoute.mockRejectedValue(new Error("OpenAI intent router request failed."));

    const result = await service.orchestrateCoachTurn({
      auth: {
        clerkUserId: "clerk-user",
        email: "test@example.com",
        displayName: "Test",
      },
      userMessage: "I feel completely off today. What should I do?",
      recentMessages: [],
    });

    expect(generateIntentRoute).toHaveBeenCalledTimes(1);
    expect(coachingContextService.buildAgentContext).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        routingMethod: "llm_router",
        isConfident: false,
        confidence: 0.35,
      }),
      expect.anything(),
    );
    expect(result.agentMetadata.routing?.llmRouterInvoked).toBe(true);
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
    const { service, generateAgentLoopStep, generateIntentRoute, agentToolRegistryService } =
      createOrchestratorWithCapturedProvider(contextPacket);

    generateIntentRoute.mockResolvedValue({
      catalogIntentId: "general",
      confidence: 0.82,
      routingMethod: "llm_router",
      requiredContextSlices: [{ type: "general_chat", depth: "small", timeRange: "7d" }],
      safetyFlags: [],
      expectedResponseMode: "advice_only",
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
        generateIntentRoute: vi.fn(),
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
    const generateIntentRoute = vi.fn().mockResolvedValue({
      catalogIntentId: "review_progress",
      confidence: 0.9,
      routingMethod: "llm_router",
      requiredContextSlices: [{ type: "weekly_review", depth: "large", timeRange: "30d" }],
      safetyFlags: [],
      expectedResponseMode: "recommendation_with_optional_proposal",
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
    const {
      capabilityRegistryService,
      responseModePolicyService,
      contextBudgetPolicyService,
      systemPlannerService,
      aiBehaviorConfigService,
    } = createAiPolicyTestStack();
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(),
      new ContextExpansionPolicyService(),
      agentToolRegistryService as never,
      systemPlannerService,
      new ActionResolverService(),
      aiBehaviorConfigService,
    );

    Object.assign(service, {
      provider: { generateCoachResponse, generateIntentRoute, generateAgentLoopStep },
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
    const generateIntentRoute = vi.fn().mockResolvedValue({
      catalogIntentId: "review_progress",
      confidence: 0.9,
      routingMethod: "llm_router",
      requiredContextSlices: [{ type: "weekly_review", depth: "large", timeRange: "30d" }],
      safetyFlags: [],
      expectedResponseMode: "recommendation_with_optional_proposal",
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
    const {
      capabilityRegistryService,
      responseModePolicyService,
      contextBudgetPolicyService,
      systemPlannerService,
      aiBehaviorConfigService,
    } = createAiPolicyTestStack();
    const failingProvider = {
      compress: vi.fn().mockRejectedValue(new Error("Primary compression provider unavailable")),
    };
    const service = new AgentOrchestratorService(
      coachingContextService as never,
      new ContextCompressionService(failingProvider as never, new StubContextCompressionProvider()),
      new ContextExpansionPolicyService(),
      agentToolRegistryService as never,
      systemPlannerService,
      new ActionResolverService(),
      aiBehaviorConfigService,
    );

    Object.assign(service, {
      provider: { generateCoachResponse, generateIntentRoute, generateAgentLoopStep },
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
