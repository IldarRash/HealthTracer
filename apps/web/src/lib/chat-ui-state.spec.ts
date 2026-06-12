import { describe, expect, it } from "vitest";
import { WELLBEING_CRISIS_SUPPORT_COPY } from "@health/types";
import {
  createOptimisticUserMessage,
  isOptimisticMessage,
  mergeDisplayMessages,
  resolveChatMessageCrisisSupport,
  resolveChatMessageSuggestedQuickActions,
  resolveChatMessageWeeklyReview,
  resolvePrimaryThreadId,
  SUGGESTED_CHAT_PROMPT_DEFINITIONS,
} from "./chat-ui-state.js";
import { WEEKLY_REVIEW_CHAT_ACTION_NOTICE, WEEKLY_REVIEW_CHAT_PROMPT } from "./weekly-review-ui-state.js";

const summaryId = "14a08176-64a7-4a2d-8a44-581807368394";

describe("chat UI state", () => {
  it("exposes coach-forward suggested prompt definitions with stable weekly review message", () => {
    expect(SUGGESTED_CHAT_PROMPT_DEFINITIONS).toHaveLength(4);
    // The first prompt targets the weekly review — its message is the stable weekly review prompt.
    expect(SUGGESTED_CHAT_PROMPT_DEFINITIONS[0]).toEqual({
      labelKey: "reviewWeekly",
      message: WEEKLY_REVIEW_CHAT_PROMPT,
    });

    // All definitions must have a non-empty labelKey and a non-empty message.
    for (const prompt of SUGGESTED_CHAT_PROMPT_DEFINITIONS) {
      expect(prompt.labelKey.length).toBeGreaterThan(0);
      expect(prompt.message.length).toBeGreaterThan(0);
    }
  });

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
          attachments: [],
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
        attachments: [],
      },
    ];

    const merged = mergeDisplayMessages(serverMessages, null);

    expect(merged).toEqual(serverMessages);
    expect(merged).not.toBe(serverMessages);
  });

  it("returns weekly review pack view for assistant messages with weeklyReview metadata", () => {
    const metadata = {
      weeklyReview: {
        summaryId,
        laneOutcomes: [
          {
            lane: "workout",
            eligible: true,
            blockedReason: null,
            confidence: 0.8,
            explanationOnly: false,
          },
          {
            lane: "nutrition",
            eligible: true,
            blockedReason: null,
            confidence: 0.7,
            explanationOnly: true,
          },
        ],
        packMeta: {
          selectedLanes: ["workout"],
          droppedLanes: [{ lane: "nutrition", reason: "conflict_downgraded" }],
          adaptationMessage:
            "This weekly review includes up to 1 typed adaptation suggestion you can approve individually.",
        },
      },
    };

    expect(
      resolveChatMessageWeeklyReview({
        role: "user",
        metadata,
      }),
    ).toBeNull();

    expect(
      resolveChatMessageWeeklyReview({
        role: "assistant",
        metadata: {},
      }),
    ).toBeNull();

    expect(
      resolveChatMessageWeeklyReview({
        role: "assistant",
        metadata: { weeklyReview: { summaryId: "not-a-uuid" } },
      }),
    ).toBeNull();

    const pack = resolveChatMessageWeeklyReview({
      role: "assistant",
      metadata,
    });

    expect(pack?.summaryId).toBe(summaryId);
    expect(pack?.lanes.map((lane) => lane.statusLabel)).toEqual([
      "Eligible for adaptation",
      "Explanation only",
    ]);
    expect(pack?.droppedLanes[0]?.reason).toContain("conflict");
    expect(WEEKLY_REVIEW_CHAT_ACTION_NOTICE).toContain("proposal cards");
    expect(WEEKLY_REVIEW_CHAT_ACTION_NOTICE.toLowerCase()).not.toContain("automatically");
  });

  it("resolves quick-action chips from persisted assistant message metadata (survives reload)", () => {
    // Fixture mirrors a persisted assistant message as returned by the thread
    // query after reload — the chips source of truth is metadata, not live state.
    const quickAction = {
      id: "today_summary_read",
      labelEn: "Today's summary",
      labelRu: "Сводка дня",
      messageText: {
        en: "Show me today's summary",
        ru: "Покажи сводку за сегодня",
      },
    };

    expect(
      resolveChatMessageSuggestedQuickActions({
        role: "assistant",
        metadata: { suggestedQuickActions: [quickAction] },
      }),
    ).toEqual([quickAction]);

    // User messages never produce chips, even with metadata present.
    expect(
      resolveChatMessageSuggestedQuickActions({
        role: "user",
        metadata: { suggestedQuickActions: [quickAction] },
      }),
    ).toBeNull();

    // Absent key (e.g. turnError turns or no chips produced) resolves to null.
    expect(
      resolveChatMessageSuggestedQuickActions({
        role: "assistant",
        metadata: { turnError: { reason: "decision_failed" } },
      }),
    ).toBeNull();

    // Invalid persisted shape is tolerated, never thrown.
    expect(
      resolveChatMessageSuggestedQuickActions({
        role: "assistant",
        metadata: { suggestedQuickActions: [{ id: "not_a_kind" }] },
      }),
    ).toBeNull();
  });
});
