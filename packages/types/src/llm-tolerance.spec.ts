/**
 * llm-tolerance.spec.ts — Focused regression tests for LLM payload tolerance:
 *
 *   (a) Key omitted (simulating stripExplicitNulls removing a null key) → parses to null.
 *   (b) Decimal numeric value → rounded to integer.
 *   (c) Existing valid inputs are unchanged.
 *   (d) Integration: a realistic nutrition candidate payload containing nulls, passed through
 *       stripExplicitNulls-equivalent preprocessing → nutritionPlanPayloadSchema.parse succeeds.
 */

import { describe, expect, it } from "vitest";
import {
  nutritionPlanPayloadSchema,
  nutritionMealSlotSchema,
  nutritionWeekDaySchema,
} from "./nutrition-meal.js";
import {
  nutritionIncidentItemSchema,
  nutritionIncidentMacrosSchema,
  logNutritionIncidentProposalPayloadSchema,
} from "./nutrition-incidents.js";
import {
  workoutPlanExerciseSchema,
  workoutPlanPayloadSchema,
  logWorkoutActivityProposalPayloadSchema,
} from "./workouts.js";
import { llmInt, requiredNullable } from "./llm-coerce.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared test helper: simulate the stripExplicitNulls behaviour from
// openai-coach-provider.ts — recursively removes null keys from an object.
// ---------------------------------------------------------------------------
function stripExplicitNulls(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stripExplicitNulls);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== null) {
        result[k] = stripExplicitNulls(v);
      }
    }
    return result;
  }
  return value;
}

// ---------------------------------------------------------------------------
// llmInt helper
// ---------------------------------------------------------------------------

