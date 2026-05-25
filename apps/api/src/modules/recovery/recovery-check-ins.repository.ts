import { recoveryCheckIns } from "@health/db";
import type { UpsertRecoveryCheckInInput } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";
import { normalizeCheckInInput } from "./recovery.mapper.js";

@Injectable()
export class RecoveryCheckInsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findByUserAndDate(userId: string, date: string) {
    const [row] = await this.db
      .select()
      .from(recoveryCheckIns)
      .where(and(eq(recoveryCheckIns.userId, userId), eq(recoveryCheckIns.date, date)))
      .limit(1);

    return row ?? null;
  }

  async upsertByUserAndDate(userId: string, date: string, input: UpsertRecoveryCheckInInput) {
    const normalized = normalizeCheckInInput(input);

    const [row] = await this.db
      .insert(recoveryCheckIns)
      .values({
        userId,
        date,
        soreness: normalized.soreness,
        fatigue: normalized.fatigue,
        moodScore: normalized.moodScore,
        perceivedStress: normalized.perceivedStress,
        source: normalized.source,
      })
      .onConflictDoUpdate({
        target: [recoveryCheckIns.userId, recoveryCheckIns.date],
        set: {
          soreness: normalized.soreness,
          fatigue: normalized.fatigue,
          moodScore: normalized.moodScore,
          perceivedStress: normalized.perceivedStress,
          source: normalized.source,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert recovery check-in.");
    }

    return row;
  }

  async listByUserAndDateRange(userId: string, startDate: string, endDate: string) {
    return this.db
      .select()
      .from(recoveryCheckIns)
      .where(
        and(
          eq(recoveryCheckIns.userId, userId),
          gte(recoveryCheckIns.date, startDate),
          lte(recoveryCheckIns.date, endDate),
        ),
      )
      .orderBy(desc(recoveryCheckIns.date));
  }

  async countByUserAndDateRange(userId: string, startDate: string, endDate: string) {
    const rows = await this.listByUserAndDateRange(userId, startDate, endDate);
    return rows.length;
  }
}
