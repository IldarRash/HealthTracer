/**
 * Shared date/time formatting helpers for apps/web.
 *
 * All formatters pin locale to "en-US" so the UI is always English regardless
 * of the runtime (browser or Node) locale — which in some dev environments
 * resolves to Russian and would render dates in Cyrillic.
 */

const LOCALE = "en-US";

/** "Jun 5, 2026" */
export function formatDateMedium(value: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/** "Jun 5, 2026, 9:07 AM" */
export function formatDateTimeMedium(value: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}

/** "Fri" (abbreviated weekday) */
export function formatWeekdayShort(value: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/** "Friday" (full weekday) */
export function formatWeekdayLong(value: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "long" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

/** "Jun" (abbreviated month) */
export function formatMonthShort(value: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, { month: "short" }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}
