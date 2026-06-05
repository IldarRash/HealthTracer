import { deriveActivityCalories } from "@health/types";

// ---------------------------------------------------------------------------
// Stub log-activity proposal factory
// ---------------------------------------------------------------------------

/** The stub trusted calorie burn rate used for all log_workout_activity stubs. */
export const STUB_LOG_ACTIVITY_RATE = 300;

/**
 * Shared result type returned by `buildStubLogWorkoutActivityProposal`.
 * Each caller owns its own outer envelope (reply path vs domain_answer path).
 * `performedAt` is intentionally excluded — callers compute it per-call so
 * the timestamp reflects the actual invocation time.
 */
export interface StubLogActivityProposal {
  /** The proposal object ready to place in proposals[] or candidateProposals[]. */
  proposal: {
    intent: "log_workout_activity";
    targetDomain: "workout";
    title: string;
    reason: string;
    proposedChanges: {
      activityType: string;
      title: string;
      durationMinutes: number;
      /** Caller injects performedAt after calling the factory. */
      performedAt?: string;
      ratePerHour: number;
      estimatedCalories: number;
      displayContract: {
        version: number;
        title: string;
        fields: Array<{
          key: string;
          label: string;
          kind: string;
          unit: string;
          value: number;
          editable: boolean;
          min?: number;
          max?: number;
          step?: number;
        }>;
        derived: Array<{
          target: string;
          label: string;
          unit: string;
          op: string;
          inputs: string[];
          isPrimaryTotal: boolean;
        }>;
      };
    };
  };
  /** The trusted calorie rate — forwarded as workoutCaloriePerHourRate in domain_answer. */
  ratePerHour: number;
  /** Derived calorie estimate — forwarded as workoutCalorieEstimate in domain_answer. */
  estimatedCalories: number;
}

/**
 * Build the shared log_workout_activity proposal literal.
 *
 * Does NOT bake in `performedAt` — callers must set it on
 * `result.proposal.proposedChanges.performedAt` after calling this factory,
 * so the timestamp is always the actual call-time.
 *
 * Uses `deriveActivityCalories` (C9 helper) internally; no raw formula here.
 */
