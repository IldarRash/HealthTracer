import {
  buildExerciseDisplaySnapshotFromInput,
  isStructuredWorkoutPlanExercise,
  stripWorkoutPlanProposalExtras,
  type PendingExerciseDefinition,
  type WorkoutPlanPayload,
  type WorkoutPlanProposalChanges,
} from "@health/types";
import { BadRequestException } from "@nestjs/common";
import type { ExercisesService } from "../exercises/exercises.service.js";

export async function resolveWorkoutPlanProposalForApply(
  exercisesService: ExercisesService,
  userId: string,
  changes: WorkoutPlanProposalChanges,
): Promise<WorkoutPlanPayload> {
  const pendingExercises = changes.pendingExercises ?? {};
  // Promise-cached per-ref resolution: days (and entries within a day) resolve
  // concurrently, so the cache stores the in-flight promise. A ref repeated
  // across days therefore triggers exactly one findOrCreateExercise call and
  // every entry shares the same catalog exerciseId.
  const resolvedRefs = new Map<string, Promise<string>>();
  const plan = stripWorkoutPlanProposalExtras(changes);

  const resolveRef = (ref: string): Promise<string> => {
    const cached = resolvedRefs.get(ref);

    if (cached) {
      return cached;
    }

    const definition = pendingExercises[ref];

    if (!definition) {
      throw new BadRequestException(
        `Pending exercise definition "${ref}" was not found in the proposal.`,
      );
    }

    const promise = exercisesService
      .findOrCreateExercise({
        ...definition,
        userId,
      })
      .then((created) => created.id);

    resolvedRefs.set(ref, promise);

    return promise;
  };

  const resolvedDays = await Promise.all(
    plan.days.map(async (day) => ({
      ...day,
      exercises: await Promise.all(
        day.exercises.map(async (entry) => {
          if (!isStructuredWorkoutPlanExercise(entry) || !entry.pendingExerciseRef) {
            return entry;
          }

          const ref = entry.pendingExerciseRef;
          const exerciseId = await resolveRef(ref);
          const definition = pendingExercises[ref] as PendingExerciseDefinition;

          return {
            ...entry,
            exerciseId,
            pendingExerciseRef: undefined,
            snapshot: buildExerciseDisplaySnapshotFromInput(definition),
          };
        }),
      ),
    })),
  );

  return {
    ...plan,
    days: resolvedDays,
  };
}
