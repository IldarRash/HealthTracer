import { describe, expect, it } from "vitest";
import {
  adjustNutritionPlanFromProgressChangesSchema,
  getNutritionPlanDomainErrors,
  nutritionPlanPayloadSchema,
} from "./index.js";

/**
 * Tests for the additive per-meal (C1), weekly-matrix (C2), and swap (C4)
 * extensions to nutritionPlanPayloadSchema / adjustNutritionPlanFromProgressChangesSchema.
 * All existing plans without these fields must remain valid.
 */

const baseMealStructure = [
  { label: "Breakfast", timingHint: "Morning" },
  { label: "Lunch", timingHint: null },
  { label: "Dinner", timingHint: "Evening" },
];

const basePayload = {
  title: "Base plan",
  summary: "Balanced base.",
  caloriesPerDay: 2200,
  proteinGrams: 140,
  carbsGrams: 220,
  fatGrams: 70,
  hydrationLiters: 2.5,
  mealStructure: baseMealStructure,
  preferences: [],
  restrictions: [],
  allergies: [],
  notes: [],
};

describe("nutritionPlanPayloadSchema — backward compatibility", () => {
  it("accepts legacy payloads without per-meal or weekly fields", () => {
    const result = nutritionPlanPayloadSchema.safeParse(basePayload);
    expect(result.success).toBe(true);
    if (result.success) {
      // New optional fields absent by default
      expect(result.data.weeklyPlan).toBeUndefined();
      expect(result.data.mealStructure[0]?.kcal).toBeUndefined();
    }
  });

  it("domain errors are unchanged for legacy payloads", () => {
    const parsed = nutritionPlanPayloadSchema.parse(basePayload);
    expect(getNutritionPlanDomainErrors(parsed)).toEqual([]);
  });
});

