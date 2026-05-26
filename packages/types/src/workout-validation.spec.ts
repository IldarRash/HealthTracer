import { describe, expect, it } from "vitest";
import {
  buildExerciseCatalogMetadataFromExercise,
  buildExerciseCatalogMetadataFromSnapshot,
  exerciseModalitySchema,
  inferExerciseModalitiesFromMovementPatterns,
  normalizeExerciseName,
} from "./exercises.js";
import {
  getResolvedWorkoutPlanCatalogErrors,
  getWorkoutPlanDomainErrors,
  getWorkoutProposalDomainErrors,
  normalizeWorkoutPlanPayload,
  stripWorkoutPlanProposalExtras,
  summarizeWorkoutPlanForCoaching,
  workoutAdaptationIncreasesVolumeOrLoad,
  updateWorkoutSessionExerciseSchema,
  workoutPlanExerciseSchema,
  workoutPlanPayloadSchema,
  workoutPlanProposalChangesSchema,
} from "./workouts.js";

const catalogExercise = workoutPlanExerciseSchema.parse({
  exerciseId: "b1000001-0000-4000-8000-000000000016",
  snapshot: {
    name: "Goblet Squat",
    primaryMuscles: ["quads", "glutes"],
    equipment: ["dumbbell", "kettlebell"],
  },
  sets: 3,
  reps: "8-10",
  recommendedLoadGuidance: "Choose a weight that feels challenging but controlled.",
  restBetweenSetsSeconds: 90,
  notes: "Keep chest tall.",
});

const validStructuredPayload = workoutPlanPayloadSchema.parse({
  title: "Three day strength base",
  summary: "A simple weekly structure for consistent training.",
  days: [
    {
      weekday: "monday",
      focus: "Full body strength",
      exercises: [catalogExercise],
    },
    {
      weekday: "wednesday",
      focus: "Conditioning",
      exercises: [
        {
          exerciseId: "b1000001-0000-4000-8000-000000000037",
          snapshot: {
            name: "Farmer Carry",
            primaryMuscles: ["core", "forearms"],
            equipment: ["dumbbell", "kettlebell"],
          },
          sets: 3,
          durationSeconds: 45,
          recommendedLoadGuidance: "Moderate load; focus on posture.",
          restBetweenSetsSeconds: 60,
        },
      ],
    },
    {
      weekday: "friday",
      focus: "Full body strength",
      exercises: [
        {
          exerciseId: "b1000001-0000-4000-8000-000000000017",
          snapshot: {
            name: "Romanian Deadlift",
            primaryMuscles: ["glutes", "hamstrings"],
            equipment: ["barbell", "dumbbell"],
          },
          sets: 3,
          reps: "8",
          recommendedLoadGuidance: "Start conservative and add load gradually.",
          restBetweenSetsSeconds: 120,
        },
      ],
    },
  ],
  notes: [],
});

describe("getWorkoutPlanDomainErrors", () => {
  it("accepts structured weekday plans with catalog exercises", () => {
    expect(
      getWorkoutPlanDomainErrors(validStructuredPayload, { requireStructuredPlan: true }),
    ).toEqual([]);
  });

  it("accepts legacy stored payloads with string exercises", () => {
    const legacy = workoutPlanPayloadSchema.parse({
      title: "Strength base",
      summary: "Legacy revision payload.",
      days: [{ day: "Day 1", focus: "Strength", exercises: ["Squat"] }],
      notes: [],
    });

    expect(getWorkoutPlanDomainErrors(legacy)).toEqual([]);
  });

  it("rejects plans without any exercises", () => {
    const errors = getWorkoutPlanDomainErrors({
      ...validStructuredPayload,
      days: [{ weekday: "monday", focus: "Rest", exercises: [] }],
    });

    expect(errors).toContain("workout: At least one plan day must include exercises.");
  });

  it("rejects duplicate weekday assignments", () => {
    const errors = getWorkoutPlanDomainErrors({
      ...validStructuredPayload,
      days: [
        { weekday: "monday", focus: "A", exercises: [catalogExercise] },
        { weekday: "monday", focus: "B", exercises: [catalogExercise] },
      ],
    });

    expect(errors).toContain("workout: Weekday assignments must be unique across plan days.");
  });

  it("rejects structured proposals missing weekday mapping", () => {
    const errors = getWorkoutPlanDomainErrors(
      {
        ...validStructuredPayload,
        days: [{ day: "Day 1", focus: "Strength", exercises: [catalogExercise] }],
      },
      { requireStructuredPlan: true },
    );

    expect(errors).toContain(
      "workout: Structured workout plans must assign a weekday (monday-sunday) to every day.",
    );
  });

  it("rejects structured proposals with legacy string exercises", () => {
    const errors = getWorkoutPlanDomainErrors(
      {
        ...validStructuredPayload,
        days: [{ weekday: "monday", focus: "Strength", exercises: ["Squat"] }],
      },
      { requireStructuredPlan: true },
    );

    expect(errors.some((error) => error.includes("structured catalog-backed exercises"))).toBe(
      true,
    );
  });

  it("rejects unsupported medical wording", () => {
    const errors = getWorkoutPlanDomainErrors({
      ...validStructuredPayload,
      summary: "Follow this clinical treatment protocol for your disorder.",
    });

    expect(errors).toContain(
      "workout: Plan copy must avoid diagnosis, treatment, or other unsupported medical wording.",
    );
  });

  it("requires prescription fields on structured exercises", () => {
    const errors = getWorkoutPlanDomainErrors(
      {
        ...validStructuredPayload,
        days: [
          {
            weekday: "monday",
            focus: "Strength",
            exercises: [
              {
                exerciseId: catalogExercise.exerciseId,
                snapshot: catalogExercise.snapshot,
              },
            ],
          },
        ],
      },
      { requireStructuredPlan: true },
    );

    expect(errors.some((error) => error.includes("sets, reps, or durationSeconds"))).toBe(true);
  });
});

