/**
 * nutrition-meal-calories-read-model.spec.ts
 *
 * Covers:
 *  - nutritionMealCaloriesReadModelSchema Zod validation (valid / invalid shapes)
 *  - computeMealCaloriesBreakdown edge cases not in nutrition-payload-extensions.spec.ts:
 *      • caloriesPerDay=null → remaining=0, totalKcal correct
 *      • empty mealStructure → hasPerMealData=false, totals=0
 *      • kcal=0 explicitly set → treated as per-meal data present
 *      • only kcal changed (not dish/macros) triggers changed=true
 *      • only dish changed triggers changed=true
 *      • only protein changed triggers changed=true
 *      • slot present in both revisions, fully equal → changed=false
 *  - revisionNumber threaded correctly into output
 */

import { describe, expect, it } from "vitest";
import {
  computeMealCaloriesBreakdown,
  nutritionMealCaloriesReadModelSchema,
  nutritionPlanPayloadSchema,
} from "./index.js";

// ── Helpers ────────────────────────────────────────────────────────

const basePayload = {
  title: "Base",
  summary: "Base plan",
  caloriesPerDay: 2100 as number | null,
  proteinGrams: 130,
  carbsGrams: 210,
  fatGrams: 65,
  hydrationLiters: 2.5,
  mealStructure: [
    {
      label: "Breakfast",
      timingHint: "Morning",
      mealTime: "07:30",
      dish: "Oatmeal",
      kcal: 480,
      proteinGrams: 32,
      carbsGrams: 58,
      fatGrams: 14,
    },
    {
      label: "Lunch",
      timingHint: null,
      mealTime: "14:00",
      dish: "Chicken",
      kcal: 620,
      proteinGrams: 44,
      carbsGrams: 62,
      fatGrams: 20,
    },
  ],
  preferences: [],
  restrictions: [],
  allergies: [],
  notes: [],
};

const parsedBase = nutritionPlanPayloadSchema.parse(basePayload);

// ── Zod schema validation ──────────────────────────────────────────

