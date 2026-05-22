import { workoutPlanRevisions, workoutPlans, workoutSessions } from "@health/db";
import type {
  CompleteWorkoutSessionInput,
  ScheduleWorkoutSessionInput,
  WorkoutPlanPayload,
} from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

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

      return { plan: updatedPlan ?? plan, revision };
    });
  }

  async appendRevision(
    workoutPlanId: string,
    payload: WorkoutPlanPayload,
    reason: string,
    source: string,
  ) {
    return this.db.transaction(async (tx) => {
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
        .where(eq(workoutPlans.id, workoutPlanId));

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
