import { describe, it, expect } from "vitest";
import {
  chatTurnDegradedReasonSchema,
  chatMessageDegradedTurnSchema,
  parseChatMessageDegradedTurn,
} from "./chat-turn.js";

describe("chatTurnDegradedReasonSchema", () => {
  it("accepts all valid reason codes", () => {
    expect(chatTurnDegradedReasonSchema.parse("reply_blocked")).toBe("reply_blocked");
    expect(chatTurnDegradedReasonSchema.parse("parse_failed")).toBe("parse_failed");
    expect(chatTurnDegradedReasonSchema.parse("provider_error")).toBe("provider_error");
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
      reason: "reply_blocked",
    });
    expect(result).toEqual({ degraded: true, reason: "reply_blocked" });
  });

  it("accepts all reason codes within the object", () => {
    for (const reason of ["reply_blocked", "parse_failed", "provider_error"] as const) {
      const result = chatMessageDegradedTurnSchema.parse({ degraded: true, reason });
      expect(result.reason).toBe(reason);
    }
  });

  it("rejects when degraded is not literal true", () => {
    expect(() => chatMessageDegradedTurnSchema.parse({ degraded: false, reason: "reply_blocked" })).toThrow();
    expect(() => chatMessageDegradedTurnSchema.parse({ reason: "reply_blocked" })).toThrow();
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
    expect(parseChatMessageDegradedTurn({ turnDegraded: { degraded: false, reason: "reply_blocked" } })).toBeNull();
    expect(parseChatMessageDegradedTurn({ turnDegraded: { degraded: true, reason: "unknown" } })).toBeNull();
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
    const original = { degraded: true as const, reason: "reply_blocked" as const };
    const metadata = { turnDegraded: original };
    const parsed = parseChatMessageDegradedTurn(metadata);
    expect(parsed).toEqual(original);
    // Re-parse the parsed result
    const reparsed = parseChatMessageDegradedTurn({ turnDegraded: parsed });
    expect(reparsed).toEqual(original);
  });
});
