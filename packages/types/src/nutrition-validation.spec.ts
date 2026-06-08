import { describe, expect, it } from "vitest";
import {
  adjustNutritionPlanFromProgressChangesSchema,
  getAdjustNutritionPlanProteinFloorErrors,
  getNutritionPlanDomainErrors,
  nutritionAdherenceStateSchema,
  nutritionPlanPayloadSchema,
  nutritionSwapItemSchema,
  upsertNutritionAdherenceSchema,
} from "./index.js";

const validPayload = nutritionPlanPayloadSchema.parse({
  title: "Balanced base",
  summary: "Moderate macros and hydration.",
  caloriesPerDay: 2200,
  proteinGrams: 140,
  carbsGrams: 220,
  fatGrams: 70,
  hydrationLiters: 2.5,
  mealStructure: [
    { label: "Breakfast", timingHint: "Morning" },
    { label: "Lunch", timingHint: null },
    { label: "Dinner", timingHint: "Evening" },
  ],
  preferences: ["Whole foods first"],
  restrictions: ["No shellfish"],
  notes: ["Whole foods first"],
});

describe("getNutritionPlanDomainErrors", () => {
  it("accepts payloads with targets and meal structure", () => {
    expect(getNutritionPlanDomainErrors(validPayload)).toEqual([]);
  });

  it("rejects payloads without any daily targets", () => {
    const errors = getNutritionPlanDomainErrors({
      ...validPayload,
      caloriesPerDay: null,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
      hydrationLiters: null,
    });

    expect(errors).toContain(
      "nutrition: At least one daily target (calories, macros, or hydration) is required.",
    );
  });

  it("rejects payloads without meal structure", () => {
    const errors = getNutritionPlanDomainErrors({
      ...validPayload,
      mealStructure: [],
    });

    expect(errors).toContain("nutrition: mealStructure must include at least one meal slot.");
  });

  it("rejects duplicate meal labels", () => {
    const errors = getNutritionPlanDomainErrors({
      ...validPayload,
      mealStructure: [
        { label: "Breakfast", timingHint: null },
        { label: "Breakfast", timingHint: null },
      ],
    });

    expect(errors).toContain("nutrition: mealStructure labels must be unique.");
  });

  it("rejects case-insensitive duplicate meal labels", () => {
    const errors = getNutritionPlanDomainErrors({
      ...validPayload,
      mealStructure: [
        { label: "Breakfast", timingHint: null },
        { label: "breakfast", timingHint: null },
      ],
    });

    expect(errors).toContain("nutrition: mealStructure labels must be unique.");
  });

  it("accepts hydration-only targets when meal structure is present", () => {
    const errors = getNutritionPlanDomainErrors({
      ...validPayload,
      caloriesPerDay: null,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
      hydrationLiters: 2,
    });

    expect(errors).toEqual([]);
  });
});

describe("nutritionPlanPayloadSchema boundaries", () => {
  const base = {
    title: "Balanced base",
    summary: "Moderate macros and hydration.",
    mealStructure: [{ label: "Breakfast", timingHint: null }],
    notes: [],
  };

  it("rejects negative macro grams and out-of-range calories", () => {
    expect(() =>
      nutritionPlanPayloadSchema.parse({
        ...base,
        caloriesPerDay: 10001,
        proteinGrams: 140,
        carbsGrams: 220,
        fatGrams: 70,
        hydrationLiters: 2.5,
      }),
    ).toThrow();

    expect(() =>
      nutritionPlanPayloadSchema.parse({
        ...base,
        caloriesPerDay: 2200,
        proteinGrams: -1,
        carbsGrams: 220,
        fatGrams: 70,
        hydrationLiters: 2.5,
      }),
    ).toThrow();
  });

  it("rejects zero or excessive hydration targets", () => {
    expect(() =>
      nutritionPlanPayloadSchema.parse({
        ...base,
        caloriesPerDay: 2200,
        proteinGrams: null,
        carbsGrams: null,
        fatGrams: null,
        hydrationLiters: 0,
      }),
    ).toThrow();

    expect(() =>
      nutritionPlanPayloadSchema.parse({
        ...base,
        caloriesPerDay: 2200,
        proteinGrams: null,
        carbsGrams: null,
        fatGrams: null,
        hydrationLiters: 21,
      }),
    ).toThrow();
  });

  it("rejects empty meal labels", () => {
    expect(() =>
      nutritionPlanPayloadSchema.parse({
        ...base,
        caloriesPerDay: 2200,
        proteinGrams: 140,
        carbsGrams: 220,
        fatGrams: 70,
        hydrationLiters: 2.5,
        mealStructure: [{ label: "", timingHint: null }],
      }),
    ).toThrow();
  });
});

