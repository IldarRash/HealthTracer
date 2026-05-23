import { describe, expect, it } from "vitest";
import { ProposalValidationService } from "../proposals/proposal-validation.service.js";
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
      new ProposalValidationService({
        summaryExistsForUser: async () => true,
        findTrendsOwnedByUser: async () => [],
      } as never),
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
});
