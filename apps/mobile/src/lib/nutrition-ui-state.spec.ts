import { describe, expect, it } from "vitest";
import {
  buildMealCompletionState,
  buildAdherenceState,
  cycleTargetCompletion,
  formatHydrationProgress,
  hasActiveNutritionPlan,
  parseHydrationInput,
  summarizeNutritionTargets,
} from "./nutrition-ui-state.js";

describe("mobile nutrition UI state", () => {
  it("detects active nutrition plans", () => {
    expect(
      hasActiveNutritionPlan({
        plan: { id: "plan-1" },
        activeRevision: { id: "rev-1" },
      }),
    ).toBe(true);
  });

  it("summarizes targets and meal completion defaults", () => {
    const payload = {
      title: "Balanced base",
      summary: "Consistent meals.",
      caloriesPerDay: 2200,
      proteinGrams: 140,
      carbsGrams: 220,
      fatGrams: 70,
      hydrationLiters: 2.5,
      mealStructure: [{ label: "Breakfast", timingHint: null }],
      preferences: [],
      restrictions: [],
      allergies: [],
      notes: [],
    };

    expect(summarizeNutritionTargets(payload)).toContain("2200 kcal");
    expect(buildMealCompletionState(payload.mealStructure)).toEqual([
      { label: "Breakfast", completed: false },
    ]);
  });

  it("builds adherence state from plan structure and existing records", () => {
    const payload = {
      title: "Balanced base",
      summary: "Consistent meals.",
      caloriesPerDay: 2200,
      proteinGrams: 140,
      carbsGrams: 220,
      fatGrams: 70,
      hydrationLiters: 2.5,
      mealStructure: [
        { label: "Breakfast", timingHint: null },
        { label: "Lunch", timingHint: null },
      ],
      preferences: [],
      restrictions: [],
      allergies: [],
      notes: [],
    };

    const state = buildAdherenceState({
      date: "2026-05-22",
      payload,
      record: {
        id: "adh-1",
        userId: "user-1",
        date: "2026-05-22",
        hydrationLitersConsumed: 1,
        mealCompletion: [{ label: "Breakfast", completed: true }],
        targetCompletion: {
          caloriesOnTarget: true,
          proteinOnTarget: null,
          carbsOnTarget: null,
          fatOnTarget: null,
        },
        notes: [],
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
      },
    });

    expect(state.mealCompletion).toEqual([
      { label: "Breakfast", completed: true },
      { label: "Lunch", completed: false },
    ]);
    expect(formatHydrationProgress(state.hydrationLitersConsumed, payload.hydrationLiters)).toBe(
      "1 / 2.5 L",
    );
  });

  it("cycles target completion and parses hydration input safely", () => {
    expect(cycleTargetCompletion(null)).toBe(true);
    expect(cycleTargetCompletion(true)).toBe(false);
    expect(cycleTargetCompletion(false)).toBe(null);
    expect(parseHydrationInput("-1")).toBeNull();
    expect(parseHydrationInput("2.5")).toBe(2.5);
  });
});
