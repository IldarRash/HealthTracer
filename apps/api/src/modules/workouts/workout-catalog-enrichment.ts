import {
  buildExerciseCatalogMetadataFromExercise,
  buildExerciseCatalogMetadataFromSnapshot,
  isStructuredWorkoutPlanExercise,
  normalizeWorkoutSessionExercises,
  type Exercise,
  type WorkoutPlanPayload,
  type WorkoutSession,
  type WorkoutSessionExercise,
} from "@health/types";

export function indexExercisesById(exercises: readonly Exercise[]): Map<string, Exercise> {
  return new Map(exercises.map((exercise) => [exercise.id, exercise]));
}

export function enrichWorkoutPlanPayload(
  payload: WorkoutPlanPayload,
  catalogById: ReadonlyMap<string, Exercise>,
): WorkoutPlanPayload {
  return {
    ...payload,
    days: payload.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((entry) => {
        if (!isStructuredWorkoutPlanExercise(entry)) {
          return entry;
        }

        const catalogExercise = entry.exerciseId
          ? catalogById.get(entry.exerciseId)
          : undefined;

        return {
          ...entry,
          catalog: catalogExercise
            ? buildExerciseCatalogMetadataFromExercise(catalogExercise)
            : buildExerciseCatalogMetadataFromSnapshot(entry.snapshot),
        };
      }),
    })),
  };
}

export function enrichWorkoutSessionExercises(
  sessionId: string,
  exercises: WorkoutSession["exercises"],
  catalogById: ReadonlyMap<string, Exercise>,
): WorkoutSessionExercise[] {
  return normalizeWorkoutSessionExercises(sessionId, exercises).map((exercise) => {
    const catalogExercise = exercise.exerciseId
      ? catalogById.get(exercise.exerciseId)
      : undefined;

    return {
      ...exercise,
      catalog: catalogExercise
        ? buildExerciseCatalogMetadataFromExercise(catalogExercise)
        : buildExerciseCatalogMetadataFromSnapshot(exercise.prescription.snapshot),
    };
  });
}

export function collectExerciseIdsFromSessionExercises(
  exercises: readonly WorkoutSessionExercise[],
): string[] {
  const ids = exercises
    .map((exercise) => exercise.exerciseId)
    .filter((exerciseId): exerciseId is string => exerciseId != null);

  return [...new Set(ids)];
}
