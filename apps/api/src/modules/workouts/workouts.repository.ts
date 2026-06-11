import { workoutPlanRevisions, workoutPlans, workoutSessions } from "@health/db";
import type {
  CompleteWorkoutSessionInput,
  ScheduleWorkoutSessionInput,
  WorkoutPlanPayload,
} from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase, HealthDatabaseTransaction } from "../../database/database.types.js";

export function isPostgresUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const directCode = (error as { code?: string }).code;
  if (directCode === "23505") {
    return true;
  }

  const cause = (error as { cause?: unknown }).cause;
  if (typeof cause === "object" && cause !== null) {
    return (cause as { code?: string }).code === "23505";
  }

  return false;
}

@Injectable()
export class WorkoutsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findActivePlanByUserId(userId: string) {
    const [plan] = await this.db
      .select()
      .from(workoutPlans)
      .where(and(eq(workoutPlans.userId, userId), eq(workoutPlans.status, "active")))
      .orderBy(desc(workoutPlans.updatedAt))
      .limit(1);

    return plan ?? null;
  }

  async findRevisionById(revisionId: string) {
    const [revision] = await this.db
      .select()
      .from(workoutPlanRevisions)
      .where(eq(workoutPlanRevisions.id, revisionId))
      .limit(1);

    return revision ?? null;
  }

  async findActiveRevisionByPlanId(workoutPlanId: string, activeRevisionId: string) {
    const [revision] = await this.db
      .select()
      .from(workoutPlanRevisions)
      .where(
        and(
          eq(workoutPlanRevisions.id, activeRevisionId),
          eq(workoutPlanRevisions.workoutPlanId, workoutPlanId),
        ),
      )
      .limit(1);

    return revision ?? null;
  }

  async listRevisionsByUserId(userId: string) {
    const rows = await this.db
      .select({ revision: workoutPlanRevisions })
      .from(workoutPlanRevisions)
      .innerJoin(
        workoutPlans,
        eq(workoutPlanRevisions.workoutPlanId, workoutPlans.id),
      )
      .where(eq(workoutPlans.userId, userId))
      .orderBy(desc(workoutPlanRevisions.createdAt));

    return rows.map((row) => row.revision);
  }

  async findRevisionForUser(userId: string, revisionId: string) {
    const [row] = await this.db
      .select({ revision: workoutPlanRevisions, plan: workoutPlans })
      .from(workoutPlanRevisions)
      .innerJoin(
        workoutPlans,
        eq(workoutPlanRevisions.workoutPlanId, workoutPlans.id),
      )
      .where(and(eq(workoutPlanRevisions.id, revisionId), eq(workoutPlans.userId, userId)))
      .limit(1);

    return row ?? null;
  }

  async findActiveRevisionForUser(userId: string, revisionId: string) {
    const [row] = await this.db
      .select({ revision: workoutPlanRevisions, plan: workoutPlans })
      .from(workoutPlanRevisions)
      .innerJoin(
        workoutPlans,
        eq(workoutPlanRevisions.workoutPlanId, workoutPlans.id),
      )
      .where(
        and(
          eq(workoutPlanRevisions.id, revisionId),
          eq(workoutPlans.userId, userId),
          eq(workoutPlans.status, "active"),
          eq(workoutPlans.activeRevisionId, revisionId),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async listSessionsByPlanId(userId: string, workoutPlanId: string) {
    return this.db
      .select()
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.workoutPlanId, workoutPlanId),
        ),
      )
      .orderBy(desc(workoutSessions.plannedDate), desc(workoutSessions.createdAt));
  }

  async listSessionsByUserIdInDateRange(
    userId: string,
    startDate: string,
    endDate: string,
  ) {
    return this.db
      .select()
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          gte(workoutSessions.plannedDate, startDate),
          lte(workoutSessions.plannedDate, endDate),
        ),
      )
      .orderBy(desc(workoutSessions.plannedDate), desc(workoutSessions.createdAt));
  }

  /**
   * Numeric-only session execution projection for progress-history aggregation.
   * Deliberately selects NO free-text columns (no title, no activityType, no
   * feedback notes) — fatigue is extracted from the feedback jsonb in SQL so
   * free text never leaves the database.
   */
  async listSessionExecutionRowsByUserIdInDateRange(
    userId: string,
    startDate: string,
    endDate: string,
  ) {
    return this.db
      .select({
        plannedDate: workoutSessions.plannedDate,
        status: workoutSessions.status,
        source: workoutSessions.source,
        completionFatigue: sql<number | null>`(${workoutSessions.feedback} ->> 'fatigue')::int`,
      })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          gte(workoutSessions.plannedDate, startDate),
          lte(workoutSessions.plannedDate, endDate),
        ),
      )
      .orderBy(workoutSessions.plannedDate);
  }

  /**
   * Revision creation timestamps only (for plan-change markers) — never the
   * revision payloads.
   */
  async listRevisionCreatedAtByUserId(userId: string) {
    const rows = await this.db
      .select({ createdAt: workoutPlanRevisions.createdAt })
      .from(workoutPlanRevisions)
      .innerJoin(
        workoutPlans,
        eq(workoutPlanRevisions.workoutPlanId, workoutPlans.id),
      )
      .where(eq(workoutPlans.userId, userId))
      .orderBy(desc(workoutPlanRevisions.createdAt));

    return rows.map((row) => row.createdAt);
  }

  async findSessionByUserPlanRevisionAndDate(
    userId: string,
    workoutPlanId: string,
    workoutPlanRevisionId: string,
    plannedDate: string,
  ) {
    const [session] = await this.db
      .select()
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.workoutPlanId, workoutPlanId),
          eq(workoutSessions.workoutPlanRevisionId, workoutPlanRevisionId),
          eq(workoutSessions.plannedDate, plannedDate),
        ),
      )
      .orderBy(desc(workoutSessions.createdAt))
      .limit(1);

    return session ?? null;
  }

  async materializeSession(
    userId: string,
    workoutPlanId: string,
    workoutPlanRevisionId: string,
    plannedDate: string,
    title: string,
    exercises: unknown[],
  ) {
    try {
      const [session] = await this.db
        .insert(workoutSessions)
        .values({
          userId,
          workoutPlanId,
          workoutPlanRevisionId,
          plannedDate,
          title,
          exercises,
        })
        .returning();

      if (!session) {
        throw new Error("Failed to materialize workout session.");
      }

      return session;
    } catch (error) {
      if (!isPostgresUniqueViolation(error)) {
        throw error;
      }

      const existingSession = await this.findSessionByUserPlanRevisionAndDate(
        userId,
        workoutPlanId,
        workoutPlanRevisionId,
        plannedDate,
      );

      if (!existingSession) {
        throw error;
      }

      return existingSession;
    }
  }

  async updateSessionState(
    userId: string,
    sessionId: string,
    input: {
      exercises?: unknown[];
      status?: string;
      completedAt?: Date | null;
    },
  ) {
    const [session] = await this.db
      .update(workoutSessions)
      .set({
        ...(input.exercises !== undefined ? { exercises: input.exercises } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
      .returning();

    return session ?? null;
  }

  async scheduleSession(
    userId: string,
    workoutPlanId: string,
    input: ScheduleWorkoutSessionInput,
  ) {
    const [session] = await this.db
      .insert(workoutSessions)
      .values({
        userId,
        workoutPlanId,
        workoutPlanRevisionId: input.workoutPlanRevisionId,
        plannedDate: input.plannedDate,
        title: input.title,
        exercises: input.exercises,
      })
      .returning();

    if (!session) {
      throw new Error("Failed to schedule workout session.");
    }

    return session;
  }

  async listSessionsByUserAndPlannedDate(userId: string, plannedDate: string) {
    return this.db
      .select()
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.userId, userId),
          eq(workoutSessions.plannedDate, plannedDate),
        ),
      )
      .orderBy(desc(workoutSessions.createdAt));
  }

  async findSessionByUserId(userId: string, sessionId: string) {
    const [session] = await this.db
      .select()
      .from(workoutSessions)
      .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
      .limit(1);

    return session ?? null;
  }

  async completeSession(
    userId: string,
    sessionId: string,
    input: CompleteWorkoutSessionInput,
  ) {
    const existingSession = await this.findSessionByUserId(userId, sessionId);

    if (!existingSession) {
      return null;
    }

    const completionUpdate = buildSessionCompletionUpdate(existingSession, input);

    const [session] = await this.db
      .update(workoutSessions)
      .set({
        ...completionUpdate,
        updatedAt: new Date(),
      })
      .where(and(eq(workoutSessions.id, sessionId), eq(workoutSessions.userId, userId)))
      .returning();

    return session ?? null;
  }

  async createPlanWithRevision(
    userId: string,
    payload: WorkoutPlanPayload,
    reason: string,
    source: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(workoutPlans)
        .values({ userId })
        .returning();

      if (!plan) {
        throw new Error("Failed to create workout plan.");
      }

      const [revision] = await tx
        .insert(workoutPlanRevisions)
        .values({
          workoutPlanId: plan.id,
          revisionNumber: 1,
          reason,
          source,
          payload,
        })
        .returning();

      if (!revision) {
        throw new Error("Failed to create workout plan revision.");
      }

      const [updatedPlan] = await tx
        .update(workoutPlans)
        .set({
          activeRevisionId: revision.id,
          updatedAt: new Date(),
        })
        .where(eq(workoutPlans.id, plan.id))
        .returning();

      if (!updatedPlan) {
        throw new Error("Failed to activate workout plan revision.");
      }

      return { plan: updatedPlan, revision };
    });
  }

  /**
   * Insert a fully-completed ad-hoc workout session.
   * workoutPlanId and workoutPlanRevisionId are intentionally null — this is not
   * backed by a plan revision. source='ad_hoc', status='completed'.
   *
   * When tx is provided the insert runs inside that transaction so the domain
   * write is atomic with the proposal status flip in the caller (mirrors the
   * nutrition-incident pattern: NutritionRepository.createIncident).
   */
  async insertAdHocSession(
    userId: string,
    payload: {
      title: string;
      activityType: string;
      performedAt: Date;
      plannedDate: string;
      estimatedCalories: number;
    },
    tx?: HealthDatabaseTransaction,
  ) {
    const db = tx ?? this.db;
    const [session] = await db
      .insert(workoutSessions)
      .values({
        userId,
        workoutPlanId: null,
        workoutPlanRevisionId: null,
        source: "ad_hoc",
        status: "completed",
        title: payload.title,
        activityType: payload.activityType,
        estimatedCalories: payload.estimatedCalories,
        plannedDate: payload.plannedDate,
        completedAt: payload.performedAt,
        exercises: [],
      })
      .returning();

    if (!session) {
      throw new Error("Failed to insert ad-hoc workout session.");
    }

    return session;
  }

  async appendRevision(
    workoutPlanId: string,
    payload: WorkoutPlanPayload,
    reason: string,
    source: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [lockedPlan] = await tx
        .select({ id: workoutPlans.id, status: workoutPlans.status })
        .from(workoutPlans)
        .where(and(eq(workoutPlans.id, workoutPlanId), eq(workoutPlans.status, "active")))
        .for("update");

      if (!lockedPlan) {
        throw new Error("Active workout plan not found.");
      }

      const [latestRevision] = await tx
        .select()
        .from(workoutPlanRevisions)
        .where(eq(workoutPlanRevisions.workoutPlanId, workoutPlanId))
        .orderBy(desc(workoutPlanRevisions.revisionNumber))
        .limit(1);

      const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1;

      const [revision] = await tx
        .insert(workoutPlanRevisions)
        .values({
          workoutPlanId,
          revisionNumber,
          reason,
          source,
          payload,
        })
        .returning();

      if (!revision) {
        throw new Error("Failed to create workout plan revision.");
      }

      await tx
        .update(workoutPlans)
        .set({
          activeRevisionId: revision.id,
          updatedAt: new Date(),
        })
        .where(and(eq(workoutPlans.id, workoutPlanId), eq(workoutPlans.status, "active")));

      return revision;
    });
  }
}

type SessionCompletionSource = {
  status: string;
  completedAt: Date | null;
};

export function buildSessionCompletionUpdate(
  existingSession: SessionCompletionSource,
  input: CompleteWorkoutSessionInput,
) {
  const isRepeatTerminalStatus =
    existingSession.status === input.status &&
    (input.status === "completed" || input.status === "skipped");

  const completedAt = isRepeatTerminalStatus
    ? (existingSession.completedAt ?? new Date())
    : new Date();

  return {
    status: input.status,
    feedback: input.feedback,
    completedAt,
  };
}
