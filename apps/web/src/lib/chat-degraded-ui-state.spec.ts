import { describe, expect, it } from "vitest";
import {
  resolveChatMessageDegradedTurn,
  resolveChatMessageTurnError,
  findPrecedingUserMessage,
} from "./chat-degraded-ui-state.js";

// Minimal stubs — real type shape, no DOM needed.
// metadata must be Record<string, unknown> (not nullable) to match DisplayChatMessage.
type Msg = { role: "user" | "assistant"; content: string; metadata: Record<string, unknown> };

function userMsg(content: string): Msg {
  return { role: "user", content, metadata: {} };
}

function assistantMsg(content: string, metadata: Record<string, unknown> = {}): Msg {
  return { role: "assistant", content, metadata };
}

describe("resolveChatMessageDegradedTurn", () => {
  it("returns null for user messages regardless of metadata", () => {
    const msg = userMsg("hello");
    expect(resolveChatMessageDegradedTurn(msg)).toBeNull();
  });

  it("returns null for assistant message with no metadata", () => {
    expect(resolveChatMessageDegradedTurn(assistantMsg("ok"))).toBeNull();
  });

  it("returns null when metadata has no turnDegraded key", () => {
    const msg = assistantMsg("ok", { parseErrors: [] });
    expect(resolveChatMessageDegradedTurn(msg)).toBeNull();
  });

  it("returns null when turnDegraded shape is invalid", () => {
    const msg = assistantMsg("ok", { turnDegraded: { degraded: false, reason: "provider_error" } });
    expect(resolveChatMessageDegradedTurn(msg)).toBeNull();
  });

  it("returns the degraded turn for reply_blocked", () => {
    const meta = { turnDegraded: { degraded: true, reason: "reply_blocked" } };
    const result = resolveChatMessageDegradedTurn(assistantMsg("", meta));
    expect(result).toEqual({ degraded: true, reason: "reply_blocked" });
  });

  it("returns the degraded turn for parse_failed", () => {
    const meta = { turnDegraded: { degraded: true, reason: "parse_failed" } };
    const result = resolveChatMessageDegradedTurn(assistantMsg("", meta));
    expect(result).toEqual({ degraded: true, reason: "parse_failed" });
  });

  it("returns the degraded turn for provider_error", () => {
    const meta = { turnDegraded: { degraded: true, reason: "provider_error" } };
    const result = resolveChatMessageDegradedTurn(assistantMsg("", meta));
    expect(result).toEqual({ degraded: true, reason: "provider_error" });
  });

  it("ignores unknown extra keys in the degraded payload", () => {
    const meta = { turnDegraded: { degraded: true, reason: "provider_error", extra: "ok" } };
    const result = resolveChatMessageDegradedTurn(assistantMsg("", meta));
    expect(result).toEqual({ degraded: true, reason: "provider_error" });
  });
});

describe("resolveChatMessageTurnError", () => {
  it("returns null for user messages", () => {
    const msg = userMsg("hello");
    expect(resolveChatMessageTurnError(msg)).toBeNull();
  });

  it("returns null for assistant message with no metadata", () => {
    expect(resolveChatMessageTurnError(assistantMsg("ok"))).toBeNull();
  });

  it("returns null when metadata has no turnError key", () => {
    const msg = assistantMsg("ok", { turnDegraded: { degraded: true, reason: "provider_error" } });
    expect(resolveChatMessageTurnError(msg)).toBeNull();
  });

  it("returns null when turnError shape is invalid", () => {
    const msg = assistantMsg(" ", { turnError: { reason: "unknown_reason" } });
    expect(resolveChatMessageTurnError(msg)).toBeNull();
  });

  it("returns turnError for decision_failed reason", () => {
    const meta = { turnError: { reason: "decision_failed" } };
    const result = resolveChatMessageTurnError(assistantMsg(" ", meta));
    expect(result).toEqual({ reason: "decision_failed" });
  });

  it("returns turnError for reply_blocked reason", () => {
    const meta = { turnError: { reason: "reply_blocked" } };
    const result = resolveChatMessageTurnError(assistantMsg(" ", meta));
    expect(result).toEqual({ reason: "reply_blocked" });
  });

  it("ignores unknown extra keys in the turnError payload (Zod strips them)", () => {
    const meta = { turnError: { reason: "decision_failed", extra: "ignored" } };
    const result = resolveChatMessageTurnError(assistantMsg(" ", meta));
    expect(result).toEqual({ reason: "decision_failed" });
  });
});

describe("findPrecedingUserMessage", () => {
  it("returns null when there are no messages before the index", () => {
    const msgs = [assistantMsg("hi")];
    expect(findPrecedingUserMessage(msgs, 0)).toBeNull();
  });

  it("returns the user message directly before the assistant message", () => {
    const msgs = [userMsg("my question"), assistantMsg("error")];
    expect(findPrecedingUserMessage(msgs, 1)).toBe("my question");
  });

  it("skips over assistant messages to find the preceding user message", () => {
    const msgs = [
      userMsg("first question"),
      assistantMsg("first reply"),
      assistantMsg("second error"),
    ];
    expect(findPrecedingUserMessage(msgs, 2)).toBe("first question");
  });

  it("returns the nearest user message when multiple users exist", () => {
    const msgs = [
      userMsg("old"),
      assistantMsg("ok"),
      userMsg("new question"),
      assistantMsg("error"),
    ];
    expect(findPrecedingUserMessage(msgs, 3)).toBe("new question");
  });

  it("returns null when index is 0 (no preceding messages)", () => {
    const msgs = [userMsg("alone")];
    expect(findPrecedingUserMessage(msgs, 0)).toBeNull();
  });

  it("returns null when all preceding messages are assistant messages", () => {
    const msgs = [assistantMsg("a"), assistantMsg("b"), assistantMsg("c")];
    expect(findPrecedingUserMessage(msgs, 2)).toBeNull();
  });
});
