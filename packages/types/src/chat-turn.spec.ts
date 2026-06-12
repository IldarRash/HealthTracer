import { describe, it, expect } from "vitest";
import {
  chatTurnDegradedReasonSchema,
  chatMessageDegradedTurnSchema,
  parseChatMessageDegradedTurn,
  parseChatMessageSuggestedQuickActions,
} from "./chat-turn.js";

describe("chatTurnDegradedReasonSchema", () => {
  it("accepts the reply-present degraded reason codes", () => {
    expect(chatTurnDegradedReasonSchema.parse("parse_failed")).toBe("parse_failed");
    expect(chatTurnDegradedReasonSchema.parse("provider_error")).toBe("provider_error");
  });

  it("rejects turnError reasons — the enums are disjoint by contract", () => {
    // reply-absent failures belong to chatTurnErrorSchema, never turnDegraded
    expect(() => chatTurnDegradedReasonSchema.parse("reply_blocked")).toThrow();
    expect(() => chatTurnDegradedReasonSchema.parse("decision_failed")).toThrow();
  });

  it("rejects unknown reason strings", () => {
    expect(() => chatTurnDegradedReasonSchema.parse("unknown_reason")).toThrow();
    expect(() => chatTurnDegradedReasonSchema.parse("passed")).toThrow();
    expect(() => chatTurnDegradedReasonSchema.parse("")).toThrow();
  });
});

describe("chatMessageDegradedTurnSchema", () => {
  it("accepts a valid degraded turn object", () => {
    const result = chatMessageDegradedTurnSchema.parse({
      degraded: true,
      reason: "parse_failed",
    });
    expect(result).toEqual({ degraded: true, reason: "parse_failed" });
  });

  it("accepts all reason codes within the object", () => {
    for (const reason of ["parse_failed", "provider_error"] as const) {
      const result = chatMessageDegradedTurnSchema.parse({ degraded: true, reason });
      expect(result.reason).toBe(reason);
    }
  });

  it("rejects when degraded is not literal true", () => {
    expect(() => chatMessageDegradedTurnSchema.parse({ degraded: false, reason: "parse_failed" })).toThrow();
    expect(() => chatMessageDegradedTurnSchema.parse({ reason: "parse_failed" })).toThrow();
  });

  it("rejects unknown reason even when degraded=true", () => {
    expect(() => chatMessageDegradedTurnSchema.parse({ degraded: true, reason: "not_a_reason" })).toThrow();
  });
});

describe("parseChatMessageDegradedTurn", () => {
  it("returns parsed object when metadata contains valid turnDegraded", () => {
    const result = parseChatMessageDegradedTurn({
      turnDegraded: { degraded: true, reason: "parse_failed" },
    });
    expect(result).toEqual({ degraded: true, reason: "parse_failed" });
  });

  it("returns null for null metadata", () => {
    expect(parseChatMessageDegradedTurn(null)).toBeNull();
  });

  it("returns null for undefined metadata", () => {
    expect(parseChatMessageDegradedTurn(undefined)).toBeNull();
  });

  it("returns null when turnDegraded key is absent", () => {
    expect(parseChatMessageDegradedTurn({ someOtherKey: "value" })).toBeNull();
  });

  it("returns null when turnDegraded is null", () => {
    expect(parseChatMessageDegradedTurn({ turnDegraded: null })).toBeNull();
  });

  it("returns null when turnDegraded has invalid structure", () => {
    expect(parseChatMessageDegradedTurn({ turnDegraded: { degraded: false, reason: "parse_failed" } })).toBeNull();
    expect(parseChatMessageDegradedTurn({ turnDegraded: { degraded: true, reason: "unknown" } })).toBeNull();
  });

  it("returns null for legacy turnError reasons persisted as turnDegraded", () => {
    expect(parseChatMessageDegradedTurn({ turnDegraded: { degraded: true, reason: "reply_blocked" } })).toBeNull();
    expect(parseChatMessageDegradedTurn({ turnDegraded: { degraded: true, reason: "decision_failed" } })).toBeNull();
  });

  it("tolerates unknown metadata keys alongside turnDegraded", () => {
    const result = parseChatMessageDegradedTurn({
      parseErrors: [],
      replySafetyErrors: [],
      agent: { someData: 1 },
      turnDegraded: { degraded: true, reason: "provider_error" },
    });
    expect(result).toEqual({ degraded: true, reason: "provider_error" });
  });

  it("round-trips: parse → schema → parse", () => {
    const original = { degraded: true as const, reason: "parse_failed" as const };
    const metadata = { turnDegraded: original };
    const parsed = parseChatMessageDegradedTurn(metadata);
    expect(parsed).toEqual(original);
    // Re-parse the parsed result
    const reparsed = parseChatMessageDegradedTurn({ turnDegraded: parsed });
    expect(reparsed).toEqual(original);
  });
});

describe("parseChatMessageSuggestedQuickActions", () => {
  const validAction = {
    id: "today_summary_read",
    labelEn: "Today's summary",
    labelRu: "Сводка на сегодня",
    messageText: {
      en: "What's today?",
      ru: "Что у меня на сегодня?",
    },
  };

  it("returns the parsed array when metadata contains valid suggestedQuickActions", () => {
    const result = parseChatMessageSuggestedQuickActions({
      suggestedQuickActions: [validAction],
    });
    expect(result).toEqual([validAction]);
  });

  it("returns null for null/undefined metadata", () => {
    expect(parseChatMessageSuggestedQuickActions(null)).toBeNull();
    expect(parseChatMessageSuggestedQuickActions(undefined)).toBeNull();
  });

  it("returns null when the key is absent", () => {
    expect(parseChatMessageSuggestedQuickActions({ turnError: { reason: "decision_failed" } })).toBeNull();
  });

  it("returns null for an empty array (no chips to render)", () => {
    expect(parseChatMessageSuggestedQuickActions({ suggestedQuickActions: [] })).toBeNull();
  });

  it("returns null when the array contains malformed actions — never throws", () => {
    expect(
      parseChatMessageSuggestedQuickActions({
        suggestedQuickActions: [{ id: "not_a_direct_path_kind", labelEn: "x" }],
      }),
    ).toBeNull();
    expect(parseChatMessageSuggestedQuickActions({ suggestedQuickActions: "oops" })).toBeNull();
  });

  it("tolerates unknown metadata keys alongside suggestedQuickActions", () => {
    const result = parseChatMessageSuggestedQuickActions({
      agent: { someData: 1 },
      suggestedQuickActions: [validAction],
    });
    expect(result).toEqual([validAction]);
  });
});
