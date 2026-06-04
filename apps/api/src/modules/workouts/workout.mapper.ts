import { workoutPlanRevisions, workoutPlans, workoutSessions } from "@health/db";
import {
  normalizeWorkoutPlanPayload,
  workoutCompletionFeedbackSchema,
  workoutSessionExerciseEntrySchema,
  workoutPlanPayloadSchema,
  type WorkoutPlan,
  type WorkoutPlanRevision,
  type WorkoutSession,
} from "@health/types";
import { InternalServerErrorException } from "@nestjs/common";
import type { z } from "zod";

function parseStoredValue<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
  field: string,
): z.infer<TSchema> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new InternalServerErrorException(`Invalid stored workout ${field}.`);
  }

  return result.data;
}

type WorkoutPlanRow = typeof workoutPlans.$inferSelect;
type WorkoutPlanRevisionRow = typeof workoutPlanRevisions.$inferSelect;
type WorkoutSessionRow = typeof workoutSessions.$inferSelect;

export function toWorkoutPlan(row: WorkoutPlanRow): WorkoutPlan {
  return {
    id: row.id,
    userId: row.userId,
    activeRevisionId: row.activeRevisionId,
    status: row.status as WorkoutPlan["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toWorkoutPlanRevision(
  row: WorkoutPlanRevisionRow,
): WorkoutPlanRevision {
  return {
    id: row.id,
    workoutPlanId: row.workoutPlanId,
    revisionNumber: row.revisionNumber,
    reason: row.reason,
    source: row.source,
    payload: normalizeWorkoutPlanPayload(
      parseStoredValue(workoutPlanPayloadSchema, row.payload, "revision payload"),
    ),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toWorkoutSession(row: WorkoutSessionRow): WorkoutSession {
  return {
    id: row.id,
    userId: row.userId,
    workoutPlanId: row.workoutPlanId ?? null,
    workoutPlanRevisionId: row.workoutPlanRevisionId ?? null,
    plannedDate: row.plannedDate,
    title: row.title,
    status: row.status as WorkoutSession["status"],
    source: (row.source ?? "planned") as WorkoutSession["source"],
    activityType: row.activityType ?? null,
    estimatedCalories: row.estimatedCalories ?? null,
    exercises: parseStoredValue(
      workoutSessionExerciseEntrySchema.array(),
      row.exercises,
      "session exercises",
    ),
    feedback: parseStoredValue(
      workoutCompletionFeedbackSchema,
      row.feedback,
      "session feedback",
    ),
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
