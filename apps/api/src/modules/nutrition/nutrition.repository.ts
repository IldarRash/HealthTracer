import { foodPhotoAnalyses, nutritionAdherence, nutritionIncidents, nutritionPlanRevisions, nutritionPlans } from "@health/db";
import type {
  LogNutritionIncidentProposalPayload,
  NutritionImageRef,
  NutritionPlanPayload,
  UpsertNutritionAdherenceInput,
} from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";
import {
  adherenceStateToRowValues,
  mergeAdherenceInput,
} from "./nutrition.mapper.js";

type NutritionDbClient = Pick<HealthDatabase, "insert" | "select">;

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

  async listAdherenceByUserAndDateRange(userId: string, startDate: string, endDate: string) {
    return this.db
      .select()
      .from(nutritionAdherence)
      .where(
        and(
          eq(nutritionAdherence.userId, userId),
          gte(nutritionAdherence.date, startDate),
          lte(nutritionAdherence.date, endDate),
        ),
      )
      .orderBy(nutritionAdherence.date);
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

  async listIncidentsByUserAndDate(userId: string, date: string) {
    return this.db
      .select()
      .from(nutritionIncidents)
      .where(
        and(
          eq(nutritionIncidents.userId, userId),
          eq(nutritionIncidents.date, date),
        ),
      )
      .orderBy(nutritionIncidents.incidentDateTime);
  }

  async listIncidentsByUserAndDateRange(userId: string, startDate: string, endDate: string) {
    return this.db
      .select()
      .from(nutritionIncidents)
      .where(
        and(
          eq(nutritionIncidents.userId, userId),
          gte(nutritionIncidents.date, startDate),
          lte(nutritionIncidents.date, endDate),
        ),
      )
      .orderBy(nutritionIncidents.date, nutritionIncidents.incidentDateTime);
  }

  async findIncidentBySourceProposalId(
    userId: string,
    sourceProposalId: string,
    db: NutritionDbClient = this.db,
  ) {
    const [row] = await db
      .select()
      .from(nutritionIncidents)
      .where(
        and(
          eq(nutritionIncidents.userId, userId),
          eq(nutritionIncidents.sourceProposalId, sourceProposalId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async createIncident(
    userId: string,
    sourceProposalId: string,
    payload: LogNutritionIncidentProposalPayload,
    db: Pick<HealthDatabase, "insert"> = this.db,
  ) {
    // TODO(C2): incidentDate is derived as a UTC prefix here. Ideally it should be
    // derived in the user's timezone (as workouts.service.ts now does for plannedDate).
    // The user timezone is not readily available at the repository layer; the fix
    // belongs in a service-layer caller once the createIncident signature carries
    // the timezone or a pre-computed date.
    const incidentDate = payload.incidentDateTime.slice(0, 10);
    const [row] = await db
      .insert(nutritionIncidents)
      .values({
        userId,
        incidentDateTime: new Date(payload.incidentDateTime),
        date: incidentDate,
        items: payload.items,
        estimatedCalories: payload.estimatedCalories,
        estimatedMacros: payload.estimatedMacros,
        confidence: payload.confidence,
        provenance: payload.provenance,
        imageRefs: payload.imageRefs,
        userEdits: payload.userEdits ?? null,
        sourceProposalId,
        source: "ai_proposal",
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create nutrition incident.");
    }

    return row;
  }

  async findFoodPhotoAnalysisByImageRefForUser(userId: string, imageRefId: string) {
    const [row] = await this.db
      .select()
      .from(foodPhotoAnalyses)
      .where(
        and(eq(foodPhotoAnalyses.userId, userId), eq(foodPhotoAnalyses.imageRefId, imageRefId)),
      )
      .limit(1);

    return row ?? null;
  }

  async findFoodPhotoAnalysisByIdForUser(userId: string, analysisId: string) {
    const [row] = await this.db
      .select()
      .from(foodPhotoAnalyses)
      .where(and(eq(foodPhotoAnalyses.userId, userId), eq(foodPhotoAnalyses.id, analysisId)))
      .limit(1);

    return row ?? null;
  }

  async listOwnedFoodPhotoAnalysesByImageRefIds(userId: string, imageRefIds: readonly string[]) {
    if (imageRefIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        analysisId: foodPhotoAnalyses.id,
        imageRefId: foodPhotoAnalyses.imageRefId,
      })
      .from(foodPhotoAnalyses)
      .where(
        and(
          eq(foodPhotoAnalyses.userId, userId),
          inArray(foodPhotoAnalyses.imageRefId, [...imageRefIds]),
        ),
      );
  }

  async persistFoodPhotoAnalysis(input: {
    analysisId: string;
    userId: string;
    imageRef: NutritionImageRef;
    provenanceSource: string;
    providerId?: string;
  }) {
    const [row] = await this.db
      .insert(foodPhotoAnalyses)
      .values({
        id: input.analysisId,
        userId: input.userId,
        imageRefId: input.imageRef.id,
        mimeType: input.imageRef.mimeType ?? null,
        storageKey: input.imageRef.storageKey ?? null,
        provenanceSource: input.provenanceSource,
        providerId: input.providerId ?? null,
      })
      .onConflictDoUpdate({
        target: [foodPhotoAnalyses.userId, foodPhotoAnalyses.imageRefId],
        set: {
          id: input.analysisId,
          mimeType: input.imageRef.mimeType ?? null,
          storageKey: input.imageRef.storageKey ?? null,
          provenanceSource: input.provenanceSource,
          providerId: input.providerId ?? null,
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to persist food photo analysis.");
    }

    return row;
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
