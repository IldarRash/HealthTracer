import { describe, expect, it } from "vitest";
import { ProposalValidationService } from "../proposals/proposal-validation.service.js";
import { WELLBEING_CRISIS_SUPPORT_COPY } from "@health/types";
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

describe("ChatService", () => {
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

    const service = new ChatService(
      {
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
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        generateCoachResponse: async () => ({
          output: {
            reply: "Here is a proposal to review.",
            proposals: [invalidProposal],
          },
          parseErrors: [],
          replySafetyErrors: [],
        }),
      } as never,
      new ProposalValidationService(
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
      ),
    );

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

    const service = new ChatService(
      {
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
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        generateCoachResponse: async () => ({
          output: {
            reply: "Here is a proposal to review.",
            proposals: [proposalWithUnownedEvidence],
          },
          parseErrors: [],
          replySafetyErrors: [],
        }),
      } as never,
      {
        validateRawProposal: () => ({ valid: true, errors: [] }),
        validateCorrelationEvidenceOwnership: async () => [evidenceError],
        validateGoalProposalHierarchy: async () => [],
        validateTodayChecklistGoalSourceRefs: async () => [],
        validateRecoveryAwareWorkoutAdaptation: async () => [],
      } as never,
    );

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

    const service = new ChatService(
      {
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
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
      {
        generateCoachResponse: async () => {
          aiCalled = true;
          return {
            output: { reply: "Unsafe coaching reply", proposals: [] },
            parseErrors: [],
            replySafetyErrors: [],
          };
        },
      } as never,
      {
        validateRawProposal: () => ({ valid: true, errors: [] }),
        validateCorrelationEvidenceOwnership: async () => [],
        validateGoalProposalHierarchy: async () => [],
        validateTodayChecklistGoalSourceRefs: async () => [],
        validateRecoveryAwareWorkoutAdaptation: async () => [],
      } as never,
    );

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
});
