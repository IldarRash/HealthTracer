import { nutritionPlanRevisions, nutritionPlans } from "@health/db";
import {
  nutritionPlanPayloadSchema,
  type NutritionPlan,
  type NutritionPlanRevision,
} from "@health/types";
import { InternalServerErrorException } from "@nestjs/common";

type NutritionPlanRow = typeof nutritionPlans.$inferSelect;
type NutritionPlanRevisionRow = typeof nutritionPlanRevisions.$inferSelect;

export function toNutritionPlan(row: NutritionPlanRow): NutritionPlan {
  return {
    id: row.id,
    userId: row.userId,
    activeRevisionId: row.activeRevisionId,
    status: row.status as NutritionPlan["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toNutritionPlanRevision(
  row: NutritionPlanRevisionRow,
): NutritionPlanRevision {
  const parsedPayload = nutritionPlanPayloadSchema.safeParse(row.payload);

  if (!parsedPayload.success) {
    throw new InternalServerErrorException("Invalid stored nutrition revision payload.");
  }

  return {
    id: row.id,
    nutritionPlanId: row.nutritionPlanId,
    revisionNumber: row.revisionNumber,
    reason: row.reason,
    source: row.source,
    payload: parsedPayload.data,
    createdAt: row.createdAt.toISOString(),
  };
}