describe("nutritionPlanPayloadSchema — C1 per-meal kcal + macros + time + dish", () => {
  it("accepts meal slots with all C1 fields", () => {
    const result = nutritionPlanPayloadSchema.safeParse({
      ...basePayload,
      mealStructure: [
        {
          label: "Breakfast",
          timingHint: "07:30",
          kcal: 450,
          proteinGrams: 30,
          carbsGrams: 50,
          fatGrams: 15,
          mealTime: "07:30",
          dish: "Oatmeal with berries",
          ingredients: [
            { name: "Oats", quantity: 80, unit: "g" },
            { name: "Milk", quantity: 200, unit: "ml" },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const slot = result.data.mealStructure[0]!;
      expect(slot.kcal).toBe(450);
      expect(slot.dish).toBe("Oatmeal with berries");
      expect(slot.ingredients).toHaveLength(2);
    }
  });

  it("rejects negative kcal on a meal slot", () => {
    const result = nutritionPlanPayloadSchema.safeParse({
      ...basePayload,
      mealStructure: [{ label: "Breakfast", timingHint: null, kcal: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects meal slot kcal exceeding 5000", () => {
    const result = nutritionPlanPayloadSchema.safeParse({
      ...basePayload,
      mealStructure: [{ label: "Breakfast", timingHint: null, kcal: 5001 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts meal slots with partial C1 fields (only kcal)", () => {
    const result = nutritionPlanPayloadSchema.safeParse({
      ...basePayload,
      mealStructure: [{ label: "Breakfast", timingHint: "Morning", kcal: 500 }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 30 ingredients on a meal slot", () => {
    const tooManyIngredients = Array.from({ length: 31 }, (_, i) => ({
      name: `Ingredient ${i + 1}`,
    }));
    const result = nutritionPlanPayloadSchema.safeParse({
      ...basePayload,
      mealStructure: [
        { label: "Lunch", timingHint: null, ingredients: tooManyIngredients },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("nutritionPlanPayloadSchema — C2 weekly plan matrix", () => {
  it("accepts a 7-day weekly matrix", () => {
    const weeklyPlan = [
      { weekday: 1, breakfast: "Oatmeal", lunch: "Salad", dinner: "Chicken", kcal: 2100 },
      { weekday: 2, breakfast: "Eggs", kcal: 2200 },
      { weekday: 3 },
      { weekday: 4, snack: "Fruit" },
      { weekday: 5, dinner: "Fish" },
      { weekday: 6, lunch: "Soup" },
      { weekday: 7, breakfast: "Pancakes" },
    ];
    const result = nutritionPlanPayloadSchema.safeParse({
      ...basePayload,
      weeklyPlan,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weeklyPlan).toHaveLength(7);
    }
  });

  it("rejects weekday values outside 1–7", () => {
    const result = nutritionPlanPayloadSchema.safeParse({
      ...basePayload,
      weeklyPlan: [{ weekday: 8 }],
    });
    expect(result.success).toBe(false);

    const result2 = nutritionPlanPayloadSchema.safeParse({
      ...basePayload,
      weeklyPlan: [{ weekday: 0 }],
    });
    expect(result2.success).toBe(false);
  });

  it("rejects more than 7 entries in weeklyPlan", () => {
    const result = nutritionPlanPayloadSchema.safeParse({
      ...basePayload,
      weeklyPlan: Array.from({ length: 8 }, (_, i) => ({ weekday: (i % 7) + 1 })),
    });
    expect(result.success).toBe(false);
  });

  it("accepts weeklyPlan absent (undefined)", () => {
    const { weeklyPlan: _omit, ...withoutWeekly } = {
      ...basePayload,
      weeklyPlan: undefined,
    };
    const result = nutritionPlanPayloadSchema.safeParse(withoutWeekly);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.weeklyPlan).toBeUndefined();
    }
  });
});

describe("adjustNutritionPlanFromProgressChangesSchema — C4 swap metadata", () => {
  const progressChangesBase = {
    plan: basePayload,
    sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
    sourceTrendObservationIds: [],
  };

  it("accepts progress-linked payload without swaps (backward compatible)", () => {
    const result =
      adjustNutritionPlanFromProgressChangesSchema.safeParse(progressChangesBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.swaps).toBeUndefined();
      expect(result.data.fromCaloriesPerDay).toBeUndefined();
    }
  });

  it("accepts progress-linked payload with swaps and fromCaloriesPerDay", () => {
    const result = adjustNutritionPlanFromProgressChangesSchema.safeParse({
      ...progressChangesBase,
      fromCaloriesPerDay: 2400,
      swaps: [
        { from: "White rice (200g)", to: "Brown rice (180g)", save: "~40 kcal" },
        { from: "Whole milk", to: "Skimmed milk" },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fromCaloriesPerDay).toBe(2400);
      expect(result.data.swaps).toHaveLength(2);
      expect(result.data.swaps?.[0]?.save).toBe("~40 kcal");
    }
  });

  it("rejects swap items with empty from/to strings", () => {
    const result = adjustNutritionPlanFromProgressChangesSchema.safeParse({
      ...progressChangesBase,
      swaps: [{ from: "", to: "Brown rice" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 20 swaps", () => {
    const result = adjustNutritionPlanFromProgressChangesSchema.safeParse({
      ...progressChangesBase,
      swaps: Array.from({ length: 21 }, (_, i) => ({
        from: `Item ${i}`,
        to: `Replacement ${i}`,
      })),
    });
    expect(result.success).toBe(false);
  });

  it("rejects fromCaloriesPerDay out of range", () => {
    const result = adjustNutritionPlanFromProgressChangesSchema.safeParse({
      ...progressChangesBase,
      fromCaloriesPerDay: 10001,
    });
    expect(result.success).toBe(false);
  });
});

describe("domain errors still enforced on plans with new optional fields", () => {
  it("rejects a plan with no targets even when weeklyPlan is present", () => {
    const payload = nutritionPlanPayloadSchema.parse({
      title: "No macros",
      summary: "Missing targets.",
      caloriesPerDay: null,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
      hydrationLiters: null,
      mealStructure: [{ label: "Breakfast", timingHint: null }],
      weeklyPlan: [{ weekday: 1, breakfast: "Eggs" }],
    });
    const errors = getNutritionPlanDomainErrors(payload);
    expect(errors).toContain(
      "nutrition: At least one daily target (calories, macros, or hydration) is required.",
    );
  });
});
