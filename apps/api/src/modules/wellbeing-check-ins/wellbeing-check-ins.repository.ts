import { wellbeingCheckIns } from "@health/db";
import type { UpsertWellbeingCheckInInput, WellbeingCrisisFlagReason } from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";
import {
  normalizeWellbeingNote,
  normalizeWellbeingTags,
  serializeCrisisFlagReasons,
} from "./wellbeing-check-ins.mapper.js";

@Injectable()
export class WellbeingCheckInsRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findByUserAndDate(userId: string, date: string) {
    const [row] = await this.db
      .select()
      .from(wellbeingCheckIns)
      .where(and(eq(wellbeingCheckIns.userId, userId), eq(wellbeingCheckIns.date, date)))
      .limit(1);

    return row ?? null;
  }

  async insertByUserAndDateIfAbsent(
    userId: string,
    date: string,
    input: UpsertWellbeingCheckInInput,
    crisisFlagReasons: WellbeingCrisisFlagReason[],
  ) {
    const [inserted] = await this.db
      .insert(wellbeingCheckIns)
      .values({
        userId,
        date,
        moodScore: input.moodScore,
        stressScore: input.stressScore,
        tags: normalizeWellbeingTags(input.tags),
        note: normalizeWellbeingNote(input.note),
        source: input.source ?? "user_entry",
        crisisFlagReasons: serializeCrisisFlagReasons(crisisFlagReasons),
      })
      .onConflictDoNothing({
        target: [wellbeingCheckIns.userId, wellbeingCheckIns.date],
      })
      .returning();

    if (inserted) {
      return { row: inserted, created: true as const };
    }

    const existing = await this.findByUserAndDate(userId, date);

    if (!existing) {
      throw new Error("Failed to resolve wellbeing check-in after insert conflict.");
    }

    return { row: existing, created: false as const };
  }

  async upsertByUserAndDate(
    userId: string,
    date: string,
    input: UpsertWellbeingCheckInInput,
    crisisFlagReasons: WellbeingCrisisFlagReason[],
  ) {
    const [row] = await this.db
      .insert(wellbeingCheckIns)
      .values({
        userId,
        date,
        moodScore: input.moodScore,
        stressScore: input.stressScore,
        tags: normalizeWellbeingTags(input.tags),
        note: normalizeWellbeingNote(input.note),
        source: input.source ?? "user_entry",
        crisisFlagReasons: serializeCrisisFlagReasons(crisisFlagReasons),
      })
      .onConflictDoUpdate({
        target: [wellbeingCheckIns.userId, wellbeingCheckIns.date],
        set: {
          moodScore: input.moodScore,
          stressScore: input.stressScore,
          tags: normalizeWellbeingTags(input.tags),
          note: normalizeWellbeingNote(input.note),
          source: input.source ?? "user_entry",
          crisisFlagReasons: serializeCrisisFlagReasons(crisisFlagReasons),
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!row) {
      throw new Error("Failed to upsert wellbeing check-in.");
    }

    return row;
  }

  async listRecentByUserId(userId: string, limit: number) {
    return this.db
      .select()
      .from(wellbeingCheckIns)
      .where(eq(wellbeingCheckIns.userId, userId))
      .orderBy(desc(wellbeingCheckIns.date))
      .limit(limit);
  }

  async listByUserAndDateRange(userId: string, startDate: string, endDate: string) {
    return this.db
      .select()
      .from(wellbeingCheckIns)
      .where(
        and(
          eq(wellbeingCheckIns.userId, userId),
          gte(wellbeingCheckIns.date, startDate),
          lte(wellbeingCheckIns.date, endDate),
        ),
      )
      .orderBy(desc(wellbeingCheckIns.date));
  }
}