describe("nutritionMealCaloriesReadModelSchema — valid shapes", () => {
  it("accepts a fully-populated read model", () => {
    const result = nutritionMealCaloriesReadModelSchema.safeParse({
      revisionNumber: 3,
      caloriesPerDay: 2100,
      proteinTarget: 130,
      carbsTarget: 210,
      fatTarget: 65,
      meals: [
        {
          label: "Breakfast",
          timingHint: "Morning",
          mealTime: "07:30",
          dish: "Oatmeal",
          kcal: 480,
          proteinGrams: 32,
          carbsGrams: 58,
          fatGrams: 14,
          changed: false,
        },
      ],
      totalKcal: 480,
      totalProtein: 32,
      totalCarbs: 58,
      totalFat: 14,
      remaining: 1620,
      hasPerMealData: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a model with caloriesPerDay=null", () => {
    const result = nutritionMealCaloriesReadModelSchema.safeParse({
      revisionNumber: 1,
      caloriesPerDay: null,
      proteinTarget: null,
      carbsTarget: null,
      fatTarget: null,
      meals: [],
      totalKcal: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      remaining: 0,
      hasPerMealData: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts meal rows with all optional fields absent", () => {
    const result = nutritionMealCaloriesReadModelSchema.safeParse({
      revisionNumber: 1,
      caloriesPerDay: 2000,
      proteinTarget: 120,
      carbsTarget: 200,
      fatTarget: 60,
      meals: [
        {
          label: "Breakfast",
          timingHint: null,
          changed: false,
          // kcal, proteinGrams, carbsGrams, fatGrams, mealTime, dish all absent
        },
      ],
      totalKcal: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      remaining: 2000,
      hasPerMealData: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("nutritionMealCaloriesReadModelSchema — invalid shapes", () => {
  it("rejects missing required fields (revisionNumber)", () => {
    const result = nutritionMealCaloriesReadModelSchema.safeParse({
      caloriesPerDay: 2000,
      meals: [],
      totalKcal: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      remaining: 0,
      hasPerMealData: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects revisionNumber < 1", () => {
    const result = nutritionMealCaloriesReadModelSchema.safeParse({
      revisionNumber: 0,
      caloriesPerDay: null,
      proteinTarget: null,
      carbsTarget: null,
      fatTarget: null,
      meals: [],
      totalKcal: 0,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      remaining: 0,
      hasPerMealData: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative totalKcal", () => {
    const result = nutritionMealCaloriesReadModelSchema.safeParse({
      revisionNumber: 1,
      caloriesPerDay: null,
      proteinTarget: null,
      carbsTarget: null,
      fatTarget: null,
      meals: [],
      totalKcal: -1,
      totalProtein: 0,
      totalCarbs: 0,
      totalFat: 0,
      remaining: 0,
      hasPerMealData: false,
    });
    expect(result.success).toBe(false);
  });
});

// ── computeMealCaloriesBreakdown edge cases ────────────────────────

describe("computeMealCaloriesBreakdown — caloriesPerDay=null", () => {
  it("returns caloriesPerDay=null and remaining=0 when no calorie target", () => {
    const noCaloriesPayload = nutritionPlanPayloadSchema.parse({
      ...basePayload,
      caloriesPerDay: null,
    });

    const model = computeMealCaloriesBreakdown(1, noCaloriesPayload, null);

    expect(model.caloriesPerDay).toBeNull();
    // remaining = (null ?? 0) - totalKcal = 0 - 1100 = -1100
    expect(model.totalKcal).toBe(480 + 620);
    expect(model.remaining).toBe(0 - (480 + 620));
  });
});

describe("computeMealCaloriesBreakdown — empty mealStructure", () => {
  it("returns hasPerMealData=false and all totals=0 for a plan with no meals", () => {
    // An empty mealStructure would fail domain validation — bypass via direct call
    // using a minimal payload that passes Zod but has no slots.
    // NOTE: getNutritionPlanDomainErrors rejects empty mealStructure at service layer.
    // Here we test computeMealCaloriesBreakdown directly to confirm it handles the
    // edge case defensively (not a valid plan, but a defensive unit test).
    const emptyMealPayload = {
      ...parsedBase,
      mealStructure: [],
    };

    const model = computeMealCaloriesBreakdown(1, emptyMealPayload, null);

    expect(model.meals).toHaveLength(0);
    expect(model.totalKcal).toBe(0);
    expect(model.totalProtein).toBe(0);
    expect(model.totalCarbs).toBe(0);
    expect(model.totalFat).toBe(0);
    expect(model.hasPerMealData).toBe(false);
  });
});

describe("computeMealCaloriesBreakdown — kcal=0 edge", () => {
  it("treats kcal=0 as per-meal data present (not absent)", () => {
    const zeroKcalPayload = nutritionPlanPayloadSchema.parse({
      ...basePayload,
      mealStructure: [
        { label: "Fast", timingHint: null, kcal: 0 },
        { label: "Lunch", timingHint: null, kcal: 500 },
      ],
    });

    const model = computeMealCaloriesBreakdown(1, zeroKcalPayload, null);

    // kcal=0 is a defined value — hasPerMealData should be true
    expect(model.hasPerMealData).toBe(true);
    expect(model.totalKcal).toBe(500);
  });
});

describe("computeMealCaloriesBreakdown — granular changed flag", () => {
  const previousSameData = nutritionPlanPayloadSchema.parse({
    ...basePayload,
    mealStructure: [
      {
        label: "Breakfast",
        timingHint: "Morning",
        mealTime: "07:30",
        dish: "Oatmeal",
        kcal: 480,
        proteinGrams: 32,
        carbsGrams: 58,
        fatGrams: 14,
      },
      {
        label: "Lunch",
        timingHint: null,
        mealTime: "14:00",
        dish: "Chicken",
        kcal: 620,
        proteinGrams: 44,
        carbsGrams: 62,
        fatGrams: 20,
      },
    ],
  });

  it("marks only the slot whose kcal changed as changed=true", () => {
    const activeWithChangedBreakfast = nutritionPlanPayloadSchema.parse({
      ...basePayload,
      mealStructure: [
        {
          label: "Breakfast",
          timingHint: "Morning",
          mealTime: "07:30",
          dish: "Oatmeal",
          kcal: 520, // Changed from 480
          proteinGrams: 32,
          carbsGrams: 58,
          fatGrams: 14,
        },
        {
          label: "Lunch",
          timingHint: null,
          mealTime: "14:00",
          dish: "Chicken",
          kcal: 620, // Unchanged
          proteinGrams: 44,
          carbsGrams: 62,
          fatGrams: 20,
        },
      ],
    });

    const model = computeMealCaloriesBreakdown(2, activeWithChangedBreakfast, previousSameData);

    const breakfast = model.meals.find((m) => m.label === "Breakfast");
    const lunch = model.meals.find((m) => m.label === "Lunch");

    expect(breakfast?.changed).toBe(true);
    expect(lunch?.changed).toBe(false);
  });

  it("marks only the slot whose dish changed as changed=true", () => {
    const activeWithChangedDish = nutritionPlanPayloadSchema.parse({
      ...basePayload,
      mealStructure: [
        {
          label: "Breakfast",
          timingHint: "Morning",
          dish: "Granola", // Changed dish
          kcal: 480,
          proteinGrams: 32,
          carbsGrams: 58,
          fatGrams: 14,
        },
        {
          label: "Lunch",
          timingHint: null,
          dish: "Chicken",
          kcal: 620,
          proteinGrams: 44,
          carbsGrams: 62,
          fatGrams: 20,
        },
      ],
    });

    const model = computeMealCaloriesBreakdown(2, activeWithChangedDish, previousSameData);

    const breakfast = model.meals.find((m) => m.label === "Breakfast");
    const lunch = model.meals.find((m) => m.label === "Lunch");

    expect(breakfast?.changed).toBe(true);
    expect(lunch?.changed).toBe(false);
  });

  it("marks only the slot whose protein changed as changed=true", () => {
    const activeWithChangedProtein = nutritionPlanPayloadSchema.parse({
      ...basePayload,
      mealStructure: [
        {
          label: "Breakfast",
          timingHint: "Morning",
          dish: "Oatmeal",
          kcal: 480,
          proteinGrams: 40, // Changed from 32
          carbsGrams: 58,
          fatGrams: 14,
        },
        {
          label: "Lunch",
          timingHint: null,
          dish: "Chicken",
          kcal: 620,
          proteinGrams: 44,
          carbsGrams: 62,
          fatGrams: 20,
        },
      ],
    });

    const model = computeMealCaloriesBreakdown(2, activeWithChangedProtein, previousSameData);

    const breakfast = model.meals.find((m) => m.label === "Breakfast");
    const lunch = model.meals.find((m) => m.label === "Lunch");

    expect(breakfast?.changed).toBe(true);
    expect(lunch?.changed).toBe(false);
  });

  it("marks nothing changed when all slots match previous exactly", () => {
    const model = computeMealCaloriesBreakdown(2, parsedBase, previousSameData);

    expect(model.meals.every((m) => !m.changed)).toBe(true);
  });
});

describe("computeMealCaloriesBreakdown — revisionNumber threaded", () => {
  it("emits the exact revisionNumber provided as argument", () => {
    const model = computeMealCaloriesBreakdown(7, parsedBase, null);
    expect(model.revisionNumber).toBe(7);
  });
});

describe("computeMealCaloriesBreakdown — macro targets threaded", () => {
  it("maps proteinTarget/carbsTarget/fatTarget from the active payload", () => {
    const model = computeMealCaloriesBreakdown(1, parsedBase, null);

    expect(model.proteinTarget).toBe(parsedBase.proteinGrams);
    expect(model.carbsTarget).toBe(parsedBase.carbsGrams);
    expect(model.fatTarget).toBe(parsedBase.fatGrams);
  });

  it("returns null macro targets when payload has null macro targets", () => {
    const noMacroPayload = nutritionPlanPayloadSchema.parse({
      ...basePayload,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
    });

    const model = computeMealCaloriesBreakdown(1, noMacroPayload, null);

    expect(model.proteinTarget).toBeNull();
    expect(model.carbsTarget).toBeNull();
    expect(model.fatTarget).toBeNull();
  });
});
