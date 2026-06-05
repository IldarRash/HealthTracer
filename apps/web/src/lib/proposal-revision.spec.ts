import { describe, expect, it, vi, afterEach } from "vitest";
import { aiProposalSchema, type ProposalModifyResponse } from "@health/types";
import { sendChatMessage } from "./api.js";
import {
  buildProposalRevisionChatSend,
  isProposalRevisionChatSend,
  shouldShowProposalRevisionSendRetry,
  toChatProposalOriginal,
} from "./proposal-revision.js";

const supersededProposal = aiProposalSchema.parse({
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  threadId: "33333333-3333-4333-8333-333333333333",
  sourceMessageId: null,
  intent: "adapt_workout_plan",
  targetDomain: "workout",
  title: "Adjust today's workout",
  reason: "Recovery signals are low.",
  proposedChanges: {
    title: "Strength base",
    summary: "Three-day split with compound lifts.",
    days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
  },
  status: "superseded",
  validationStatus: "valid",
  validationErrors: [],
  userDecisionAt: "2026-05-25T12:00:00.000Z",
  appliedReference: null,
  createdAt: "2026-05-25T12:00:00.000Z",
  updatedAt: "2026-05-25T12:00:00.000Z",
});

describe("buildProposalRevisionChatSend", () => {
  it("maps modify response to chat send with structured proposalRevision metadata", () => {
    const response: ProposalModifyResponse = {
      proposal: supersededProposal,
      revisionContext: {
        supersededProposalId: supersededProposal.id,
        originalIntent: "adapt_workout_plan",
        originalTitle: "Adjust today's workout",
        originalReason: "Recovery signals are low.",
        modificationFeedback: "Keep one strength exercise.",
        nextAction: "send_chat_message",
        suggestedUserMessage:
          'Please revise the proposal "Adjust today\'s workout" with these changes: Keep one strength exercise.',
      },
    };

    const send = buildProposalRevisionChatSend(response);

    expect(send.message).toContain("Keep one strength exercise");
    expect(send.proposalRevision.supersededProposalId).toBe(supersededProposal.id);
    expect(send.proposalRevision.modificationFeedback).toBe("Keep one strength exercise.");
    expect(send.proposalRevision.originalProposal.intent).toBe("adapt_workout_plan");
    expect(send.proposalRevision.originalProposal.title).toBe("Adjust today's workout");
    expect(send.proposalRevision.originalProposal.proposedChanges).toEqual(
      supersededProposal.proposedChanges,
    );
  });
});

describe("toChatProposalOriginal", () => {
  it("strips persisted proposal fields for chat revision metadata", () => {
    const original = toChatProposalOriginal(supersededProposal);

    expect(original).toEqual({
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Adjust today's workout",
      reason: "Recovery signals are low.",
      proposedChanges: supersededProposal.proposedChanges,
    });
    expect(original).not.toHaveProperty("id");
    expect(original).not.toHaveProperty("status");
  });
});

describe("isProposalRevisionChatSend", () => {
  it("distinguishes revision sends from plain text", () => {
    const revisionSend = buildProposalRevisionChatSend({
      proposal: supersededProposal,
      revisionContext: {
        supersededProposalId: supersededProposal.id,
        originalIntent: "adapt_workout_plan",
        originalTitle: "Adjust today's workout",
        originalReason: "Recovery signals are low.",
        modificationFeedback: "Keep one strength exercise.",
        nextAction: "send_chat_message",
        suggestedUserMessage: "Please revise the proposal.",
      },
    });

    expect(isProposalRevisionChatSend(revisionSend)).toBe(true);
    expect(isProposalRevisionChatSend("plain message")).toBe(false);
  });
});

describe("shouldShowProposalRevisionSendRetry", () => {
  const pendingSend = buildProposalRevisionChatSend({
    proposal: supersededProposal,
    revisionContext: {
      supersededProposalId: supersededProposal.id,
      originalIntent: "adapt_workout_plan",
      originalTitle: "Adjust today's workout",
      originalReason: "Recovery signals are low.",
      modificationFeedback: "Keep one strength exercise.",
      nextAction: "send_chat_message",
      suggestedUserMessage: "Please revise the proposal.",
    },
  });

  it("shows retry only after modify succeeded but follow-up chat send failed", () => {
    expect(
      shouldShowProposalRevisionSendRetry({
        pendingRevisionSend: pendingSend,
        isSendError: true,
        isSendPending: false,
      }),
    ).toBe(true);
  });

  it("hides retry while resending or before a pending revision exists", () => {
    expect(
      shouldShowProposalRevisionSendRetry({
        pendingRevisionSend: null,
        isSendError: true,
        isSendPending: false,
      }),
    ).toBe(false);

    expect(
      shouldShowProposalRevisionSendRetry({
        pendingRevisionSend: pendingSend,
        isSendError: true,
        isSendPending: true,
      }),
    ).toBe(false);

    expect(
      shouldShowProposalRevisionSendRetry({
        pendingRevisionSend: pendingSend,
        isSendError: false,
        isSendPending: false,
      }),
    ).toBe(false);
  });
});

describe("modify response to chat send contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps modify response into the POST /chat/messages payload", async () => {
    const modifyResponse: ProposalModifyResponse = {
      proposal: supersededProposal,
      revisionContext: {
        supersededProposalId: supersededProposal.id,
        originalIntent: "adapt_workout_plan",
        originalTitle: "Adjust today's workout",
        originalReason: "Recovery signals are low.",
        modificationFeedback: "Keep one strength exercise.",
        nextAction: "send_chat_message",
        suggestedUserMessage:
          'Please revise the proposal "Adjust today\'s workout" with these changes: Keep one strength exercise.',
      },
    };

    const revisionSend = buildProposalRevisionChatSend(modifyResponse);
    const threadId = supersededProposal.threadId;
    const requestBodies: unknown[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        const method = init?.method ?? "GET";

        if (method === "POST" && path.includes(`/chat/threads/${threadId}/messages`)) {
          requestBodies.push(JSON.parse(String(init?.body)));

          return new Response(
            JSON.stringify({
              thread: {
                id: threadId,
                userId: supersededProposal.userId,
                title: "Coaching",
                createdAt: "2026-05-25T12:00:00.000Z",
                updatedAt: "2026-05-25T12:00:00.000Z",
              },
              userMessage: {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                threadId,
                role: "user",
                content: revisionSend.message,
                metadata: {},
                createdAt: "2026-05-25T12:00:00.000Z",
              },
              assistantMessage: {
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                threadId,
                role: "assistant",
                content: "I'll draft a revised workout suggestion.",
                metadata: {},
                createdAt: "2026-05-25T12:00:01.000Z",
              },
              proposals: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        return new Response("not found", { status: 404 });
      }),
    );

    const result = await sendChatMessage(
      "test-token",
      threadId,
      revisionSend.message,
      { proposalRevision: revisionSend.proposalRevision },
    );

    expect(result.error).toBeUndefined();
    expect(requestBodies).toHaveLength(1);
    expect(requestBodies[0]).toMatchObject({
      content: revisionSend.message,
      proposalRevision: revisionSend.proposalRevision,
    });
    expect((requestBodies[0] as { proposalRevision: { supersededProposalId: string } }).proposalRevision.supersededProposalId).toBe(
      supersededProposal.id,
    );
  });
});
