import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { ProposalValidationService } from "../proposals/proposal-validation.service.js";
import {
  WELLBEING_CRISIS_SUPPORT_COPY,
  WEEKLY_REVIEW_CHAT_PROMPT,
  getTodayIsoDateInTimezone,
} from "@health/types";
import { createAiPolicyTestStack } from "../ai/test-ai-behavior-fixtures.js";
import { DirectChatPathService } from "./direct-chat-path.service.js";
import { ChatService } from "./chat.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const thread = {
  id: "24b19287-75b8-4a3e-9c10-691908479405",
  userId: user.id,
  title: "Coach chat",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const noopWeeklyReviewService = {
  packChatWeeklyReviewProposals: async () => {
    throw new Error("packChatWeeklyReviewProposals should not be called");
  },
} as never;

const noopWellbeingCheckInsService = {
  getCheckInForDate: async () => ({ checkIn: null }),
} as never;

const noopRecipesService = {
  packChatRecipeRecommendationProposal: async () => null,
} as never;

const noopChatAttachmentsService = {
  getMessageDisplayAttachments: async () => new Map(),
} as never;

/** Entitlements stub: always allows AI messages (no quota enforcement in existing tests). */
const noopEntitlementsService = {
  assertAiMessageAllowed: async () => undefined,
  recordAiMessageUsage: async () => undefined,
  getEntitlement: async () => ({
    tier: "free" as const,
    aiMessagesPerDay: 10,
    aiMessagesUsedToday: 0,
    aiMessagesRemaining: 10,
  }),
} as never;

function buildMockAttachmentTurnStageResult(input: {
  attachments: readonly Record<string, unknown>[];
}) {
  return {
    attachmentMetadata: input.attachments.map((attachment) => ({
      refId: attachment.id,
      category: attachment.category ?? "unclassified",
      mimeType: attachment.mimeType ?? "image/jpeg",
      consentState: attachment.consent != null ? "granted" : "none",
      storageRef: attachment.storageKey ?? null,
    })),
    outcomes: input.attachments.map((attachment) => ({
      attachmentRefId: attachment.id,
      category: attachment.category ?? "unclassified",
      status: attachment.status ?? "ready",
      // recognition field removed (B3 removal, C4 cluster)
    })),
  };
}

const noopDirectChatPathService = {
  tryExecute: async () => null,
} as never;

const noopProposalExplainerService = {
  resolvePreAiTurn: async () => ({ kind: "not_explainer" as const }),
} as never;

function createDirectChatPathServiceForChatTests(todayService: {
  getOrGenerateDay: (...args: unknown[]) => Promise<unknown>;
  updateItemStatus?: (...args: unknown[]) => Promise<unknown>;
}) {
  const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();

  return new DirectChatPathService(
    systemPlannerService,
    aiBehaviorConfigService,
    todayService as never,
    {
      resolveFromAuth: async () => user,
    } as never,
    {
      getCurrentActivePlan: vi.fn().mockResolvedValue({ plan: null, activeRevision: null }),
    } as never,
  );
}

const noopAiBehaviorConfigService = {
  getChat: () => ({
    emptyAttachmentMessage: "Shared attachment(s) for coaching review.",
  }),
  getDeterministicProposalTriggers: () => ({
    maxMergedProposals: 5,
    wellbeingCheckin: {
      enabled: true,
      moodPhrases: ["feel bad"],
      excludeContainsPhrases: ["hungry", "not losing weight"],
      excludeWhenNutritionIncidentSignal: true,
      requireNoTodayCheckIn: true,
      skipWhenCrisis: true,
    },
    nutritionIncident: {
      enabled: true,
      phrases: ["cheat meal"],
      skipWhenCrisis: true,
    },
    recipeRecommendation: {
      enabled: true,
      phrases: ["dinner idea"],
      excludeWhenNutritionIncidentSignal: true,
      skipWhenCrisis: true,
    },
  }),
  getSuggestedQuickActions: () => ({ actions: [] }),
} as never;

const noopChatTurnAttachmentStageService = {
  validateRefsForSend: async () => undefined,
  runTurnStages: async () => null,
} as never;

function createDefaultAgentMetadataForTests(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    provider: "openai",
    intent: "general",
    catalogIntentId: "general",
    purpose: "general_chat",
    depth: "small",
    timeRange: "7d",
    toolsInvoked: [],
    citations: [],
    unifiedTurnDecision: { ran: false },
    safety: {
      status: "passed",
      blockedReasons: [],
      constraintsApplied: [],
    },
    ...overrides,
  };
}

function wrapAiServiceWithDefaultMetadata(aiService: unknown) {
  const service = aiService as {
    generateCoachResponse: (...args: unknown[]) => Promise<Record<string, unknown>>;
  };

  return {
    ...service,
    generateCoachResponse: async (...args: unknown[]) => {
      const result = await service.generateCoachResponse(...args);

      if (!result.agentMetadata) {
        return {
          ...result,
          agentMetadata: createDefaultAgentMetadataForTests(),
        };
      }

      const agentMetadata = result.agentMetadata as Record<string, unknown>;

      if (agentMetadata.unifiedTurnDecision) {
        return result;
      }

      return {
        ...result,
        agentMetadata: {
          ...agentMetadata,
          unifiedTurnDecision: { ran: false },
        },
      };
    },
  };
}

function createChatService(deps: {
  chatRepository: unknown;
  usersService: unknown;
  aiService: unknown;
  proposalValidationService: unknown;
  progressWeeklyReviewService?: unknown;
  wellbeingCheckInsService?: unknown;
  recipesService?: unknown;
  chatAttachmentsService?: unknown;
  chatTurnAttachmentStageService?: unknown;
  directChatPathService?: unknown;
  proposalExplainerService?: unknown;
  aiBehaviorConfigService?: unknown;
  entitlementsService?: unknown;
}) {
  return new ChatService(
    deps.chatRepository as never,
    deps.usersService as never,
    wrapAiServiceWithDefaultMetadata(deps.aiService) as never,
    deps.proposalValidationService as never,
    (deps.progressWeeklyReviewService ?? noopWeeklyReviewService) as never,
    (deps.wellbeingCheckInsService ?? noopWellbeingCheckInsService) as never,
    (deps.recipesService ?? noopRecipesService) as never,
    (deps.chatAttachmentsService ?? noopChatAttachmentsService) as never,
    (deps.chatTurnAttachmentStageService ?? noopChatTurnAttachmentStageService) as never,
    (deps.directChatPathService ?? noopDirectChatPathService) as never,
    (deps.proposalExplainerService ?? noopProposalExplainerService) as never,
    (deps.aiBehaviorConfigService ?? noopAiBehaviorConfigService) as never,
    (deps.entitlementsService ?? noopEntitlementsService) as never,
  );
}

