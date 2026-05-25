import { describe, expect, it } from "vitest";
import {
  buildTodayNutritionAdherenceView,
  canAppendTodayNutritionNote,
  countCompletedMeals,
  formatMealCompletionSummary,
  formatTodayNutritionPlanSummary,
  hasTodayNutritionAdherenceSaved,
  MAX_TODAY_NUTRITION_NOTE_LENGTH,
  MAX_TODAY_NUTRITION_NOTES,
  resolveTodayNutritionCardPhase,
  todayNutritionPayload,
} from "./today-nutrition-ui-state.js";

const timestamp = "2026-05-22T12:00:00.000Z";
const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const planId = "33333333-3333-4333-8333-333333333333";
const revisionId = "44444444-4444-4444-8444-444444444444";

const payload = {
  title: "Balanced daily nutrition base",
  summary: "A moderate starting point focused on consistency.",
  caloriesPerDay: 2200,
  proteinGrams: 140,
  carbsGrams: 220,
  fatGrams: 70,
  hydrationLiters: 2.5,
  mealStructure: [
    { label: "Breakfast", timingHint: "Morning" },
    { label: "Lunch", timingHint: null },
  ],
  preferences: [],
  restrictions: [],
  allergies: [],
  notes: [],
};

const baseNutrition = {
  date: "2026-05-22",
  plan: {
    id: planId,
    userId,
    activeRevisionId: revisionId,
    status: "active" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  activeRevision: {
    id: revisionId,
    nutritionPlanId: planId,
    revisionNumber: 1,
    reason: "Initial plan",
    source: "ai_proposal" as const,
    payload,
    createdAt: timestamp,
  },
  adherence: null,
};

describe("today nutrition UI state", () => {
  it("resolves card phases from today nutrition detail", () => {
    expect(resolveTodayNutritionCardPhase(null)).toBe("empty");
    expect(resolveTodayNutritionCardPhase(baseNutrition)).toBe("ready");
    expect(
      resolveTodayNutritionCardPhase({
        ...baseNutrition,
        activeRevision: {
          ...baseNutrition.activeRevision,
          payload: {
            ...payload,
            caloriesPerDay: null,
            proteinGrams: null,
            carbsGrams: null,
            fatGrams: null,
            hydrationLiters: null,
            mealStructure: [],
          },
        },
      }),
    ).toBe("partial");
  });

  it("builds adherence view aligned to plan meals", () => {
    const view = buildTodayNutritionAdherenceView({
      ...baseNutrition,
      adherence: {
        id: "66666666-6666-4666-8666-666666666666",
        userId,
        date: "2026-05-22",
        hydrationLitersConsumed: 1.5,
        mealCompletion: [{ label: "Breakfast", completed: true }],
        targetCompletion: {
          caloriesOnTarget: true,
          proteinOnTarget: null,
          carbsOnTarget: null,
          fatOnTarget: null,
        },
        notes: ["Light day"],
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });

    expect(view.mealCompletion).toEqual([
      { label: "Breakfast", completed: true },
      { label: "Lunch", completed: false },
    ]);
    expect(view.hydrationLitersConsumed).toBe(1.5);
    expect(view.notes).toEqual(["Light day"]);
  });

  it("keeps selected-date adherence state separate from the active plan", () => {
    const selectedDate = "2026-05-23";
    const view = buildTodayNutritionAdherenceView({
      ...baseNutrition,
      date: selectedDate,
      adherence: null,
    });

    expect(view.date).toBe(selectedDate);
    expect(view.mealCompletion).toEqual([
      { label: "Breakfast", completed: false },
      { label: "Lunch", completed: false },
    ]);
    expect(view.targetCompletion).toEqual({
      caloriesOnTarget: null,
      proteinOnTarget: null,
      carbsOnTarget: null,
      fatOnTarget: null,
    });
    expect(todayNutritionPayload(baseNutrition)).toBe(payload);
  });

  it("formats plan summary and meal completion labels", () => {
    expect(formatTodayNutritionPlanSummary(payload)).toContain("2200 kcal/day");
    expect(
      formatMealCompletionSummary([
        { completed: true },
        { completed: false },
      ]),
    ).toBe("1 of 2 meals logged");
    expect(countCompletedMeals([{ completed: true }, { completed: true }])).toEqual({
      completed: 2,
      total: 2,
    });
  });

  it("guards bounded nutrition note entry", () => {
    expect(canAppendTodayNutritionNote([], "  ")).toBe(false);
    expect(canAppendTodayNutritionNote([], "Felt good")).toBe(true);
    expect(
      canAppendTodayNutritionNote(
        Array.from({ length: MAX_TODAY_NUTRITION_NOTES }, (_, index) => `Note ${index}`),
        "One more",
      ),
    ).toBe(false);
    expect(
      canAppendTodayNutritionNote([], "x".repeat(MAX_TODAY_NUTRITION_NOTE_LENGTH + 1)),
    ).toBe(false);
  });

  it("detects saved adherence and payload access", () => {
    expect(hasTodayNutritionAdherenceSaved(baseNutrition)).toBe(false);
    expect(
      hasTodayNutritionAdherenceSaved({
        ...baseNutrition,
        adherence: {
          id: "66666666-6666-4666-8666-666666666666",
          userId,
          date: "2026-05-22",
          hydrationLitersConsumed: null,
          mealCompletion: [],
          targetCompletion: {
            caloriesOnTarget: null,
            proteinOnTarget: null,
            carbsOnTarget: null,
            fatOnTarget: null,
          },
          notes: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      }),
    ).toBe(true);
    expect(todayNutritionPayload(baseNutrition)?.title).toBe(payload.title);
  });
});
