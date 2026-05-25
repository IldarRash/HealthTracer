import { describe, expect, it } from "vitest";
import type { AiProposal, NutritionPlanPayload } from "@health/types";
import {
  buildAdherenceState,
  buildMealCompletionState,
  formatHydrationProgress,
  hasActiveNutritionPlan,
  parseHydrationInput,
  summarizeNutritionProposalChanges,
  summarizeNutritionTargets,
  targetCompletionKeysForPayload,
  toggleMealCompletion,
  toggleTargetCompletion,
} from "./nutrition-ui-state.js";

const samplePayload: NutritionPlanPayload = {
  title: "Balanced base",
  summary: "Consistent meals with moderate targets.",
  caloriesPerDay: 2200,
  proteinGrams: 140,
  carbsGrams: 220,
  fatGrams: 70,
  hydrationLiters: 2.5,
  mealStructure: [
    { label: "Breakfast", timingHint: "Within 1 hour of waking" },
    { label: "Lunch", timingHint: null },
  ],
  preferences: ["Higher protein"],
  restrictions: ["No pork"],
  allergies: [],
  notes: ["Prep lunches on Sunday"],
};

describe("nutrition UI state", () => {
  it("detects active nutrition plans", () => {
    expect(
      hasActiveNutritionPlan({
        plan: { id: "plan-1" },
        activeRevision: { id: "rev-1" },
      }),
    ).toBe(true);
    expect(
      hasActiveNutritionPlan({
        plan: { id: "plan-1" },
        activeRevision: null,
      }),
    ).toBe(false);
  });

  it("builds meal completion from plan structure and existing adherence", () => {
    expect(buildMealCompletionState(samplePayload.mealStructure)).toEqual([
      { label: "Breakfast", completed: false },
      { label: "Lunch", completed: false },
    ]);

    expect(
      buildMealCompletionState(samplePayload.mealStructure, [
        { label: "Lunch", completed: true },
      ]),
    ).toEqual([
      { label: "Breakfast", completed: false },
      { label: "Lunch", completed: true },
    ]);
  });

  it("toggles meals and target completion states", () => {
    const meals = buildMealCompletionState(samplePayload.mealStructure);
    expect(toggleMealCompletion(meals, "Breakfast")[0]?.completed).toBe(true);

    const targets = {
      caloriesOnTarget: null,
      proteinOnTarget: null,
      carbsOnTarget: null,
      fatOnTarget: null,
    };

    expect(toggleTargetCompletion(targets, "proteinOnTarget").proteinOnTarget).toBe(true);
    expect(
      toggleTargetCompletion(
        { ...targets, proteinOnTarget: true },
        "proteinOnTarget",
      ).proteinOnTarget,
    ).toBe(false);
  });

  it("summarizes targets and formats hydration progress", () => {
    expect(summarizeNutritionTargets(samplePayload)).toEqual([
      "2200 kcal/day",
      "140 g protein",
      "220 g carbs",
      "70 g fat",
      "2.5 L hydration",
    ]);
    expect(formatHydrationProgress(1.5, 2.5)).toBe("1.5 / 2.5 L");
    expect(targetCompletionKeysForPayload(samplePayload)).toEqual([
      "caloriesOnTarget",
      "proteinOnTarget",
      "carbsOnTarget",
      "fatOnTarget",
    ]);
  });

  it("guards hydration input parsing for Today adherence saves", () => {
    expect(parseHydrationInput("2.25")).toBe(2.25);
    expect(parseHydrationInput("  ")).toBeNull();
    expect(parseHydrationInput("-1")).toBeNull();
    expect(parseHydrationInput("not a number")).toBeNull();
  });

  it("builds adherence state for today from payload and record", () => {
    const state = buildAdherenceState({
      date: "2026-05-22",
      payload: samplePayload,
      record: {
        id: "adh-1",
        userId: "user-1",
        date: "2026-05-22",
        hydrationLitersConsumed: 1.25,
        mealCompletion: [{ label: "Breakfast", completed: true }],
        targetCompletion: {
          caloriesOnTarget: true,
          proteinOnTarget: null,
          carbsOnTarget: null,
          fatOnTarget: null,
        },
        notes: ["Felt consistent"],
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
      },
    });

    expect(state.hydrationLitersConsumed).toBe(1.25);
    expect(state.mealCompletion).toEqual([
      { label: "Breakfast", completed: true },
      { label: "Lunch", completed: false },
    ]);
    expect(state.notes).toEqual(["Felt consistent"]);
  });

  it("summarizes richer nutrition proposal changes for inline cards", () => {
    const proposal: AiProposal = {
      id: "14a08176-64a7-4a2d-8a44-581807368394",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
      sourceMessageId: null,
      intent: "adjust_nutrition_plan",
      targetDomain: "nutrition",
      title: "Adjust nutrition targets",
      reason: "Matches your current training context.",
      proposedChanges: samplePayload,
      status: "pending",
      validationStatus: "valid",
      validationErrors: [],
      userDecisionAt: null,
      appliedReference: null,
      createdAt: "2026-05-22T12:00:00.000Z",
      updatedAt: "2026-05-22T12:00:00.000Z",
    };

    expect(summarizeNutritionProposalChanges(proposal)).toEqual([
      "2200 kcal/day",
      "140 g protein",
      "220 g carbs",
      "70 g fat",
      "2.5 L hydration",
      "Meals: Breakfast, Lunch",
      "Preferences: Higher protein",
      "Restrictions: No pork",
    ]);
  });

  it("returns empty proposal summaries for non-nutrition domains", () => {
    expect(
      summarizeNutritionProposalChanges({
        targetDomain: "workout",
        proposedChanges: samplePayload,
      } as AiProposal),
    ).toEqual([]);
  });
});