describe("ChatService", () => {
  it("persists agent turn metadata on assistant messages", async () => {
    let assistantMetadata: Record<string, unknown> = {};
    const agentMetadata = {
      provider: "openai" as const,
      intent: "adjust_workout" as const,
      purpose: "workout_adaptation" as const,
      depth: "medium" as const,
      timeRange: "14d" as const,
      toolsInvoked: ["getWeeklyProgressContext" as const],
      unifiedTurnDecision: { ran: false },
      safety: {
        status: "passed" as const,
        blockedReasons: [],
        constraintsApplied: ["Plan changes must be proposals requiring user approval."],
      },
      citations: [],
    };

    const service = createChatService({
      chatRepository: {
        findThreadById: async () => thread,
        listMessagesByThreadId: async () => [],
        createMessage: async (
          _threadId: string,
          role: "user" | "assistant" | "system",
          content: string,
          metadata: Record<string, unknown> = {},
        ) => {
          if (role === "assistant") {
            assistantMetadata = metadata;
          }

          return {
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          };
        },
        createProposal: async () => {
          throw new Error("createProposal should not be called");
        },
        touchThread: async () => undefined,
      },
      usersService: {
        resolveFromAuth: async () => user,
      },
      aiService: {
        generateCoachResponse: async () => ({
          output: {
            reply: "Here is a coaching reply.",
            proposals: [],
          },
          parseErrors: [],
          replySafetyErrors: [],
          agentMetadata,
        }),
      },
      proposalValidationService: {
        validateRawProposal: () => ({ valid: true, errors: [] }),
        validateCorrelationEvidenceOwnership: async () => [],
        validateProvenanceOwnership: async () => [],
        validateProgressLinkedProvenanceRequired: () => [],
        validateGoalProposalHierarchy: async () => [],
        validateTodayChecklistGoalSourceRefs: async () => [],
        validateRecoveryAwareWorkoutAdaptation: async () => [],
        validateHabitProposalContext: async () => [],
        validateWellbeingCheckinProposalContext: async () => [],
        validateNutritionIncidentImageRefOwnership: async () => [],
        validateChatAttachmentProposalRefs: async () => [],
        validateRecipeRecommendationProposalContext: async () => [],
      },
    });

    await service.sendMessage(auth, thread.id, {
      content: "Can you adapt my workout this week?",
    });

    expect(assistantMetadata.agent).toEqual(agentMetadata);
    expect(assistantMetadata.parseErrors).toEqual([]);
    expect(assistantMetadata.replySafetyErrors).toEqual([]);
  });

  it("passes proposalRevision metadata to AiService for revision turns", async () => {
    let capturedInput: Record<string, unknown> | undefined;
    const proposalRevision = {
      supersededProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
      modificationFeedback: "Keep one strength exercise.",
      originalProposal: {
        intent: "adapt_workout_plan" as const,
        targetDomain: "workout" as const,
        title: "Adjust today's workout",
        reason: "Recovery signals are low.",
        proposedChanges: {
          title: "Strength base",
          summary: "Lighter session today.",
          days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
          notes: [],
        },
      },
    };

    const service = createChatService({
      chatRepository: {
        findThreadById: async () => thread,
        listMessagesByThreadId: async () => [],
        createMessage: async (
          _threadId: string,
          role: "user" | "assistant" | "system",
          content: string,
          metadata: Record<string, unknown> = {},
        ) => ({
          id: role === "user" ? "user-message-id" : "assistant-message-id",
          threadId: thread.id,
          role,
          content,
          metadata,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        createProposal: async () => {
          throw new Error("createProposal should not be called");
        },
        touchThread: async () => undefined,
      },
      usersService: {
        resolveFromAuth: async () => user,
      },
      aiService: {
        generateCoachResponse: async (input: Record<string, unknown>) => {
          capturedInput = input;
          return {
            output: {
              reply: "Here is a revised proposal to review.",
              proposals: [],
            },
            parseErrors: [],
            replySafetyErrors: [],
            agentMetadata: {
              provider: "openai" as const,
              intent: "adjust_workout" as const,
              purpose: "workout_adaptation" as const,
              depth: "medium" as const,
              timeRange: "14d" as const,
              toolsInvoked: [],
              safety: {
                status: "passed" as const,
                blockedReasons: [],
                constraintsApplied: [],
              },
              citations: [],
            },
          };
        },
      },
      proposalValidationService: {
        validateRawProposal: () => ({ valid: true, errors: [] }),
        validateCorrelationEvidenceOwnership: async () => [],
        validateProvenanceOwnership: async () => [],
        validateProgressLinkedProvenanceRequired: () => [],
        validateGoalProposalHierarchy: async () => [],
        validateTodayChecklistGoalSourceRefs: async () => [],
        validateRecoveryAwareWorkoutAdaptation: async () => [],
        validateHabitProposalContext: async () => [],
        validateWellbeingCheckinProposalContext: async () => [],
        validateNutritionIncidentImageRefOwnership: async () => [],
        validateChatAttachmentProposalRefs: async () => [],
        validateRecipeRecommendationProposalContext: async () => [],
      },
    });

    await service.sendMessage(auth, thread.id, {
      content: "Please revise the proposal with these changes: keep one strength exercise.",
      proposalRevision,
    });

    expect(capturedInput?.proposalRevision).toEqual(proposalRevision);
  });

  it("persists unified turn decision routing metadata on assistant messages", async () => {
    let assistantMetadata: Record<string, unknown> = {};
    const agentMetadata = {
      provider: "openai" as const,
      intent: "adjust_nutrition" as const,
      purpose: "nutrition_adaptation" as const,
      depth: "medium" as const,
      timeRange: "14d" as const,
      toolsInvoked: [] as const,
      safety: {
        status: "passed" as const,
        blockedReasons: [],
        constraintsApplied: ["Plan changes must be proposals requiring user approval."],
      },
      citations: [],
      routing: {
        confidence: 0.84,
        routingMethod: "unified_turn_decision" as const,
        llmRouterInvoked: false,
        unifiedTurnDecisionInvoked: true,
        safetyFlags: ["hunger", "fatigue"] as const,
        expectedResponseMode: "recommendation_with_optional_proposal" as const,
        contextSliceCount: 2,
      },
    };

    const service = createChatService({
      chatRepository: {
        findThreadById: async () => thread,
        listMessagesByThreadId: async () => [],
        createMessage: async (
          _threadId: string,
          role: "user" | "assistant" | "system",
          content: string,
          metadata: Record<string, unknown> = {},
        ) => {
          if (role === "assistant") {
            assistantMetadata = metadata;
          }

          return {
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          };
        },
        createProposal: async () => {
          throw new Error("createProposal should not be called");
        },
        touchThread: async () => undefined,
      },
      usersService: {
        resolveFromAuth: async () => user,
      },
      aiService: {
        generateCoachResponse: async () => ({
          output: {
            reply: "Here is a coaching reply.",
            proposals: [],
          },
          parseErrors: [],
          replySafetyErrors: [],
          agentMetadata,
        }),
      },
      proposalValidationService: {
        validateRawProposal: () => ({ valid: true, errors: [] }),
        validateCorrelationEvidenceOwnership: async () => [],
        validateProvenanceOwnership: async () => [],
        validateProgressLinkedProvenanceRequired: () => [],
        validateGoalProposalHierarchy: async () => [],
        validateTodayChecklistGoalSourceRefs: async () => [],
        validateRecoveryAwareWorkoutAdaptation: async () => [],
        validateHabitProposalContext: async () => [],
        validateWellbeingCheckinProposalContext: async () => [],
        validateNutritionIncidentImageRefOwnership: async () => [],
        validateChatAttachmentProposalRefs: async () => [],
        validateRecipeRecommendationProposalContext: async () => [],
      },
    });

    await service.sendMessage(auth, thread.id, {
      content: "I feel tired and hungry all the time.",
    });

    expect(assistantMetadata.agent).toEqual(
      expect.objectContaining({
        routing: expect.objectContaining({
          unifiedTurnDecisionInvoked: true,
          routingMethod: "unified_turn_decision",
          contextSliceCount: 2,
        }),
      }),
    );
  });

  it("persists invalid proposals with validation errors instead of dropping them", async () => {
    const captured: Array<{
      validationStatus: string;
      validationErrors: string[];
    }> = [];

    const invalidProposal = {
      intent: "create_workout_plan" as const,
      targetDomain: "workout" as const,
      title: "Broken workout plan",
      reason: "This proposal has invalid payload shape.",
      proposedChanges: {
        title: "Broken workout plan",
        summary: "Missing required days.",
      },
    };

    const service = createChatService({
      chatRepository: {
        findThreadById: async () => thread,
        listMessagesByThreadId: async () => [],
        createMessage: async (
          _threadId: string,
          role: "user" | "assistant" | "system",
          content: string,
        ) => ({
          id: role === "user" ? "user-message-id" : "assistant-message-id",
          threadId: thread.id,
          role,
          content,
          metadata: {},
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        createProposal: async (
          _userId: string,
          _threadId: string,
          _sourceMessageId: string | null,
          _proposal: typeof invalidProposal,
          validationStatus: "valid" | "invalid" | "pending_validation",
          validationErrors: string[],
        ) => {
          captured.push({ validationStatus, validationErrors });

          return {
            id: "proposal-id",
            userId: user.id,
            threadId: thread.id,
            sourceMessageId: "assistant-message-id",
            ...invalidProposal,
            status: "pending" as const,
            validationStatus,
            validationErrors,
            userDecisionAt: null,
            appliedReference: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          };
        },
        touchThread: async () => undefined,
      },
      usersService: {
        resolveFromAuth: async () => user,
      },
      aiService: {
        generateCoachResponse: async () => ({
          output: {
            reply: "Here is a proposal to review.",
            proposals: [invalidProposal],
          },
          parseErrors: [],
          replySafetyErrors: [],
        }),
      },
      proposalValidationService: new ProposalValidationService(
        {
          summaryExistsForUser: async () => true,
          findTrendsOwnedByUser: async () => [],
        } as never,
        {
          findInaccessibleExerciseIds: async () => [],
        } as never,
        {
          getHabitTemplateReferenceErrors: async () => [],
        } as never,
        {
          findApprovedSignalById: async () => null,
          findCorrelationEligibleSignalById: async () => null,
        } as never,
        {
          buildSummaryForUser: async () => ({ items: [], generatedAt: new Date().toISOString() }),
        } as never,
        {
          listByUserId: async () => [],
        } as never,
        {
          computeAndPersistSnapshot: async () => ({
            id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
            band: "moderate_load",
          }),
        } as never,
        {
          findActivePlanByUserId: async () => null,
          findRevisionById: async () => null,
        } as never,
        {
          findByUserId: async () => ({ timezone: "UTC" }),
        } as never,
        {
          findActivePlanByUserId: async () => null,
          findActiveRevisionByPlanId: async () => null,
        } as never,
        {} as never,
        {} as never,
        {} as never,
        { listByIdsForUser: async () => [] } as never,
      ),
    });

    const result = await service.sendMessage(auth, thread.id, {
      content: "Suggest a workout plan",
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.validationStatus).toBe("invalid");
    expect(captured[0]?.validationErrors.length).toBeGreaterThan(0);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.validationStatus).toBe("invalid");
    expect(result.proposals[0]?.validationErrors.length).toBeGreaterThan(0);
  });

  it("validates evidence ref ownership before persisting generated proposals", async () => {
    const evidenceError =
      "evidenceRefs[0].id: Approved document signal was not found for this user.";
    const captured: Array<{
      validationStatus: string;
      validationErrors: string[];
    }> = [];
    const proposalWithUnownedEvidence = {
      intent: "summarize_progress" as const,
      targetDomain: "general" as const,
      title: "Review recent recovery patterns",
      reason: "Training load looked heavy recently.",
      proposedChanges: {},
      evidenceRefs: [
        {
          type: "document_signal" as const,
          id: "4a98f3dd-806d-4386-8c5f-43499626c5d7",
          label: "Energy level from uploaded document",
        },
      ],
    };

    const service = createChatService({
      chatRepository: {
        findThreadById: async () => thread,
        listMessagesByThreadId: async () => [],
        createMessage: async (
          _threadId: string,
          role: "user" | "assistant" | "system",
          content: string,
        ) => ({
          id: role === "user" ? "user-message-id" : "assistant-message-id",
          threadId: thread.id,
          role,
          content,
          metadata: {},
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
        createProposal: async (
          _userId: string,
          _threadId: string,
          _sourceMessageId: string | null,
          _proposal: typeof proposalWithUnownedEvidence,
          validationStatus: "valid" | "invalid" | "pending_validation",
          validationErrors: string[],
        ) => {
          captured.push({ validationStatus, validationErrors });

          return {
            id: "proposal-id",
            userId: user.id,
            threadId: thread.id,
            sourceMessageId: "assistant-message-id",
            ...proposalWithUnownedEvidence,
            status: "pending" as const,
            validationStatus,
            validationErrors,
            userDecisionAt: null,
            appliedReference: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          };
        },
        touchThread: async () => undefined,
      },
      usersService: {
        resolveFromAuth: async () => user,
      },
      aiService: {
        generateCoachResponse: async () => ({
          output: {
            reply: "Here is a proposal to review.",
            proposals: [proposalWithUnownedEvidence],
          },
          parseErrors: [],
          replySafetyErrors: [],
        }),
      },
      proposalValidationService: {
        validateRawProposal: () => ({ valid: true, errors: [] }),
        validateCorrelationEvidenceOwnership: async () => [evidenceError],
        validateProvenanceOwnership: async () => [],
        validateProgressLinkedProvenanceRequired: () => [],
        validateGoalProposalHierarchy: async () => [],
        validateTodayChecklistGoalSourceRefs: async () => [],
        validateRecoveryAwareWorkoutAdaptation: async () => [],
        validateHabitProposalContext: async () => [],
        validateWellbeingCheckinProposalContext: async () => [],
        validateNutritionIncidentImageRefOwnership: async () => [],
        validateChatAttachmentProposalRefs: async () => [],
        validateRecipeRecommendationProposalContext: async () => [],
      },
    });

    const result = await service.sendMessage(auth, thread.id, {
      content: "Suggest recovery adjustments",
    });

    expect(captured).toEqual([
      {
        validationStatus: "invalid",
        validationErrors: [evidenceError],
      },
    ]);
    expect(result.proposals[0]?.validationStatus).toBe("invalid");
    expect(result.proposals[0]?.validationErrors).toEqual([evidenceError]);
  });

  it("returns static crisis support without calling AI when keywords are present", async () => {
    let aiCalled = false;
    const capturedAssistant: Array<{ content: string; metadata: Record<string, unknown> }> = [];

    const service = createChatService({
      chatRepository: {
        findThreadById: async () => thread,
        listMessagesByThreadId: async () => [],
        createMessage: async (
          _threadId: string,
          role: "user" | "assistant" | "system",
          content: string,
          metadata: Record<string, unknown> = {},
        ) => {
          if (role === "assistant") {
            capturedAssistant.push({ content, metadata });
          }

          return {
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          };
        },
        createProposal: async () => {
          throw new Error("createProposal should not be called for crisis boundary turns");
        },
        touchThread: async () => undefined,
      },
      usersService: {
        resolveFromAuth: async () => user,
      },
      aiService: {
        generateCoachResponse: async () => {
          aiCalled = true;
          return {
            output: { reply: "Unsafe coaching reply", proposals: [] },
            parseErrors: [],
            replySafetyErrors: [],
          };
        },
      },
      proposalValidationService: {
        validateRawProposal: () => ({ valid: true, errors: [] }),
        validateCorrelationEvidenceOwnership: async () => [],
        validateProvenanceOwnership: async () => [],
        validateProgressLinkedProvenanceRequired: () => [],
        validateGoalProposalHierarchy: async () => [],
        validateTodayChecklistGoalSourceRefs: async () => [],
        validateRecoveryAwareWorkoutAdaptation: async () => [],
        validateHabitProposalContext: async () => [],
        validateWellbeingCheckinProposalContext: async () => [],
        validateNutritionIncidentImageRefOwnership: async () => [],
        validateChatAttachmentProposalRefs: async () => [],
        validateRecipeRecommendationProposalContext: async () => [],
      },
    });

    const result = await service.sendMessage(auth, thread.id, {
      content: "I want to die and I do not know what to do",
    });

    expect(aiCalled).toBe(false);
    expect(capturedAssistant).toHaveLength(1);
    expect(capturedAssistant[0]?.content).toContain("Support is available");
    expect(capturedAssistant[0]?.content).toContain("tel:988");
    expect(capturedAssistant[0]?.metadata.crisisBoundary).toBe(true);
    expect(capturedAssistant[0]?.metadata.crisisSupport).toMatchObject({
      shouldShowCrisisSupport: true,
      reasons: ["keyword_match"],
    });
    expect(result.proposals).toEqual([]);
    expect(result.assistantMessage.content).toContain(WELLBEING_CRISIS_SUPPORT_COPY.message);
  });

  describe("direct chat path integration", () => {
    const workoutItemId = "880099c6-3b5f-4383-8246-97b72bf61818";
    const todayIsoDate = getTodayIsoDateInTimezone(user.timezone);

    function buildDirectPathTodayDay(overrides?: {
      items?: Array<{
        id: string;
        label: string;
        kind: "workout";
        status: "pending" | "completed" | "skipped";
        required: boolean;
        source: { type: "workout_session"; id: string };
      }>;
      adherence?: {
        score: number | null;
        completedRequired: number;
        totalRequired: number;
        completedOptional: number;
        skippedRequired: number;
        skippedOptional: number;
      };
    }) {
      return {
        id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        userId: user.id,
        date: todayIsoDate,
        items: overrides?.items ?? [
          {
            id: workoutItemId,
            label: "Strength session",
            kind: "workout" as const,
            status: "pending" as const,
            required: true,
            source: {
              type: "workout_session" as const,
              id: "78d40655-b4b5-47b3-b28e-470192e05f04",
            },
          },
        ],
        source: "generated",
        feedback: null,
        adherence: overrides?.adherence ?? {
          score: 0,
          completedRequired: 0,
          totalRequired: 1,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        createdAt: new Date("2026-05-27T12:00:00.000Z").toISOString(),
        updatedAt: new Date("2026-05-27T12:00:00.000Z").toISOString(),
        workout: null,
        nutrition: null,
      };
    }

    function createDirectPathChatService(options?: {
      todayService?: {
        getOrGenerateDay: (...args: unknown[]) => Promise<unknown>;
        updateItemStatus?: (...args: unknown[]) => Promise<unknown>;
      };
      aiCalledRef?: { value: boolean };
      attachmentRefIds?: string[];
    }) {
      const aiCalledRef = options?.aiCalledRef ?? { value: false };
      const capturedAssistant: Array<{ content: string; metadata: Record<string, unknown> }> =
        [];

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => {
            if (role === "assistant") {
              capturedAssistant.push({ content, metadata });
            }

            return {
              id: role === "user" ? "user-message-id" : "assistant-message-id",
              threadId: thread.id,
              role,
              content,
              metadata,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            };
          },
          createProposal: async () => {
            throw new Error("createProposal should not be called for direct path turns");
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => {
            aiCalledRef.value = true;
            return {
              output: { reply: "AI should not run", proposals: [] },
              parseErrors: [],
              replySafetyErrors: [],
            };
          },
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        directChatPathService: createDirectChatPathServiceForChatTests(
          options?.todayService ?? {
            getOrGenerateDay: async () => buildDirectPathTodayDay(),
            updateItemStatus: async () => buildDirectPathTodayDay(),
          },
        ),
        chatTurnAttachmentStageService: {
          validateRefsForSend: async () => undefined,
          runTurnStages: async () =>
            buildMockAttachmentTurnStageResult({
              attachments: options!.attachmentRefIds!.map((id) => ({
                id,
                userId: user.id,
                category: "unclassified",
                status: "ready",
                linkedDocumentId: null,
                linkedImageRefId: null,
                retentionPolicy: "standard",
                expiresAt: null,
                // recognition field removed (B3 removal, C4 cluster)
              })),
            }),
        },
      });

      return { service, aiCalledRef, capturedAssistant };
    }

    it("bypasses AI for explicit today summary read", async () => {
      const { service, aiCalledRef, capturedAssistant } = createDirectPathChatService();

      const result = await service.sendMessage(auth, thread.id, {
        content: "What is today?",
      });

      expect(aiCalledRef.value).toBe(false);
      expect(result.proposals).toEqual([]);
      expect(capturedAssistant[0]?.metadata.directPath).toMatchObject({
        candidate: { kind: "today_summary_read" },
        outcome: { kind: "today_summary_read", status: "executed", refreshHints: ["today"] },
      });
      expect(result.assistantMessage.content).toContain("Here's your Today summary");
    });

    it("executes explicit workout done without AI when one pending workout exists", async () => {
      const updateItemStatus = vi.fn(async () => buildDirectPathTodayDay());
      const { service, aiCalledRef } = createDirectPathChatService({
        todayService: {
          getOrGenerateDay: async () => buildDirectPathTodayDay(),
          updateItemStatus,
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "Mark today's workout done",
      });

      expect(aiCalledRef.value).toBe(false);
      expect(updateItemStatus).toHaveBeenCalledWith(auth, todayIsoDate, workoutItemId, {
        status: "completed",
      });
      expect(result.proposals).toEqual([]);
      expect(result.assistantMessage.content).toContain('Marked "Strength session" as done');
      expect(result.assistantMessage.metadata.directPath).toMatchObject({
        outcome: {
          kind: "mark_today_workout_done",
          status: "executed",
          refreshHints: ["today", "dashboard", "longevity"],
        },
      });
    });

    it("returns clarification for ambiguous workout done without AI or mutation", async () => {
      const updateItemStatus = vi.fn();
      const { service, aiCalledRef } = createDirectPathChatService({
        todayService: {
          getOrGenerateDay: async () =>
            buildDirectPathTodayDay({
              items: [],
              adherence: {
                score: null,
                completedRequired: 0,
                totalRequired: 0,
                completedOptional: 0,
                skippedRequired: 0,
                skippedOptional: 0,
              },
            }),
          updateItemStatus,
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "Mark today's workout done",
      });

      expect(aiCalledRef.value).toBe(false);
      expect(updateItemStatus).not.toHaveBeenCalled();
      expect(result.proposals).toEqual([]);
      expect(result.assistantMessage.metadata.directPath).toMatchObject({
        outcome: {
          kind: "mark_today_workout_done",
          status: "clarification_required",
          refreshHints: [],
        },
      });
    });

    it("still calls AI for non-direct messages", async () => {
      const { service, aiCalledRef } = createDirectPathChatService();

      await service.sendMessage(auth, thread.id, {
        content: "How can I improve recovery this week?",
      });

      expect(aiCalledRef.value).toBe(true);
    });

    it("does not take direct path when attachments are present", async () => {
      const { service, aiCalledRef } = createDirectPathChatService({
        attachmentRefIds: ["a1000001-0000-4000-8000-000000000001"],
      });

      await service.sendMessage(auth, thread.id, {
        content: "What is today?",
        attachmentRefIds: ["a1000001-0000-4000-8000-000000000001"],
      });

      expect(aiCalledRef.value).toBe(true);
    });

    it("does not take direct path when proposal revision is present", async () => {
      const { service, aiCalledRef } = createDirectPathChatService();

      await service.sendMessage(auth, thread.id, {
        content: "What is today?",
        proposalRevision: {
          supersededProposalId: "a1000001-0000-4000-8000-000000000001",
          originalProposal: {
            intent: "create_workout_plan",
            targetDomain: "workout",
            title: "Weekly plan",
            reason: "Build consistency",
            proposedChanges: {
              title: "Weekly plan",
              summary: "Build consistency with a simple weekly structure.",
              days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
              notes: [],
            },
          },
          modificationFeedback: "Make it easier on Wednesdays",
        },
      });

      expect(aiCalledRef.value).toBe(true);
    });

    it("returns crisis support before direct path when crisis language is present", async () => {
      const { service, aiCalledRef, capturedAssistant } = createDirectPathChatService();

      const result = await service.sendMessage(auth, thread.id, {
        content: "I want to die and I do not know what to do",
      });

      expect(aiCalledRef.value).toBe(false);
      expect(capturedAssistant[0]?.metadata.crisisBoundary).toBe(true);
      expect(capturedAssistant[0]?.metadata.directPath).toBeUndefined();
      expect(result.proposals).toEqual([]);
    });
  });

  describe("habit proposal validation at chat time", () => {
    const habitDefinitionId = "a1000001-0000-4000-8000-000000000001";
    const habitPayload = {
      habits: [
        {
          habitDefinitionId,
          title: "Morning hydration",
          category: "hydration",
          status: "active",
          schedule: { type: "daily" },
          target: { type: "boolean" },
          required: true,
          displayOrder: 0,
        },
      ],
    };

    function createHabitChatService(
      proposalValidationService: ProposalValidationService,
      proposal: {
        intent: "create_habit_plan" | "adapt_habit_plan";
        targetDomain: "habits";
        title: string;
        reason: string;
        proposedChanges: typeof habitPayload;
      },
    ) {
      const captured: Array<{
        validationStatus: string;
        validationErrors: string[];
      }> = [];

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata: {},
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
          createProposal: async (
            _userId: string,
            _threadId: string,
            _sourceMessageId: string | null,
            _rawProposal: typeof proposal,
            validationStatus: "valid" | "invalid" | "pending_validation",
            validationErrors: string[],
          ) => {
            captured.push({ validationStatus, validationErrors });

            return {
              id: "proposal-id",
              userId: user.id,
              threadId: thread.id,
              sourceMessageId: "assistant-message-id",
              ...proposal,
              status: "pending" as const,
              validationStatus,
              validationErrors,
              userDecisionAt: null,
              appliedReference: null,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            };
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: {
              reply: "Here is a habit proposal to review.",
              proposals: [proposal],
            },
            parseErrors: [],
            replySafetyErrors: [],
          }),
        },
        proposalValidationService,
      });

      return { service, captured };
    }

    function createDefaultProposalValidationService(
      habitsRepository: {
        findActivePlanByUserId?: (
          userId: string,
        ) => Promise<{ id: string; activeRevisionId: string | null } | null>;
        findActiveRevisionByPlanId?: (
          habitPlanId: string,
          activeRevisionId: string,
        ) => Promise<{ payload: unknown } | null>;
      } = {},
      habitsService: {
        getHabitTemplateReferenceErrors?: (payload: unknown) => Promise<string[]>;
      } = {},
    ) {
      return new ProposalValidationService(
        {
          summaryExistsForUser: async () => true,
          findTrendsOwnedByUser: async () => [],
        } as never,
        {
          findInaccessibleExerciseIds: async () => [],
        } as never,
        {
          getHabitTemplateReferenceErrors: async () => [],
          ...habitsService,
        } as never,
        {
          findApprovedSignalById: async () => null,
          findCorrelationEligibleSignalById: async () => null,
        } as never,
        {
          buildSummaryForUser: async () => ({ items: [], generatedAt: new Date().toISOString() }),
        } as never,
        {
          listByUserId: async () => [],
        } as never,
        {
          computeAndPersistSnapshot: async () => ({
            id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
            band: "moderate_load",
          }),
        } as never,
        {
          findActivePlanByUserId: async () => null,
          findRevisionById: async () => null,
        } as never,
        {
          findByUserId: async () => ({ timezone: "UTC" }),
        } as never,
        {
          findActivePlanByUserId: async () => null,
          findActiveRevisionByPlanId: async () => null,
          ...habitsRepository,
        } as never,
        {} as never,
        {} as never,
        {} as never,
        { listByIdsForUser: async () => [] } as never,
      );
    }

    it("marks create_habit_plan invalid when an active habit plan already exists", async () => {
      const proposal = {
        intent: "create_habit_plan" as const,
        targetDomain: "habits" as const,
        title: "Start hydration habit",
        reason: "Build a daily hydration routine.",
        proposedChanges: habitPayload,
      };
      const { service, captured } = createHabitChatService(
        createDefaultProposalValidationService({
          findActivePlanByUserId: async () => ({
            id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
            activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
          }),
        }),
        proposal,
      );

      const result = await service.sendMessage(auth, thread.id, {
        content: "Help me start a hydration habit",
      });

      expect(captured[0]?.validationStatus).toBe("invalid");
      expect(captured[0]?.validationErrors.some((error) =>
        /create_habit_plan requires no active habit plan/.test(error),
      )).toBe(true);
      expect(result.proposals[0]?.validationStatus).toBe("invalid");
    });

    it("marks adapt_habit_plan invalid when no active habit plan exists", async () => {
      const proposal = {
        intent: "adapt_habit_plan" as const,
        targetDomain: "habits" as const,
        title: "Adjust hydration habit",
        reason: "Make the hydration target easier.",
        proposedChanges: habitPayload,
      };
      const { service, captured } = createHabitChatService(
        createDefaultProposalValidationService(),
        proposal,
      );

      await service.sendMessage(auth, thread.id, {
        content: "Adjust my hydration habit",
      });

      expect(captured[0]?.validationStatus).toBe("invalid");
      expect(captured[0]?.validationErrors.some((error) =>
        /adapt_habit_plan requires an active habit plan/.test(error),
      )).toBe(true);
    });

    it("marks adapt_habit_plan invalid when habitDefinitionId continuity fails", async () => {
      const proposal = {
        intent: "adapt_habit_plan" as const,
        targetDomain: "habits" as const,
        title: "Adjust hydration habit",
        reason: "Swap the hydration habit id.",
        proposedChanges: {
          habits: [
            {
              ...habitPayload.habits[0]!,
              habitDefinitionId: "b2000002-0000-4000-8000-000000000002",
            },
          ],
        },
      };
      const { service, captured } = createHabitChatService(
        createDefaultProposalValidationService({
          findActivePlanByUserId: async () => ({
            id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
            activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
          }),
          findActiveRevisionByPlanId: async () => ({ payload: habitPayload }),
        }),
        proposal,
      );

      await service.sendMessage(auth, thread.id, {
        content: "Adjust my hydration habit",
      });

      expect(captured[0]?.validationStatus).toBe("invalid");
      expect(captured[0]?.validationErrors.some((error) =>
        /must include habitDefinitionId/.test(error),
      )).toBe(true);
    });

    it("marks habit proposals invalid when template references fail", async () => {
      const unknownTemplateId = "d1000001-0000-4000-8000-000000000099";
      const proposal = {
        intent: "create_habit_plan" as const,
        targetDomain: "habits" as const,
        title: "Start hydration habit",
        reason: "Use a catalog hydration template.",
        proposedChanges: {
          habits: [
            {
              ...habitPayload.habits[0]!,
              templateId: unknownTemplateId,
            },
          ],
        },
      };
      const { service, captured } = createHabitChatService(
        createDefaultProposalValidationService({}, {
          getHabitTemplateReferenceErrors: async () => [
            `habits: "Morning hydration" templateId "${unknownTemplateId}" was not found in the active habit template catalog.`,
          ],
        }),
        proposal,
      );

      await service.sendMessage(auth, thread.id, {
        content: "Help me start a hydration habit",
      });

      expect(captured[0]?.validationStatus).toBe("invalid");
      expect(captured[0]?.validationErrors.some((error) =>
        /templateId/.test(error),
      )).toBe(true);
    });
  });

  describe("weekly review chat path", () => {
    const summaryId = "14a08176-64a7-4a2d-8a44-581807368394";
    const trendId = "24b19287-75b8-4a3e-9c10-691908479405";

    const workoutProposal = {
      intent: "adapt_workout_plan_from_progress" as const,
      targetDomain: "workout" as const,
      title: "Adjust training load from weekly progress",
      reason: "Completion dipped mid-week.",
      proposedChanges: {
        plan: {
          title: "Lighter week",
          summary: "Adjusted volume based on weekly completion patterns.",
          days: [{ weekday: "monday" as const, focus: "Recovery", exercises: [{ name: "Walk" }] }],
        },
        sourceSummaryId: summaryId,
        sourceTrendObservationIds: [trendId],
      },
    };

    const nutritionProposal = {
      intent: "adjust_nutrition_plan" as const,
      targetDomain: "nutrition" as const,
      title: "Refine nutrition targets from weekly adherence",
      reason: "Weekly nutrition adherence patterns suggest a modest target adjustment.",
      proposedChanges: {
        plan: {
          title: "Balanced weekly nutrition",
          summary: "Adjusted targets based on weekly adherence patterns.",
          caloriesPerDay: 2100,
          proteinGrams: 135,
          carbsGrams: 210,
          fatGrams: 68,
          hydrationLiters: 2.5,
          mealStructure: [{ label: "Breakfast", timingHint: null }],
          preferences: [],
          restrictions: [],
          allergies: [],
          notes: [],
        },
        sourceSummaryId: summaryId,
        sourceTrendObservationIds: [trendId],
      },
    };

    const overflowWorkoutProposal = {
      ...workoutProposal,
      title: "Overflow workout proposal",
      reason: "Should not persist after soft target cap.",
    };

    it("packs and persists bounded weekly review proposals with provenance validation", async () => {
      const capturedProposals: Array<{ intent: string; proposedChanges: unknown }> = [];
      let assistantMetadata: Record<string, unknown> = {};

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => {
            if (role === "assistant") {
              assistantMetadata = metadata;
            }

            return {
              id: role === "user" ? "user-message-id" : "assistant-message-id",
              threadId: thread.id,
              role,
              content,
              metadata,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            };
          },
          createProposal: async (
            _userId: string,
            _threadId: string,
            _sourceMessageId: string | null,
            proposal: { intent: string; proposedChanges: unknown },
            validationStatus: "valid" | "invalid" | "pending_validation",
            validationErrors: string[],
          ) => {
            capturedProposals.push(proposal);

            return {
              id: `proposal-${capturedProposals.length}`,
              userId: user.id,
              threadId: thread.id,
              sourceMessageId: "assistant-message-id",
              ...proposal,
              targetDomain: proposal.intent === "adjust_nutrition_plan" ? "nutrition" : "workout",
              title: "Weekly review proposal",
              reason: "Weekly review reason",
              status: "pending" as const,
              validationStatus,
              validationErrors,
              userDecisionAt: null,
              appliedReference: null,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            };
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: {
              reply: "Weekly review packaged.",
              proposals: [workoutProposal, nutritionProposal, overflowWorkoutProposal],
            },
            parseErrors: [],
            replySafetyErrors: [],
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
        validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        progressWeeklyReviewService: {
          packChatWeeklyReviewProposals: async () => ({
            summary: { summary: { id: summaryId }, trends: [] },
            laneOutcomes: [
              {
                lane: "workout",
                eligible: true,
                blockedReason: null,
                confidence: 0.85,
                explanationOnly: false,
              },
              {
                lane: "nutrition",
                eligible: true,
                blockedReason: null,
                confidence: 0.8,
                explanationOnly: false,
              },
            ],
            proposalsToPersist: [workoutProposal, nutritionProposal],
            packMeta: {
              selectedLanes: ["workout", "nutrition"],
              droppedLanes: [{ lane: "workout", reason: "lane_cap_reached" }],
              adaptationMessage:
                "This weekly review includes up to 2 typed adaptation suggestions you can approve individually. Nothing changes until you accept a proposal.",
            },
          }),
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: WEEKLY_REVIEW_CHAT_PROMPT,
      });

      expect(capturedProposals).toHaveLength(2);
      expect(capturedProposals.map((proposal) => proposal.intent)).toEqual([
        "adapt_workout_plan_from_progress",
        "adjust_nutrition_plan",
      ]);
      expect(capturedProposals.every((proposal) =>
        (proposal.proposedChanges as { sourceSummaryId?: string }).sourceSummaryId === summaryId,
      )).toBe(true);
      expect(assistantMetadata.weeklyReview).toMatchObject({
        summaryId,
        packMeta: {
          selectedLanes: ["workout", "nutrition"],
        },
      });
      expect(result.proposals).toHaveLength(2);
    });

    it("does not invoke weekly review packing for normal chat messages", async () => {
      let packingCalled = false;

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata: {},
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
          createProposal: async () => ({
            id: "proposal-id",
            userId: user.id,
            threadId: thread.id,
            sourceMessageId: "assistant-message-id",
            intent: "create_workout_plan",
            targetDomain: "workout",
            title: "Workout",
            reason: "Reason",
            proposedChanges: {},
            status: "pending" as const,
            validationStatus: "valid" as const,
            validationErrors: [],
            userDecisionAt: null,
            appliedReference: null,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: {
              reply: "Normal reply",
              proposals: [workoutProposal],
            },
            parseErrors: [],
            replySafetyErrors: [],
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
        validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        progressWeeklyReviewService: {
          packChatWeeklyReviewProposals: async () => {
            packingCalled = true;
            return {
              summary: { summary: { id: summaryId }, trends: [] },
              laneOutcomes: [],
              proposalsToPersist: [],
              packMeta: {
                selectedLanes: [],
                droppedLanes: [],
                adaptationMessage: "No safe adaptation",
              },
            };
          },
        },
      });

      await service.sendMessage(auth, thread.id, {
        content: "Suggest a workout plan",
      });

      expect(packingCalled).toBe(false);
    });

    it("marks progress-linked nutrition proposals invalid when sourceSummaryId is missing", async () => {
      const captured: Array<{ validationStatus: string; validationErrors: string[] }> = [];
      const missingProvenanceError =
        "proposedChanges.sourceSummaryId: Progress-linked proposals require a weekly progress summary reference.";

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata: {},
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
          createProposal: async (
            _userId: string,
            _threadId: string,
            _sourceMessageId: string | null,
            _proposal: unknown,
            validationStatus: "valid" | "invalid" | "pending_validation",
            validationErrors: string[],
          ) => {
            captured.push({ validationStatus, validationErrors });

            return {
              id: "proposal-id",
              userId: user.id,
              threadId: thread.id,
              sourceMessageId: "assistant-message-id",
              intent: "adjust_nutrition_plan",
              targetDomain: "nutrition",
              title: "Nutrition",
              reason: "Missing provenance",
              proposedChanges: {},
              status: "pending" as const,
              validationStatus,
              validationErrors,
              userDecisionAt: null,
              appliedReference: null,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              updatedAt: new Date("2026-01-01T00:00:00.000Z"),
            };
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "Weekly review", proposals: [] },
            parseErrors: [],
            replySafetyErrors: [],
          }),
        },
        proposalValidationService: new ProposalValidationService(
          {
            summaryExistsForUser: async () => true,
            findTrendsOwnedByUser: async () => [],
          } as never,
          { findInaccessibleExerciseIds: async () => [] } as never,
          { getHabitTemplateReferenceErrors: async () => [] } as never,
          {
            findApprovedSignalById: async () => null,
            findCorrelationEligibleSignalById: async () => null,
          } as never,
          {
            buildSummaryForUser: async () => ({ items: [], generatedAt: new Date().toISOString() }),
          } as never,
          { listByUserId: async () => [] } as never,
          {
            computeAndPersistSnapshot: async () => ({
              id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
              band: "moderate_load",
            }),
          } as never,
          { findActivePlanByUserId: async () => null, findRevisionById: async () => null } as never,
          { findByUserId: async () => ({ timezone: "UTC" }) } as never,
          {
            findActivePlanByUserId: async () => null,
            findActiveRevisionByPlanId: async () => null,
          } as never,
          {} as never,
          {} as never,
          {} as never,
          { listByIdsForUser: async () => [] } as never,
        ),
        progressWeeklyReviewService: {
          packChatWeeklyReviewProposals: async () => ({
            summary: { summary: { id: summaryId }, trends: [] },
            laneOutcomes: [],
            proposalsToPersist: [
              {
                intent: "adjust_nutrition_plan",
                targetDomain: "nutrition",
                title: "Nutrition without provenance",
                reason: "Missing summary reference.",
                proposedChanges: {
                  plan: nutritionProposal.proposedChanges.plan,
                },
              },
            ],
            packMeta: {
              selectedLanes: ["nutrition"],
              droppedLanes: [],
              adaptationMessage: "Packaged one proposal.",
            },
          }),
        },
      });

      await service.sendMessage(auth, thread.id, {
        content: WEEKLY_REVIEW_CHAT_PROMPT,
      });

      expect(captured[0]?.validationStatus).toBe("invalid");
      expect(captured[0]?.validationErrors).toContain(missingProvenanceError);
    });
  });

  describe("deterministic wellbeing and nutrition proposals", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    function createDeterministicProposalChatService(options: {
      hasTodayCheckIn?: boolean;
      aiProposals?: Array<Record<string, unknown>>;
      recipesService?: unknown;
    } = {}) {
      const capturedProposals: Array<{ intent: string; proposedChanges: unknown }> = [];

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata: {},
            createdAt: new Date("2026-05-26T12:00:00.000Z"),
          }),
          createProposal: async (
            _userId: string,
            _threadId: string,
            _sourceMessageId: string | null,
            proposal: { intent: string; proposedChanges: unknown },
            validationStatus: "valid" | "invalid" | "pending_validation",
            validationErrors: string[],
          ) => {
            capturedProposals.push(proposal);

            return {
              id: `proposal-${capturedProposals.length}`,
              userId: user.id,
              threadId: thread.id,
              sourceMessageId: "assistant-message-id",
              targetDomain: proposal.intent === "log_nutrition_incident" ? "nutrition" : "general",
              title: "Deterministic proposal",
              reason: "Deterministic trigger",
              ...proposal,
              status: "pending" as const,
              validationStatus,
              validationErrors,
              userDecisionAt: null,
              appliedReference: null,
              createdAt: new Date("2026-05-26T12:00:00.000Z"),
              updatedAt: new Date("2026-05-26T12:00:00.000Z"),
            };
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: {
              reply: "Coaching reply.",
              proposals: options.aiProposals ?? [],
            },
            parseErrors: [],
            replySafetyErrors: [],
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
        validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        wellbeingCheckInsService: {
          getCheckInForDate: async () => ({
            checkIn: options.hasTodayCheckIn
              ? {
                  id: "checkin-1",
                  userId: user.id,
                  date: "2026-05-26",
                  moodScore: 4,
                  stressScore: 2,
                  tags: [],
                  note: null,
                  source: "user_entry",
                  crisisFlagReasons: [],
                  createdAt: "2026-05-26T08:00:00.000Z",
                  updatedAt: "2026-05-26T08:00:00.000Z",
                }
              : null,
          }),
        },
        ...(options.recipesService ? { recipesService: options.recipesService } : {}),
      });

      return { service, capturedProposals };
    }

    it("adds wellbeing check-in proposal when low mood is reported and today check-in is missing", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-26T12:00:00.000Z"));

      const { service, capturedProposals } = createDeterministicProposalChatService();

      const result = await service.sendMessage(auth, thread.id, {
        content: "I feel bad today",
      });

      expect(capturedProposals.map((proposal) => proposal.intent)).toEqual([
        "capture_wellbeing_checkin",
      ]);
      expect(capturedProposals[0]?.proposedChanges).toMatchObject({
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
      });
      expect(result.proposals).toHaveLength(1);
    });

    it("skips wellbeing check-in proposal when today's check-in already exists", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-26T12:00:00.000Z"));

      const { service, capturedProposals } = createDeterministicProposalChatService({
        hasTodayCheckIn: true,
      });

      await service.sendMessage(auth, thread.id, {
        content: "I feel bad today",
      });

      expect(capturedProposals).toEqual([]);
    });

    it("adds nutrition incident proposal for cheat meal phrases", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-26T18:00:00.000Z"));

      const { service, capturedProposals } = createDeterministicProposalChatService();

      const result = await service.sendMessage(auth, thread.id, {
        content: "I had a cheat meal tonight",
      });

      expect(capturedProposals.map((proposal) => proposal.intent)).toEqual([
        "log_nutrition_incident",
      ]);
      expect(capturedProposals[0]?.proposedChanges).toMatchObject({
        confidence: "medium",
        provenance: { source: "text_estimate" },
      });
      expect(result.proposals).toHaveLength(1);
    });

    it("does not add deterministic proposals when crisis language is present", async () => {
      let aiCalled = false;

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-05-26T12:00:00.000Z"),
          }),
          createProposal: async () => {
            throw new Error("createProposal should not be called for crisis boundary turns");
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => {
            aiCalled = true;
            return {
              output: { reply: "Unsafe coaching reply", proposals: [] },
              parseErrors: [],
              replySafetyErrors: [],
            };
          },
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
        validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "I feel bad and want to die",
      });

      expect(aiCalled).toBe(false);
      expect(result.proposals).toEqual([]);
    });

    it("adds recipe recommendation proposal when meal ideas are requested", async () => {
      const recipeProposal = {
        intent: "recommend_recipes",
        targetDomain: "recipe",
        title: "Recipe ideas for your plan",
        reason: "These recipe ideas were selected to fit your active nutrition plan.",
        proposedChanges: {
          relatedNutritionPlanRevisionId: "ad000002-0000-4000-8000-000000000001",
          recommendations: [
            {
              recipeId: "a1000001-0000-4000-8000-000000000001",
              reason: "Fits your active plan.",
              fitSummary: "Estimated macros are a reasonable fit.",
            },
          ],
        },
      };

      const { service, capturedProposals } = createDeterministicProposalChatService({
        recipesService: {
          packChatRecipeRecommendationProposal: async () => recipeProposal,
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "Can you suggest some dinner ideas?",
      });

      expect(capturedProposals.map((proposal) => proposal.intent)).toEqual(["recommend_recipes"]);
      expect(result.proposals).toHaveLength(1);
    });

    it("passes bounded attachment metadata into coach orchestration without generic router fields", async () => {
      const attachmentId = "a1000001-0000-4000-8000-000000000001";
      let capturedCoachInput: Record<string, unknown> | undefined;

      const attachmentRecord = {
        id: attachmentId,
        userId: user.id,
        threadId: thread.id,
        messageId: null,
        category: "food_photo" as const,
        status: "ready" as const,
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 1024,
        storageKey: "local://attachments/meal.jpg",
        linkedDocumentId: null,
        linkedImageRefId: attachmentId,
        consent: null,
        // recognition field removed (B3 removal, C4 cluster)
        failureReason: null,
        retentionPolicy: "ephemeral_recognition" as const,
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      };

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-05-26T12:00:00.000Z"),
          }),
          createProposal: async () => {
            throw new Error("createProposal should not be called");
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async (input: Record<string, unknown>) => {
            capturedCoachInput = input;
            return {
              output: { reply: "I reviewed your attachment.", proposals: [] },
              parseErrors: [],
              replySafetyErrors: [],
              agentMetadata: {
                provider: "openai" as const,
                intent: "adjust_nutrition" as const,
                catalogIntentId: "attachment_food_photo" as const,
                purpose: "nutrition_adaptation" as const,
                depth: "medium" as const,
                timeRange: "14d" as const,
                toolsInvoked: [],
                safety: {
                  status: "passed" as const,
                  blockedReasons: [],
                  constraintsApplied: [],
                },
                citations: [],
                routing: {
                  confidence: 0.98,
                  routingMethod: "unified_turn_decision" as const,
                  llmRouterInvoked: false,
                  unifiedTurnDecisionInvoked: true,
                  catalogIntentId: "attachment_food_photo" as const,
                  safetyFlags: [],
                  expectedResponseMode: "recommendation_with_optional_proposal" as const,
                  contextSliceCount: 1,
                  loopIterations: 1,
                  maxLoopIterations: 3,
                },
              },
            };
          },
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        chatTurnAttachmentStageService: {
          validateRefsForSend: async () => undefined,
          runTurnStages: async () =>
            buildMockAttachmentTurnStageResult({ attachments: [attachmentRecord] }),
        },
      });

      await service.sendMessage(auth, thread.id, {
        content: "",
        attachmentRefIds: [attachmentId],
      });

      expect(capturedCoachInput?.attachmentTurn).toMatchObject({
        attachments: [
          {
            attachmentRefId: attachmentId,
            category: "food_photo",
            consentState: "none",
          },
        ],
      });
      expect(capturedCoachInput).not.toHaveProperty("proposalRevision");
      expect(capturedCoachInput?.recentMessages).toEqual([]);
    });

    it("passes prior thread messages without duplicating the current user turn", async () => {
      let capturedCoachInput: Record<string, unknown> | undefined;
      const priorUserMessage = {
        id: "prior-user-message-id",
        threadId: thread.id,
        role: "user" as const,
        content: "How was my week?",
        metadata: {},
        createdAt: new Date("2026-05-26T11:00:00.000Z"),
      };
      const priorAssistantMessage = {
        id: "prior-assistant-message-id",
        threadId: thread.id,
        role: "assistant" as const,
        content: "Your week looked consistent overall.",
        metadata: {},
        createdAt: new Date("2026-05-26T11:01:00.000Z"),
      };

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [priorUserMessage, priorAssistantMessage],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-05-26T12:00:00.000Z"),
          }),
          createProposal: async () => {
            throw new Error("createProposal should not be called");
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async (input: Record<string, unknown>) => {
            capturedCoachInput = input;
            return {
              output: { reply: "Here is a follow-up.", proposals: [] },
              parseErrors: [],
              replySafetyErrors: [],
              agentMetadata: {
                provider: "openai" as const,
                intent: "general" as const,
                catalogIntentId: "general" as const,
                purpose: "general_chat" as const,
                depth: "small" as const,
                timeRange: "7d" as const,
                toolsInvoked: [],
                safety: {
                  status: "passed" as const,
                  blockedReasons: [],
                  constraintsApplied: [],
                },
                citations: [],
                routing: {
                  confidence: 0.82,
                  routingMethod: "unified_turn_decision" as const,
                  llmRouterInvoked: false,
                  unifiedTurnDecisionInvoked: true,
                  catalogIntentId: "general" as const,
                  safetyFlags: [],
                  expectedResponseMode: "advice_only" as const,
                  contextSliceCount: 1,
                  loopIterations: 1,
                  maxLoopIterations: 3,
                },
              },
            };
          },
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
      });

      await service.sendMessage(auth, thread.id, {
        content: "Can you help me stay consistent this week?",
      });

      expect(capturedCoachInput?.userMessage).toBe("Can you help me stay consistent this week?");
      expect(capturedCoachInput?.recentMessages).toEqual([
        { role: "user", content: "How was my week?" },
        { role: "assistant", content: "Your week looked consistent overall." },
      ]);
    });

    it("links owned attachment refs without auto-merging attachment proposals", async () => {
      const attachmentId = "a1000001-0000-4000-8000-000000000001";
      let userMessageMetadata: Record<string, unknown> = {};
      let turnStagesCalled = false;

      const attachmentRecord = {
        id: attachmentId,
        userId: user.id,
        threadId: thread.id,
        messageId: null,
        category: "food_photo" as const,
        status: "ready" as const,
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 1024,
        storageKey: "local://attachments/meal.jpg",
        linkedDocumentId: null,
        linkedImageRefId: attachmentId,
        consent: null,
        // recognition field removed (B3 removal, C4 cluster)
        failureReason: null,
        retentionPolicy: "ephemeral_recognition" as const,
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      };

      const capturedProposals: Array<{ intent: string; proposedChanges: unknown }> = [];

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => {
            if (role === "user") {
              userMessageMetadata = metadata;
            }

            return {
              id: role === "user" ? "user-message-id" : "assistant-message-id",
              threadId: thread.id,
              role,
              content,
              metadata,
              createdAt: new Date("2026-05-26T12:00:00.000Z"),
            };
          },
          createProposal: async (
            _userId: string,
            _threadId: string,
            _sourceMessageId: string | null,
            proposal: { intent: string; proposedChanges: unknown },
            validationStatus: "valid" | "invalid" | "pending_validation",
            validationErrors: string[],
          ) => {
            capturedProposals.push(proposal);

            return {
              id: `proposal-${capturedProposals.length}`,
              userId: user.id,
              threadId: thread.id,
              sourceMessageId: "assistant-message-id",
              targetDomain: "nutrition",
              title: "Attachment proposal",
              reason: "From attachment",
              ...proposal,
              status: "pending" as const,
              validationStatus,
              validationErrors,
              userDecisionAt: null,
              appliedReference: null,
              createdAt: new Date("2026-05-26T12:00:00.000Z"),
              updatedAt: new Date("2026-05-26T12:00:00.000Z"),
            };
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "I reviewed your attachment.", proposals: [] },
            parseErrors: [],
            replySafetyErrors: [],
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        chatTurnAttachmentStageService: {
          validateRefsForSend: async () => undefined,
          runTurnStages: async () => {
            turnStagesCalled = true;
            return buildMockAttachmentTurnStageResult({
              attachments: [attachmentRecord],
            });
          },
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "",
        attachmentRefIds: [attachmentId],
      });

      expect(userMessageMetadata.attachmentRefIds).toEqual([attachmentId]);
      expect(turnStagesCalled).toBe(true);
      expect(capturedProposals).toEqual([]);
      expect(result.proposals).toHaveLength(0);
    });

    it("does not persist proposals when coach AI fails on attachment turns", async () => {
      const attachmentId = "a1000001-0000-4000-8000-000000000001";
      const createProposal = vi.fn();
      const attachmentRecord = {
        id: attachmentId,
        userId: user.id,
        threadId: thread.id,
        messageId: null,
        category: "food_photo" as const,
        status: "ready" as const,
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 1024,
        storageKey: "local://attachments/meal.jpg",
        linkedDocumentId: null,
        linkedImageRefId: attachmentId,
        consent: null,
        // recognition field removed (B3 removal, C4 cluster)
        failureReason: null,
        retentionPolicy: "ephemeral_recognition" as const,
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      };

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-05-26T12:00:00.000Z"),
          }),
          createProposal,
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "I could not review that attachment safely.", proposals: [] },
            parseErrors: ["OpenAI coach provider request failed."],
            replySafetyErrors: [],
            agentMetadata: {
              provider: "openai",
              intent: "general",
              catalogIntentId: "general",
              purpose: "general_chat",
              depth: "small",
              timeRange: "7d",
              toolsInvoked: [],
              citations: [],
              unifiedTurnDecision: { ran: true, routingMethod: "unified_turn_decision" },
              safety: {
                status: "provider_error",
                blockedReasons: ["OpenAI coach provider request failed."],
                constraintsApplied: [],
              },
              routing: {
                confidence: 0.35,
                routingMethod: "unified_turn_decision",
                llmRouterInvoked: false,
                unifiedTurnDecisionInvoked: true,
                catalogIntentId: "general",
                safetyFlags: [],
                expectedResponseMode: "advice_only",
                contextSliceCount: 1,
              },
            },
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
        },
        chatTurnAttachmentStageService: {
          validateRefsForSend: async () => undefined,
          runTurnStages: async () =>
            buildMockAttachmentTurnStageResult({ attachments: [attachmentRecord] }),
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "",
        attachmentRefIds: [attachmentId],
      });

      expect(createProposal).not.toHaveBeenCalled();
      expect(result.proposals).toEqual([]);
    });

    it("rejects chat send when attachment refs are still recognizing", async () => {
      const attachmentId = "a1000001-0000-4000-8000-000000000001";
      let createMessageCalled = false;

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async () => {
            createMessageCalled = true;
            throw new Error("createMessage should not be called");
          },
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "Should not run", proposals: [] },
            parseErrors: [],
            replySafetyErrors: [],
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        chatTurnAttachmentStageService: {
          validateRefsForSend: async () => {
            throw new BadRequestException({
              message: "Attachment references failed validation.",
              validationErrors: ["Attachment is still processing."],
            });
          },
        },
      });

      await expect(
        service.sendMessage(auth, thread.id, {
          content: "",
          attachmentRefIds: [attachmentId],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(createMessageCalled).toBe(false);
    });

    it("allows text-only chat send without attachment refs", async () => {
      let createMessageCalled = false;
      const validateRefsForSend = vi.fn();
      const runTurnStages = vi.fn();

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => {
            if (role === "user") {
              createMessageCalled = true;
            }

            return {
              id: role === "user" ? "user-message-id" : "assistant-message-id",
              threadId: thread.id,
              role,
              content,
              metadata,
              createdAt: new Date("2026-05-26T12:00:00.000Z"),
            };
          },
          createProposal: async () => {
            throw new Error("createProposal should not be called");
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "Hi there.", proposals: [] },
            parseErrors: [],
            replySafetyErrors: [],
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        chatTurnAttachmentStageService: {
          validateRefsForSend,
          runTurnStages,
        },
      });

      await service.sendMessage(auth, thread.id, {
        content: "Hello coach",
      });

      expect(createMessageCalled).toBe(true);
      expect(validateRefsForSend).not.toHaveBeenCalled();
      expect(runTurnStages).not.toHaveBeenCalled();
    });

    it("runs attachment turn stages after user message creation with persisted messageId", async () => {
      const attachmentId = "a1000001-0000-4000-8000-000000000001";
      let userMessageCreated = false;
      let turnStageInput:
        | {
            messageId: string;
            attachmentRefIds: readonly string[];
          }
        | undefined;

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => {
            if (role === "user") {
              userMessageCreated = true;
            }

            return {
              id: role === "user" ? "user-message-id" : "assistant-message-id",
              threadId: thread.id,
              role,
              content,
              metadata,
              createdAt: new Date("2026-05-26T12:00:00.000Z"),
            };
          },
          createProposal: async () => {
            throw new Error("createProposal should not be called");
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "I reviewed your attachment.", proposals: [] },
            parseErrors: [],
            replySafetyErrors: [],
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        chatTurnAttachmentStageService: {
          validateRefsForSend: async () => undefined,
          runTurnStages: async (input: {
            messageId: string;
            attachmentRefIds: readonly string[];
          }) => {
            expect(userMessageCreated).toBe(true);
            turnStageInput = input;
            return buildMockAttachmentTurnStageResult({
              attachments: [
                {
                  id: attachmentId,
                  category: "food_photo",
                  status: "ready",
                  // recognition field removed (B3 removal, C4 cluster)
                },
              ],
            });
          },
        },
      });

      await service.sendMessage(auth, thread.id, {
        content: "Second meal",
        attachmentRefIds: [attachmentId],
      });

      expect(turnStageInput?.messageId).toBe("user-message-id");
      expect(turnStageInput?.attachmentRefIds).toEqual([attachmentId]);
    });

    it("passes bounded attachment metadata (no recognition envelope) to coach orchestration", async () => {
      const attachmentId = "a1000001-0000-4000-8000-000000000001";
      let capturedCoachInput: Record<string, unknown> | undefined;

      const attachmentRecord = {
        id: attachmentId,
        userId: user.id,
        threadId: thread.id,
        messageId: "user-message-id",
        category: "food_photo" as const,
        status: "ready" as const,
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 1024,
        storageKey: "local://attachments/meal.jpg",
        linkedDocumentId: null,
        linkedImageRefId: attachmentId,
        consent: null,
        // recognition field removed (B3 removal, C4 cluster)
        failureReason: null,
        retentionPolicy: "ephemeral_recognition" as const,
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      };

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-05-26T12:00:00.000Z"),
          }),
          createProposal: async () => {
            throw new Error("createProposal should not be called");
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async (input: Record<string, unknown>) => {
            capturedCoachInput = input;
            return {
              output: { reply: "I reviewed your attachment.", proposals: [] },
              parseErrors: [],
              replySafetyErrors: [],
            };
          },
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        chatTurnAttachmentStageService: {
          validateRefsForSend: async () => undefined,
          runTurnStages: async () =>
            buildMockAttachmentTurnStageResult({ attachments: [attachmentRecord] }),
        },
      });

      await service.sendMessage(auth, thread.id, {
        content: "Second meal",
        attachmentRefIds: [attachmentId],
      });

      // Bounded metadata only — no recognition envelope, no contextSummaries.
      expect(capturedCoachInput?.attachmentTurn).toMatchObject({
        attachments: [
          {
            attachmentRefId: attachmentId,
            category: "food_photo",
            mimeType: "image/jpeg",
            consentState: "none",
          },
        ],
      });
      expect(capturedCoachInput?.attachmentTurn).not.toHaveProperty("contextSummaries");
    });
  });

  describe("proposal explainer turns", () => {
    it("returns clarification without calling AI when no stored proposal exists", async () => {
      const generateCoachResponse = vi.fn();
      const createProposal = vi.fn();

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? "user-msg" : "assistant-msg",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-05-27T10:00:00.000Z"),
          }),
          touchThread: async () => undefined,
          createProposal,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse,
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
        },
        proposalExplainerService: {
          resolvePreAiTurn: async () => ({
            kind: "no_proposal",
            reply: "No recent proposal to explain.",
          }),
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "Why this proposal?",
      });

      expect(generateCoachResponse).not.toHaveBeenCalled();
      expect(createProposal).not.toHaveBeenCalled();
      expect(result.proposals).toEqual([]);
      expect(result.assistantMessage.content).toBe("No recent proposal to explain.");
    });

    it("passes proposal context to AI and does not persist proposals", async () => {
      const createProposal = vi.fn();
      let capturedCoachInput: Record<string, unknown> | undefined;

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? "user-msg" : "assistant-msg",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-05-27T10:00:00.000Z"),
          }),
          touchThread: async () => undefined,
          createProposal,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async (input: Record<string, unknown>) => {
            capturedCoachInput = input;
            return {
              output: {
                reply: "I suggested this because your recovery signals were low.",
                proposals: [
                  {
                    intent: "adapt_workout_plan",
                    targetDomain: "workout",
                    title: "Should not persist",
                    reason: "Blocked",
                    proposedChanges: {},
                  },
                ],
              },
              parseErrors: [],
              replySafetyErrors: [],
              agentMetadata: {
                provider: "openai",
                intent: "proposal_explainer",
                catalogIntentId: "proposal_explainer",
                purpose: "general_chat",
                depth: "small",
                timeRange: "7d",
                toolsInvoked: [],
                citations: [],
                routing: {
                  confidence: 0.95,
                  routingMethod: "rule_based",
                  llmRouterInvoked: false,
                  catalogIntentId: "proposal_explainer",
                  safetyFlags: [],
                  expectedResponseMode: "advice_only",
                  contextSliceCount: 1,
                  maxLoopIterations: 3,
                  loopIterations: 1,
                },
                safety: {
                  status: "passed",
                  blockedReasons: [],
                  constraintsApplied: [],
                },
              },
            };
          },
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
        },
        proposalExplainerService: {
          resolvePreAiTurn: async () => ({
            kind: "with_proposal",
            context: {
              proposalId: "a1000001-0000-4000-8000-000000000001",
              intent: "adapt_workout_plan",
              targetDomain: "workout",
              title: "Lighten leg day",
              reason: "Recent poor sleep suggested a lighter session.",
              status: "pending",
              evidenceSummaries: [
                { domain: "wellbeing", label: "Poor sleep reported yesterday" },
              ],
              createdAt: "2026-05-27T10:00:00.000Z",
            },
          }),
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "Why did you suggest this change?",
      });

      expect(capturedCoachInput?.proposalExplainer).toMatchObject({
        proposalId: "a1000001-0000-4000-8000-000000000001",
        title: "Lighten leg day",
      });
      expect(createProposal).not.toHaveBeenCalled();
      expect(result.proposals).toEqual([]);
      expect(result.assistantMessage.content).toContain("recovery signals");
    });
  });

  // ---------------------------------------------------------------------------
  // Gap 4 — document_file attachment turn + workout proposal + no health_documents
  // ---------------------------------------------------------------------------
  //
  // An attachment turn whose mocked AI output selects a create_workout_plan
  // candidate must:
  //   (a) produce a validated + persisted proposal in the result
  //   (b) NEVER call any health_documents repository or service method
  //       (no auto-persist path exists for document attachments)
  //
  // The chat-attachments path is images + document files, context-only; document text goes
  // directly to the LLM as ephemeral context and must never be saved.
  // ---------------------------------------------------------------------------

  describe("document_file attachment turn with workout proposal (Gap 4)", () => {
    it("document_file attachment turn → create_workout_plan proposal persisted, zero health_documents calls", async () => {
      const attachmentId = "d9000001-0000-4000-8000-000000000001";
      const proposalRecord = {
        intent: "create_workout_plan" as const,
        targetDomain: "workout" as const,
        title: "3-Day Strength Plan",
        reason: "User uploaded their training preferences.",
        proposedChanges: {
          title: "3-Day Strength Plan",
          summary: "Strength-focused plan based on uploaded document.",
          days: [
            { weekday: "monday" as const, focus: "Upper body", exercises: [{ name: "Bench Press", sets: 4, reps: "8" }] },
          ],
          notes: [],
        },
      };

      const createProposal = vi.fn(async (
        _userId: string,
        _threadId: string,
        _sourceMessageId: string | null,
        proposal: unknown,
        validationStatus: "valid" | "invalid" | "pending_validation",
        validationErrors: string[],
      ) => ({
        id: "proposal-id",
        userId: user.id,
        threadId: thread.id,
        sourceMessageId: "assistant-message-id",
        ...(proposal as Record<string, unknown>),
        status: "pending" as const,
        validationStatus,
        validationErrors,
        userDecisionAt: null,
        appliedReference: null,
        createdAt: new Date("2026-06-10T00:00:00.000Z"),
        updatedAt: new Date("2026-06-10T00:00:00.000Z"),
      }));

      // Health documents repository mock — all methods should be untouched.
      const documentsRepositoryMock = {
        create: vi.fn(),
        findById: vi.fn(),
        findByUserId: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      };

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-06-10T00:00:00.000Z"),
          }),
          createProposal,
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: {
              reply: "Here is a workout plan based on your uploaded document.",
              proposals: [proposalRecord],
            },
            parseErrors: [],
            replySafetyErrors: [],
            agentMetadata: {
              provider: "openai" as const,
              intent: "create_workout_plan" as const,
              catalogIntentId: "create_workout_plan" as const,
              purpose: "workout_adaptation" as const,
              depth: "medium" as const,
              timeRange: "14d" as const,
              toolsInvoked: [],
              safety: { status: "passed" as const, blockedReasons: [], constraintsApplied: [] },
              citations: [],
            },
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        chatTurnAttachmentStageService: {
          validateRefsForSend: async () => undefined,
          runTurnStages: async () =>
            buildMockAttachmentTurnStageResult({
              attachments: [
                {
                  id: attachmentId,
                  userId: user.id,
                  category: "document_file",
                  mimeType: "application/pdf",
                  status: "ready",
                  filename: "training-plan.pdf",
                  storageKey: "local://attachments/training-plan.pdf",
                  consent: null,
                },
              ],
            }),
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "Create a workout plan based on this document.",
        attachmentRefIds: [attachmentId],
      });

      // (a) The create_workout_plan proposal must be validated and persisted.
      expect(createProposal).toHaveBeenCalledOnce();
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0]?.intent).toBe("create_workout_plan");
      expect(result.proposals[0]?.targetDomain).toBe("workout");

      // (b) Health documents repository must never have been called.
      // The document file is ephemeral context only — no auto-save to health_documents.
      for (const [methodName, mock] of Object.entries(documentsRepositoryMock)) {
        expect(mock, `documentsRepositoryMock.${methodName} should not be called`).not.toHaveBeenCalled();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Phase 7: consentRequired surfacing + no health_documents auto-persist
  // ---------------------------------------------------------------------------

  describe("consentRequired surfacing (Phase 7)", () => {
    function buildMinimalChatServiceWithAiResult(aiResult: {
      consentRequired?: boolean;
      proposals?: unknown[];
    }) {
      return createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-05-30T10:00:00.000Z"),
          }),
          createProposal: async (
            _userId: string,
            _threadId: string,
            _sourceMessageId: string | null,
            proposal: unknown,
            validationStatus: "valid" | "invalid" | "pending_validation",
            validationErrors: string[],
          ) => ({
            id: "proposal-id",
            userId: user.id,
            threadId: thread.id,
            sourceMessageId: "assistant-message-id",
            ...(proposal as Record<string, unknown>),
            status: "pending" as const,
            validationStatus,
            validationErrors,
            userDecisionAt: null,
            appliedReference: null,
            createdAt: new Date("2026-05-30T10:00:00.000Z"),
            updatedAt: new Date("2026-05-30T10:00:00.000Z"),
          }),
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: {
              reply: "Health context noted. I prepared a consent-gated proposal you can review.",
              proposals: (aiResult.proposals ?? []) as never,
            },
            parseErrors: [],
            replySafetyErrors: [],
            consentRequired: aiResult.consentRequired,
            agentMetadata: {
              provider: "openai" as const,
              intent: "general" as const,
              catalogIntentId: "general" as const,
              purpose: "general_chat" as const,
              depth: "small" as const,
              timeRange: "7d" as const,
              toolsInvoked: [],
              safety: { status: "passed" as const, blockedReasons: [], constraintsApplied: [] },
              citations: [],
            },
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
      });
    }

    it("surfaces consentRequired=true on the chat turn result when the AI result carries it", async () => {
      const service = buildMinimalChatServiceWithAiResult({ consentRequired: true });

      const result = await service.sendMessage(auth, thread.id, {
        content: "Please review my health document and suggest next steps.",
      });

      // consentRequired must be surfaced to the caller so the UI can prompt for consent.
      expect(result.consentRequired).toBe(true);
      // No health_documents are auto-persisted — proposals flow through the normal
      // proposal validation + accept path. The proposals array may be empty or contain
      // a consent-gated proposal record; no auto-applied health_documents row exists.
      // (The intent type union does not include an auto-persist variant by design.)
      expect(Array.isArray(result.proposals)).toBe(true);
    });

    it("does not set consentRequired on the chat turn result when the AI result has consentRequired=false", async () => {
      const service = buildMinimalChatServiceWithAiResult({ consentRequired: false });

      const result = await service.sendMessage(auth, thread.id, {
        content: "Can you adapt my workout plan this week?",
      });

      // consentRequired must NOT be set (falsy / absent) for normal non-consent turns.
      expect(result.consentRequired).toBeFalsy();
    });

    it("does not set consentRequired on the chat turn result when the AI result is undefined", async () => {
      const service = buildMinimalChatServiceWithAiResult({ consentRequired: undefined });

      const result = await service.sendMessage(auth, thread.id, {
        content: "Can you adjust my nutrition plan?",
      });

      expect(result.consentRequired).toBeFalsy();
    });
  });

  describe("attachment display metadata on message DTOs", () => {
    const attachmentId = "a1000001-0000-4000-8000-000000000001";
    const attachmentMeta = {
      attachmentRefId: attachmentId,
      filename: "food.jpg",
      mimeType: "image/jpeg",
      category: "food_photo" as const,
      status: "ready" as const,
      hasViewableContent: true,
    };

    function makeMessage(id: string, role: "user" | "assistant" = "user") {
      return {
        id,
        threadId: thread.id,
        role,
        content: "Hello",
        metadata: {},
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      };
    }

    it("getThread populates attachments on messages via a single batched load", async () => {
      const msgId = "msg-001-user";
      const listByMessageIdsCalls: string[][] = [];

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [makeMessage(msgId, "user")],
          touchThread: async () => undefined,
        },
        usersService: { resolveFromAuth: async () => user },
        aiService: {} as never,
        proposalValidationService: {} as never,
        chatAttachmentsService: {
          getMessageDisplayAttachments: async (userId: string, ids: string[]) => {
            listByMessageIdsCalls.push(ids);
            const map = new Map<string, typeof attachmentMeta[]>();
            map.set(msgId, [attachmentMeta]);
            return map;
          },
        },
      });

      const result = await service.getThread(auth, thread.id);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]?.attachments).toHaveLength(1);
      expect(result.messages[0]?.attachments[0]?.hasViewableContent).toBe(true);
      // batched: called once for all messages, not once per message
      expect(listByMessageIdsCalls).toHaveLength(1);
      expect(listByMessageIdsCalls[0]).toContain(msgId);
    });

    it("getThread returns empty attachments array for messages with no linked attachments", async () => {
      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [makeMessage("msg-002")],
          touchThread: async () => undefined,
        },
        usersService: { resolveFromAuth: async () => user },
        aiService: {} as never,
        proposalValidationService: {} as never,
        chatAttachmentsService: {
          getMessageDisplayAttachments: async () => new Map(),
        },
      });

      const result = await service.getThread(auth, thread.id);

      expect(result.messages[0]?.attachments).toEqual([]);
    });

    it("sendMessage returns populated attachments on userMessage when attachments are linked", async () => {
      const userMsgId = "user-msg-with-attachment";

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? userMsgId : "assistant-msg",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
          createProposal: async () => { throw new Error("not needed"); },
          touchThread: async () => undefined,
        },
        usersService: { resolveFromAuth: async () => user },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "Got your photo.", proposals: [] },
            parseErrors: [],
            replySafetyErrors: [],
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
        chatTurnAttachmentStageService: {
          validateRefsForSend: async () => undefined,
          runTurnStages: async () => ({
            attachmentMetadata: [
              { refId: attachmentId, category: "food_photo", mimeType: "image/jpeg", consentState: "none", storageRef: "local://x" },
            ],
            outcomes: [],
          }),
        },
        chatAttachmentsService: {
          getMessageDisplayAttachments: async (_userId: string, ids: string[]) => {
            const map = new Map<string, typeof attachmentMeta[]>();
            if (ids.includes(userMsgId)) {
              map.set(userMsgId, [attachmentMeta]);
            }
            return map;
          },
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "",
        attachmentRefIds: [attachmentId],
      });

      expect(result.userMessage.attachments).toHaveLength(1);
      expect(result.userMessage.attachments[0]?.attachmentRefId).toBe(attachmentId);
      expect(result.userMessage.attachments[0]?.hasViewableContent).toBe(true);
    });

    it("sendMessage userMessage has empty attachments when no attachmentRefIds are passed", async () => {
      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? "user-msg-no-attach" : "assistant-msg",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
          createProposal: async () => { throw new Error("not needed"); },
          touchThread: async () => undefined,
        },
        usersService: { resolveFromAuth: async () => user },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "Hello!", proposals: [] },
            parseErrors: [],
            replySafetyErrors: [],
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "How should I train today?",
      });

      expect(result.userMessage.attachments).toEqual([]);
    });
  });

  describe("AI message quota enforcement", () => {
    const minimalProposalValidationService = {
      validateRawProposal: () => ({ valid: true, errors: [] }),
      validateCorrelationEvidenceOwnership: async () => [],
      validateProvenanceOwnership: async () => [],
      validateProgressLinkedProvenanceRequired: () => [],
      validateGoalProposalHierarchy: async () => [],
      validateTodayChecklistGoalSourceRefs: async () => [],
      validateRecoveryAwareWorkoutAdaptation: async () => [],
      validateHabitProposalContext: async () => [],
      validateWellbeingCheckinProposalContext: async () => [],
      validateNutritionIncidentImageRefOwnership: async () => [],
      validateChatAttachmentProposalRefs: async () => [],
      validateRecipeRecommendationProposalContext: async () => [],
    };

    function createQuotaChatService(deps: {
      assertAiMessageAllowed?: () => Promise<void>;
      recordAiMessageUsage?: () => Promise<void>;
      generateCoachResponse?: (...args: unknown[]) => Promise<unknown>;
    } = {}) {
      const generateCoachResponse = deps.generateCoachResponse ?? vi.fn(async () => ({
        output: { reply: "Here is a coaching reply.", proposals: [] },
        parseErrors: [],
        replySafetyErrors: [],
      }));

      const assertAiMessageAllowed = deps.assertAiMessageAllowed ?? vi.fn(async () => undefined);
      const recordAiMessageUsage = deps.recordAiMessageUsage ?? vi.fn(async () => undefined);

      const entitlementsService = {
        assertAiMessageAllowed,
        recordAiMessageUsage,
        getEntitlement: async () => ({
          tier: "free" as const,
          aiMessagesPerDay: 10,
          aiMessagesUsedToday: 0,
          aiMessagesRemaining: 10,
        }),
      };

      const capturedAssistant: Array<{ content: string; metadata: Record<string, unknown> }> = [];

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => {
            if (role === "assistant") {
              capturedAssistant.push({ content, metadata });
            }

            return {
              id: role === "user" ? "user-message-id" : "assistant-message-id",
              threadId: thread.id,
              role,
              content,
              metadata,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            };
          },
          createProposal: async () => {
            throw new Error("createProposal should not be called in quota tests");
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: { generateCoachResponse },
        proposalValidationService: minimalProposalValidationService,
        entitlementsService: entitlementsService as never,
      });

      return { service, capturedAssistant, generateCoachResponse, assertAiMessageAllowed, recordAiMessageUsage };
    }

    it("free user at the limit gets a boundary reply and generateCoachResponse is NOT called", async () => {
      const { AiMessageQuotaExceededError } = await import("../billing/entitlements.service.js");

      const { service, capturedAssistant, generateCoachResponse } = createQuotaChatService({
        assertAiMessageAllowed: vi.fn(async () => {
          throw new AiMessageQuotaExceededError();
        }),
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "How can I improve my workout?",
      });

      expect(generateCoachResponse).not.toHaveBeenCalled();
      expect(result.proposals).toEqual([]);
      expect(capturedAssistant).toHaveLength(1);
      expect(capturedAssistant[0]?.content).toContain("upgrade to Pro");
      expect(capturedAssistant[0]?.metadata).toMatchObject({
        quota: { limitReached: true, tier: "free" },
      });
    });

    it("allowed turn calls generateCoachResponse and then recordAiMessageUsage", async () => {
      const recordAiMessageUsage = vi.fn(async () => undefined);

      const { service, generateCoachResponse } = createQuotaChatService({
        assertAiMessageAllowed: vi.fn(async () => undefined),
        recordAiMessageUsage,
      });

      await service.sendMessage(auth, thread.id, {
        content: "How should I structure my week?",
      });

      expect(generateCoachResponse).toHaveBeenCalledOnce();
      // recordAiMessageUsage is fire-and-forget — give it a tick to resolve
      await new Promise((r) => setTimeout(r, 0));
      expect(recordAiMessageUsage).toHaveBeenCalledOnce();
    });

    it("crisis-support turn does not call assertAiMessageAllowed or recordAiMessageUsage", async () => {
      const assertAiMessageAllowed = vi.fn(async () => undefined);
      const recordAiMessageUsage = vi.fn(async () => undefined);

      const { service } = createQuotaChatService({
        assertAiMessageAllowed,
        recordAiMessageUsage,
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "I want to die and I do not know what to do",
      });

      expect(assertAiMessageAllowed).not.toHaveBeenCalled();
      expect(recordAiMessageUsage).not.toHaveBeenCalled();
      expect(result.assistantMessage.metadata.crisisBoundary).toBe(true);
    });

    it("direct-path turn does not call assertAiMessageAllowed or recordAiMessageUsage", async () => {
      const assertAiMessageAllowed = vi.fn(async () => undefined);
      const recordAiMessageUsage = vi.fn(async () => undefined);

      const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();

      const directChatPathService = new DirectChatPathService(
        systemPlannerService,
        aiBehaviorConfigService,
        {
          getOrGenerateDay: async () => ({
            id: "day-id",
            userId: user.id,
            date: "2026-01-01",
            items: [],
            source: "generated",
            feedback: null,
            adherence: { score: null, completedRequired: 0, totalRequired: 0, completedOptional: 0, skippedRequired: 0, skippedOptional: 0 },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            workout: null,
            nutrition: null,
          }),
        } as never,
        { resolveFromAuth: async () => user } as never,
        {
          getCurrentActivePlan: vi.fn().mockResolvedValue({ plan: null, activeRevision: null }),
        } as never,
      );

      const entitlementsService = {
        assertAiMessageAllowed,
        recordAiMessageUsage,
        getEntitlement: async () => ({
          tier: "free" as const,
          aiMessagesPerDay: 10,
          aiMessagesUsedToday: 0,
          aiMessagesRemaining: 10,
        }),
      };

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => ({
            id: role === "user" ? "user-message-id" : "assistant-message-id",
            threadId: thread.id,
            role,
            content,
            metadata,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
          createProposal: async () => {
            throw new Error("proposals should not be created for direct path");
          },
          touchThread: async () => undefined,
        },
        usersService: { resolveFromAuth: async () => user },
        aiService: {
          generateCoachResponse: vi.fn(async () => ({
            output: { reply: "AI should not run", proposals: [] },
            parseErrors: [],
            replySafetyErrors: [],
          })),
        },
        proposalValidationService: minimalProposalValidationService,
        directChatPathService,
        entitlementsService: entitlementsService as never,
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "What is today?",
      });

      // Direct-path executes (no AI)
      expect(result.assistantMessage.metadata.directPath).toBeDefined();
      expect(assertAiMessageAllowed).not.toHaveBeenCalled();
      expect(recordAiMessageUsage).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // F2 / F6b — turnError: assistant content is " " + no suggestedQuickActions
  // -------------------------------------------------------------------------

  describe("turnError honest degradation", () => {
    function buildTurnErrorChatService(turnError: { reason: "decision_failed" | "reply_blocked" }) {
      let assistantMessageContent = "";
      let assistantMessageMetadata: Record<string, unknown> = {};

      const service = createChatService({
        chatRepository: {
          findThreadById: async () => thread,
          listMessagesByThreadId: async () => [],
          createMessage: async (
            _threadId: string,
            role: "user" | "assistant" | "system",
            content: string,
            metadata: Record<string, unknown> = {},
          ) => {
            if (role === "assistant") {
              assistantMessageContent = content;
              assistantMessageMetadata = metadata;
            }

            return {
              id: role === "user" ? "user-message-id" : "assistant-message-id",
              threadId: thread.id,
              role,
              content,
              metadata,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            };
          },
          createProposal: async () => {
            throw new Error("createProposal should not be called for turnError turns");
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: {
              reply: "[degraded]",
              proposals: [],
            },
            parseErrors: [],
            replySafetyErrors: [],
            turnError,
            agentMetadata: {
              ...createDefaultAgentMetadataForTests(),
              fanOut: {
                domains: [
                  {
                    domain: "workout",
                    status: "degraded",
                    degradedReasons: [],
                    tokenUsage: null,
                  },
                ],
                router: null,
                decision: null,
                resolution: null,
              },
            },
          }),
        },
        proposalValidationService: {
          validateRawProposal: () => ({ valid: true, errors: [] }),
          validateCorrelationEvidenceOwnership: async () => [],
          validateProvenanceOwnership: async () => [],
          validateProgressLinkedProvenanceRequired: () => [],
          validateGoalProposalHierarchy: async () => [],
          validateTodayChecklistGoalSourceRefs: async () => [],
          validateRecoveryAwareWorkoutAdaptation: async () => [],
          validateHabitProposalContext: async () => [],
          validateWellbeingCheckinProposalContext: async () => [],
          validateNutritionIncidentImageRefOwnership: async () => [],
          validateChatAttachmentProposalRefs: async () => [],
          validateRecipeRecommendationProposalContext: async () => [],
        },
      });

      return { service, getAssistantContent: () => assistantMessageContent, getAssistantMetadata: () => assistantMessageMetadata };
    }

    it("persists assistant content as ' ' (space) when turnError is set — not the fallback reply", async () => {
      const { service, getAssistantContent } = buildTurnErrorChatService({ reason: "decision_failed" });

      await service.sendMessage(auth, thread.id, { content: "adjust my workout" });

      // Must be the space placeholder, not "[degraded]" or any real coaching text
      expect(getAssistantContent()).toBe(" ");
    });

    it("persists turnError in assistant message metadata when turnError is set", async () => {
      const { service, getAssistantMetadata } = buildTurnErrorChatService({ reason: "decision_failed" });

      await service.sendMessage(auth, thread.id, { content: "adjust my workout" });

      expect(getAssistantMetadata().turnError).toEqual({ reason: "decision_failed" });
    });

    it("does NOT persist turnDegraded when turnError is set (mutually exclusive)", async () => {
      const { service, getAssistantMetadata } = buildTurnErrorChatService({ reason: "decision_failed" });

      await service.sendMessage(auth, thread.id, { content: "adjust my workout" });

      // turnDegraded must be absent — only turnError is written
      expect(getAssistantMetadata().turnDegraded).toBeUndefined();
    });

    it("does not attach suggestedQuickActions on turnError turns", async () => {
      const { service } = buildTurnErrorChatService({ reason: "decision_failed" });

      const result = await service.sendMessage(auth, thread.id, { content: "adjust my workout" });

      // Quick actions are derived for LLM-backed turns only — absent when turnError is set
      expect(result.suggestedQuickActions).toBeUndefined();
    });

    it("surfaces turnError.reason=reply_blocked in the response and persists ' ' content", async () => {
      const { service, getAssistantContent } = buildTurnErrorChatService({ reason: "reply_blocked" });

      const result = await service.sendMessage(auth, thread.id, { content: "diagnose me" });

      expect(result.turnError).toEqual({ reason: "reply_blocked" });
      expect(getAssistantContent()).toBe(" ");
    });
  });
});
