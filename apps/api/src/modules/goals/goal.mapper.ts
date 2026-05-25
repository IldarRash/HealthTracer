import { goals } from "@health/db";
import type { Goal } from "@health/types";

type GoalRow = typeof goals.$inferSelect;

export function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    status: row.status,
    priority: row.priority,
    title: row.title,
    target: row.target,
    horizon: row.horizon,
    parentGoalId: row.parentGoalId,
    weekStart: row.weekStart,
    startDate: row.startDate,
    targetDate: row.targetDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
