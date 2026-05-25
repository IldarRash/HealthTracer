import { goals } from "@health/db";
import type { CreateGoalInput, GoalListQuery, UpdateGoalInput } from "@health/types";
import { MAX_ACTIVE_WEEKLY_FOCUS } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ne, sql, type SQL } from "drizzle-orm";
import { isPostgresUniqueViolation } from "../../database/postgres-errors.js";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

export class GoalHierarchyLimitError extends Error {
  constructor(
    readonly limit: "quarterly" | "weekly",
    message: string,
  ) {
    super(message);
    this.name = "GoalHierarchyLimitError";
  }
}

export class DuplicateActiveQuarterlyGoalError extends Error {
  constructor() {
    super("goal: At most 1 active quarterly goal is allowed.");
    this.name = "DuplicateActiveQuarterlyGoalError";
  }
}

const GOAL_HIERARCHY_WEEKLY_LOCK_NAMESPACE = 847291;

@Injectable()
export class GoalsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  private buildListFilters(userId: string, query?: GoalListQuery): SQL | undefined {
    const filters: SQL[] = [eq(goals.userId, userId)];

    if (query?.horizon && query.horizon !== "direction") {
      filters.push(eq(goals.horizon, query.horizon));
    }

    if (query?.active === true) {
      filters.push(eq(goals.status, "active"));
    }

    if (query?.weekStart) {
      filters.push(eq(goals.weekStart, query.weekStart));
    }

    return and(...filters);
  }

  async listByUserId(userId: string, query?: GoalListQuery) {
    return this.db
      .select()
      .from(goals)
      .where(this.buildListFilters(userId, query));
  }

  async findByIdForUser(userId: string, goalId: string) {
    const [goal] = await this.db
      .select()
      .from(goals)
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
      .limit(1);

    return goal ?? null;
  }

  private async countActiveWeeklyGoals(
    db: Pick<HealthDatabase, "select">,
    userId: string,
    excludeGoalId?: string,
  ) {
    const filters: SQL[] = [
      eq(goals.userId, userId),
      eq(goals.status, "active"),
      eq(goals.horizon, "weekly"),
    ];

    if (excludeGoalId) {
      filters.push(ne(goals.id, excludeGoalId));
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(goals)
      .where(and(...filters));

    return result?.count ?? 0;
  }

  private async acquireActiveWeeklyGoalLock(
    db: Pick<HealthDatabase, "execute">,
    userId: string,
  ) {
    await db.execute(
      sql`select pg_advisory_xact_lock(${GOAL_HIERARCHY_WEEKLY_LOCK_NAMESPACE}, hashtext(${userId}::text))`,
    );
  }

  private async assertActiveWeeklyCapacity(
    db: Pick<HealthDatabase, "select" | "execute">,
    userId: string,
    excludeGoalId?: string,
  ) {
    await this.acquireActiveWeeklyGoalLock(db, userId);

    const activeWeeklyCount = await this.countActiveWeeklyGoals(db, userId, excludeGoalId);

    if (activeWeeklyCount >= MAX_ACTIVE_WEEKLY_FOCUS) {
      throw new GoalHierarchyLimitError(
        "weekly",
        `goal: At most ${MAX_ACTIVE_WEEKLY_FOCUS} active weekly focus goals are allowed.`,
      );
    }
  }

  async create(userId: string, input: CreateGoalInput) {
    return this.db.transaction(async (tx) => {
      const nextStatus = "active";
      const nextHorizon = input.horizon ?? null;

      if (nextStatus === "active" && nextHorizon === "weekly") {
        await this.assertActiveWeeklyCapacity(tx, userId);
      }

      try {
        const [goal] = await tx
          .insert(goals)
          .values({
            ...input,
            userId,
          })
          .returning();

        if (!goal) {
          throw new Error("Failed to create goal.");
        }

        return goal;
      } catch (error) {
        if (isPostgresUniqueViolation(error)) {
          throw new GoalHierarchyLimitError(
            "quarterly",
            "goal: At most 1 active quarterly goal is allowed.",
          );
        }

        throw error;
      }
    });
  }

  async update(userId: string, goalId: string, input: UpdateGoalInput) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(goals)
        .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
        .limit(1);

      if (!existing) {
        return null;
      }

      const nextStatus = input.status ?? existing.status;
      const nextHorizon = input.horizon !== undefined ? input.horizon : existing.horizon;

      if (nextStatus === "active" && nextHorizon === "weekly") {
        await this.assertActiveWeeklyCapacity(tx, userId, goalId);
      }

      try {
        const [goal] = await tx
          .update(goals)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
          .returning();

        return goal ?? null;
      } catch (error) {
        if (isPostgresUniqueViolation(error)) {
          throw new GoalHierarchyLimitError(
            "quarterly",
            "goal: At most 1 active quarterly goal is allowed.",
          );
        }

        throw error;
      }
    });
  }
}
