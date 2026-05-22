import { describe, expect, it } from "vitest";
import {
  getNutritionPlanDomainErrors,
  nutritionAdherenceStateSchema,
  nutritionPlanPayloadSchema,
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
});
