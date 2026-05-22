import { goals } from "@health/db";
import type { CreateGoalInput, UpdateGoalInput } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";

@Injectable()
export class GoalsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async listByUserId(userId: string) {
    return this.db.select().from(goals).where(eq(goals.userId, userId));
  }

  async create(userId: string, input: CreateGoalInput) {
    const [goal] = await this.db
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
  }

  async update(userId: string, goalId: string, input: UpdateGoalInput) {
    const [goal] = await this.db
      .update(goals)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
      .returning();

    return goal ?? null;
  }
}
