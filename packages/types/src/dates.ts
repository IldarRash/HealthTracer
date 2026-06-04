import { z } from "zod";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCalendarValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const day = Number.parseInt(match[3]!, 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export const isoDateSchema = z
  .string()
  .regex(ISO_DATE_PATTERN, {
    message: "Expected date in YYYY-MM-DD format",
  })
  .refine(isCalendarValidIsoDate, {
    message: "Expected a valid calendar date in YYYY-MM-DD format",
  });

export const isoDateTimeSchema = z.string().datetime();

/**
 * Extract the YYYY-MM-DD calendar-date prefix from a UTC ISO-8601 datetime string.
 *
 * Use this ONLY when the datetime value is already normalised to UTC and you
 * genuinely want the UTC calendar date (e.g. storing a DB timestamp as its own
 * UTC date column).  Do NOT use this when the intent is to derive the user's
 * local calendar date — use `formatIsoDateInTimezone(timezone, new Date(value))`
 * from `packages/types/src/habits.ts` for that.
 */
export function isoDateOnly(value: string): string {
  isoDateTimeSchema.parse(value);
  return value.slice(0, 10);
}
