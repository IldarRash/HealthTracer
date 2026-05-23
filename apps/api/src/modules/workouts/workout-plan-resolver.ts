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
  const resolvedRefs = new Map<string, string>();
  const plan = stripWorkoutPlanProposalExtras(changes);

  const resolvedDays = await Promise.all(
    plan.days.map(async (day) => ({
      ...day,
      exercises: await Promise.all(
        day.exercises.map(async (entry) => {
          if (!isStructuredWorkoutPlanExercise(entry) || !entry.pendingExerciseRef) {
            return entry;
          }

          const ref = entry.pendingExerciseRef;
          let exerciseId = resolvedRefs.get(ref);

          if (!exerciseId) {
            const definition = pendingExercises[ref];

            if (!definition) {
              throw new BadRequestException(
                `Pending exercise definition "${ref}" was not found in the proposal.`,
              );
            }

            const created = await exercisesService.findOrCreateExercise({
              ...definition,
              userId,
            });
            exerciseId = created.id;
            resolvedRefs.set(ref, exerciseId);
          }

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