describe("nutrition adherence schemas", () => {
  it("accepts partial upsert payloads", () => {
    expect(
      upsertNutritionAdherenceSchema.parse({
        hydrationLitersConsumed: 1.5,
      }).hydrationLitersConsumed,
    ).toBe(1.5);
  });

  it("rejects negative or excessive hydration consumption", () => {
    expect(() =>
      upsertNutritionAdherenceSchema.parse({
        hydrationLitersConsumed: -0.5,
      }),
    ).toThrow();

    expect(() =>
      nutritionAdherenceStateSchema.parse({
        date: "2026-05-22",
        hydrationLitersConsumed: 21,
      }),
    ).toThrow();
  });

  it("validates meal completion target completion and note boundaries", () => {
    expect(
      upsertNutritionAdherenceSchema.parse({
        mealCompletion: [{ label: "Breakfast", completed: true }],
        targetCompletion: {
          proteinOnTarget: false,
        },
        notes: ["Felt steady."],
      }),
    ).toEqual({
      mealCompletion: [{ label: "Breakfast", completed: true }],
      targetCompletion: {
        caloriesOnTarget: null,
        proteinOnTarget: false,
        carbsOnTarget: null,
        fatOnTarget: null,
      },
      notes: ["Felt steady."],
    });

    expect(() =>
      upsertNutritionAdherenceSchema.parse({
        mealCompletion: [{ label: "", completed: true }],
      }),
    ).toThrow();
    expect(() =>
      upsertNutritionAdherenceSchema.parse({
        mealCompletion: Array.from({ length: 9 }, (_, index) => ({
          label: `Meal ${index}`,
          completed: false,
        })),
      }),
    ).toThrow();
    expect(() =>
      upsertNutritionAdherenceSchema.parse({
        targetCompletion: {
          caloriesOnTarget: "yes",
        },
      }),
    ).toThrow();
    expect(() =>
      upsertNutritionAdherenceSchema.parse({
        notes: ["x".repeat(241)],
      }),
    ).toThrow();
    expect(() =>
      upsertNutritionAdherenceSchema.parse({
        notes: Array.from({ length: 11 }, (_, index) => `Note ${index}`),
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// C4 — nutritionSwapItemSchema boundaries
// ---------------------------------------------------------------------------

describe("nutritionSwapItemSchema", () => {
  it("accepts a valid swap item with optional save string", () => {
    expect(
      nutritionSwapItemSchema.parse({ from: "White rice 150g", to: "Cauliflower rice 150g", save: "~160 kcal" }),
    ).toMatchObject({ from: "White rice 150g", to: "Cauliflower rice 150g", save: "~160 kcal" });
  });

  it("accepts a swap item without a save value", () => {
    const item = nutritionSwapItemSchema.parse({ from: "Whole milk", to: "Skimmed milk" });
    expect(item.save).toBeUndefined();
  });

  it("rejects a swap item with an empty 'from' label", () => {
    expect(() => nutritionSwapItemSchema.parse({ from: "", to: "Skimmed milk" })).toThrow();
  });

  it("rejects a swap item with an empty 'to' label", () => {
    expect(() => nutritionSwapItemSchema.parse({ from: "Whole milk", to: "" })).toThrow();
  });

  it("rejects a swap item whose 'from' label exceeds 240 chars", () => {
    expect(() =>
      nutritionSwapItemSchema.parse({ from: "x".repeat(241), to: "Something else" }),
    ).toThrow();
  });

  it("rejects a swap item whose 'to' label exceeds 240 chars", () => {
    expect(() =>
      nutritionSwapItemSchema.parse({ from: "Something", to: "x".repeat(241) }),
    ).toThrow();
  });

  it("rejects a swap item whose 'save' string exceeds 240 chars", () => {
    expect(() =>
      nutritionSwapItemSchema.parse({ from: "Something", to: "Other", save: "x".repeat(241) }),
    ).toThrow();
  });

  it("rejects a swap item missing both from and to", () => {
    expect(() => nutritionSwapItemSchema.parse({})).toThrow();
  });
});

// C4 — adjustNutritionPlanFromProgressChangesSchema with swaps
describe("adjustNutritionPlanFromProgressChangesSchema — C4 swaps extension", () => {
  const planBase = {
    title: "Lighter plan",
    summary: "Reduced carbs, protein preserved.",
    caloriesPerDay: 1750,
    proteinGrams: 130,
    carbsGrams: 150,
    fatGrams: 60,
    hydrationLiters: 2.5,
    mealStructure: [{ label: "Breakfast", timingHint: "Morning" }],
    preferences: [],
    restrictions: [],
    allergies: [],
    notes: [],
  };

  it("accepts a valid payload with swaps and fromCaloriesPerDay", () => {
    const result = adjustNutritionPlanFromProgressChangesSchema.parse({
      plan: planBase,
      sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
      sourceTrendObservationIds: [],
      fromCaloriesPerDay: 2100,
      swaps: [
        { from: "White rice 150g", to: "Cauliflower rice 150g", save: "~160 kcal" },
      ],
    });
    expect(result.swaps).toHaveLength(1);
    expect(result.fromCaloriesPerDay).toBe(2100);
  });

  it("accepts a valid payload without swaps (plain adjust proposal, backward-compat)", () => {
    const result = adjustNutritionPlanFromProgressChangesSchema.parse({
      plan: planBase,
      sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
      sourceTrendObservationIds: [],
    });
    expect(result.swaps).toBeUndefined();
    expect(result.fromCaloriesPerDay).toBeUndefined();
  });

  it("rejects when swaps array exceeds 20 items", () => {
    const tooManySwaps = Array.from({ length: 21 }, (_, i) => ({
      from: `Food ${i}`,
      to: `Substitute ${i}`,
    }));
    expect(() =>
      adjustNutritionPlanFromProgressChangesSchema.parse({
        plan: planBase,
        swaps: tooManySwaps,
      }),
    ).toThrow();
  });

  it("rejects when fromCaloriesPerDay is negative", () => {
    expect(() =>
      adjustNutritionPlanFromProgressChangesSchema.parse({
        plan: planBase,
        fromCaloriesPerDay: -100,
      }),
    ).toThrow();
  });

  it("rejects when fromCaloriesPerDay exceeds 10000", () => {
    expect(() =>
      adjustNutritionPlanFromProgressChangesSchema.parse({
        plan: planBase,
        fromCaloriesPerDay: 10001,
      }),
    ).toThrow();
  });

  it("rejects when a swap item has an invalid shape", () => {
    expect(() =>
      adjustNutritionPlanFromProgressChangesSchema.parse({
        plan: planBase,
        swaps: [{ from: "", to: "Something" }],
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// C4 — protein-floor validation for adjust_nutrition_plan proposals
// ---------------------------------------------------------------------------

const baseAdjustPayload = {
  plan: {
    title: "Lighter plan",
    summary: "Reduced carbs, protein preserved.",
    caloriesPerDay: 1750,
    proteinGrams: 130,
    carbsGrams: 150,
    fatGrams: 60,
    hydrationLiters: 2.5,
    mealStructure: [{ label: "Breakfast", timingHint: "Morning" }],
    preferences: [],
    restrictions: [],
    allergies: [],
    notes: [],
  },
  sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
  sourceTrendObservationIds: [] as string[],
  fromCaloriesPerDay: 2100,
  swaps: [
    { from: "White rice 150g", to: "Cauliflower rice 150g", save: "~160 kcal" },
    { from: "Whole milk", to: "Skimmed milk", save: "~80 kcal" },
  ],
};

describe("getAdjustNutritionPlanProteinFloorErrors", () => {
  it("returns no errors when calories are lowered and protein is preserved (no current plan)", () => {
    const parsed = adjustNutritionPlanFromProgressChangesSchema.parse(baseAdjustPayload);
    const errors = getAdjustNutritionPlanProteinFloorErrors(parsed, null);

    expect(errors).toEqual([]);
  });

  it("returns no errors when calories are lowered and protein matches the current floor", () => {
    const parsed = adjustNutritionPlanFromProgressChangesSchema.parse(baseAdjustPayload);
    // Current protein is 130 g, proposal also sets 130 g — no cut
    const errors = getAdjustNutritionPlanProteinFloorErrors(parsed, 130);

    expect(errors).toEqual([]);
  });

  it("returns no errors when calories are lowered and protein is increased", () => {
    const parsed = adjustNutritionPlanFromProgressChangesSchema.parse({
      ...baseAdjustPayload,
      plan: { ...baseAdjustPayload.plan, proteinGrams: 140 },
    });
    // Current protein is 130 g, proposal increases to 140 g — allowed
    const errors = getAdjustNutritionPlanProteinFloorErrors(parsed, 130);

    expect(errors).toEqual([]);
  });

  it("rejects when calories are lowered and protein is cut below current floor", () => {
    const parsed = adjustNutritionPlanFromProgressChangesSchema.parse({
      ...baseAdjustPayload,
      plan: { ...baseAdjustPayload.plan, proteinGrams: 100 }, // cut from 130
    });
    const errors = getAdjustNutritionPlanProteinFloorErrors(parsed, 130);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Protein must not be cut while lowering calories");
    expect(errors[0]).toContain("130");
    expect(errors[0]).toContain("100");
  });

  it("rejects when calories are lowered and protein is set to null", () => {
    const parsed = adjustNutritionPlanFromProgressChangesSchema.parse({
      ...baseAdjustPayload,
      plan: { ...baseAdjustPayload.plan, proteinGrams: null },
    });
    const errors = getAdjustNutritionPlanProteinFloorErrors(parsed, 130);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Protein target must remain set");
  });

  it("returns no errors when calories are NOT being lowered (no fromCaloriesPerDay)", () => {
    const parsed = adjustNutritionPlanFromProgressChangesSchema.parse({
      ...baseAdjustPayload,
      fromCaloriesPerDay: undefined,
      plan: { ...baseAdjustPayload.plan, proteinGrams: 80 }, // would be a cut but no before-value
    });
    const errors = getAdjustNutritionPlanProteinFloorErrors(parsed, 130);

    expect(errors).toEqual([]);
  });

  it("returns no errors when the proposed calories are NOT lower than fromCaloriesPerDay", () => {
    // Increasing calories — protein check does not apply
    const parsed = adjustNutritionPlanFromProgressChangesSchema.parse({
      ...baseAdjustPayload,
      plan: { ...baseAdjustPayload.plan, caloriesPerDay: 2200, proteinGrams: 100 },
      fromCaloriesPerDay: 2100,
    });
    const errors = getAdjustNutritionPlanProteinFloorErrors(parsed, 130);

    expect(errors).toEqual([]);
  });
});