describe("workoutPlanPayloadSchema boundaries", () => {
  it("rejects out-of-range prescription values", () => {
    expect(() =>
      workoutPlanExerciseSchema.parse({
        snapshot: { name: "Squat" },
        sets: 21,
        reps: "8",
      }),
    ).toThrow();

    expect(() =>
      workoutPlanExerciseSchema.parse({
        snapshot: { name: "Plank" },
        durationSeconds: 8000,
        sets: 3,
      }),
    ).toThrow();
  });

  it("requires either weekday or legacy day label", () => {
    expect(() =>
      workoutPlanPayloadSchema.parse({
        title: "Invalid day",
        summary: "Missing day label.",
        days: [{ focus: "Strength", exercises: ["Squat"] }],
      }),
    ).toThrow();
  });
});

describe("normalizeWorkoutPlanPayload", () => {
  it("upgrades legacy string exercises to structured snapshots", () => {
    const normalized = normalizeWorkoutPlanPayload(
      workoutPlanPayloadSchema.parse({
        title: "Strength base",
        summary: "Legacy payload.",
        days: [
          {
            day: "Monday",
            focus: "Lower body",
            exercises: ["Squat", { name: "RDL", sets: 3, reps: "8" }],
          },
        ],
        notes: [],
      }),
    );

    expect(normalized.days[0]?.weekday).toBe("monday");
    expect(normalized.days[0]?.exercises[0]).toMatchObject({
      snapshot: { name: "Squat" },
    });
    expect(normalized.days[0]?.exercises[1]).toMatchObject({
      snapshot: { name: "RDL" },
      sets: 3,
      reps: "8",
    });
  });
});

describe("workout proposal helpers", () => {
  it("strips proposal extras before revision persistence", () => {
    const proposal = workoutPlanProposalChangesSchema.parse({
      ...validStructuredPayload,
      adaptationMetadata: {
        operations: [
          {
            operation: "reduce_load",
            description: "Lower load on Monday.",
            weekday: "monday",
          },
        ],
      },
      pendingExercises: {
        "band-pull-apart": {
          name: "Band Pull-Apart",
          aliases: [],
          primaryMuscles: ["back"],
          secondaryMuscles: [],
          equipment: ["resistance_band"],
          movementPatterns: ["pull"],
          modalities: ["strength"],
          difficulty: "beginner",
          instructions: ["Pull with control."],
          safetyNotes: ["Use a light band."],
          source: "ai_generated",
        },
      },
    });

    expect(stripWorkoutPlanProposalExtras(proposal)).toEqual({
      ...validStructuredPayload,
      adaptationMetadata: proposal.adaptationMetadata,
    });
  });

  it("summarizes active workout plans for coaching context", () => {
    const summary = summarizeWorkoutPlanForCoaching(validStructuredPayload);

    expect(summary.title).toBe("Three day strength base");
    expect(summary.days[0]?.exercises[0]?.name).toBe("Goblet Squat");
  });

  it("validates pending exercise refs and adaptation metadata", () => {
    const errors = getWorkoutProposalDomainErrors(
      workoutPlanProposalChangesSchema.parse({
        ...validStructuredPayload,
        days: [
          {
            weekday: "monday",
            focus: "Full body strength",
            exercises: [
              {
                pendingExerciseRef: "band-pull-apart",
                snapshot: {
                  name: "Band Pull-Apart",
                  primaryMuscles: ["back"],
                  equipment: ["resistance_band"],
                },
                sets: 3,
                reps: "12",
              },
            ],
          },
        ],
      }),
      { requireStructuredPlan: true },
    );

    expect(errors.some((error) => error.includes("pendingExercises"))).toBe(true);
  });

  it("detects workout adaptations that increase volume or load", () => {
    const current = validStructuredPayload;
    const increased = workoutPlanPayloadSchema.parse({
      ...validStructuredPayload,
      days: [
        ...validStructuredPayload.days,
        {
          weekday: "friday",
          focus: "Extra conditioning",
          exercises: [catalogExercise],
        },
      ],
    });

    expect(workoutAdaptationIncreasesVolumeOrLoad(current, increased)).toBe(true);
    expect(workoutAdaptationIncreasesVolumeOrLoad(current, current)).toBe(false);
  });

  it("requires resolved exercise ids before plan apply", () => {
    const errors = getResolvedWorkoutPlanCatalogErrors({
      ...validStructuredPayload,
      days: [
        {
          weekday: "monday",
          focus: "Strength",
          exercises: [
            {
              snapshot: { name: "Missing id" },
              sets: 3,
              reps: "8",
            },
          ],
        },
      ],
    });

    expect(errors.some((error) => error.includes("must resolve to exerciseId"))).toBe(true);
  });
});

