import { dailyChecklists } from "@health/db";
import type {
  TodayChecklistItem,
  TodayChecklistPayload,
  TodayDailyFeedback,
} from "@health/types";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { DATABASE } from "../../database/database.tokens.js";
import type { HealthDatabase } from "../../database/database.types.js";
import { adherenceScoreValue, serializeChecklistItems, serializeFeedback } from "./today.mapper.js";

@Injectable()
export class TodayRepository {
  constructor(@Inject(DATABASE) private readonly db: HealthDatabase) {}

  async findByUserAndDate(userId: string, date: string) {
    const [checklist] = await this.db
      .select()
      .from(dailyChecklists)
      .where(and(eq(dailyChecklists.userId, userId), eq(dailyChecklists.date, date)))
      .limit(1);

    return checklist ?? null;
  }

  async createChecklist(
    userId: string,
    date: string,
    items: TodayChecklistItem[],
    source: string,
    adherenceScore: string | null,
  ) {
    const [checklist] = await this.db
      .insert(dailyChecklists)
      .values({
        userId,
        date,
        items: serializeChecklistItems(items),
        source,
        adherenceScore,
      })
      .returning();

    if (!checklist) {
      throw new Error("Failed to create daily checklist.");
    }

    return checklist;
  }

  async upsertChecklist(
    userId: string,
    date: string,
    items: TodayChecklistItem[],
    source: string,
    adherenceScore: string | null,
  ) {
    const [checklist] = await this.db
      .insert(dailyChecklists)
      .values({
        userId,
        date,
        items: serializeChecklistItems(items),
        source,
        adherenceScore,
      })
      .onConflictDoUpdate({
        target: [dailyChecklists.userId, dailyChecklists.date],
        set: {
          items: serializeChecklistItems(items),
          source,
          adherenceScore,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!checklist) {
      throw new Error("Failed to upsert daily checklist.");
    }

    return checklist;
  }

  async updateChecklistState(
    userId: string,
    checklistId: string,
    items: TodayChecklistItem[],
    adherenceScore: string | null,
  ) {
    const [checklist] = await this.db
      .update(dailyChecklists)
      .set({
        items: serializeChecklistItems(items),
        adherenceScore,
        updatedAt: new Date(),
      })
      .where(and(eq(dailyChecklists.id, checklistId), eq(dailyChecklists.userId, userId)))
      .returning();

    return checklist ?? null;
  }

  async updateFeedback(
    userId: string,
    checklistId: string,
    feedback: TodayDailyFeedback | null,
  ) {
    const [checklist] = await this.db
      .update(dailyChecklists)
      .set({
        feedback: serializeFeedback(feedback),
        updatedAt: new Date(),
      })
      .where(and(eq(dailyChecklists.id, checklistId), eq(dailyChecklists.userId, userId)))
      .returning();

    return checklist ?? null;
  }

  async listRecentByUserId(userId: string, limit: number) {
    return this.db
      .select()
      .from(dailyChecklists)
      .where(eq(dailyChecklists.userId, userId))
      .orderBy(desc(dailyChecklists.date))
      .limit(limit);
  }

  async listByUserAndDateRange(userId: string, startDate: string, endDate: string) {
    return this.db
      .select()
      .from(dailyChecklists)
      .where(
        and(
          eq(dailyChecklists.userId, userId),
          gte(dailyChecklists.date, startDate),
          lte(dailyChecklists.date, endDate),
        ),
      )
      .orderBy(desc(dailyChecklists.date));
  }

  async createChecklistFromProposal(
    userId: string,
    payload: TodayChecklistPayload,
    items: TodayChecklistItem[],
    source: string,
    adherenceScore: string | null,
  ) {
    return this.upsertChecklist(userId, payload.date, items, source, adherenceScore);
  }
}
