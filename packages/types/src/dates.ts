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