describe("llmInt helper", () => {
  it("rounds a decimal to the nearest integer", () => {
    const schema = llmInt(z.number().nonnegative().max(1000));
    expect(schema.parse(66.7)).toBe(67);
    expect(schema.parse(66.2)).toBe(66);
    expect(schema.parse(100.5)).toBe(101);
  });

  it("accepts plain integers unchanged", () => {
    const schema = llmInt(z.number().nonnegative().max(1000));
    expect(schema.parse(66)).toBe(66);
    expect(schema.parse(0)).toBe(0);
  });

  it("still enforces max bound after rounding", () => {
    const schema = llmInt(z.number().nonnegative().max(100));
    expect(() => schema.parse(100.6)).toThrow(); // rounds to 101 > 100
  });

  it("still enforces nonnegative after rounding", () => {
    const schema = llmInt(z.number().nonnegative().max(1000));
    expect(() => schema.parse(-0.1)).not.toThrow(); // rounds to 0, which passes nonnegative
    expect(() => schema.parse(-1)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// requiredNullable helper
// ---------------------------------------------------------------------------

describe("requiredNullable helper", () => {
  const schema = requiredNullable(z.number().positive().max(100));

  it("coerces undefined to null (simulates stripped null key)", () => {
    expect(schema.parse(undefined)).toBeNull();
  });

  it("preserves explicit null", () => {
    expect(schema.parse(null)).toBeNull();
  });

  it("passes through a valid number", () => {
    expect(schema.parse(42)).toBe(42);
  });

  it("still enforces inner constraints when value is present", () => {
    expect(() => schema.parse(0)).toThrow();
    expect(() => schema.parse(101)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// nutritionPlanPayloadSchema — required-nullable fields
// ---------------------------------------------------------------------------

const minimalNutritionPlanBase = {
  title: "Test plan",
  summary: "Test summary.",
  mealStructure: [{ label: "Breakfast", timingHint: null }],
};

describe("nutritionPlanPayloadSchema — required-nullable fields (stripExplicitNulls tolerance)", () => {
  it("(a) key omitted (after stripExplicitNulls) → field parses to null", () => {
    const result = nutritionPlanPayloadSchema.parse({
      ...minimalNutritionPlanBase,
      // caloriesPerDay, proteinGrams, carbsGrams, fatGrams, hydrationLiters all absent
    });
    expect(result.caloriesPerDay).toBeNull();
    expect(result.proteinGrams).toBeNull();
    expect(result.carbsGrams).toBeNull();
    expect(result.fatGrams).toBeNull();
    expect(result.hydrationLiters).toBeNull();
  });

  it("(b) decimal values → rounded to int", () => {
    const result = nutritionPlanPayloadSchema.parse({
      ...minimalNutritionPlanBase,
      caloriesPerDay: 2199.7,
      proteinGrams: 139.8,
      carbsGrams: 249.3,
      fatGrams: 69.6,
      hydrationLiters: 2.5,
    });
    expect(result.caloriesPerDay).toBe(2200);
    expect(result.proteinGrams).toBe(140);
    expect(result.carbsGrams).toBe(249);
    expect(result.fatGrams).toBe(70);
    // hydrationLiters is NOT int-rounded (it's a float field)
    expect(result.hydrationLiters).toBeCloseTo(2.5);
  });

  it("(c) valid integer inputs unchanged", () => {
    const result = nutritionPlanPayloadSchema.parse({
      ...minimalNutritionPlanBase,
      caloriesPerDay: 2200,
      proteinGrams: 140,
      carbsGrams: 250,
      fatGrams: 70,
      hydrationLiters: 2.5,
    });
    expect(result.caloriesPerDay).toBe(2200);
    expect(result.proteinGrams).toBe(140);
    expect(result.carbsGrams).toBe(250);
    expect(result.fatGrams).toBe(70);
    expect(result.hydrationLiters).toBeCloseTo(2.5);
  });

  it("still rejects values exceeding max bounds", () => {
    expect(() =>
      nutritionPlanPayloadSchema.parse({
        ...minimalNutritionPlanBase,
        caloriesPerDay: 10001,
      }),
    ).toThrow();

    expect(() =>
      nutritionPlanPayloadSchema.parse({
        ...minimalNutritionPlanBase,
        hydrationLiters: 21,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// nutritionMealSlotSchema — per-meal kcal/macro int fields
// ---------------------------------------------------------------------------

describe("nutritionMealSlotSchema — decimal kcal/macro tolerance", () => {
  it("(a) optional fields absent → absent in result", () => {
    const result = nutritionMealSlotSchema.parse({ label: "Lunch", timingHint: null });
    expect(result.kcal).toBeUndefined();
    expect(result.proteinGrams).toBeUndefined();
  });

  it("(b) decimal values → rounded to int", () => {
    const result = nutritionMealSlotSchema.parse({
      label: "Lunch",
      timingHint: null,
      kcal: 499.7,
      proteinGrams: 33.4,
      carbsGrams: 55.6,
      fatGrams: 14.2,
    });
    expect(result.kcal).toBe(500);
    expect(result.proteinGrams).toBe(33);
    expect(result.carbsGrams).toBe(56);
    expect(result.fatGrams).toBe(14);
  });

  it("(c) valid integer inputs unchanged", () => {
    const result = nutritionMealSlotSchema.parse({
      label: "Lunch",
      timingHint: null,
      kcal: 500,
      proteinGrams: 33,
      carbsGrams: 55,
      fatGrams: 14,
    });
    expect(result.kcal).toBe(500);
    expect(result.proteinGrams).toBe(33);
  });
});

// ---------------------------------------------------------------------------
// nutritionWeekDaySchema — kcal int field
// ---------------------------------------------------------------------------

describe("nutritionWeekDaySchema.kcal — decimal tolerance", () => {
  it("(a) kcal absent → absent in result", () => {
    const result = nutritionWeekDaySchema.parse({ weekday: 1, breakfast: "Oats" });
    expect(result.kcal).toBeUndefined();
  });

  it("(b) decimal kcal → rounded to int", () => {
    const result = nutritionWeekDaySchema.parse({ weekday: 1, kcal: 1999.6 });
    expect(result.kcal).toBe(2000);
  });

  it("(c) integer kcal unchanged", () => {
    const result = nutritionWeekDaySchema.parse({ weekday: 1, kcal: 2000 });
    expect(result.kcal).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// nutritionIncidentItemSchema — decimal tolerance
// ---------------------------------------------------------------------------

describe("nutritionIncidentItemSchema — decimal macro/calorie tolerance", () => {
  it("(a) optional macro fields absent → absent in result", () => {
    const result = nutritionIncidentItemSchema.parse({ name: "Chicken breast" });
    expect(result.calories).toBeUndefined();
    expect(result.proteinGrams).toBeUndefined();
  });

  it("(b) decimal values → rounded to int", () => {
    const result = nutritionIncidentItemSchema.parse({
      name: "Chicken breast",
      calories: 184.7,
      proteinGrams: 34.9,
      carbsGrams: 0.3,
      fatGrams: 3.6,
    });
    expect(result.calories).toBe(185);
    expect(result.proteinGrams).toBe(35);
    expect(result.carbsGrams).toBe(0);
    expect(result.fatGrams).toBe(4);
  });

  it("(c) integer values unchanged", () => {
    const result = nutritionIncidentItemSchema.parse({
      name: "Chicken breast",
      calories: 185,
      proteinGrams: 35,
    });
    expect(result.calories).toBe(185);
    expect(result.proteinGrams).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// nutritionIncidentMacrosSchema — decimal tolerance
// ---------------------------------------------------------------------------

describe("nutritionIncidentMacrosSchema — decimal tolerance", () => {
  it("(b) decimal values → rounded to int", () => {
    const result = nutritionIncidentMacrosSchema.parse({
      proteinGrams: 34.9,
      carbsGrams: 72.1,
      fatGrams: 18.5,
    });
    expect(result.proteinGrams).toBe(35);
    expect(result.carbsGrams).toBe(72);
    expect(result.fatGrams).toBe(19);
  });

  it("(c) integer values unchanged", () => {
    const result = nutritionIncidentMacrosSchema.parse({
      proteinGrams: 35,
      carbsGrams: 72,
      fatGrams: 18,
    });
    expect(result.proteinGrams).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// logNutritionIncidentProposalPayloadSchema — estimatedCalories decimal
// ---------------------------------------------------------------------------

describe("logNutritionIncidentProposalPayloadSchema — estimatedCalories decimal tolerance", () => {
  const base = {
    incidentDateTime: "2026-06-11T12:30:00.000Z",
    items: [{ name: "Chicken salad", calories: 450 }],
    estimatedMacros: { proteinGrams: 35, carbsGrams: 30, fatGrams: 18 },
    confidence: "medium" as const,
    provenance: { source: "text_estimate" as const },
    imageRefs: [],
  };

  it("(b) decimal estimatedCalories → rounded to int", () => {
    const result = logNutritionIncidentProposalPayloadSchema.parse({
      ...base,
      estimatedCalories: 649.7,
    });
    expect(result.estimatedCalories).toBe(650);
  });

  it("(c) integer estimatedCalories unchanged", () => {
    const result = logNutritionIncidentProposalPayloadSchema.parse({
      ...base,
      estimatedCalories: 650,
    });
    expect(result.estimatedCalories).toBe(650);
  });
});

// ---------------------------------------------------------------------------
// workoutPlanExerciseSchema — decimal int fields
// ---------------------------------------------------------------------------

describe("workoutPlanExerciseSchema — decimal tolerance for sets/rest/calorie fields", () => {
  const baseExercise = {
    snapshot: { name: "Push-up", primaryMuscles: ["chest"], equipment: ["bodyweight"] },
    reps: "12",
  };

  it("(a) optional fields absent → absent in result", () => {
    const result = workoutPlanExerciseSchema.parse(baseExercise);
    expect(result.sets).toBeUndefined();
    expect(result.durationSeconds).toBeUndefined();
    expect(result.restBetweenSetsSeconds).toBeUndefined();
    expect(result.estimatedCalorieBurn).toBeUndefined();
  });

  it("(b) decimal sets/rest/calorie values → rounded to int", () => {
    const result = workoutPlanExerciseSchema.parse({
      ...baseExercise,
      sets: 3.7,
      durationSeconds: 44.9,
      restBetweenSetsSeconds: 89.5,
      restBetweenRepsSeconds: 10.3,
      restInsideCircuitSeconds: 29.6,
      restBetweenCircuitRoundsSeconds: 59.8,
      estimatedCalorieBurn: 74.4,
    });
    expect(result.sets).toBe(4);
    expect(result.durationSeconds).toBe(45);
    expect(result.restBetweenSetsSeconds).toBe(90);
    expect(result.restBetweenRepsSeconds).toBe(10);
    expect(result.restInsideCircuitSeconds).toBe(30);
    expect(result.restBetweenCircuitRoundsSeconds).toBe(60);
    expect(result.estimatedCalorieBurn).toBe(74);
  });

  it("(c) integer sets/rest/calorie values unchanged", () => {
    const result = workoutPlanExerciseSchema.parse({
      ...baseExercise,
      sets: 3,
      restBetweenSetsSeconds: 90,
      estimatedCalorieBurn: 75,
    });
    expect(result.sets).toBe(3);
    expect(result.restBetweenSetsSeconds).toBe(90);
    expect(result.estimatedCalorieBurn).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// workoutPlanPayloadSchema — estimatedSessionCalorieBurn / caloriePerHourRate
// ---------------------------------------------------------------------------

describe("workoutPlanPayloadSchema — decimal calorie/rate tolerance", () => {
  const minimalPlan = {
    title: "Push day",
    summary: "Chest and triceps.",
    days: [
      {
        weekday: "monday",
        focus: "Upper body",
        exercises: [
          {
            snapshot: { name: "Bench Press", primaryMuscles: ["chest"], equipment: ["barbell"] },
            sets: 3,
            reps: "8",
          },
        ],
      },
    ],
    notes: [],
  };

  it("(a) optional calorie fields absent → absent in result", () => {
    const result = workoutPlanPayloadSchema.parse(minimalPlan);
    expect(result.estimatedSessionCalorieBurn).toBeUndefined();
    expect(result.caloriePerHourRate).toBeUndefined();
  });

  it("(b) decimal calorie/rate values → rounded to int", () => {
    const result = workoutPlanPayloadSchema.parse({
      ...minimalPlan,
      estimatedSessionCalorieBurn: 349.7,
      calorieEstimateProvenance: "workout_llm",
      caloriePerHourRate: 399.4,
    });
    expect(result.estimatedSessionCalorieBurn).toBe(350);
    expect(result.caloriePerHourRate).toBe(399);
  });

  it("(c) integer calorie/rate values unchanged", () => {
    const result = workoutPlanPayloadSchema.parse({
      ...minimalPlan,
      estimatedSessionCalorieBurn: 350,
      calorieEstimateProvenance: "workout_llm",
      caloriePerHourRate: 400,
    });
    expect(result.estimatedSessionCalorieBurn).toBe(350);
    expect(result.caloriePerHourRate).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// logWorkoutActivityProposalPayloadSchema — decimal tolerance
// ---------------------------------------------------------------------------

describe("logWorkoutActivityProposalPayloadSchema — decimal tolerance", () => {
  const base = {
    activityType: "Cycling",
    title: "Evening ride",
    performedAt: "2026-06-11T18:00:00.000Z",
  };

  it("(b) decimal durationMinutes → rounded to int", () => {
    const result = logWorkoutActivityProposalPayloadSchema.parse({
      ...base,
      durationMinutes: 44.8,
      estimatedCalories: 300,
    });
    expect(result.durationMinutes).toBe(45);
  });

  it("(b) decimal estimatedCalories → rounded to int", () => {
    const result = logWorkoutActivityProposalPayloadSchema.parse({
      ...base,
      durationMinutes: 45,
      estimatedCalories: 299.6,
    });
    expect(result.estimatedCalories).toBe(300);
  });

  it("(b) decimal ratePerHour → rounded to int", () => {
    const result = logWorkoutActivityProposalPayloadSchema.parse({
      ...base,
      durationMinutes: 45,
      ratePerHour: 399.7,
    });
    expect(result.ratePerHour).toBe(400);
  });

  it("(c) integer values unchanged", () => {
    const result = logWorkoutActivityProposalPayloadSchema.parse({
      ...base,
      durationMinutes: 45,
      estimatedCalories: 300,
      ratePerHour: 400,
    });
    expect(result.durationMinutes).toBe(45);
    expect(result.estimatedCalories).toBe(300);
    expect(result.ratePerHour).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Integration: realistic nutrition candidate with nulls → stripExplicitNulls → parse succeeds
// ---------------------------------------------------------------------------

describe("nutritionPlanPayloadSchema integration: stripExplicitNulls + parse", () => {
  it("parses a realistic LLM-emitted nutrition plan payload after null stripping", () => {
    // Simulate what the LLM might emit, including null fields and decimal macros.
    const llmEmitted = {
      title: "Moderate cut plan",
      summary: "Balanced macros for a gradual deficit.",
      caloriesPerDay: 2149.8,
      proteinGrams: null,        // LLM returned null
      carbsGrams: 249.3,
      fatGrams: null,            // LLM returned null
      hydrationLiters: null,     // LLM returned null
      mealStructure: [
        {
          label: "Breakfast",
          timingHint: null,       // timingHint is nullable — but uses .default(null) already
          kcal: 499.6,
          proteinGrams: 30.1,
          carbsGrams: 60.7,
          fatGrams: null,        // optional, stripped
        },
        {
          label: "Lunch",
          timingHint: "Noon",
          kcal: 750.4,
        },
      ],
      preferences: ["High protein"],
      restrictions: [],
      allergies: [],
      notes: [],
    };

    const stripped = stripExplicitNulls(llmEmitted);
    const result = nutritionPlanPayloadSchema.parse(stripped);

    // Required-nullable fields default to null when key was stripped.
    expect(result.proteinGrams).toBeNull();
    expect(result.fatGrams).toBeNull();
    expect(result.hydrationLiters).toBeNull();

    // Decimal kcal/macros rounded.
    expect(result.caloriesPerDay).toBe(2150);
    expect(result.carbsGrams).toBe(249);

    // Per-meal decimals rounded.
    expect(result.mealStructure[0]!.kcal).toBe(500);
    expect(result.mealStructure[0]!.proteinGrams).toBe(30);
    expect(result.mealStructure[0]!.carbsGrams).toBe(61);
    expect(result.mealStructure[0]!.fatGrams).toBeUndefined(); // stripped null → optional absent

    expect(result.mealStructure[1]!.kcal).toBe(750);
  });
});
