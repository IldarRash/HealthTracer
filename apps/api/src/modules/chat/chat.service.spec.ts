import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { ProposalValidationService } from "../proposals/proposal-validation.service.js";
import {
  type RawAiProposal,
  WELLBEING_CRISIS_SUPPORT_COPY,
  WEEKLY_REVIEW_CHAT_PROMPT,
  getTodayIsoDateInTimezone,
} from "@health/types";
import type { AttachmentProposalCandidate } from "../chat-attachments/chat-attachment-recognition.service.js";
import { ChatAttachmentRecognitionService } from "../chat-attachments/chat-attachment-recognition.service.js";
import { createAiPolicyTestStack } from "../ai/test-ai-behavior-fixtures.js";
import { DirectChatPathService } from "./direct-chat-path.service.js";
import { ChatService } from "./chat.service.js";

type BuildAttachmentProposalInput = Parameters<
  ChatAttachmentRecognitionService["buildProposalCandidates"]
>[0];

type ClassifyAttachmentsForMessageInput = {
  auth: typeof auth;
  userId: string;
  messageContent: string;
  attachments: readonly unknown[];
};

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
  assertOwnedAttachmentRefs: async () => [],
  linkAttachmentsToMessage: async () => undefined,
  classifyAndRecognizeAttachmentsForMessage: async (input: {
    attachments: readonly unknown[];
  }) => [...input.attachments],
} as never;

const noopChatAttachmentRecognitionService = {
  buildProposalCandidates: () => [],
  mergeAttachmentProposals: <T>(aiProposals: T[]) => aiProposals,
} as never;

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
  );
}

const noopAiBehaviorConfigService = {
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
} as never;

function createChatService(deps: {
  chatRepository: unknown;
  usersService: unknown;
  aiService: unknown;
  proposalValidationService: unknown;
  progressWeeklyReviewService?: unknown;
  wellbeingCheckInsService?: unknown;
  recipesService?: unknown;
  chatAttachmentsService?: unknown;
  chatAttachmentRecognitionService?: unknown;
  directChatPathService?: unknown;
  proposalExplainerService?: unknown;
  aiBehaviorConfigService?: unknown;
}) {
  return new ChatService(
    deps.chatRepository as never,
    deps.usersService as never,
    deps.aiService as never,
    deps.proposalValidationService as never,
    (deps.progressWeeklyReviewService ?? noopWeeklyReviewService) as never,
    (deps.wellbeingCheckInsService ?? noopWellbeingCheckInsService) as never,
    (deps.recipesService ?? noopRecipesService) as never,
    (deps.chatAttachmentsService ?? noopChatAttachmentsService) as never,
    (deps.chatAttachmentRecognitionService ?? noopChatAttachmentRecognitionService) as never,
    (deps.directChatPathService ?? noopDirectChatPathService) as never,
    (deps.proposalExplainerService ?? noopProposalExplainerService) as never,
    (deps.aiBehaviorConfigService ?? noopAiBehaviorConfigService) as never,
  );
}

