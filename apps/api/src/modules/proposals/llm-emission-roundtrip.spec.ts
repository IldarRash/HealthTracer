/**
 * LLM emission → canonical proposal round-trip pins (drift guard).
 *
 * For every intent covered by the LLM emission schemas
 * (packages/types/src/llm-emission), a realistic emission-shaped sample —
 * exactly what a domain LLM may emit under the strict domain-step wire
 * schema, including explicit nulls for optional fields — must:
 *
 *   1. parse against its emission schema (sample validity),
 *   2. survive the provider's stripExplicitNulls pass,
 *   3. flow through ProposalNormalizationService.normalizeProposal, and
 *   4. parse against the canonical proposal payload schema
 *      (getProposedChangesSchemaForIntent).
 *
 * If an emission schema and its canonical counterpart (or the normalizer
 * bridge between them) ever drift apart, these pins fail.
 */

import { describe, expect, it, vi } from "vitest";
import {
  LLM_EMISSION_PAYLOAD_SCHEMAS,
  getProposedChangesSchemaForIntent,
  getWorkoutProposalDomainErrors,
  isStructuredWorkoutPlanExercise,
  type AdaptWorkoutPlanFromProgressChanges,
  type LlmEmissionCoveredIntent,
  type LogNutritionIncidentProposalPayload,
  type ProposalIntent,
  type WorkoutPlanProposalChanges,
} from "@health/types";
import { stripExplicitNulls } from "../ai/openai-http.js";
import {
  ProposalNormalizationService,
  type ProposalNormalizationContext,
} from "./proposal-normalization.service.js";

const USER_ID = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const NOW_ISO = "2026-06-12T10:00:00.000Z";
const IMAGE_ATTACHMENT_ID = "aa345678-90ab-4cde-8f01-234567890abc";
const RECIPE_ID = "bb345678-90ab-4cde-8f01-234567890abc";

