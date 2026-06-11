/**
 * Pure helpers for chat transcript date grouping.
 * No DOM/React dependencies — fully unit-testable.
 */

type MessageWithDate = {
  createdAt: string;
};

/**
 * Returns true when two messages fall on different calendar days (in the system locale).
 * Used to decide whether to show a date separator between messages.
 */
export function shouldShowDateSeparator(
  prev: MessageWithDate | null | undefined,
  current: MessageWithDate,
): boolean {
  if (!prev) {
    return true; // Always show before the first message
  }

  const prevDate = new Date(prev.createdAt);
  const currentDate = new Date(current.createdAt);

  return (
    prevDate.getFullYear() !== currentDate.getFullYear() ||
    prevDate.getMonth() !== currentDate.getMonth() ||
    prevDate.getDate() !== currentDate.getDate()
  );
}

/**
 * Format a date for the chat date separator.
 * Returns "Today", "Yesterday", or a medium date string.
 * Locale-aware: uses the provided locale for medium dates and localized words.
 *
 * @param iso - ISO datetime string
 * @param locale - BCP 47 locale tag ("en", "ru", etc.)
 * @param todayLabel - Localized label for today (e.g. "Today" / "Сегодня")
 * @param yesterdayLabel - Localized label for yesterday
 */
export function formatChatDateSeparator(
  iso: string,
  locale: string,
  todayLabel: string,
  yesterdayLabel: string,
): string {
  const date = new Date(iso);
  const now = new Date();

  const sameYear = (a: Date, b: Date) => a.getFullYear() === b.getFullYear();
  const sameMonth = (a: Date, b: Date) => a.getMonth() === b.getMonth();
  const sameDay = (a: Date, b: Date) => a.getDate() === b.getDate();

  const isToday = sameYear(date, now) && sameMonth(date, now) && sameDay(date, now);
  if (isToday) {
    return todayLabel;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    sameYear(date, yesterday) && sameMonth(date, yesterday) && sameDay(date, yesterday);
  if (isYesterday) {
    return yesterdayLabel;
  }

  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}
