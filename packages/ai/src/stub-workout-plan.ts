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
