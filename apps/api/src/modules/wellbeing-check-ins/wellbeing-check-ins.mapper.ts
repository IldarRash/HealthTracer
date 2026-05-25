import { wellbeingCheckIns } from "@health/db";
import {
  wellbeingCheckInRecordSchema,
  type WellbeingCheckInRecord,
  type WellbeingCrisisFlagReason,
} from "@health/types";
import { InternalServerErrorException } from "@nestjs/common";

type WellbeingCheckInRow = typeof wellbeingCheckIns.$inferSelect;

export function toWellbeingCheckInRecord(row: WellbeingCheckInRow): WellbeingCheckInRecord {
  const parsed = wellbeingCheckInRecordSchema.safeParse({
    id: row.id,
    userId: row.userId,
    date: row.date,
    moodScore: row.moodScore,
    stressScore: row.stressScore,
    tags: row.tags ?? [],
    note: row.note,
    source: row.source,
    crisisFlagReasons: row.crisisFlagReasons ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });

  if (!parsed.success) {
    throw new InternalServerErrorException("Invalid stored wellbeing check-in.");
  }

  return parsed.data;
}

export function serializeCrisisFlagReasons(
  reasons: WellbeingCrisisFlagReason[],
): WellbeingCrisisFlagReason[] {
  return [...new Set(reasons)];
}

export function normalizeWellbeingNote(note: string | null | undefined): string | null {
  if (note == null) {
    return null;
  }

  const trimmed = note.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeWellbeingTags(tags: string[] | undefined): string[] {
  if (!tags) {
    return [];
  }

  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))].slice(
    0,
    8,
  );
}