const CATALOG_EXERCISE = {
  id: "e1000001-0000-4000-8000-000000000001",
  name: "Bench Press",
  normalizedName: "bench press",
  aliases: [],
  primaryMuscles: ["chest"],
  secondaryMuscles: ["triceps"],
  equipment: ["barbell"],
  movementPatterns: ["push"],
  modalities: ["strength"],
  difficulty: "intermediate",
  instructions: ["Press."],
  safetyNotes: ["Use a spotter."],
  media: { refs: [], fallbackLabel: null },
  source: "system_seed",
  validationStatus: "validated",
  status: "active",
  userId: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

/** Catalog stub: "Bench Press" resolves, everything else is a catalog miss. */
function createService(): ProposalNormalizationService {
  const exercisesService = {
    findExerciseByNormalizedName: vi.fn(async (name: string) =>
      name.toLowerCase() === "bench press" ? CATALOG_EXERCISE : null,
    ),
  };

  return new ProposalNormalizationService(exercisesService as never);
}

function createContext(
  overrides: Partial<ProposalNormalizationContext> = {},
): ProposalNormalizationContext {
  return { userId: USER_ID, nowIso: NOW_ISO, turnAttachments: [], ...overrides };
}

/** Emission-shaped sample → strip nulls → normalize → canonical parse. */
async function roundTrip(
  intent: LlmEmissionCoveredIntent,
  emissionSample: unknown,
  ctx: ProposalNormalizationContext = createContext(),
): Promise<unknown> {
  // 1. Sample is valid against the emission schema itself.
  LLM_EMISSION_PAYLOAD_SCHEMAS[intent].parse(emissionSample);

  // 2-3. Provider null stripping, then the per-intent normalizer bridge.
  const stripped = stripExplicitNulls(emissionSample);
  const normalized = await createService().normalizeProposal(
    intent as ProposalIntent,
    stripped,
    ctx,
  );

  // 4. Canonical contract parse — the drift guard.
  return getProposedChangesSchemaForIntent(intent as ProposalIntent).parse(normalized);
}

// ---------------------------------------------------------------------------
// Emission-shaped samples (explicit nulls, exactly as the strict wire allows)
// ---------------------------------------------------------------------------

const workoutPlanEmissionSample = {
  title: "3-Day Strength Plan",
  summary: "Full-body strength program with progressive overload",
  days: [
    {
      weekday: "monday",
      focus: "Upper body push",
      exercises: [
        { name: "Bench Press", target: null, sets: 4, reps: "8-10", notes: null },
        { name: "Quantum Press", target: "shoulders", sets: 3, reps: 12, notes: null },
      ],
    },
  ],
  notes: [],
  displayContract: null,
};

const logWorkoutActivityEmissionSample = {
  activityType: "volleyball",
  title: "Volleyball session",
  durationMinutes: 90,
  intensity: "moderate",
  performedAt: "2026-06-05T16:00:00.000Z",
  estimatedCalories: null,
  ratePerHour: 400,
  displayContract: {
    version: 1,
    title: "Volleyball session",
    fields: [
      {
        key: "caloriePerHourRate",
        label: "Burn rate",
        kind: "readonly",
        unit: "kcal/hour",
        value: 400,
        textValue: null,
        min: null,
        max: null,
        step: null,
        editable: false,
      },
      {
        key: "durationMinutes",
        label: "Duration",
        kind: "slider",
        unit: "min",
        value: 60,
        textValue: null,
        min: 1,
        max: 600,
        step: 5,
        editable: true,
      },
    ],
    derived: [
      {
        target: "totalCalories",
        label: "Estimated calories",
        unit: "kcal",
        op: "rate_per_hour",
        inputs: ["caloriePerHourRate", "durationMinutes"],
        isPrimaryTotal: true,
      },
    ],
  },
};

const nutritionIncidentEmissionSample = {
  items: [
    {
      name: "Chicken breast",
      quantity: "200g",
      calories: 330,
      proteinGrams: 62,
      carbsGrams: 0,
      fatGrams: 7,
    },
  ],
  estimatedCalories: 330,
  estimatedMacros: { proteinGrams: 62, carbsGrams: 0, fatGrams: 7 },
  confidence: "medium",
  mealContextLabel: null,
};

const nutritionPlanEmissionSample = {
  title: "Balanced Nutrition Plan",
  summary: "High-protein plan targeting fat loss",
  caloriesPerDay: 2000,
  proteinGrams: 160,
  carbsGrams: 200,
  fatGrams: 65,
  hydrationLiters: 2.5,
  mealStructure: [
    {
      label: "Breakfast",
      timingHint: "7-9 AM",
      kcal: 500,
      proteinGrams: 40,
      carbsGrams: 50,
      fatGrams: 15,
      mealTime: "08:00",
      dish: "Oats with eggs",
      ingredients: [{ name: "Oats", quantity: 80, unit: "g", notes: null }],
    },
  ],
  preferences: [],
  restrictions: [],
  allergies: [],
  notes: [],
  weeklyPlan: null,
};

describe("LLM emission → canonical round-trip pins", () => {
  it("create_workout_plan: name-only exercises bridge to a fully structured catalog-backed plan", async () => {
    const canonical = (await roundTrip(
      "create_workout_plan",
      workoutPlanEmissionSample,
    )) as WorkoutPlanProposalChanges;

    const exercises = canonical.days[0]!.exercises;
    expect(exercises).toHaveLength(2);
    expect(exercises.every(isStructuredWorkoutPlanExercise)).toBe(true);

    // Catalog hit → exerciseId; miss → pendingExerciseRef with a definition.
    const [hit, miss] = exercises.filter(isStructuredWorkoutPlanExercise);
    expect(hit!.exerciseId).toBe(CATALOG_EXERCISE.id);
    expect(miss!.pendingExerciseRef).toBeTruthy();
    expect(canonical.pendingExercises?.[miss!.pendingExerciseRef!]).toBeTruthy();

    // The bridged plan satisfies the structured-plan domain rules.
    expect(
      getWorkoutProposalDomainErrors(canonical, { requireStructuredPlan: true }),
    ).toEqual([]);
  });

  it("adapt_workout_plan: same payload round-trips through the same bridge", async () => {
    const canonical = (await roundTrip(
      "adapt_workout_plan",
      workoutPlanEmissionSample,
    )) as WorkoutPlanProposalChanges;

    expect(canonical.days[0]!.exercises.every(isStructuredWorkoutPlanExercise)).toBe(true);
  });

  it("adapt_workout_plan_from_progress: the nested plan is bridged inside the wrapper", async () => {
    const emissionSample = {
      plan: workoutPlanEmissionSample,
      sourceSummaryId: null,
      sourceTrendObservationIds: [],
      allowVolumeIncrease: null,
    };

    const canonical = (await roundTrip(
      "adapt_workout_plan_from_progress",
      emissionSample,
    )) as AdaptWorkoutPlanFromProgressChanges;

    expect(canonical.plan.days[0]!.exercises.every(isStructuredWorkoutPlanExercise)).toBe(
      true,
    );
    expect(
      getWorkoutProposalDomainErrors(canonical.plan, { requireStructuredPlan: true }),
    ).toEqual([]);
  });

  it("log_workout_activity: passes through with the display contract intact", async () => {
    const canonical = (await roundTrip(
      "log_workout_activity",
      logWorkoutActivityEmissionSample,
    )) as { ratePerHour?: number; displayContract?: unknown };

    expect(canonical.ratePerHour).toBe(400);
    expect(canonical.displayContract).toBeTruthy();
  });

  it("log_nutrition_incident (no images): server stamps incidentDateTime + text_estimate provenance", async () => {
    const canonical = (await roundTrip(
      "log_nutrition_incident",
      nutritionIncidentEmissionSample,
    )) as LogNutritionIncidentProposalPayload;

    expect(canonical.incidentDateTime).toBe(NOW_ISO);
    expect(canonical.provenance.source).toBe("text_estimate");
    expect(canonical.imageRefs).toEqual([]);
  });

  it("log_nutrition_incident (with image): server stamps vision provenance + trusted imageRefs", async () => {
    const canonical = (await roundTrip(
      "log_nutrition_incident",
      nutritionIncidentEmissionSample,
      createContext({
        turnAttachments: [
          { id: IMAGE_ATTACHMENT_ID, mimeType: "image/jpeg", category: "unclassified" },
        ],
      }),
    )) as LogNutritionIncidentProposalPayload;

    expect(canonical.provenance.source).toBe("vision_llm_estimate");
    expect(canonical.imageRefs).toEqual([{ id: IMAGE_ATTACHMENT_ID }]);
  });

  it("create_nutrition_plan: plan payload round-trips unchanged", async () => {
    const canonical = (await roundTrip(
      "create_nutrition_plan",
      nutritionPlanEmissionSample,
    )) as { caloriesPerDay: number | null; mealStructure: unknown[] };

    expect(canonical.caloriesPerDay).toBe(2000);
    expect(canonical.mealStructure).toHaveLength(1);
  });

  it("adjust_nutrition_plan: the plan-payload union arm round-trips", async () => {
    await expect(
      roundTrip("adjust_nutrition_plan", nutritionPlanEmissionSample),
    ).resolves.toBeTruthy();
  });

  it("recommend_recipes: catalog-sourced recipe ids round-trip", async () => {
    const emissionSample = {
      relatedNutritionPlanRevisionId: null,
      recommendations: [
        {
          recipeId: RECIPE_ID,
          reason: "High protein, fits your calorie target",
          fitSummary: "Matches the dinner slot of your plan",
        },
      ],
    };

    await expect(roundTrip("recommend_recipes", emissionSample)).resolves.toBeTruthy();
  });

  it("capture_wellbeing_checkin: scores and tags round-trip (safetyFlags never emitted)", async () => {
    const emissionSample = {
      date: "2026-06-12",
      moodScore: 2,
      stressScore: 4,
      energyLevel: 2,
      note: "Feeling drained after work",
      tags: ["fatigue"],
    };

    const canonical = (await roundTrip("capture_wellbeing_checkin", emissionSample)) as {
      safetyFlags?: unknown;
      moodScore: number;
    };

    expect(canonical.moodScore).toBe(2);
    expect(canonical.safetyFlags).toBeUndefined();
  });
});
