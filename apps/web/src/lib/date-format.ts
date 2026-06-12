/**
 * Shared date/time formatting helpers for apps/web.
 * The standalone functions pin locale to "en-US" so existing callers are
 * unaffected.
 */

const EN_LOCALE = "en-US";

// ── Standalone helpers (default en-US) ────────────────────────────

/** "Jun 5, 2026" */
export function formatDateMedium(value: Date | string): string {
  return new Intl.DateTimeFormat(EN_LOCALE, { dateStyle: "medium" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/** "Jun 5, 2026, 9:07 AM" */
export function formatDateTimeMedium(value: Date | string): string {
  return new Intl.DateTimeFormat(EN_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}

/** "Fri" (abbreviated weekday) */
export function formatWeekdayShort(value: Date | string): string {
  return new Intl.DateTimeFormat(EN_LOCALE, { weekday: "short" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/** "Friday" (full weekday) */
export function formatWeekdayLong(value: Date | string): string {
  return new Intl.DateTimeFormat(EN_LOCALE, { weekday: "long" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/** "Jun" (abbreviated month) */
export function formatMonthShort(value: Date | string): string {
  return new Intl.DateTimeFormat(EN_LOCALE, { month: "short" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/** "Jun 5" (abbreviated month + day, no year) */
export function formatMonthDayShort(value: Date | string): string {
  return new Intl.DateTimeFormat(EN_LOCALE, {
    month: "short",
    day: "numeric",
  }).format(typeof value === "string" ? new Date(value) : value);
}

