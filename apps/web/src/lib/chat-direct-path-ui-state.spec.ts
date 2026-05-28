import { describe, expect, it } from "vitest";
import { apiQueryKeys, getDirectChatPathRefreshQueryKeys } from "./api.js";
import {
  getDirectChatPathRefreshHints,
  parseChatDirectPathMetadata,
  resolveChatMessageDirectPathFeedback,
} from "./chat-direct-path-ui-state.js";

describe("chat direct path UI state", () => {
  it("parses directPath metadata from assistant messages", () => {
    expect(parseChatDirectPathMetadata({})).toBeNull();
    expect(parseChatDirectPathMetadata({ directPath: { invalid: true } })).toBeNull();

    const parsed = parseChatDirectPathMetadata({
      directPath: {
        candidate: {
          kind: "today_summary_read",
          confidence: 0.95,
          routingMethod: "rule_based",
        },
        outcome: {
          kind: "today_summary_read",
          status: "executed",
          refreshHints: ["today"],
        },
      },
    });

    expect(parsed?.outcome?.status).toBe("executed");
    expect(getDirectChatPathRefreshHints({ directPath: parsed })).toEqual(["today"]);
  });

  it("returns supplemental feedback only when assistant content is empty", () => {
    const metadata = {
      directPath: {
        candidate: {
          kind: "mark_today_workout_done",
          confidence: 0.95,
          routingMethod: "rule_based",
        },
        outcome: {
          kind: "mark_today_workout_done",
          status: "executed",
          message: "Marked your workout as done for today.",
          refreshHints: ["today", "dashboard", "longevity"],
        },
      },
    };

    expect(
      resolveChatMessageDirectPathFeedback({
        role: "assistant",
        content: "Marked your workout as done for today.",
        metadata,
      }),
    ).toBeNull();

    expect(
      resolveChatMessageDirectPathFeedback({
        role: "assistant",
        content: "",
        metadata,
      }),
    ).toEqual({
      message: "Marked your workout as done for today.",
    });

    expect(
      resolveChatMessageDirectPathFeedback({
        role: "user",
        content: "",
        metadata,
      }),
    ).toBeNull();
  });

  it("maps refresh hints to targeted query keys", () => {
    expect(getDirectChatPathRefreshQueryKeys(["today"])).toEqual([
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
    ]);

    expect(getDirectChatPathRefreshQueryKeys(["today", "dashboard", "longevity"])).toEqual([
      apiQueryKeys.todayDayPrefix,
      apiQueryKeys.todayHistoryPrefix,
      apiQueryKeys.dashboardState,
      apiQueryKeys.longevityState,
    ]);

    expect(getDirectChatPathRefreshQueryKeys([])).toEqual([]);
  });
});
