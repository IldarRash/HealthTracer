import { describe, expect, it } from "vitest";
import type { Exercise } from "@health/types";
import { normalizeExerciseName } from "@health/types";
import {
  hasLegacyExerciseEntries,
  normalizeLegacyWorkoutPlanExercises,
  toPendingExerciseRef,
} from "./workout-exercise-normalizer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock ExercisesService that simulates the real findExerciseByNormalizedName:
 * keys in `lookup` are raw exercise names; the mock normalizes the incoming name
 * the same way ExercisesService does before looking up the catalog row.
 */
function makeExercisesService(
  lookup: Record<string, Exercise | null> = {},
): { findExerciseByNormalizedName: (name: string, userId: string) => Promise<Exercise | null> } {
  // Pre-build a normalized-key map so lookups work the same way as the real service.
  const normalizedLookup: Record<string, Exercise | null> = {};

  for (const [name, exercise] of Object.entries(lookup)) {
    normalizedLookup[normalizeExerciseName(name)] = exercise;
  }

  return {
    findExerciseByNormalizedName: async (name: string) =>
      normalizedLookup[normalizeExerciseName(name)] ?? null,
  };
}

const CATALOG_POGO_JUMP: Exercise = {
  id: "e1000001-0000-4000-8000-000000000001",
  name: "Pogo Jump",
  normalizedName: "pogo jump",
  aliases: [],
  primaryMuscles: ["calves"],
  secondaryMuscles: [],
  equipment: ["bodyweight"],
  movementPatterns: ["plyometric"],
  modalities: ["plyometrics"],
  difficulty: "intermediate",
  instructions: ["Jump repeatedly with minimal ground contact time."],
  safetyNotes: ["Land softly."],
  media: { refs: [], fallbackLabel: null },
  source: "system_seed",
  validationStatus: "validated",
  status: "active",
  userId: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const BASE_CHANGES = {
  title: "Plyometric Cardio Plan",
  summary: "High-intensity cardio training.",
  notes: [] as string[],
};

const MONDAY_DAY_LEGACY = {
  weekday: "monday" as const,
  focus: "Cardio",
  exercises: [{ name: "Pogo Jump", reps: "20", sets: 2 }],
};

// ---------------------------------------------------------------------------
// toPendingExerciseRef
// ---------------------------------------------------------------------------

describe("toPendingExerciseRef", () => {
  it("slugifies a simple name", () => {
    expect(toPendingExerciseRef("Pogo Jump")).toBe("pogo-jump");
  });

  it("removes punctuation and trims to 80 chars", () => {
    const long = "A".repeat(100);
    expect(toPendingExerciseRef(long).length).toBeLessThanOrEqual(80);
  });

  it("handles hyphenated names", () => {
    expect(toPendingExerciseRef("Band Pull-Apart")).toBe("band-pull-apart");
  });
});

// ---------------------------------------------------------------------------
// hasLegacyExerciseEntries
// ---------------------------------------------------------------------------

describe("hasLegacyExerciseEntries", () => {
  it("returns true when any day has a legacy entry", () => {
    const changes = {
      ...BASE_CHANGES,
      days: [MONDAY_DAY_LEGACY],
    };
    expect(hasLegacyExerciseEntries(changes as never)).toBe(true);
  });

  it("returns false when all exercises are structured", () => {
    const changes = {
      ...BASE_CHANGES,
      days: [
        {
          weekday: "monday" as const,
          focus: "Strength",
          exercises: [
            {
              exerciseId: "e1000001-0000-4000-8000-000000000001",
              snapshot: { name: "Goblet Squat" },
              sets: 3,
              reps: "8",
            },
          ],
        },
      ],
    };
    expect(hasLegacyExerciseEntries(changes as never)).toBe(false);
  });

  it("returns false when a day has no exercises", () => {
    const changes = {
      ...BASE_CHANGES,
      days: [{ weekday: "monday" as const, focus: "Rest", exercises: [] }],
    };
    expect(hasLegacyExerciseEntries(changes as never)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeLegacyWorkoutPlanExercises
// ---------------------------------------------------------------------------

describe("normalizeLegacyWorkoutPlanExercises", () => {
  const USER_ID = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

  it("resolves a catalog-matched exercise to exerciseId + snapshot", async () => {
    const service = makeExercisesService({ "pogo jump": CATALOG_POGO_JUMP });
    const changes = { ...BASE_CHANGES, days: [MONDAY_DAY_LEGACY] };

    const { changes: result, unmatchedNames } =
      await normalizeLegacyWorkoutPlanExercises(service as never, USER_ID, changes as never);

    const exercise = result.days[0]?.exercises[0] as Record<string, unknown>;
    expect(exercise.exerciseId).toBe(CATALOG_POGO_JUMP.id);
    expect((exercise.snapshot as { name: string }).name).toBe("Pogo Jump");
    expect(exercise.sets).toBe(2);
    expect(exercise.reps).toBe("20");
    expect(unmatchedNames).toEqual([]);
  });

  it("resolves an unmatched exercise to pendingExerciseRef with definition", async () => {
    const service = makeExercisesService({}); // no catalog matches
    const changes = {
      ...BASE_CHANGES,
      days: [{ weekday: "tuesday" as const, focus: "HIIT", exercises: [{ name: "Box Hop", sets: 3, reps: "10" }] }],
    };

    const { changes: result, unmatchedNames } =
      await normalizeLegacyWorkoutPlanExercises(service as never, USER_ID, changes as never);

    const exercise = result.days[0]?.exercises[0] as Record<string, unknown>;
    expect(exercise.pendingExerciseRef).toBe("box-hop");
    expect((exercise.snapshot as { name: string }).name).toBe("Box Hop");
    expect(exercise.sets).toBe(3);
    expect(unmatchedNames).toEqual(["Box Hop"]);

    // pendingExercises map has the definition
    expect(result.pendingExercises).toBeDefined();
    expect(result.pendingExercises!["box-hop"]).toMatchObject({
      name: "Box Hop",
      source: "ai_generated",
    });
  });

  it("carries sets/reps/notes through from legacy entry", async () => {
    const service = makeExercisesService({ "pogo jump": CATALOG_POGO_JUMP });
    const changes = {
      ...BASE_CHANGES,
      days: [
        {
          weekday: "wednesday" as const,
          focus: "Cardio",
          exercises: [{ name: "Pogo Jump", sets: 4, reps: "15", notes: "keep knees soft" }],
        },
      ],
    };

    const { changes: result } = await normalizeLegacyWorkoutPlanExercises(
      service as never,
      USER_ID,
      changes as never,
    );

    const exercise = result.days[0]?.exercises[0] as Record<string, unknown>;
    expect(exercise.sets).toBe(4);
    expect(exercise.reps).toBe("15");
    expect(exercise.notes).toBe("keep knees soft");
  });

  it("passes through already-structured exercises unchanged", async () => {
    const service = makeExercisesService({});
    const structuredEntry = {
      exerciseId: "e1000001-0000-4000-8000-000000000001",
      snapshot: { name: "Goblet Squat", primaryMuscles: ["quads"] },
      sets: 3,
      reps: "8",
    };
    const changes = {
      ...BASE_CHANGES,
      days: [{ weekday: "thursday" as const, focus: "Strength", exercises: [structuredEntry] }],
    };

    const { changes: result, unmatchedNames } = await normalizeLegacyWorkoutPlanExercises(
      service as never,
      USER_ID,
      changes as never,
    );

    expect(result.days[0]?.exercises[0]).toEqual(structuredEntry);
    expect(unmatchedNames).toEqual([]);
  });

  it("deduplicates catalog queries for the same exercise name on multiple days", async () => {
    let callCount = 0;
    const service = {
      findExerciseByNormalizedName: async (_name: string, _userId: string): Promise<Exercise | null> => {
        callCount += 1;
        return CATALOG_POGO_JUMP;
      },
    };
    const changes = {
      ...BASE_CHANGES,
      days: [
        { weekday: "monday" as const, focus: "A", exercises: [{ name: "Pogo Jump", sets: 2, reps: "10" }] },
        { weekday: "tuesday" as const, focus: "B", exercises: [{ name: "Pogo Jump", sets: 3, reps: "8" }] },
      ],
    };

    await normalizeLegacyWorkoutPlanExercises(service as never, USER_ID, changes as never);

    // Should only query once for "Pogo Jump" despite appearing on two days.
    expect(callCount).toBe(1);
  });

  it("returns changes unchanged (by reference) when no legacy entries exist", async () => {
    const service = makeExercisesService({});
    const changes = {
      ...BASE_CHANGES,
      days: [
        {
          weekday: "friday" as const,
          focus: "Strength",
          exercises: [
            { exerciseId: "e1000001-0000-4000-8000-000000000001", snapshot: { name: "Squat" }, sets: 3, reps: "5" },
          ],
        },
      ],
    };

    const { changes: result } = await normalizeLegacyWorkoutPlanExercises(
      service as never,
      USER_ID,
      changes as never,
    );

    expect(result).toBe(changes);
  });

  it("mixes catalog-matched and unmatched exercises in the same day", async () => {
    const service = makeExercisesService({ "pogo jump": CATALOG_POGO_JUMP });
    const changes = {
      ...BASE_CHANGES,
      days: [
        {
          weekday: "saturday" as const,
          focus: "Mixed",
          exercises: [
            { name: "Pogo Jump", sets: 2, reps: "20" },
            { name: "Unknown Drill", sets: 3, reps: "15" },
          ],
        },
      ],
    };

    const { changes: result, unmatchedNames } = await normalizeLegacyWorkoutPlanExercises(
      service as never,
      USER_ID,
      changes as never,
    );

    const exercises = result.days[0]?.exercises as Array<Record<string, unknown>>;
    expect(exercises[0]?.exerciseId).toBe(CATALOG_POGO_JUMP.id);
    expect(exercises[1]?.pendingExerciseRef).toBe("unknown-drill");
    expect(unmatchedNames).toEqual(["Unknown Drill"]);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: normalizeWorkoutProposalExercises via ProposalValidationService
// ---------------------------------------------------------------------------
// Tested separately in proposal-validation.service.spec.ts to keep test file focused.
