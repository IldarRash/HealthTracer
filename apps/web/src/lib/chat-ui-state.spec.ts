import { describe, expect, it } from "vitest";
import { WELLBEING_CRISIS_SUPPORT_COPY } from "@health/types";
import {
  createOptimisticUserMessage,
  isOptimisticMessage,
  mergeDisplayMessages,
  resolveChatMessageCrisisSupport,
  resolvePrimaryThreadId,
} from "./chat-ui-state.js";

describe("chat UI state", () => {
  it("selects the most recently updated thread as primary", () => {
    const threadId = resolvePrimaryThreadId([
      {
        id: "11111111-1111-4111-8111-111111111111",
        userId: "22222222-2222-4222-8222-222222222222",
        title: "Older",
        createdAt: "2026-05-20T12:00:00.000Z",
        updatedAt: "2026-05-20T12:00:00.000Z",
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        userId: "22222222-2222-4222-8222-222222222222",
        title: "Newer",
        createdAt: "2026-05-21T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
      },
    ]);

    expect(threadId).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("returns no primary thread until the single conversation exists", () => {
    expect(resolvePrimaryThreadId([])).toBeNull();
  });

  it("appends optimistic user messages after server messages", () => {
    const optimistic = createOptimisticUserMessage(
      "33333333-3333-4333-8333-333333333333",
      "Hello coach",
    );

    const merged = mergeDisplayMessages(
      [
        {
          id: "44444444-4444-4444-8444-444444444444",
          threadId: "33333333-3333-4333-8333-333333333333",
          role: "assistant",
          content: "Welcome back.",
          metadata: {},
          createdAt: "2026-05-22T11:00:00.000Z",
        },
      ],
      optimistic,
    );

    expect(merged).toHaveLength(2);
    expect(merged[1]?.content).toBe("Hello coach");
    expect(merged[1]).toMatchObject({ optimistic: true });
    expect(isOptimisticMessage(merged[1]!)).toBe(true);
    expect(isOptimisticMessage(merged[0]!)).toBe(false);
  });

  it("returns crisis support copy for assistant messages with crisis metadata", () => {
    expect(
      resolveChatMessageCrisisSupport({
        role: "user",
        metadata: {
          crisisBoundary: true,
          crisisSupport: {
            shouldShowCrisisSupport: true,
            reasons: ["keyword_match"],
            copy: WELLBEING_CRISIS_SUPPORT_COPY,
          },
        },
      }),
    ).toBeNull();

    expect(
      resolveChatMessageCrisisSupport({
        role: "assistant",
        metadata: {},
      }),
    ).toBeNull();

    expect(
      resolveChatMessageCrisisSupport({
        role: "assistant",
        metadata: {
          crisisBoundary: true,
          crisisSupport: {
            shouldShowCrisisSupport: true,
            reasons: ["keyword_match"],
            copy: WELLBEING_CRISIS_SUPPORT_COPY,
          },
        },
      }),
    ).toEqual(WELLBEING_CRISIS_SUPPORT_COPY);
  });

  it("falls back to default crisis copy when crisis metadata is incomplete", () => {
    expect(
      resolveChatMessageCrisisSupport({
        role: "assistant",
        metadata: { crisisBoundary: true },
      }),
    ).toEqual(WELLBEING_CRISIS_SUPPORT_COPY);
  });

  it("returns a fresh message list when no optimistic message is pending", () => {
    const serverMessages = [
      {
        id: "44444444-4444-4444-8444-444444444444",
        threadId: "33333333-3333-4333-8333-333333333333",
        role: "assistant" as const,
        content: "Welcome back.",
        metadata: {},
        createdAt: "2026-05-22T11:00:00.000Z",
      },
    ];

    const merged = mergeDisplayMessages(serverMessages, null);

    expect(merged).toEqual(serverMessages);
    expect(merged).not.toBe(serverMessages);
  });
});
