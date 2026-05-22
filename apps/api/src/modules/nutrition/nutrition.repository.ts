import { nutritionPlanRevisions, nutritionPlans } from "@health/db";
import type { NutritionPlanPayload } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

@Injectable()
export class NutritionRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findActivePlanByUserId(userId: string) {
    const [plan] = await this.db
      .select()
      .from(nutritionPlans)
      .where(and(eq(nutritionPlans.userId, userId), eq(nutritionPlans.status, "active")))
      .orderBy(desc(nutritionPlans.updatedAt))
      .limit(1);

    return plan ?? null;
  }

  async findActiveRevisionByPlanId(nutritionPlanId: string, activeRevisionId: string) {
    const [revision] = await this.db
      .select()
      .from(nutritionPlanRevisions)
      .where(
        and(
          eq(nutritionPlanRevisions.id, activeRevisionId),
          eq(nutritionPlanRevisions.nutritionPlanId, nutritionPlanId),
        ),
      )
      .limit(1);

    return revision ?? null;
  }

  async listRevisionsByUserId(userId: string) {
    const rows = await this.db
      .select({ revision: nutritionPlanRevisions })
      .from(nutritionPlanRevisions)
      .innerJoin(
        nutritionPlans,
        eq(nutritionPlanRevisions.nutritionPlanId, nutritionPlans.id),
      )
      .where(eq(nutritionPlans.userId, userId))
      .orderBy(desc(nutritionPlanRevisions.createdAt));

    return rows.map((row) => row.revision);
  }

  async createPlanWithRevision(
    userId: string,
    payload: NutritionPlanPayload,
    reason: string,
    source: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(nutritionPlans)
        .values({ userId })
        .returning();

      if (!plan) {
        throw new Error("Failed to create nutrition plan.");
      }

      const [revision] = await tx
        .insert(nutritionPlanRevisions)
        .values({
          nutritionPlanId: plan.id,
          revisionNumber: 1,
          reason,
          source,
          payload,
        })
        .returning();

      if (!revision) {
        throw new Error("Failed to create nutrition plan revision.");
      }

      const [updatedPlan] = await tx
        .update(nutritionPlans)
        .set({
          activeRevisionId: revision.id,
          updatedAt: new Date(),
        })
        .where(eq(nutritionPlans.id, plan.id))
        .returning();

      return { plan: updatedPlan ?? plan, revision };
    });
  }

  async appendRevision(
    nutritionPlanId: string,
    payload: NutritionPlanPayload,
    reason: string,
    source: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [latestRevision] = await tx
        .select()
        .from(nutritionPlanRevisions)
        .where(eq(nutritionPlanRevisions.nutritionPlanId, nutritionPlanId))
        .orderBy(desc(nutritionPlanRevisions.revisionNumber))
        .limit(1);

      const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1;

      const [revision] = await tx
        .insert(nutritionPlanRevisions)
        .values({
          nutritionPlanId,
          revisionNumber,
          reason,
          source,
          payload,
        })
        .returning();

      if (!revision) {
        throw new Error("Failed to create nutrition plan revision.");
      }

      await tx
        .update(nutritionPlans)
        .set({
          activeRevisionId: revision.id,
          updatedAt: new Date(),
        })
        .where(eq(nutritionPlans.id, nutritionPlanId));

      return revision;
    });
  }
}
