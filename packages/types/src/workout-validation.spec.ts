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
  workoutExerciseSchema,
  workoutPlanExerciseSchema,
  workoutPlanPayloadSchema,
  workoutPlanProposalChangesSchema,
  workoutSessionExerciseExecutionSchema,
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

  it("accepts stored payloads with legacy object exercises (B5/B6 removal — day field and string arm gone)", () => {
    // B5 removal: `day` free-text field deleted — weekday required.
    // B6 removal: string exercise arm deleted — object form required.
    const legacy = workoutPlanPayloadSchema.parse({
      title: "Strength base",
      summary: "Legacy revision payload.",
      days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
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

  it("weekday is now required by schema — missing weekday fails parse (B5 removal)", () => {
    // B5 removal: free-text `day` field deleted; workoutPlanDaySchema now requires `weekday`.
    // A day without `weekday` will fail Zod parse before getWorkoutPlanDomainErrors is reached.
    expect(() =>
      workoutPlanPayloadSchema.parse({
        title: "Plan",
        summary: "Test.",
        days: [{ focus: "Strength", exercises: [catalogExercise] }],
        notes: [],
      }),
    ).toThrow();
  });

  it("rejects structured proposals with legacy object exercises without exerciseId (B6 removal — string arm gone)", () => {
    // B6 removal: string exercises no longer accepted; legacy object form still checked for
    // exerciseId/pendingExerciseRef when requireStructuredPlan=true.
    const errors = getWorkoutPlanDomainErrors(
      {
        ...validStructuredPayload,
        days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
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

  it("requires weekday (B5 removal — free-text day label gone)", () => {
    // B5 removal: weekday is now required; any day without it must fail parse.
    expect(() =>
      workoutPlanPayloadSchema.parse({
        title: "Invalid day",
        summary: "Missing weekday.",
        days: [{ focus: "Strength", exercises: [{ name: "Squat" }] }],
      }),
    ).toThrow();
  });
});

describe("normalizeWorkoutPlanPayload", () => {
  it("upgrades legacy object exercises to structured snapshots (B5/B6 removal)", () => {
    // B5 removal: day field gone — weekday required.
    // B6 removal: string exercises gone — object form required.
    const normalized = normalizeWorkoutPlanPayload(
      workoutPlanPayloadSchema.parse({
        title: "Strength base",
        summary: "Legacy payload.",
        days: [
          {
            weekday: "monday",
            focus: "Lower body",
            exercises: [{ name: "Squat" }, { name: "RDL", sets: 3, reps: "8" }],
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

// ---------------------------------------------------------------------------
// Phase 6: calorie-on-workout fields
// ---------------------------------------------------------------------------

describe("workoutPlanExerciseSchema — estimatedCalorieBurn", () => {
  it("accepts an exercise with a valid calorie estimate", () => {
    const exercise = workoutPlanExerciseSchema.parse({
      snapshot: { name: "Goblet Squat" },
      sets: 3,
      reps: "10",
      estimatedCalorieBurn: 120,
    });
    expect(exercise.estimatedCalorieBurn).toBe(120);
  });

  it("accepts zero as a valid calorie estimate (nonneg)", () => {
    const exercise = workoutPlanExerciseSchema.parse({
      snapshot: { name: "Stretch" },
      durationSeconds: 60,
      estimatedCalorieBurn: 0,
    });
    expect(exercise.estimatedCalorieBurn).toBe(0);
  });

  it("rejects a negative calorie estimate", () => {
    expect(() =>
      workoutPlanExerciseSchema.parse({
        snapshot: { name: "Squat" },
        sets: 3,
        reps: "8",
        estimatedCalorieBurn: -1,
      }),
    ).toThrow();
  });

  it("rejects an exercise calorie estimate exceeding 5 000 kcal", () => {
    expect(() =>
      workoutPlanExerciseSchema.parse({
        snapshot: { name: "Ultra Marathon Sprint" },
        durationSeconds: 3600,
        estimatedCalorieBurn: 5001,
      }),
    ).toThrow();
  });

  it("accepts the maximum boundary value of 5 000 kcal", () => {
    const exercise = workoutPlanExerciseSchema.parse({
      snapshot: { name: "Extreme Effort" },
      durationSeconds: 3600,
      estimatedCalorieBurn: 5000,
    });
    expect(exercise.estimatedCalorieBurn).toBe(5000);
  });
});

describe("workoutPlanPayloadSchema — estimatedSessionCalorieBurn + calorieEstimateProvenance", () => {
  it("accepts a payload without calorie fields", () => {
    const payload = workoutPlanPayloadSchema.parse({
      title: "Base plan",
      summary: "No calorie fields.",
      days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
      notes: [],
    });
    expect(payload.estimatedSessionCalorieBurn).toBeUndefined();
    expect(payload.calorieEstimateProvenance).toBeUndefined();
  });

  it("accepts a payload with both session calorie fields set", () => {
    const payload = workoutPlanPayloadSchema.parse({
      title: "Base plan",
      summary: "With calorie estimate.",
      days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
      notes: [],
      estimatedSessionCalorieBurn: 350,
      calorieEstimateProvenance: "workout_llm",
    });
    expect(payload.estimatedSessionCalorieBurn).toBe(350);
    expect(payload.calorieEstimateProvenance).toBe("workout_llm");
  });

  it("accepts user_manual provenance", () => {
    const payload = workoutPlanPayloadSchema.parse({
      title: "User plan",
      summary: "User entered calories.",
      days: [{ weekday: "tuesday", focus: "Cardio", exercises: [{ name: "Run" }] }],
      notes: [],
      estimatedSessionCalorieBurn: 500,
      calorieEstimateProvenance: "user_manual",
    });
    expect(payload.calorieEstimateProvenance).toBe("user_manual");
  });

  it("rejects a session calorie estimate exceeding 20 000 kcal", () => {
    expect(() =>
      workoutPlanPayloadSchema.parse({
        title: "Extreme",
        summary: "Way too many calories.",
        days: [{ weekday: "monday", focus: "Ultra", exercises: [{ name: "Run" }] }],
        notes: [],
        estimatedSessionCalorieBurn: 20001,
        calorieEstimateProvenance: "workout_llm",
      }),
    ).toThrow();
  });

  it("rejects a negative session calorie estimate", () => {
    expect(() =>
      workoutPlanPayloadSchema.parse({
        title: "Negative",
        summary: "Negative is invalid.",
        days: [{ weekday: "monday", focus: "Rest", exercises: [{ name: "Stretch" }] }],
        notes: [],
        estimatedSessionCalorieBurn: -10,
        calorieEstimateProvenance: "workout_llm",
      }),
    ).toThrow();
  });

  it("rejects an unknown provenance value", () => {
    expect(() =>
      workoutPlanPayloadSchema.parse({
        title: "Unknown",
        summary: "Bad provenance.",
        days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
        notes: [],
        estimatedSessionCalorieBurn: 300,
        calorieEstimateProvenance: "some_llm",
      }),
    ).toThrow();
  });
});

describe("getWorkoutProposalDomainErrors — calorie field validation", () => {
  const baseChanges = workoutPlanProposalChangesSchema.parse({
    title: "Three day plan",
    summary: "Weekly training.",
    days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
    notes: [],
  });

  it("accepts a valid workout_llm provenance with session calorie estimate", () => {
    const errors = getWorkoutProposalDomainErrors({
      ...baseChanges,
      estimatedSessionCalorieBurn: 280,
      calorieEstimateProvenance: "workout_llm",
    });
    expect(errors).toEqual([]);
  });

  it("requires calorieEstimateProvenance when estimatedSessionCalorieBurn is set", () => {
    // Build the object manually — schema-level validation does not enforce co-presence.
    const changes = {
      ...baseChanges,
      estimatedSessionCalorieBurn: 280,
      calorieEstimateProvenance: undefined,
    };
    const errors = getWorkoutProposalDomainErrors(changes as typeof baseChanges);
    expect(
      errors.some((e) => e.includes("calorieEstimateProvenance")),
    ).toBe(true);
  });

  it("requires estimatedSessionCalorieBurn when calorieEstimateProvenance is set", () => {
    const changes = {
      ...baseChanges,
      estimatedSessionCalorieBurn: undefined,
      calorieEstimateProvenance: "workout_llm" as const,
    };
    const errors = getWorkoutProposalDomainErrors(changes as typeof baseChanges);
    expect(
      errors.some((e) => e.includes("calorieEstimateProvenance")),
    ).toBe(true);
  });

  it("bounds the session calorie estimate in domain errors", () => {
    // Must pass schema parse (max is 20 000 in schema), but our domain checker
    // repeats the upper bound to give a domain-level error message.
    const changes = workoutPlanProposalChangesSchema.parse({
      ...baseChanges,
      estimatedSessionCalorieBurn: 20000,
      calorieEstimateProvenance: "workout_llm",
    });
    const errors = getWorkoutProposalDomainErrors(changes);
    // 20 000 is the schema max; no domain error expected at this boundary.
    expect(errors.some((e) => e.includes("estimatedSessionCalorieBurn"))).toBe(false);
  });

  it("accepts an exercise with a valid per-exercise calorie estimate in proposals", () => {
    const changes = workoutPlanProposalChangesSchema.parse({
      title: "Three day plan",
      summary: "Weekly training.",
      days: [
        {
          weekday: "monday",
          focus: "Strength",
          exercises: [
            {
              exerciseId: "b1000001-0000-4000-8000-000000000016",
              snapshot: { name: "Goblet Squat", primaryMuscles: ["quads"], equipment: ["dumbbell"] },
              sets: 3,
              reps: "10",
              estimatedCalorieBurn: 95,
            },
          ],
        },
      ],
      notes: [],
    });
    const errors = getWorkoutProposalDomainErrors(changes, { requireStructuredPlan: true });
    expect(errors).toEqual([]);
  });
});

describe("workoutSessionExerciseExecutionSchema — userCompletionTimeMinutes (user-set only)", () => {
  it("accepts a valid completion time", () => {
    const execution = workoutSessionExerciseExecutionSchema.parse({
      status: "completed",
      userCompletionTimeMinutes: 45,
    });
    expect(execution.userCompletionTimeMinutes).toBe(45);
  });

  it("accepts null as an explicit reset", () => {
    const execution = workoutSessionExerciseExecutionSchema.parse({
      status: "completed",
      userCompletionTimeMinutes: null,
    });
    expect(execution.userCompletionTimeMinutes).toBeNull();
  });

  it("rejects zero (must be positive)", () => {
    expect(() =>
      workoutSessionExerciseExecutionSchema.parse({
        status: "planned",
        userCompletionTimeMinutes: 0,
      }),
    ).toThrow();
  });

  it("rejects a completion time exceeding 600 minutes", () => {
    expect(() =>
      workoutSessionExerciseExecutionSchema.parse({
        status: "planned",
        userCompletionTimeMinutes: 601,
      }),
    ).toThrow();
  });

  it("accepts the maximum boundary of 600 minutes", () => {
    const execution = workoutSessionExerciseExecutionSchema.parse({
      status: "completed",
      userCompletionTimeMinutes: 600,
    });
    expect(execution.userCompletionTimeMinutes).toBe(600);
  });

  it("does not appear in workoutPlanPayloadSchema (LLM cannot set it)", () => {
    // workoutPlanPayloadSchema must not know about userCompletionTimeMinutes.
    // Parse a payload that includes it — Zod strips unknown keys by default
    // (no .strict()), so it simply won't appear in the parsed output.
    const rawInput: Record<string, unknown> = {
      title: "Plan",
      summary: "Summary.",
      days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
      notes: [],
      userCompletionTimeMinutes: 45,
    };
    const payload = workoutPlanPayloadSchema.parse(rawInput);
    expect((payload as Record<string, unknown>)["userCompletionTimeMinutes"]).toBeUndefined();
  });
});

describe("workoutExerciseSchema reps tolerance (LLM numeric reps)", () => {
  it("normalizes numeric reps to a string", () => {
    const exercise = workoutExerciseSchema.parse({ name: "Pogo Jump", sets: 2, reps: 20 });
    expect(exercise.reps).toBe("20");
  });

  it("keeps string reps as-is", () => {
    const exercise = workoutExerciseSchema.parse({ name: "Squat", reps: "8-12" });
    expect(exercise.reps).toBe("8-12");
  });

  it("a full plan payload with numeric reps parses (regression: live LLM proposal was marked invalid)", () => {
    const payload = workoutPlanPayloadSchema.parse({
      title: "Week 2",
      summary: "Stiffness and power.",
      days: [
        {
          weekday: "monday",
          focus: "Power",
          exercises: [{ name: "Pogo Jump", reps: 20, sets: 2 }],
        },
      ],
      notes: [],
    });
    const exercise = payload.days[0]!.exercises[0]! as { reps?: string | null };
    expect(exercise.reps).toBe("20");
  });
});