export function buildStubLogWorkoutActivityProposal(
  normalized: string,
  opts: {
    parseDuration: (msg: string) => number;
    parseActivityType: (msg: string) => string;
  },
): StubLogActivityProposal {
  const ratePerHour = STUB_LOG_ACTIVITY_RATE;
  const durationMinutes = opts.parseDuration(normalized);
  const activityType = opts.parseActivityType(normalized);
  const estimatedCalories = deriveActivityCalories(ratePerHour, durationMinutes);
  const titleStr = `${activityType.charAt(0).toUpperCase() + activityType.slice(1)} session`;

  return {
    ratePerHour,
    estimatedCalories,
    proposal: {
      intent: "log_workout_activity",
      targetDomain: "workout",
      title: titleStr,
      reason: `Logged from your message as an ad-hoc activity (${durationMinutes} min).`,
      proposedChanges: {
        activityType,
        title: titleStr,
        durationMinutes,
        ratePerHour,
        estimatedCalories,
        displayContract: {
          version: 1,
          title: "Activity log",
          fields: [
            {
              key: "ratePerHour",
              label: "Burn rate",
              kind: "readonly",
              unit: "kcal/hour",
              value: ratePerHour,
              editable: false,
            },
            {
              key: "durationMinutes",
              label: "Duration",
              kind: "slider",
              unit: "min",
              value: durationMinutes,
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
              inputs: ["ratePerHour", "durationMinutes"],
              isPrimaryTotal: true,
            },
          ],
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------

/** Seed fixture exercise ids from packages/db/drizzle/seeds/exercises.sql */
const STUB_EXERCISE_IDS = {
  gobletSquat: "b1000001-0000-4000-8000-000000000016",
  pushUp: "b1000001-0000-4000-8000-000000000003",
  romanianDeadlift: "b1000001-0000-4000-8000-000000000017",
  barbellRow: "b1000001-0000-4000-8000-000000000006",
  farmerCarry: "b1000001-0000-4000-8000-000000000037",
  plank: "b1000001-0000-4000-8000-000000000026",
} as const;

export const stubStructuredWorkoutPlan = {
  title: "Three day strength base",
  summary: "A simple weekly structure for consistent training.",
  days: [
    {
      weekday: "monday" as const,
      focus: "Full body strength",
      exercises: [
        {
          exerciseId: STUB_EXERCISE_IDS.gobletSquat,
          snapshot: {
            name: "Goblet Squat",
            primaryMuscles: ["quads", "glutes"],
            equipment: ["dumbbell", "kettlebell"],
          },
          sets: 3,
          reps: "8-10",
          recommendedLoadGuidance: "Choose a weight that feels challenging but controlled.",
          restBetweenSetsSeconds: 90,
        },
        {
          exerciseId: STUB_EXERCISE_IDS.pushUp,
          snapshot: {
            name: "Push-Up",
            primaryMuscles: ["chest", "triceps"],
            equipment: ["bodyweight"],
          },
          sets: 3,
          reps: "8-12",
          recommendedLoadGuidance: "Use incline or knee modification if needed.",
          restBetweenSetsSeconds: 60,
        },
      ],
    },
    {
      weekday: "wednesday" as const,
      focus: "Conditioning",
      exercises: [
        {
          exerciseId: STUB_EXERCISE_IDS.farmerCarry,
          snapshot: {
            name: "Farmer Carry",
            primaryMuscles: ["core", "forearms"],
            equipment: ["dumbbell", "kettlebell"],
          },
          sets: 3,
          durationSeconds: 45,
          recommendedLoadGuidance: "Moderate load; focus on tall posture.",
          restBetweenSetsSeconds: 60,
        },
        {
          exerciseId: STUB_EXERCISE_IDS.plank,
          snapshot: {
            name: "Plank",
            primaryMuscles: ["core"],
            equipment: ["bodyweight"],
          },
          sets: 3,
          durationSeconds: 30,
          recommendedLoadGuidance: "Hold steady breathing; stop if form breaks down.",
          restBetweenSetsSeconds: 45,
        },
      ],
    },
    {
      weekday: "friday" as const,
      focus: "Full body strength",
      exercises: [
        {
          exerciseId: STUB_EXERCISE_IDS.romanianDeadlift,
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
        {
          exerciseId: STUB_EXERCISE_IDS.barbellRow,
          snapshot: {
            name: "Barbell Row",
            primaryMuscles: ["back", "lats"],
            equipment: ["barbell"],
          },
          sets: 3,
          reps: "8-10",
          recommendedLoadGuidance: "Pull to lower ribs with a flat back.",
          restBetweenSetsSeconds: 90,
        },
      ],
    },
  ],
  notes: ["Prioritize form over load early in the program."],
};

export const stubReducedLoadWorkoutPlan = {
  title: "Three day strength base",
  summary: "Reduced working load this week while keeping the same weekly structure.",
  adaptationMetadata: {
    operations: [
      {
        operation: "reduce_load" as const,
        description: "Lower recommended load guidance on strength days.",
        weekday: "monday" as const,
      },
      {
        operation: "reduce_load" as const,
        description: "Lower recommended load guidance on the second strength day.",
        weekday: "friday" as const,
      },
    ],
  },
  days: [
    {
      weekday: "monday" as const,
      focus: "Full body strength",
      exercises: [
        {
          exerciseId: STUB_EXERCISE_IDS.gobletSquat,
          snapshot: {
            name: "Goblet Squat",
            primaryMuscles: ["quads", "glutes"],
            equipment: ["dumbbell", "kettlebell"],
          },
          sets: 3,
          reps: "8-10",
          recommendedLoadGuidance: "Use a lighter load and focus on smooth reps.",
          restBetweenSetsSeconds: 90,
        },
        {
          exerciseId: STUB_EXERCISE_IDS.pushUp,
          snapshot: {
            name: "Push-Up",
            primaryMuscles: ["chest", "triceps"],
            equipment: ["bodyweight"],
          },
          sets: 3,
          reps: "8-12",
          recommendedLoadGuidance: "Choose an easier variation if needed.",
          restBetweenSetsSeconds: 60,
        },
      ],
    },
    {
      weekday: "wednesday" as const,
      focus: "Conditioning",
      exercises: [
        {
          exerciseId: STUB_EXERCISE_IDS.farmerCarry,
          snapshot: {
            name: "Farmer Carry",
            primaryMuscles: ["core", "forearms"],
            equipment: ["dumbbell", "kettlebell"],
          },
          sets: 3,
          durationSeconds: 45,
          recommendedLoadGuidance: "Light to moderate load with tall posture.",
          restBetweenSetsSeconds: 60,
        },
        {
          exerciseId: STUB_EXERCISE_IDS.plank,
          snapshot: {
            name: "Plank",
            primaryMuscles: ["core"],
            equipment: ["bodyweight"],
          },
          sets: 2,
          durationSeconds: 30,
          recommendedLoadGuidance: "Hold steady breathing; stop if form breaks down.",
          restBetweenSetsSeconds: 45,
        },
      ],
    },
    {
      weekday: "friday" as const,
      focus: "Full body strength",
      exercises: [
        {
          exerciseId: STUB_EXERCISE_IDS.romanianDeadlift,
          snapshot: {
            name: "Romanian Deadlift",
            primaryMuscles: ["glutes", "hamstrings"],
            equipment: ["barbell", "dumbbell"],
          },
          sets: 3,
          reps: "8",
          recommendedLoadGuidance: "Use a lighter load and keep reps controlled.",
          restBetweenSetsSeconds: 120,
        },
        {
          exerciseId: STUB_EXERCISE_IDS.barbellRow,
          snapshot: {
            name: "Barbell Row",
            primaryMuscles: ["back", "lats"],
            equipment: ["barbell"],
          },
          sets: 3,
          reps: "8-10",
          recommendedLoadGuidance: "Reduce load slightly and keep a flat back.",
          restBetweenSetsSeconds: 90,
        },
      ],
    },
  ],
  notes: ["Keep effort moderate while recovery feels limited."],
};

export const stubRemoveExerciseWorkoutPlan = {
  title: "Three day strength base",
  summary: "Removed the conditioning carry to simplify this week.",
  adaptationMetadata: {
    operations: [
      {
        operation: "remove_exercise" as const,
        description: "Removed farmer carry from Wednesday conditioning.",
        weekday: "wednesday" as const,
        exerciseName: "Farmer Carry",
      },
    ],
  },
  days: [
    {
      weekday: "monday" as const,
      focus: "Full body strength",
      exercises: stubStructuredWorkoutPlan.days[0]!.exercises,
    },
    {
      weekday: "wednesday" as const,
      focus: "Conditioning",
      exercises: [stubStructuredWorkoutPlan.days[1]!.exercises[1]!],
    },
    {
      weekday: "friday" as const,
      focus: "Full body strength",
      exercises: stubStructuredWorkoutPlan.days[2]!.exercises,
    },
  ],
  notes: ["Keep the session shorter while maintaining core work."],
};

export const stubSwapExerciseWorkoutPlan = {
  title: "Three day strength base",
  summary: "Swapped barbell rows for a band-friendly pulling option on Friday.",
  adaptationMetadata: {
    operations: [
      {
        operation: "swap_exercise" as const,
        description: "Replaced barbell row with a band pull-apart alternative.",
        weekday: "friday" as const,
        exerciseName: "Barbell Row",
        replacementExerciseName: "Band Pull-Apart",
      },
    ],
  },
  pendingExercises: {
    "band-pull-apart": {
      name: "Band Pull-Apart",
      aliases: [],
      primaryMuscles: ["back", "shoulders"],
      secondaryMuscles: ["traps"],
      equipment: ["resistance_band"],
      movementPatterns: ["pull"],
      modalities: ["strength"],
      difficulty: "beginner",
      instructions: [
        "Hold a resistance band at shoulder width with arms extended.",
        "Pull the band apart by squeezing shoulder blades together.",
        "Return with control and keep ribs stacked over hips.",
      ],
      safetyNotes: [
        "Use a light band and stop if shoulder discomfort increases.",
        "Keep movement in a comfortable range without forcing extension.",
      ],
      source: "ai_generated" as const,
    },
  },
  days: [
    {
      weekday: "monday" as const,
      focus: "Full body strength",
      exercises: stubStructuredWorkoutPlan.days[0]!.exercises,
    },
    {
      weekday: "wednesday" as const,
      focus: "Conditioning",
      exercises: stubStructuredWorkoutPlan.days[1]!.exercises,
    },
    {
      weekday: "friday" as const,
      focus: "Full body strength",
      exercises: [
        stubStructuredWorkoutPlan.days[2]!.exercises[0]!,
        {
          pendingExerciseRef: "band-pull-apart",
          snapshot: {
            name: "Band Pull-Apart",
            primaryMuscles: ["back", "shoulders"],
            equipment: ["resistance_band"],
          },
          sets: 3,
          reps: "12-15",
          recommendedLoadGuidance: "Use a light band and focus on shoulder blade control.",
          restBetweenSetsSeconds: 45,
        },
      ],
    },
  ],
  notes: ["This keeps pulling work available with minimal equipment."],
};

export const stubProgressAdaptedWorkoutPlan = {
  plan: stubReducedLoadWorkoutPlan,
  sourceSummaryId: "a2000002-0000-4000-8000-000000000002",
  sourceTrendObservationIds: ["b3000003-0000-4000-8000-000000000003"],
};