describe("ChatService", () => {
  it("persists agent turn metadata on assistant messages", async () => {
    let assistantMetadata: Record<string, unknown> = {};
    const agentMetadata = {
      provider: "stub" as const,
      intent: "adjust_workout" as const,
      purpose: "workout_adaptation" as const,
      depth: "medium" as const,
      timeRange: "14d" as const,
      toolsInvoked: ["getWeeklyProgressContext" as const],
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
          days: [{ day: "Day 1", focus: "Recovery", exercises: ["Walk"] }],
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
              provider: "stub" as const,
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

  it("persists llm routing metadata on assistant messages", async () => {
    let assistantMetadata: Record<string, unknown> = {};
    const agentMetadata = {
      provider: "stub" as const,
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
        routingMethod: "llm_router" as const,
        llmRouterInvoked: true,
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
          llmRouterInvoked: true,
          routingMethod: "llm_router",
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
        chatAttachmentsService:
          options?.attachmentRefIds != null
            ? {
                assertOwnedAttachmentRefs: async () =>
                  options.attachmentRefIds!.map((id) => ({
                    id,
                    userId: user.id,
                    category: "unclassified",
                    status: "ready",
                    linkedDocumentId: null,
                    linkedImageRefId: null,
                    retentionPolicy: "standard",
                    expiresAt: null,
                  })),
                linkAttachmentsToMessage: async () => undefined,
                classifyAndRecognizeAttachmentsForMessage: async (input: {
                  attachments: readonly unknown[];
                }) => [...input.attachments],
              }
            : undefined,
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
              days: [{ focus: "Strength", exercises: ["Squat"] }],
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
          days: [{ day: "Day 1", focus: "Recovery", exercises: ["Walk"] }],
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

    it("passes classified attachment recognition into coach orchestration without generic router fields", async () => {
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
        recognition: {
          category: "food_photo" as const,
          attachmentRefId: attachmentId,
          analysis: {
            candidates: [
              {
                items: [{ name: "Salad", calories: 320 }],
                estimatedCalories: 320,
                estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
                confidence: "medium" as const,
                provenance: {
                  source: "dev_stub",
                  providerId: "dev_food_photo",
                  analysisId: "b1000001-0000-4000-8000-000000000002",
                },
              },
            ],
            lowConfidenceNotice: null,
          },
          provenance: {
            source: "dev_stub",
            providerId: "dev_food_photo",
            recognitionId: "b1000001-0000-4000-8000-000000000002",
            confidence: "medium" as const,
          },
        },
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
                provider: "stub" as const,
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
                  routingMethod: "attachment_family" as const,
                  llmRouterInvoked: false,
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
        chatAttachmentsService: {
          assertOwnedAttachmentRefs: async () => [attachmentRecord],
          linkAttachmentsToMessage: async () => undefined,
          classifyAndRecognizeAttachmentsForMessage: async () => [attachmentRecord],
        },
      });

      await service.sendMessage(auth, thread.id, {
        content: "",
        attachmentRefIds: [attachmentId],
      });

      expect(capturedCoachInput?.attachmentTurn).toEqual({
        attachments: [
          {
            attachmentRefId: attachmentId,
            category: "food_photo",
            status: "ready",
            recognition: attachmentRecord.recognition,
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
                provider: "stub" as const,
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
                  routingMethod: "llm_router" as const,
                  llmRouterInvoked: true,
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

    it("links owned attachment refs and merges attachment proposal candidates on send", async () => {
      const attachmentId = "a1000001-0000-4000-8000-000000000001";
      let userMessageMetadata: Record<string, unknown> = {};
      let linkCalled = false;

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
        recognition: {
          category: "food_photo" as const,
          attachmentRefId: attachmentId,
          analysis: {
            candidates: [
              {
                items: [{ name: "Salad", calories: 320 }],
                estimatedCalories: 320,
                estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
                confidence: "medium" as const,
                provenance: {
                  source: "dev_stub",
                  providerId: "dev_food_photo",
                  analysisId: "b1000001-0000-4000-8000-000000000002",
                },
              },
            ],
            lowConfidenceNotice: null,
          },
          provenance: {
            source: "dev_stub",
            providerId: "dev_food_photo",
            recognitionId: "b1000001-0000-4000-8000-000000000002",
            confidence: "medium" as const,
          },
        },
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
        chatAttachmentsService: {
          assertOwnedAttachmentRefs: async () => [attachmentRecord],
          linkAttachmentsToMessage: async () => {
            linkCalled = true;
          },
          classifyAndRecognizeAttachmentsForMessage: async () => [attachmentRecord],
        },
        chatAttachmentRecognitionService: {
          buildProposalCandidates: () => [
            {
              intent: "log_nutrition_incident",
              targetDomain: "nutrition",
              title: "Log meal from photo",
              reason: "Review meal estimate",
              proposedChanges: { attachmentRefId: attachmentId },
              attachmentRefId: attachmentId,
            },
          ],
          mergeAttachmentProposals: (
            aiProposals: RawAiProposal[],
            attachmentProposals: AttachmentProposalCandidate[],
          ): RawAiProposal[] => [
            ...aiProposals,
            ...attachmentProposals.map(
              ({ intent, targetDomain, title, reason, proposedChanges }) =>
                ({
                  intent,
                  targetDomain,
                  title,
                  reason,
                  proposedChanges,
                }) as RawAiProposal,
            ),
          ],
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "",
        attachmentRefIds: [attachmentId],
      });

      expect(userMessageMetadata.attachmentRefIds).toEqual([attachmentId]);
      expect(linkCalled).toBe(true);
      expect(capturedProposals.map((proposal) => proposal.intent)).toContain(
        "log_nutrition_incident",
      );
      expect(result.attachmentOutcomes?.[0]?.proposalCandidateCount).toBe(1);
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
        chatAttachmentsService: {
          assertOwnedAttachmentRefs: async () => [
            {
              id: attachmentId,
              userId: user.id,
              threadId: thread.id,
              messageId: null,
              category: "food_photo",
              status: "recognizing",
              filename: "meal.jpg",
              mimeType: "image/jpeg",
              fileSizeBytes: 1024,
              storageKey: "local://attachments/meal.jpg",
              linkedDocumentId: null,
              linkedImageRefId: attachmentId,
              consent: null,
              recognition: null,
              failureReason: null,
              retentionPolicy: "ephemeral_recognition",
              expiresAt: null,
              createdAt: "2026-05-26T12:00:00.000Z",
              updatedAt: "2026-05-26T12:00:00.000Z",
            },
          ],
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
      });

      await service.sendMessage(auth, thread.id, {
        content: "Hello coach",
      });

      expect(createMessageCalled).toBe(true);
    });

    it("classifies queued unclassified refs during send and passes meal context to proposal builders", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-26T18:00:00.000Z"));

      const attachmentId = "a1000001-0000-4000-8000-000000000001";
      let classifyInput: { messageContent: string } | undefined;
      let buildProposalInput: { mealContextLabel?: string | null } | undefined;

      const classifiedAttachment = {
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
        recognition: {
          category: "food_photo" as const,
          attachmentRefId: attachmentId,
          analysis: {
            candidates: [
              {
                items: [{ name: "Salad", calories: 320 }],
                estimatedCalories: 320,
                estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
                confidence: "medium" as const,
                provenance: {
                  source: "dev_stub",
                  providerId: "dev_food_photo",
                  analysisId: "b1000001-0000-4000-8000-000000000002",
                },
              },
            ],
            lowConfidenceNotice: null,
          },
          provenance: {
            source: "dev_stub",
            providerId: "dev_food_photo",
            recognitionId: "b1000001-0000-4000-8000-000000000002",
            confidence: "medium" as const,
          },
        },
        failureReason: null,
        retentionPolicy: "ephemeral_recognition" as const,
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      };

      const queuedAttachment = {
        ...classifiedAttachment,
        category: "unclassified" as const,
        status: "queued" as const,
        linkedImageRefId: null,
        recognition: null,
      };

      const recognitionService = new ChatAttachmentRecognitionService(
        { recognize: vi.fn(), buildEnvelope: vi.fn() } as never,
        { recognize: vi.fn() } as never,
        { recognize: vi.fn() } as never,
        {
          buildProposalPayloadFromAnalysis: vi.fn(() => ({
            incidentDateTime: "2026-05-26T18:00:00.000Z",
            items: [{ name: "Salad", calories: 320 }],
            estimatedCalories: 320,
            estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
            confidence: "medium" as const,
            provenance: {
              source: "dev_stub" as const,
              providerId: "dev_food_photo",
              analysisId: "b1000001-0000-4000-8000-000000000002",
            },
            imageRefs: [{ id: attachmentId }],
            mealContextLabel: "Second meal",
          })),
        } as never,
      );

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
            createdAt: new Date("2026-05-26T18:00:00.000Z"),
          }),
          createProposal: async (
            _userId: string,
            _threadId: string,
            _sourceMessageId: string | null,
            proposal: { intent: string; proposedChanges: unknown; title?: string; reason?: string },
            validationStatus: "valid" | "invalid" | "pending_validation",
            validationErrors: string[],
          ) => ({
            id: "proposal-id",
            userId: user.id,
            threadId: thread.id,
            sourceMessageId: "assistant-message-id",
            targetDomain: "nutrition",
            status: "pending" as const,
            validationStatus,
            validationErrors,
            userDecisionAt: null,
            appliedReference: null,
            createdAt: new Date("2026-05-26T18:00:00.000Z"),
            updatedAt: new Date("2026-05-26T18:00:00.000Z"),
            title: proposal.title ?? "Log meal from photo (Second meal)",
            reason: proposal.reason ?? "Review meal estimate",
            intent: proposal.intent,
            proposedChanges: proposal.proposedChanges,
          }),
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "I reviewed your meal photo.", proposals: [] },
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
        chatAttachmentsService: {
          assertOwnedAttachmentRefs: async () => [queuedAttachment],
          linkAttachmentsToMessage: async () => undefined,
          classifyAndRecognizeAttachmentsForMessage: async (
            input: ClassifyAttachmentsForMessageInput,
          ) => {
            classifyInput = input;
            return [classifiedAttachment];
          },
        },
        chatAttachmentRecognitionService: {
          buildProposalCandidates: (input: BuildAttachmentProposalInput) => {
            buildProposalInput = input;
            return recognitionService.buildProposalCandidates(input);
          },
          mergeAttachmentProposals: (
            aiProposals: RawAiProposal[],
            attachmentProposals: AttachmentProposalCandidate[],
            options?: Parameters<
              ChatAttachmentRecognitionService["mergeAttachmentProposals"]
            >[2],
          ): RawAiProposal[] =>
            recognitionService.mergeAttachmentProposals(
              aiProposals,
              attachmentProposals,
              options,
            ),
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "второй прием пищи",
        attachmentRefIds: [attachmentId],
      });

      expect(classifyInput?.messageContent).toBe("второй прием пищи");
      expect(buildProposalInput?.mealContextLabel).toBe("Second meal");
      expect(result.attachmentOutcomes?.[0]?.proposalCandidateCount).toBe(1);
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0]?.intent).toBe("log_nutrition_incident");
      expect(result.proposals[0]?.title).toMatch(/Second meal/i);
      expect(result.proposals[0]?.proposedChanges).toMatchObject({
        mealContextLabel: "Second meal",
        attachmentRefId: attachmentId,
      });
    });

    it("dedupes text-estimate nutrition proposals when a photo-backed attachment proposal is present", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-26T18:00:00.000Z"));

      const attachmentId = "a1000001-0000-4000-8000-000000000001";
      const capturedProposals: Array<{ intent: string; proposedChanges: unknown }> = [];

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
        recognition: {
          category: "food_photo" as const,
          attachmentRefId: attachmentId,
          analysis: {
            candidates: [
              {
                items: [{ name: "Salad", calories: 320 }],
                estimatedCalories: 320,
                estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
                confidence: "medium" as const,
                provenance: {
                  source: "dev_stub",
                  providerId: "dev_food_photo",
                  analysisId: "b1000001-0000-4000-8000-000000000002",
                },
              },
            ],
            lowConfidenceNotice: null,
          },
          provenance: {
            source: "dev_stub",
            providerId: "dev_food_photo",
            recognitionId: "b1000001-0000-4000-8000-000000000002",
            confidence: "medium" as const,
          },
        },
        failureReason: null,
        retentionPolicy: "ephemeral_recognition" as const,
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      };

      const recognitionService = new ChatAttachmentRecognitionService(
        { recognize: vi.fn(), buildEnvelope: vi.fn() } as never,
        { recognize: vi.fn() } as never,
        { recognize: vi.fn() } as never,
        {
          buildProposalPayloadFromAnalysis: vi.fn(() => ({
            incidentDateTime: "2026-05-26T18:00:00.000Z",
            items: [{ name: "Salad", calories: 320 }],
            estimatedCalories: 320,
            estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
            confidence: "medium" as const,
            provenance: {
              source: "dev_stub" as const,
              providerId: "dev_food_photo",
              analysisId: "b1000001-0000-4000-8000-000000000002",
            },
            imageRefs: [{ id: attachmentId }],
            attachmentRefId: attachmentId,
          })),
        } as never,
      );

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
            createdAt: new Date("2026-05-26T18:00:00.000Z"),
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
              id: "proposal-id",
              userId: user.id,
              threadId: thread.id,
              sourceMessageId: "assistant-message-id",
              targetDomain: "nutrition",
              title: "Nutrition proposal",
              reason: "From send",
              ...proposal,
              status: "pending" as const,
              validationStatus,
              validationErrors,
              userDecisionAt: null,
              appliedReference: null,
              createdAt: new Date("2026-05-26T18:00:00.000Z"),
              updatedAt: new Date("2026-05-26T18:00:00.000Z"),
            };
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "Got it.", proposals: [] },
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
        chatAttachmentsService: {
          assertOwnedAttachmentRefs: async () => [attachmentRecord],
          linkAttachmentsToMessage: async () => undefined,
          classifyAndRecognizeAttachmentsForMessage: async () => [attachmentRecord],
        },
        chatAttachmentRecognitionService: {
          buildProposalCandidates: (input: BuildAttachmentProposalInput) =>
            recognitionService.buildProposalCandidates(input),
          mergeAttachmentProposals: (
            aiProposals: RawAiProposal[],
            attachmentProposals: AttachmentProposalCandidate[],
            options?: Parameters<
              ChatAttachmentRecognitionService["mergeAttachmentProposals"]
            >[2],
          ): RawAiProposal[] =>
            recognitionService.mergeAttachmentProposals(
              aiProposals,
              attachmentProposals,
              options,
            ),
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "I had a cheat meal tonight",
        attachmentRefIds: [attachmentId],
      });

      expect(capturedProposals.filter((proposal) => proposal.intent === "log_nutrition_incident")).toHaveLength(
        1,
      );
      expect(capturedProposals[0]?.proposedChanges).toMatchObject({
        attachmentRefId: attachmentId,
        provenance: { source: "dev_stub" },
      });
      expect(result.proposals).toHaveLength(1);
    });

    it("returns workout attachment outcomes without auto plan mutation proposals", async () => {
      const attachmentId = "c1000001-0000-4000-8000-000000000001";

      const workoutAttachment = {
        id: attachmentId,
        userId: user.id,
        threadId: thread.id,
        messageId: "user-message-id",
        category: "workout_attachment" as const,
        status: "ready" as const,
        filename: "session.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 1024,
        storageKey: "local://attachments/session.jpg",
        linkedDocumentId: null,
        linkedImageRefId: null,
        consent: null,
        recognition: {
          category: "workout_attachment" as const,
          attachmentRefId: attachmentId,
          attachmentKind: "exercise_photo" as const,
          sessionLabel: "Recognized training session",
          sessionDate: null,
          exercises: [{ name: "Row", target: "3 sets", sets: 3, reps: "8-10" }],
          suggestedIntent: "log_session_context" as const,
          planDraftTitle: null,
          provenance: {
            source: "dev_stub",
            providerId: "dev_workout_attachment",
            recognitionId: "f1000001-0000-4000-8000-000000000002",
            confidence: "medium" as const,
          },
          manualFallbackNotice: "Describe the workout in text.",
        },
        failureReason: null,
        retentionPolicy: "ephemeral_recognition" as const,
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      };

      const recognitionService = new ChatAttachmentRecognitionService(
        { recognize: vi.fn(), buildEnvelope: vi.fn() } as never,
        { recognize: vi.fn() } as never,
        { recognize: vi.fn() } as never,
        { buildProposalPayloadFromAnalysis: vi.fn() } as never,
      );

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
          createProposal: async () => {
            throw new Error("createProposal should not be called for session-context workout attachments");
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "I reviewed your training attachment.", proposals: [] },
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
        chatAttachmentsService: {
          assertOwnedAttachmentRefs: async () => [workoutAttachment],
          linkAttachmentsToMessage: async () => undefined,
          classifyAndRecognizeAttachmentsForMessage: async () => [workoutAttachment],
        },
        chatAttachmentRecognitionService: {
          buildProposalCandidates: (input: BuildAttachmentProposalInput) =>
            recognitionService.buildProposalCandidates(input),
          mergeAttachmentProposals: (
            aiProposals: RawAiProposal[],
            attachmentProposals: AttachmentProposalCandidate[],
            options?: Parameters<
              ChatAttachmentRecognitionService["mergeAttachmentProposals"]
            >[2],
          ): RawAiProposal[] =>
            recognitionService.mergeAttachmentProposals(
              aiProposals,
              attachmentProposals,
              options,
            ),
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "заполни активность",
        attachmentRefIds: [attachmentId],
      });

      expect(result.attachmentOutcomes?.[0]?.category).toBe("workout_attachment");
      expect(result.attachmentOutcomes?.[0]?.proposalCandidateCount).toBe(0);
      expect(result.proposals).toEqual([]);
    });

    it("creates a Today workout checklist proposal when logging today's session from a workout photo", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-26T12:00:00.000Z"));

      try {
        const attachmentId = "c1000004-0000-4000-8000-000000000004";
        let capturedCoachInput: Record<string, unknown> | undefined;
        const capturedProposals: Array<{ intent: string; proposedChanges: unknown }> = [];

        const workoutAttachment = {
          id: attachmentId,
          userId: user.id,
          threadId: thread.id,
          messageId: "user-message-id",
          category: "workout_attachment" as const,
          status: "ready" as const,
          filename: "volleyball.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 1024,
          storageKey: "local://attachments/volleyball.jpg",
          linkedDocumentId: null,
          linkedImageRefId: null,
          consent: null,
          recognition: {
            category: "workout_attachment" as const,
            attachmentRefId: attachmentId,
            attachmentKind: "exercise_photo" as const,
            sessionLabel: "Volleyball training",
            sessionDate: null,
            exercises: [{ name: "Volleyball drill", target: "3 sets", sets: 3, reps: "8-10" }],
            suggestedIntent: "log_session_context" as const,
            planDraftTitle: null,
            provenance: {
              source: "dev_stub",
              providerId: "dev_workout_attachment",
              recognitionId: "f1000001-0000-4000-8000-000000000004",
              confidence: "high" as const,
            },
            manualFallbackNotice: null,
          },
          failureReason: null,
          retentionPolicy: "ephemeral_recognition" as const,
          expiresAt: null,
          createdAt: "2026-05-26T12:00:00.000Z",
          updatedAt: "2026-05-26T12:00:00.000Z",
        };

        const recognitionService = new ChatAttachmentRecognitionService(
          { recognize: vi.fn(), buildEnvelope: vi.fn() } as never,
          { recognize: vi.fn() } as never,
          { recognize: vi.fn() } as never,
          { buildProposalPayloadFromAnalysis: vi.fn() } as never,
        );

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
              proposal: RawAiProposal,
              validationStatus: "valid" | "invalid" | "pending_validation",
              validationErrors: string[],
            ) => {
              capturedProposals.push(proposal);
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
            generateCoachResponse: async (input: Record<string, unknown>) => {
              capturedCoachInput = input;
              return {
                output: {
                  reply: "I reviewed your training attachment.",
                  proposals: [],
                },
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
          chatAttachmentsService: {
            assertOwnedAttachmentRefs: async () => [workoutAttachment],
            linkAttachmentsToMessage: async () => undefined,
            classifyAndRecognizeAttachmentsForMessage: async () => [workoutAttachment],
          },
          chatAttachmentRecognitionService: {
            buildProposalCandidates: (input: BuildAttachmentProposalInput) =>
              recognitionService.buildProposalCandidates(input),
            mergeAttachmentProposals: (
              aiProposals: RawAiProposal[],
              attachmentProposals: AttachmentProposalCandidate[],
              options?: Parameters<
                ChatAttachmentRecognitionService["mergeAttachmentProposals"]
              >[2],
            ): RawAiProposal[] =>
              recognitionService.mergeAttachmentProposals(
                aiProposals,
                attachmentProposals,
                options,
              ),
          },
        });

        const result = await service.sendMessage(auth, thread.id, {
          content: "запиши мне тренировку волейбола на сегодня",
          attachmentRefIds: [attachmentId],
        });

        expect(capturedCoachInput?.attachmentTurn).toMatchObject({
          preparedProposals: [
            {
              intent: "create_today_checklist",
              targetDomain: "today",
              title: "Add today's workout to Today",
            },
          ],
        });
        expect(result.attachmentOutcomes?.[0]?.proposalCandidateCount).toBe(1);
        expect(capturedProposals).toHaveLength(1);
        expect(capturedProposals[0]?.intent).toBe("create_today_checklist");
        expect(capturedProposals[0]?.proposedChanges).toMatchObject({
          date: "2026-05-26",
          items: [{ label: "Волейбол", kind: "workout", status: "pending" }],
        });
        expect(result.proposals).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("drops AI create_workout_plan when persisting one-off today workout attachment turn", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-05-26T12:00:00.000Z"));

      try {
        const attachmentId = "c1000004-0000-4000-8000-000000000004";
        const capturedProposals: Array<{ intent: string }> = [];

        const workoutAttachment = {
          id: attachmentId,
          userId: user.id,
          threadId: thread.id,
          messageId: "user-message-id",
          category: "workout_attachment" as const,
          status: "ready" as const,
          filename: "volleyball.jpg",
          mimeType: "image/jpeg",
          fileSizeBytes: 1024,
          storageKey: "local://attachments/volleyball.jpg",
          linkedDocumentId: null,
          linkedImageRefId: null,
          consent: null,
          recognition: {
            category: "workout_attachment" as const,
            attachmentRefId: attachmentId,
            attachmentKind: "exercise_photo" as const,
            sessionLabel: "Volleyball training",
            sessionDate: null,
            exercises: [{ name: "Volleyball drill", target: "3 sets", sets: 3, reps: "8-10" }],
            suggestedIntent: "log_session_context" as const,
            planDraftTitle: null,
            provenance: {
              source: "dev_stub",
              providerId: "dev_workout_attachment",
              recognitionId: "f1000001-0000-4000-8000-000000000004",
              confidence: "high" as const,
            },
            manualFallbackNotice: null,
          },
          failureReason: null,
          retentionPolicy: "ephemeral_recognition" as const,
          expiresAt: null,
          createdAt: "2026-05-26T12:00:00.000Z",
          updatedAt: "2026-05-26T12:00:00.000Z",
        };

        const recognitionService = new ChatAttachmentRecognitionService(
          { recognize: vi.fn(), buildEnvelope: vi.fn() } as never,
          { recognize: vi.fn() } as never,
          { recognize: vi.fn() } as never,
          { buildProposalPayloadFromAnalysis: vi.fn() } as never,
        );

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
              proposal: RawAiProposal,
            ) => {
              capturedProposals.push(proposal);
              return {
                id: "proposal-id",
                userId: user.id,
                threadId: thread.id,
                sourceMessageId: "assistant-message-id",
                ...proposal,
                status: "pending" as const,
                validationStatus: "valid" as const,
                validationErrors: [],
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
                reply: "I drafted a workout plan from your photo.",
                proposals: [
                  {
                    intent: "create_workout_plan",
                    targetDomain: "workout",
                    title: "Imported workout plan",
                    reason: "AI emitted a full plan",
                    proposedChanges: {
                      title: "Imported workout plan",
                      summary: "Plan from attachment",
                      days: [],
                    },
                  },
                ],
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
          chatAttachmentsService: {
            assertOwnedAttachmentRefs: async () => [workoutAttachment],
            linkAttachmentsToMessage: async () => undefined,
            classifyAndRecognizeAttachmentsForMessage: async () => [workoutAttachment],
          },
          chatAttachmentRecognitionService: {
            buildProposalCandidates: (input: BuildAttachmentProposalInput) =>
              recognitionService.buildProposalCandidates(input),
            mergeAttachmentProposals: (
              aiProposals: RawAiProposal[],
              attachmentProposals: AttachmentProposalCandidate[],
              options?: Parameters<
                ChatAttachmentRecognitionService["mergeAttachmentProposals"]
              >[2],
            ): RawAiProposal[] =>
              recognitionService.mergeAttachmentProposals(
                aiProposals,
                attachmentProposals,
                options,
              ),
          },
        });

        const result = await service.sendMessage(auth, thread.id, {
          content: "запиши мне тренировку волейбола на сегодня",
          attachmentRefIds: [attachmentId],
        });

        expect(capturedProposals.map((proposal) => proposal.intent)).toEqual([
          "create_today_checklist",
        ]);
        expect(result.proposals.map((proposal) => proposal.intent)).toEqual([
          "create_today_checklist",
        ]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps create_workout_plan when workout attachment recognition indicates a plan document", async () => {
      const attachmentId = "c1000008-0000-4000-8000-000000000008";
      const capturedProposals: Array<{ intent: string }> = [];

      const planAttachment = {
        id: attachmentId,
        userId: user.id,
        threadId: thread.id,
        messageId: "user-message-id",
        category: "workout_attachment" as const,
        status: "ready" as const,
        filename: "plan.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 2048,
        storageKey: "local://attachments/plan.pdf",
        linkedDocumentId: null,
        linkedImageRefId: null,
        consent: null,
        recognition: {
          category: "workout_attachment" as const,
          attachmentRefId: attachmentId,
          attachmentKind: "plan_screenshot" as const,
          sessionLabel: null,
          sessionDate: null,
          exercises: [{ name: "Squat", target: "3 sets", sets: 3, reps: "8-10" }],
          suggestedIntent: "create_workout_plan" as const,
          planDraftTitle: "Imported workout plan draft",
          provenance: {
            source: "dev_stub",
            providerId: "dev_workout_attachment",
            recognitionId: "f1000001-0000-4000-8000-000000000001",
            confidence: "high" as const,
          },
          manualFallbackNotice: null,
        },
        failureReason: null,
        retentionPolicy: "ephemeral_recognition" as const,
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      };

      const recognitionService = new ChatAttachmentRecognitionService(
        { recognize: vi.fn(), buildEnvelope: vi.fn() } as never,
        { recognize: vi.fn() } as never,
        { recognize: vi.fn() } as never,
        { buildProposalPayloadFromAnalysis: vi.fn() } as never,
      );

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
            proposal: RawAiProposal,
          ) => {
            capturedProposals.push(proposal);
            return {
              id: "proposal-id",
              userId: user.id,
              threadId: thread.id,
              sourceMessageId: "assistant-message-id",
              ...proposal,
              status: "pending" as const,
              validationStatus: "valid" as const,
              validationErrors: [],
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
              reply: "I extracted a workout plan from your attachment.",
              proposals: [
                {
                  intent: "create_workout_plan",
                  targetDomain: "workout",
                  title: "Review imported workout plan",
                  reason: "AI plan draft",
                  proposedChanges: {
                    title: "Imported workout plan draft",
                    summary: "Plan from attachment",
                    days: [],
                    attachmentRefId: attachmentId,
                  },
                },
              ],
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
        chatAttachmentsService: {
          assertOwnedAttachmentRefs: async () => [planAttachment],
          linkAttachmentsToMessage: async () => undefined,
          classifyAndRecognizeAttachmentsForMessage: async () => [planAttachment],
        },
        chatAttachmentRecognitionService: {
          buildProposalCandidates: (input: BuildAttachmentProposalInput) =>
            recognitionService.buildProposalCandidates(input),
          mergeAttachmentProposals: (
            aiProposals: RawAiProposal[],
            attachmentProposals: AttachmentProposalCandidate[],
            options?: Parameters<
              ChatAttachmentRecognitionService["mergeAttachmentProposals"]
            >[2],
          ): RawAiProposal[] =>
            recognitionService.mergeAttachmentProposals(
              aiProposals,
              attachmentProposals,
              options,
            ),
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "import this workout plan",
        attachmentRefIds: [attachmentId],
      });

      expect(capturedProposals.some((proposal) => proposal.intent === "create_workout_plan")).toBe(
        true,
      );
      expect(result.proposals.some((proposal) => proposal.intent === "create_workout_plan")).toBe(
        true,
      );
    });

    it("returns medical attachment outcomes without proposals before profile review", async () => {
      const attachmentId = "d1000001-0000-4000-8000-000000000001";

      const medicalAttachment = {
        id: attachmentId,
        userId: user.id,
        threadId: thread.id,
        messageId: "user-message-id",
        category: "medical_document" as const,
        status: "needs_review" as const,
        filename: "labs.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
        storageKey: "local://attachments/labs.pdf",
        linkedDocumentId: "e1000001-0000-4000-8000-000000000001",
        linkedImageRefId: null,
        consent: {
          consentScopes: ["upload_storage", "parse_ocr"],
          consentVersion: "v1",
          consentGrantedAt: "2026-05-26T12:00:00.000Z",
          documentType: "lab_report",
          documentTitle: "Labs",
        },
        recognition: {
          category: "medical_document" as const,
          attachmentRefId: attachmentId,
          documentId: "e1000001-0000-4000-8000-000000000001",
          documentType: "lab_report",
          title: "Labs",
          parseStatus: "summary_ready",
          summarySnippet: null,
          reviewStatus: "pending_review",
          consentScopes: ["upload_storage", "parse_ocr"],
          provenance: {
            source: "document_parser",
            providerId: "documents_module",
            recognitionId: "f1000001-0000-4000-8000-000000000001",
          },
          wellnessContextOnlyNotice:
            "This document is wellness coaching context only. It is not a diagnosis or treatment plan.",
          documentReviewPath: "/profile/documents?documentId=e1000001-0000-4000-8000-000000000001",
        },
        failureReason: null,
        retentionPolicy: "document_consent_rules" as const,
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      };

      const recognitionService = new ChatAttachmentRecognitionService(
        { recognize: vi.fn(), buildEnvelope: vi.fn() } as never,
        { recognize: vi.fn() } as never,
        { recognize: vi.fn() } as never,
        { buildProposalPayloadFromAnalysis: vi.fn() } as never,
      );

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
          createProposal: async () => {
            throw new Error("createProposal should not be called for pending medical review");
          },
          touchThread: async () => undefined,
        },
        usersService: {
          resolveFromAuth: async () => user,
        },
        aiService: {
          generateCoachResponse: async () => ({
            output: { reply: "Your document is ready for profile review.", proposals: [] },
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
        chatAttachmentsService: {
          assertOwnedAttachmentRefs: async () => [medicalAttachment],
          linkAttachmentsToMessage: async () => undefined,
          classifyAndRecognizeAttachmentsForMessage: async () => [medicalAttachment],
        },
        chatAttachmentRecognitionService: {
          buildProposalCandidates: (input: BuildAttachmentProposalInput) =>
            recognitionService.buildProposalCandidates(input),
          mergeAttachmentProposals: (
            aiProposals: RawAiProposal[],
            attachmentProposals: AttachmentProposalCandidate[],
            options?: Parameters<
              ChatAttachmentRecognitionService["mergeAttachmentProposals"]
            >[2],
          ): RawAiProposal[] =>
            recognitionService.mergeAttachmentProposals(
              aiProposals,
              attachmentProposals,
              options,
            ),
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "here are my lab results",
        attachmentRefIds: [attachmentId],
      });

      expect(result.attachmentOutcomes?.[0]?.category).toBe("medical_document");
      expect(result.attachmentOutcomes?.[0]?.proposalCandidateCount).toBe(0);
      if (result.attachmentOutcomes?.[0]?.recognition?.category === "medical_document") {
        expect(result.attachmentOutcomes[0].recognition.summarySnippet).toBeNull();
      }
      expect(result.proposals).toEqual([]);
    });

    it("returns unclassified attachment outcomes without food proposals when classification is ambiguous", async () => {
      const attachmentId = "u1000001-0000-4000-8000-000000000001";
      let capturedCoachInput: Record<string, unknown> | undefined;

      const unclassifiedAttachment = {
        id: attachmentId,
        userId: user.id,
        threadId: thread.id,
        messageId: "user-message-id",
        category: "unclassified" as const,
        status: "needs_review" as const,
        filename: "IMG_1234.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 1024,
        storageKey: "local://attachments/IMG_1234.jpg",
        linkedDocumentId: null,
        linkedImageRefId: null,
        consent: null,
        recognition: null,
        failureReason: "Could not determine attachment category from message context alone.",
        retentionPolicy: "ephemeral_recognition" as const,
        expiresAt: null,
        createdAt: "2026-05-26T12:00:00.000Z",
        updatedAt: "2026-05-26T12:00:00.000Z",
      };

      const buildProposalCandidates = vi.fn(() => []);

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
          createProposal: async () => {
            throw new Error("createProposal should not be called for ambiguous attachments");
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
              output: { reply: "I could not classify that attachment yet.", proposals: [] },
              parseErrors: [],
              replySafetyErrors: [],
              agentMetadata: {
                provider: "stub" as const,
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
                  confidence: 0.72,
                  routingMethod: "llm_router" as const,
                  llmRouterInvoked: true,
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
        chatAttachmentsService: {
          assertOwnedAttachmentRefs: async () => [unclassifiedAttachment],
          linkAttachmentsToMessage: async () => undefined,
          classifyAndRecognizeAttachmentsForMessage: async () => [unclassifiedAttachment],
        },
        chatAttachmentRecognitionService: {
          buildProposalCandidates,
          mergeAttachmentProposals: <T>(aiProposals: T[]) => aiProposals,
        },
      });

      const result = await service.sendMessage(auth, thread.id, {
        content: "",
        attachmentRefIds: [attachmentId],
      });

      expect(capturedCoachInput?.attachmentTurn).toEqual({
        attachments: [
          {
            attachmentRefId: attachmentId,
            category: "unclassified",
            status: "needs_review",
            recognition: null,
          },
        ],
      });
      expect(buildProposalCandidates).toHaveBeenCalledWith(
        expect.objectContaining({
          attachment: expect.objectContaining({ category: "unclassified" }),
        }),
      );
      expect(result.attachmentOutcomes?.[0]?.category).toBe("unclassified");
      expect(result.attachmentOutcomes?.[0]?.status).toBe("needs_review");
      expect(result.attachmentOutcomes?.[0]?.proposalCandidateCount).toBe(0);
      expect(result.proposals).toEqual([]);
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
                provider: "stub",
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
});
