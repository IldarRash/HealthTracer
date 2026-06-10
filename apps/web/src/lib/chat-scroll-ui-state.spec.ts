import { describe, expect, it } from "vitest";
import { isNearBottom, shouldAutoScroll } from "./chat-scroll-ui-state.js";

describe("isNearBottom", () => {
  // Geometry: scrollHeight is total content height.
  // The viewport sees from scrollTop to scrollTop + clientHeight.
  // Distance to bottom = scrollHeight - scrollTop - clientHeight.

  it("returns true when exactly at bottom (distance = 0)", () => {
    expect(isNearBottom(900, 100, 1000)).toBe(true);
  });

  it("returns true when within default 96px threshold", () => {
    expect(isNearBottom(810, 100, 1000)).toBe(true); // distance = 90 < 96
  });

  it("returns false when outside default 96px threshold", () => {
    expect(isNearBottom(800, 100, 1000)).toBe(false); // distance = 100 > 96
  });

  it("returns true with custom threshold", () => {
    expect(isNearBottom(800, 100, 1000, 200)).toBe(true); // distance = 100 < 200
  });

  it("returns false at top of a long thread", () => {
    expect(isNearBottom(0, 600, 5000)).toBe(false); // distance = 4400
  });

  it("returns true at top of a very short thread (shorter than viewport)", () => {
    // scrollHeight (500) - 0 - 600 = -100 which is <= 96 (negative means content fits)
    expect(isNearBottom(0, 600, 500)).toBe(true);
  });
});

describe("shouldAutoScroll", () => {
  it("returns true on initial load regardless of scroll position", () => {
    expect(shouldAutoScroll({ wasNearBottom: false, lastMessageIsOwnOptimistic: false, isInitialLoad: true })).toBe(true);
  });

  it("returns true when user was near bottom", () => {
    expect(shouldAutoScroll({ wasNearBottom: true, lastMessageIsOwnOptimistic: false, isInitialLoad: false })).toBe(true);
  });

  it("returns true when user just sent a message (own optimistic)", () => {
    expect(shouldAutoScroll({ wasNearBottom: false, lastMessageIsOwnOptimistic: true, isInitialLoad: false })).toBe(true);
  });

  it("returns false when user scrolled away and new message arrives from assistant", () => {
    expect(shouldAutoScroll({ wasNearBottom: false, lastMessageIsOwnOptimistic: false, isInitialLoad: false })).toBe(false);
  });

  it("returns true when all three conditions are met", () => {
    expect(shouldAutoScroll({ wasNearBottom: true, lastMessageIsOwnOptimistic: true, isInitialLoad: true })).toBe(true);
  });
});
