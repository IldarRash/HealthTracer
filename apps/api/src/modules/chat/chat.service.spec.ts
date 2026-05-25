import { describe, expect, it } from "vitest";
import { ProposalValidationService } from "../proposals/proposal-validation.service.js";
import { WELLBEING_CRISIS_SUPPORT_COPY, WEEKLY_REVIEW_CHAT_PROMPT } from "@health/types";
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

function createChatService(deps: {
  chatRepository: unknown;
  usersService: unknown;
  aiService: unknown;
  proposalValidationService: unknown;
  progressWeeklyReviewService?: unknown;
}) {
  return new ChatService(
    deps.chatRepository as never,
    deps.usersService as never,
    deps.aiService as never,
    deps.proposalValidationService as never,
    (deps.progressWeeklyReviewService ?? noopWeeklyReviewService) as never,
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
});
