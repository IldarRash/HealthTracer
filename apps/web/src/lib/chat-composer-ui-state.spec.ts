import { describe, expect, it } from "vitest";
import { shouldSendOnEnter } from "./chat-composer-ui-state.js";

describe("shouldSendOnEnter", () => {
  it("returns true for plain Enter key", () => {
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: false })).toBe(true);
  });

  it("returns false for Shift+Enter (newline intent)", () => {
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: true, isComposing: false })).toBe(false);
  });

  it("returns false during IME composition (e.g. CJK input)", () => {
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
  });

  it("returns false for any non-Enter key", () => {
    expect(shouldSendOnEnter({ key: "a", shiftKey: false, isComposing: false })).toBe(false);
    expect(shouldSendOnEnter({ key: "Tab", shiftKey: false, isComposing: false })).toBe(false);
    expect(shouldSendOnEnter({ key: " ", shiftKey: false, isComposing: false })).toBe(false);
  });

  it("returns false for Shift+Enter even during composition", () => {
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: true, isComposing: true })).toBe(false);
  });

  it("returns false for arrow keys", () => {
    expect(shouldSendOnEnter({ key: "ArrowUp", shiftKey: false, isComposing: false })).toBe(false);
  });
});
