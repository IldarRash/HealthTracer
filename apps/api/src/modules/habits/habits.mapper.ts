import { habitPlanRevisions, habitPlans, habitTemplates } from "@health/db";
import {
  habitPlanPayloadSchema,
  habitScheduleSchema,
  habitTargetSchema,
  habitTemplateSchema,
  habitTemplateTargetConstraintsSchema,
  type HabitPlan,
  type HabitPlanRevision,
  type HabitTemplate,
} from "@health/types";
import { InternalServerErrorException } from "@nestjs/common";

type HabitPlanRow = typeof habitPlans.$inferSelect;
type HabitPlanRevisionRow = typeof habitPlanRevisions.$inferSelect;
type HabitTemplateRow = typeof habitTemplates.$inferSelect;

export function toHabitPlan(row: HabitPlanRow): HabitPlan {
  return {
    id: row.id,
    userId: row.userId,
    activeRevisionId: row.activeRevisionId,
    status: row.status as HabitPlan["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toHabitPlanRevision(row: HabitPlanRevisionRow): HabitPlanRevision {
  const parsedPayload = habitPlanPayloadSchema.safeParse(row.payload);

  if (!parsedPayload.success) {
    throw new InternalServerErrorException("Invalid stored habit revision payload.");
  }

  return {
    id: row.id,
    habitPlanId: row.habitPlanId,
    revisionNumber: row.revisionNumber,
    reason: row.reason,
    source: row.source,
    payload: parsedPayload.data,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toHabitTemplate(row: HabitTemplateRow): HabitTemplate {
  const parsedTarget = habitTargetSchema.safeParse(row.defaultTarget);
  const parsedConstraints = habitTemplateTargetConstraintsSchema.safeParse(row.targetConstraints);
  const parsedSchedule = habitScheduleSchema.safeParse(row.defaultSchedule);

  if (!parsedTarget.success || !parsedConstraints.success || !parsedSchedule.success) {
    throw new InternalServerErrorException("Invalid stored habit template payload.");
  }

  return habitTemplateSchema.parse({
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    defaultTarget: parsedTarget.data,
    targetConstraints: parsedConstraints.data,
    defaultSchedule: parsedSchedule.data,
    linkedSourceHint: row.linkedSourceHint,
    defaultRequired: row.defaultRequired,
    defaultTimeOfDayHint: row.defaultTimeOfDayHint,
    coachingNoteDefault: row.coachingNoteDefault,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
