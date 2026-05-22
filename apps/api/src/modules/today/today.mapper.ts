import type { dailyChecklists } from "@health/db";
import {
  calculateTodayAdherence,
  todayChecklistItemSchema,
  todayDailyFeedbackSchema,
  type TodayAdherenceSummary,
  type TodayChecklistItem,
  type TodayChecklistRecord,
  type TodayDailyFeedback,
  type TodayHistoryEntry,
} from "@health/types";
import { InternalServerErrorException } from "@nestjs/common";
import type { z } from "zod";

type DailyChecklistRow = typeof dailyChecklists.$inferSelect;

function parseStoredValue<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
  field: string,
): z.infer<TSchema> {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new InternalServerErrorException(`Invalid stored today ${field}.`);
  }

  return result.data;
}

function parseStoredItems(value: unknown): TodayChecklistItem[] {
  if (!Array.isArray(value)) {
    throw new InternalServerErrorException("Invalid stored today checklist items.");
  }

  return value.map((item, index) =>
    parseStoredValue(todayChecklistItemSchema, item, `checklist item ${index}`),
  );
}

function toAdherenceSummary(items: TodayChecklistItem[]): TodayAdherenceSummary {
  return calculateTodayAdherence(items);
}

export function toTodayChecklistRecord(row: DailyChecklistRow): TodayChecklistRecord {
  const items = parseStoredItems(row.items);
  const feedback = row.feedback
    ? parseStoredValue(todayDailyFeedbackSchema, row.feedback, "feedback")
    : null;

  return {
    id: row.id,
    userId: row.userId,
    date: row.date,
    items,
    source: row.source,
    feedback,
    adherence: toAdherenceSummary(items),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTodayHistoryEntry(row: DailyChecklistRow): TodayHistoryEntry {
  const items = parseStoredItems(row.items);
  const feedback = row.feedback
    ? parseStoredValue(todayDailyFeedbackSchema, row.feedback, "feedback")
    : null;

  return {
    date: row.date,
    adherence: calculateTodayAdherence(items),
    itemCount: items.length,
    hasFeedback: feedback !== null && Object.keys(feedback).length > 0,
  };
}

export function serializeChecklistItems(items: TodayChecklistItem[]) {
  return items.map((item) => todayChecklistItemSchema.parse(item));
}

export function serializeFeedback(feedback: TodayDailyFeedback | null) {
  return feedback ? todayDailyFeedbackSchema.parse(feedback) : null;
}

export function adherenceScoreValue(adherence: TodayAdherenceSummary): string | null {
  return adherence.score === null ? null : adherence.score.toFixed(4);
}
