import { describe, expect, it } from "vitest";
import {
  adjustNutritionPlanFromProgressChangesSchema,
  computeMealCaloriesBreakdown,
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

// ─── C1: computeMealCaloriesBreakdown ──────────────────────────────────────

const payloadWithMealData = nutritionPlanPayloadSchema.parse({
  ...basePayload,
  caloriesPerDay: 2100,
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
      dish: "Chicken + quinoa",
      kcal: 620,
      proteinGrams: 44,
      carbsGrams: 62,
      fatGrams: 20,
    },
    {
      label: "Dinner",
      timingHint: "Evening",
      mealTime: "20:00",
      dish: "Salmon + veg",
      kcal: 540,
      proteinGrams: 38,
      carbsGrams: 30,
      fatGrams: 24,
    },
  ],
});

describe("computeMealCaloriesBreakdown — first revision (no previous)", () => {
  it("returns correct totals when no previous revision", () => {
    const model = computeMealCaloriesBreakdown(1, payloadWithMealData, null);

    expect(model.revisionNumber).toBe(1);
    expect(model.caloriesPerDay).toBe(2100);
    expect(model.totalKcal).toBe(480 + 620 + 540); // 1640
    expect(model.totalProtein).toBe(32 + 44 + 38);  // 114
    expect(model.totalCarbs).toBe(58 + 62 + 30);    // 150
    expect(model.totalFat).toBe(14 + 20 + 24);      // 58
    expect(model.remaining).toBe(2100 - 1640);      // 460
    expect(model.hasPerMealData).toBe(true);
  });

  it("marks all meals as changed when no previous revision", () => {
    const model = computeMealCaloriesBreakdown(1, payloadWithMealData, null);

    // All slots are "new" relative to null previous → changed = true.
    expect(model.meals.every((m) => m.changed)).toBe(true);
  });

  it("preserves per-meal fields in each row", () => {
    const model = computeMealCaloriesBreakdown(1, payloadWithMealData, null);

    const breakfast = model.meals.find((m) => m.label === "Breakfast");
    expect(breakfast?.kcal).toBe(480);
    expect(breakfast?.dish).toBe("Oatmeal");
    expect(breakfast?.mealTime).toBe("07:30");
  });
});

describe("computeMealCaloriesBreakdown — second revision (diff against previous)", () => {
  const previousPayload = nutritionPlanPayloadSchema.parse({
    ...basePayload,
    caloriesPerDay: 2200,
    mealStructure: [
      { label: "Breakfast", timingHint: "Morning" },
      { label: "Lunch",     timingHint: null },
      { label: "Dinner",    timingHint: "Evening" },
    ],
  });

  it("marks slots with new kcal data as changed vs legacy previous", () => {
    const model = computeMealCaloriesBreakdown(2, payloadWithMealData, previousPayload);

    // Previous had no kcal → active has kcal → changed for each slot.
    const breakfast = model.meals.find((m) => m.label === "Breakfast");
    expect(breakfast?.changed).toBe(true);
  });

  it("marks unchanged slots as not changed when kcal matches", () => {
    // Previous revision already has the same kcal/dish/macros.
    const prevWithSameData = nutritionPlanPayloadSchema.parse({
      ...basePayload,
      caloriesPerDay: 2100,
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
          dish: "Chicken + quinoa",
          kcal: 620,
          proteinGrams: 44,
          carbsGrams: 62,
          fatGrams: 20,
        },
        {
          label: "Dinner",
          timingHint: "Evening",
          mealTime: "20:00",
          dish: "Salmon + veg",
          kcal: 540,
          proteinGrams: 38,
          carbsGrams: 30,
          fatGrams: 24,
        },
      ],
    });

    const model = computeMealCaloriesBreakdown(3, payloadWithMealData, prevWithSameData);
    expect(model.meals.every((m) => !m.changed)).toBe(true);
  });

  it("marks a new slot (not present in previous) as changed", () => {
    // Add a snack slot to the active revision that was absent in previous.
    const activeWithSnack = nutritionPlanPayloadSchema.parse({
      ...basePayload,
      mealStructure: [
        ...payloadWithMealData.mealStructure,
        { label: "Snack", timingHint: null, kcal: 150, proteinGrams: 5, carbsGrams: 20, fatGrams: 5 },
      ],
    });

    const model = computeMealCaloriesBreakdown(2, activeWithSnack, previousPayload);
    const snack = model.meals.find((m) => m.label === "Snack");
    expect(snack?.changed).toBe(true);
  });
});

describe("computeMealCaloriesBreakdown — legacy plan without per-meal data", () => {
  it("returns hasPerMealData=false when no slots have kcal", () => {
    const legacyPayload = nutritionPlanPayloadSchema.parse(basePayload);
    const model = computeMealCaloriesBreakdown(1, legacyPayload, null);

    expect(model.hasPerMealData).toBe(false);
    expect(model.totalKcal).toBe(0);
    expect(model.meals.length).toBe(baseMealStructure.length);
  });

  it("remaining equals caloriesPerDay when no per-meal kcal (totalKcal=0)", () => {
    const legacyPayload = nutritionPlanPayloadSchema.parse(basePayload);
    const model = computeMealCaloriesBreakdown(1, legacyPayload, null);

    expect(model.remaining).toBe(legacyPayload.caloriesPerDay);
  });
});

describe("computeMealCaloriesBreakdown — remaining can be negative (over target)", () => {
  it("returns negative remaining when meal totals exceed caloriesPerDay", () => {
    const overTargetPayload = nutritionPlanPayloadSchema.parse({
      ...basePayload,
      caloriesPerDay: 1000,
      mealStructure: [
        { label: "Breakfast", timingHint: null, kcal: 600 },
        { label: "Lunch",     timingHint: null, kcal: 600 },
      ],
    });

    const model = computeMealCaloriesBreakdown(1, overTargetPayload, null);
    expect(model.totalKcal).toBe(1200);
    expect(model.remaining).toBe(-200);
  });
});