describe("updateWorkoutSessionExerciseSchema", () => {
  it("accepts bounded execution feedback fields", () => {
    expect(
      updateWorkoutSessionExerciseSchema.parse({
        status: "completed",
        perceivedEffort: 7,
        perceivedDifficulty: 6,
        discomfortFlag: true,
        notes: "Stable tempo.",
        actualReps: "8",
        actualWeightKg: 60,
        loadAdjustmentNotes: "Dropped 5 kg.",
      }),
    ).toMatchObject({
      status: "completed",
      perceivedEffort: 7,
      perceivedDifficulty: 6,
      discomfortFlag: true,
    });
  });

  it("rejects out-of-range effort and difficulty values", () => {
    expect(() =>
      updateWorkoutSessionExerciseSchema.parse({
        perceivedEffort: 11,
      }),
    ).toThrow();

    expect(() =>
      updateWorkoutSessionExerciseSchema.parse({
        perceivedDifficulty: 0,
      }),
    ).toThrow();
  });

  it("rejects empty update payloads", () => {
    expect(() => updateWorkoutSessionExerciseSchema.parse({})).toThrow(
      /At least one exercise execution field must be provided/,
    );
  });

  it("rejects notes and actuals that exceed bounded limits", () => {
    expect(() =>
      updateWorkoutSessionExerciseSchema.parse({
        notes: "x".repeat(501),
      }),
    ).toThrow();

    expect(() =>
      updateWorkoutSessionExerciseSchema.parse({
        actualWeightKg: 501,
      }),
    ).toThrow();
  });
});

describe("exercise catalog metadata helpers", () => {
  it("infers conditioning modality from cardio movement patterns", () => {
    expect(inferExerciseModalitiesFromMovementPatterns(["cardio"])).toEqual(["conditioning"]);
    expect(exerciseModalitySchema.options).toContain("yoga");
  });

  it("builds snapshot fallback metadata with media placeholder", () => {
    expect(
      buildExerciseCatalogMetadataFromSnapshot({
        name: "Legacy Squat",
        primaryMuscles: ["quads"],
        equipment: ["barbell"],
      }),
    ).toMatchObject({
      source: "snapshot",
      media: { fallbackLabel: "Demonstration coming soon" },
    });
  });

  it("builds full catalog metadata from exercise records", () => {
    expect(
      buildExerciseCatalogMetadataFromExercise({
        id: "b1000001-0000-4000-8000-000000000047",
        name: "Warrior II",
        normalizedName: normalizeExerciseName("Warrior II"),
        aliases: [],
        primaryMuscles: ["quads", "glutes"],
        secondaryMuscles: ["core"],
        equipment: ["bodyweight", "yoga_mat"],
        movementPatterns: ["lunge", "balance"],
        modalities: ["yoga", "mobility"],
        difficulty: "beginner",
        instructions: ["Hold steady gaze over front hand."],
        safetyNotes: ["Reduce depth if balance is unstable."],
        media: { refs: [], fallbackLabel: "Demonstration coming soon" },
        source: "system_seed",
        validationStatus: "validated",
        status: "active",
        userId: null,
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
      }),
    ).toMatchObject({
      source: "catalog",
      modalities: ["yoga", "mobility"],
      instructions: ["Hold steady gaze over front hand."],
    });
  });
});
