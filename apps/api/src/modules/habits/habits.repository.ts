import { habitCompletions, habitPlanRevisions, habitPlans, habitTemplates } from "@health/db";
import type { HabitCompletionStatus, HabitPlanPayload } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

@Injectable()
export class HabitsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findActivePlanByUserId(userId: string) {
    const [plan] = await this.db
      .select()
      .from(habitPlans)
      .where(and(eq(habitPlans.userId, userId), eq(habitPlans.status, "active")))
      .orderBy(desc(habitPlans.updatedAt))
      .limit(1);

    return plan ?? null;
  }

  async findActiveRevisionByPlanId(habitPlanId: string, activeRevisionId: string) {
    const [revision] = await this.db
      .select()
      .from(habitPlanRevisions)
      .where(
        and(
          eq(habitPlanRevisions.id, activeRevisionId),
          eq(habitPlanRevisions.habitPlanId, habitPlanId),
        ),
      )
      .limit(1);

    return revision ?? null;
  }

  async listRevisionsByUserId(userId: string) {
    const rows = await this.db
      .select({ revision: habitPlanRevisions })
      .from(habitPlanRevisions)
      .innerJoin(habitPlans, eq(habitPlanRevisions.habitPlanId, habitPlans.id))
      .where(eq(habitPlans.userId, userId))
      .orderBy(desc(habitPlanRevisions.createdAt));

    return rows.map((row) => row.revision);
  }

  async findRevisionOwnedByUser(userId: string, revisionId: string) {
    const [row] = await this.db
      .select({ revision: habitPlanRevisions })
      .from(habitPlanRevisions)
      .innerJoin(habitPlans, eq(habitPlanRevisions.habitPlanId, habitPlans.id))
      .where(and(eq(habitPlanRevisions.id, revisionId), eq(habitPlans.userId, userId)))
      .limit(1);

    return row?.revision ?? null;
  }

  async createPlanWithRevision(
    userId: string,
    payload: HabitPlanPayload,
    reason: string,
    source: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [plan] = await tx.insert(habitPlans).values({ userId }).returning();

      if (!plan) {
        throw new Error("Failed to create habit plan.");
      }

      const [revision] = await tx
        .insert(habitPlanRevisions)
        .values({
          habitPlanId: plan.id,
          revisionNumber: 1,
          reason,
          source,
          payload,
        })
        .returning();

      if (!revision) {
        throw new Error("Failed to create habit plan revision.");
      }

      const [updatedPlan] = await tx
        .update(habitPlans)
        .set({
          activeRevisionId: revision.id,
          updatedAt: new Date(),
        })
        .where(eq(habitPlans.id, plan.id))
        .returning();

      return { plan: updatedPlan ?? plan, revision };
    });
  }

  async appendRevision(
    habitPlanId: string,
    payload: HabitPlanPayload,
    reason: string,
    source: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [latestRevision] = await tx
        .select()
        .from(habitPlanRevisions)
        .where(eq(habitPlanRevisions.habitPlanId, habitPlanId))
        .orderBy(desc(habitPlanRevisions.revisionNumber))
        .limit(1);

      const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1;

      const [revision] = await tx
        .insert(habitPlanRevisions)
        .values({
          habitPlanId,
          revisionNumber,
          reason,
          source,
          payload,
        })
        .returning();

      if (!revision) {
        throw new Error("Failed to create habit plan revision.");
      }

      await tx
        .update(habitPlans)
        .set({
          activeRevisionId: revision.id,
          updatedAt: new Date(),
        })
        .where(eq(habitPlans.id, habitPlanId));

      return revision;
    });
  }

  async listCompletionsInDateRange(userId: string, startDate: string, endDate: string) {
    return this.db
      .select()
      .from(habitCompletions)
      .where(
        and(
          eq(habitCompletions.userId, userId),
          gte(habitCompletions.date, startDate),
          lte(habitCompletions.date, endDate),
        ),
      );
  }

  async upsertCompletion(
    userId: string,
    habitDefinitionId: string,
    date: string,
    status: Extract<HabitCompletionStatus, "completed" | "skipped">,
    sourceChecklistItemId: string,
  ) {
    const [existing] = await this.db
      .select()
      .from(habitCompletions)
      .where(
        and(
          eq(habitCompletions.userId, userId),
          eq(habitCompletions.habitDefinitionId, habitDefinitionId),
          eq(habitCompletions.date, date),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(habitCompletions)
        .set({
          status,
          sourceChecklistItemId,
          updatedAt: new Date(),
        })
        .where(eq(habitCompletions.id, existing.id))
        .returning();

      return updated ?? existing;
    }

    const [created] = await this.db
      .insert(habitCompletions)
      .values({
        userId,
        habitDefinitionId,
        date,
        status,
        sourceChecklistItemId,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to upsert habit completion.");
    }

    return created;
  }

  async listActiveTemplates() {
    return this.db
      .select()
      .from(habitTemplates)
      .where(eq(habitTemplates.status, "active"))
      .orderBy(habitTemplates.title);
  }

  async findActiveTemplatesByIds(templateIds: readonly string[]) {
    if (templateIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(habitTemplates)
      .where(
        and(eq(habitTemplates.status, "active"), inArray(habitTemplates.id, [...templateIds])),
      );
  }

  async findActiveTemplatesBySlugs(templateSlugs: readonly string[]) {
    if (templateSlugs.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(habitTemplates)
      .where(
        and(eq(habitTemplates.status, "active"), inArray(habitTemplates.slug, [...templateSlugs])),
      );
  }
}
