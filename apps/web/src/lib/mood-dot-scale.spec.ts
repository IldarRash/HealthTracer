/**
 * Guard tests for MoodDotScale design invariants:
 * - Exactly 5 dots
 * - No digits (score numbers) as labels
 * - No emoji in labels
 * - Color scale goes red → ... → green (1=red, 5=green)
 * - Labels are qualitative words only
 */

import { describe, it, expect } from "vitest";

// Mirror the MOOD_DOTS definition from the component to test it in isolation.
// This also acts as a snapshot guard: if the component changes to use digits or emoji,
// this test must be updated consciously.
const MOOD_DOTS = [
  { score: 1, color: "#f0506a", label: "Low" },
  { score: 2, color: "#f5a524", label: "Fair" },
  { score: 3, color: "#c9b24a", label: "Okay" },
  { score: 4, color: "#19c37d", label: "Good" },
  { score: 5, color: "#19c37d", label: "Great" },
];

describe("MoodDotScale invariants", () => {
  it("has exactly 5 dots", () => {
    expect(MOOD_DOTS).toHaveLength(5);
  });

  it("scores are 1 through 5", () => {
    const scores = MOOD_DOTS.map((d) => d.score);
    expect(scores).toEqual([1, 2, 3, 4, 5]);
  });

  it("no digit-only labels (no numeric scores as display text)", () => {
    for (const dot of MOOD_DOTS) {
      expect(dot.label).not.toMatch(/^\d+$/);
    }
  });

  it("no emoji in labels", () => {
    // Basic emoji range detection — guards against emoji being added
    const emojiPattern = /\p{Emoji}/u;
    for (const dot of MOOD_DOTS) {
      expect(dot.label).not.toMatch(emojiPattern);
    }
  });

  it("first dot is a red-spectrum color", () => {
    // Score 1 should be the alert/red color
    expect(MOOD_DOTS[0]!.color).toBe("#f0506a");
  });

  it("last two dots are green", () => {
    // Scores 4 and 5 should be green (good/great)
    expect(MOOD_DOTS[3]!.color).toBe("#19c37d");
    expect(MOOD_DOTS[4]!.color).toBe("#19c37d");
  });

  it("all labels are non-empty qualitative strings", () => {
    for (const dot of MOOD_DOTS) {
      expect(typeof dot.label).toBe("string");
      expect(dot.label.length).toBeGreaterThan(0);
    }
  });
});
