import { nutritionAdherence, nutritionPlanRevisions, nutritionPlans } from "@health/db";
import type { NutritionPlanPayload, UpsertNutritionAdherenceInput } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";
import {
  adherenceStateToRowValues,
  mergeAdherenceInput,
} from "./nutrition.mapper.js";

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

  async findRevisionOwnedByUser(userId: string, revisionId: string) {
    const [row] = await this.db
      .select({ revision: nutritionPlanRevisions })
      .from(nutritionPlanRevisions)
      .innerJoin(
        nutritionPlans,
        eq(nutritionPlanRevisions.nutritionPlanId, nutritionPlans.id),
      )
      .where(
        and(
          eq(nutritionPlanRevisions.id, revisionId),
          eq(nutritionPlans.userId, userId),
        ),
      )
      .limit(1);

    return row?.revision ?? null;
  }

  async findAdherenceByUserIdAndDate(userId: string, date: string) {
    const [row] = await this.db
      .select()
      .from(nutritionAdherence)
      .where(and(eq(nutritionAdherence.userId, userId), eq(nutritionAdherence.date, date)))
      .limit(1);

    return row ?? null;
  }

  async upsertAdherenceByUserIdAndDate(
    userId: string,
    date: string,
    input: UpsertNutritionAdherenceInput,
  ) {
    const merged = mergeAdherenceInput(date, null, input);
    const values = adherenceStateToRowValues(merged);

    const [row] = await this.db
      .insert(nutritionAdherence)
      .values({
        userId,
        date,
        ...values,
      })
      .onConflictDoUpdate({
        target: [nutritionAdherence.userId, nutritionAdherence.date],
        set: buildAdherenceConflictSet(input),
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert nutrition adherence.");
    }

    return row;
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

type AdherenceConflictSet = {
  hydrationLitersConsumed: number | null | SQL;
  mealCompletion: unknown[] | SQL;
  targetCompletion: Record<string, unknown> | SQL;
  notes: string[] | SQL;
  updatedAt: Date;
};

export function buildAdherenceConflictSet(
  input: UpsertNutritionAdherenceInput,
): AdherenceConflictSet {
  const set: AdherenceConflictSet = {
    updatedAt: new Date(),
    hydrationLitersConsumed: sql`${nutritionAdherence.hydrationLitersConsumed}`,
    mealCompletion: sql`${nutritionAdherence.mealCompletion}`,
    targetCompletion: sql`${nutritionAdherence.targetCompletion}`,
    notes: sql`${nutritionAdherence.notes}`,
  };

  if (input.hydrationLitersConsumed !== undefined) {
    set.hydrationLitersConsumed = input.hydrationLitersConsumed;
  }

  if (input.mealCompletion !== undefined) {
    set.mealCompletion = input.mealCompletion;
  }

  if (input.targetCompletion !== undefined) {
    set.targetCompletion = sql`${nutritionAdherence.targetCompletion} || ${JSON.stringify(input.targetCompletion)}::jsonb`;
  }

  if (input.notes !== undefined) {
    set.notes = input.notes;
  }

  return set;
}
