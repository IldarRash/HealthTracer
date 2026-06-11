/**
 * workout-exercise-normalizer.ts
 *
 * Bridges legacy name-only LLM exercise entries into the structured catalog-backed
 * form required by proposal validation (`requireStructuredPlan: true`).
 *
 * Runs BEFORE proposal validation so validation sees structured entries.
 * Preserves the domain invariant: catalog-backed is the product requirement.
 * Bridges, does not relax.
 *
 * Resolution strategy per entry:
 *  - Exact normalized-name match in catalog → exerciseId + snapshot from catalog row.
 *  - No match → pendingExerciseRef (stable slug) + minimal pendingExercises definition
 *    so `resolveWorkoutPlanProposalForApply` can create the catalog row on accept.
 */

import {
  isLegacyWorkoutPlanExerciseObject,
  isStructuredWorkoutPlanExercise,
  normalizeExerciseName,
  type Exercise,
  type PendingExerciseDefinition,
  type WorkoutPlanExerciseEntry,
  type WorkoutPlanProposalChanges,
} from "@health/types";
import type { ExercisesService } from "../exercises/exercises.service.js";

export interface NormalizeLegacyExercisesResult {
  /** Updated changes — legacy entries replaced with structured ones. */
  changes: WorkoutPlanProposalChanges;
  /**
   * Names that had no catalog match and were emitted as pendingExerciseRef entries.
   * Informational — apply path will call findOrCreateExercise on accept.
   */
  unmatchedNames: string[];
}

/**
 * Normalize all legacy `{name, reps, sets}` exercise entries in a
 * create_workout_plan / adapt_workout_plan proposedChanges payload to the
 * structured catalog-backed form.
 *
 * Already-structured entries (have `snapshot`) are passed through unchanged.
 *
 * Catalog lookup is by normalized name only (equipment/muscles unknown from
 * name-only LLM output) — system-catalog rows are preferred over user-created rows.
 *
 * Returns the mutated changes and a list of unmatched names for logging.
 */
export async function normalizeLegacyWorkoutPlanExercises(
  exercisesService: ExercisesService,
  userId: string,
  changes: WorkoutPlanProposalChanges,
): Promise<NormalizeLegacyExercisesResult> {
  // Collect unique unresolved names to avoid duplicate catalog queries.
  const uniqueNames = new Set<string>();

  for (const day of changes.days) {
    for (const entry of day.exercises) {
      if (isLegacyWorkoutPlanExerciseObject(entry)) {
        uniqueNames.add(entry.name);
      }
    }
  }

  if (uniqueNames.size === 0) {
    return { changes, unmatchedNames: [] };
  }

  // Resolve all unique names in parallel.
  const catalogByName = new Map<string, Exercise | null>();
  await Promise.all(
    [...uniqueNames].map(async (name) => {
      const exercise = await exercisesService.findExerciseByNormalizedName(name, userId);
      catalogByName.set(name, exercise);
    }),
  );

  // Build updated pendingExercises, merging with any already present.
  const updatedPendingExercises: Record<string, PendingExerciseDefinition> = {
    ...(changes.pendingExercises ?? {}),
  };
  const unmatchedNames: string[] = [];

  for (const name of uniqueNames) {
    const found = catalogByName.get(name);

    if (!found) {
      unmatchedNames.push(name);
      const ref = toPendingExerciseRef(name);

      if (!updatedPendingExercises[ref]) {
        updatedPendingExercises[ref] = buildMinimalPendingDefinition(name);
      }
    }
  }

  // Rebuild days with structured entries.
  const updatedDays = changes.days.map((day) => ({
    ...day,
    exercises: day.exercises.map((entry): WorkoutPlanExerciseEntry => {
      if (!isLegacyWorkoutPlanExerciseObject(entry)) {
        // Already structured — pass through.
        return entry;
      }

      const found = catalogByName.get(entry.name);

      if (found) {
        // Catalog hit: emit exerciseId + snapshot from catalog.
        return {
          exerciseId: found.id,
          snapshot: {
            name: found.name,
            primaryMuscles:
              found.primaryMuscles.length > 0 ? found.primaryMuscles : undefined,
            secondaryMuscles:
              found.secondaryMuscles.length > 0 ? found.secondaryMuscles : undefined,
            equipment: found.equipment.length > 0 ? found.equipment : undefined,
          },
          sets: entry.sets ?? null,
          reps: entry.reps ?? null,
          notes: entry.notes ?? null,
          recommendedLoadGuidance: entry.target ?? null,
        };
      }

      // No catalog match: emit pendingExerciseRef so apply creates the row.
      const ref = toPendingExerciseRef(entry.name);

      return {
        pendingExerciseRef: ref,
        snapshot: { name: entry.name },
        sets: entry.sets ?? null,
        reps: entry.reps ?? null,
        notes: entry.notes ?? null,
        recommendedLoadGuidance: entry.target ?? null,
      };
    }),
  }));

  const updatedChanges: WorkoutPlanProposalChanges = {
    ...changes,
    days: updatedDays,
    pendingExercises:
      Object.keys(updatedPendingExercises).length > 0 ? updatedPendingExercises : undefined,
  };

  return { changes: updatedChanges, unmatchedNames };
}

/**
 * Derive a stable, schema-safe slug for pendingExerciseRef from an exercise name.
 * Must be ≤80 chars and unique enough within a plan.
 */
export function toPendingExerciseRef(name: string): string {
  return normalizeExerciseName(name)
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}

/**
 * Build a minimal PendingExerciseDefinition for an exercise whose name the catalog
 * does not contain.  The apply path (`resolveWorkoutPlanProposalForApply`) calls
 * `findOrCreateExercise` with this definition, which inserts a pending_validation
 * ai_generated catalog row.  Required fields are set to safe defaults; the row
 * will be enriched later through manual review / AI enrichment.
 */
function buildMinimalPendingDefinition(name: string): PendingExerciseDefinition {
  return {
    name,
    aliases: [],
    // "bodyweight" is the safest default — avoids implying equipment the user lacks.
    primaryMuscles: ["core"],
    secondaryMuscles: [],
    equipment: ["bodyweight"],
    movementPatterns: ["isolation"],
    modalities: ["strength"],
    difficulty: "beginner",
    instructions: [`Perform ${name} with proper form.`],
    safetyNotes: ["Use appropriate weight and technique."],
    source: "ai_generated",
  };
}

/**
 * Returns true when all exercises in the given changes payload are already
 * in the structured catalog-backed form (no legacy {name,...} entries).
 * Used to short-circuit normalization when not needed.
 */
export function hasLegacyExerciseEntries(changes: WorkoutPlanProposalChanges): boolean {
  return changes.days.some((day) =>
    day.exercises.some(
      (entry) =>
        !isStructuredWorkoutPlanExercise(entry),
    ),
  );
}
