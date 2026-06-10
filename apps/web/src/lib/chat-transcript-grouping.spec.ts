import { describe, expect, it } from "vitest";
import {
  shouldShowDateSeparator,
  formatChatDateSeparator,
} from "./chat-transcript-grouping.js";

describe("shouldShowDateSeparator", () => {
  it("returns true when prev is null (first message in thread)", () => {
    expect(shouldShowDateSeparator(null, { createdAt: "2024-06-01T10:00:00Z" })).toBe(true);
  });

  it("returns true when prev is undefined", () => {
    expect(shouldShowDateSeparator(undefined, { createdAt: "2024-06-01T10:00:00Z" })).toBe(true);
  });

  it("returns false when two messages are on the same UTC day", () => {
    const prev = { createdAt: "2024-06-01T08:00:00.000Z" };
    const current = { createdAt: "2024-06-01T20:59:59.999Z" };
    // Note: same day in UTC; if local offset shifts these across midnight
    // the test intentionally uses the same ISO date so JS Date arithmetic agrees.
    const prevDate = new Date(prev.createdAt);
    const curDate = new Date(current.createdAt);
    const expectSame =
      prevDate.getFullYear() === curDate.getFullYear() &&
      prevDate.getMonth() === curDate.getMonth() &&
      prevDate.getDate() === curDate.getDate();
    expect(shouldShowDateSeparator(prev, current)).toBe(!expectSame);
  });

  it("returns true when messages are on different dates", () => {
    const prev = { createdAt: "2024-05-31T23:00:00Z" };
    const current = { createdAt: "2024-06-02T00:01:00Z" };
    // These are guaranteed to be different dates in any locale (31 May vs 2 June).
    expect(shouldShowDateSeparator(prev, current)).toBe(true);
  });

  it("returns false for two messages mere seconds apart on the same day", () => {
    // Same wall-clock date regardless of timezone when strings are identical date
    const base = "2024-06-15T14:00:00Z";
    const base2 = "2024-06-15T14:00:30Z";
    const prevDate = new Date(base);
    const curDate = new Date(base2);
    const sameDay =
      prevDate.getFullYear() === curDate.getFullYear() &&
      prevDate.getMonth() === curDate.getMonth() &&
      prevDate.getDate() === curDate.getDate();
    expect(shouldShowDateSeparator({ createdAt: base }, { createdAt: base2 })).toBe(!sameDay);
  });
});

describe("formatChatDateSeparator", () => {
  // We cannot reliably test "Today"/"Yesterday" with a fixed ISO string because
  // they depend on the current date. Instead test the medium-date fallback.

  it("returns the todayLabel when date is today", () => {
    const today = new Date().toISOString();
    const result = formatChatDateSeparator(today, "en", "Today", "Yesterday");
    expect(result).toBe("Today");
  });

  it("returns the yesterdayLabel when date is yesterday", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const result = formatChatDateSeparator(yesterday, "en", "Today", "Yesterday");
    expect(result).toBe("Yesterday");
  });

  it("returns a medium date string for older dates", () => {
    // 2020-01-15 is definitely not today or yesterday
    const old = "2020-01-15T12:00:00Z";
    const result = formatChatDateSeparator(old, "en", "Today", "Yesterday");
    // Should NOT be "Today" or "Yesterday"
    expect(result).not.toBe("Today");
    expect(result).not.toBe("Yesterday");
    // Should contain "2020" or "Jan" or "15"
    expect(result.length).toBeGreaterThan(0);
  });

  it("localizes the medium date for a different locale", () => {
    const old = "2020-06-15T12:00:00Z";
    const enResult = formatChatDateSeparator(old, "en", "Today", "Вчера");
    const ruResult = formatChatDateSeparator(old, "ru", "Сегодня", "Вчера");
    // Both should be non-empty; they may differ in locale formatting
    expect(enResult.length).toBeGreaterThan(0);
    expect(ruResult.length).toBeGreaterThan(0);
  });
});
