import { describe, expect, it } from "vitest";
import {
  getWorkoutPlanDomainErrors,
  getWorkoutProposalDomainErrors,
  normalizeWorkoutPlanPayload,
  stripWorkoutPlanProposalExtras,
  summarizeWorkoutPlanForCoaching,
  workoutAdaptationIncreasesVolumeOrLoad,
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
});
