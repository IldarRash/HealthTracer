import type { WorkoutSession } from "./workouts.js";

/**
 * Structural input for aggregateWorkoutWeek: only the execution fields are read.
 * Lets narrow, free-text-free repository projections reuse the aggregation
 * (e.g. the numeric-only progress-history packet) without carrying full sessions.
 */
export type WorkoutWeekStatsSessionInput = Pick<
  WorkoutSession,
  "plannedDate" | "status" | "source"
>;

export type WorkoutDayState = "completed" | "skipped" | "planned" | "none";

export interface WorkoutWeekDaySummary {
  date: string;
  state: WorkoutDayState;
}

export interface WorkoutWeekStats {
  /** Number of sessions sourced from the plan (source !== 'ad_hoc'). */
  plannedCount: number;
  /** Number of planned sessions that are completed. */
  plannedCompletedCount: number;
  /** Number of ad-hoc sessions that are completed. */
  adHocCompletedCount: number;
  /** Total completed sessions (planned + ad-hoc). */
  completedCount: number;
  /** Number of planned sessions with status 'skipped'. */
  skippedCount: number;
  /**
   * Adherence as a whole-number percent: plannedCompletedCount / plannedCount * 100.
   * 0 when plannedCount === 0.
   */
  adherencePercent: number;
  /** Number of distinct calendar days with at least one completed session. */
  activeDays: number;
  /** One entry per day in the [weekStart, weekEnd] window (7 entries for a full Mon–Sun week). */
  days: WorkoutWeekDaySummary[];
}

function toIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(isoDate: string, count: number): string {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + count);
  return toIsoDate(d);
}

function buildDaysWindow(weekStart: string, weekEnd: string): string[] {
  const dates: string[] = [];
  let current = weekStart;
  while (current <= weekEnd) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

/**
 * Aggregates a list of WorkoutSessions into weekly stats, using only sessions whose
 * plannedDate falls within [weekStart, weekEnd] inclusive.
 *
 * Ad-hoc sessions (source === 'ad_hoc') contribute to completedCount and activeDays
 * but never to plannedCount or the adherence denominator.
 */
export function aggregateWorkoutWeek(
  sessions: readonly WorkoutWeekStatsSessionInput[],
  weekStart: string,
  weekEnd: string,
): WorkoutWeekStats {
  const weekSessions = sessions.filter(
    (s) => s.plannedDate >= weekStart && s.plannedDate <= weekEnd,
  );

  const adHocSessions = weekSessions.filter((s) => s.source === "ad_hoc");
  const plannedSessions = weekSessions.filter((s) => s.source !== "ad_hoc");

  const plannedCount = plannedSessions.length;
  const plannedCompletedCount = plannedSessions.filter((s) => s.status === "completed").length;
  const adHocCompletedCount = adHocSessions.filter((s) => s.status === "completed").length;
  const completedCount = weekSessions.filter((s) => s.status === "completed").length;
  const skippedCount = plannedSessions.filter((s) => s.status === "skipped").length;
  const adherencePercent =
    plannedCount > 0 ? Math.round((plannedCompletedCount / plannedCount) * 100) : 0;

  const completedDays = new Set(
    weekSessions
      .filter((s) => s.status === "completed")
      .map((s) => s.plannedDate),
  );
  const activeDays = completedDays.size;

  // Build per-day state. Prefer completed > skipped > planned > none.
  const sessionsByDate = new Map<string, WorkoutWeekStatsSessionInput[]>();
  for (const s of weekSessions) {
    const bucket = sessionsByDate.get(s.plannedDate) ?? [];
    bucket.push(s);
    sessionsByDate.set(s.plannedDate, bucket);
  }

  const allDates = buildDaysWindow(weekStart, weekEnd);
  const days: WorkoutWeekDaySummary[] = allDates.map((date) => {
    const daySessions = sessionsByDate.get(date) ?? [];
    let state: WorkoutDayState = "none";

    if (daySessions.some((s) => s.status === "completed")) {
      state = "completed";
    } else if (daySessions.some((s) => s.status === "skipped")) {
      state = "skipped";
    } else if (daySessions.length > 0) {
      state = "planned";
    }

    return { date, state };
  });

  return {
    plannedCount,
    plannedCompletedCount,
    adHocCompletedCount,
    completedCount,
    skippedCount,
    adherencePercent,
    activeDays,
    days,
  };
}

/**
 * Formats a concise weekly workout label for display in progress summaries.
 *
 * Examples:
 *   "3 of 4 planned sessions completed"
 *   "3 of 4 planned sessions completed · +2 ad-hoc"
 *   "No planned sessions this week"
 */
export function formatWorkoutWeekLabel(stats: WorkoutWeekStats): string {
  if (stats.plannedCount === 0 && stats.adHocCompletedCount === 0) {
    return "No sessions logged this week";
  }

  if (stats.plannedCount === 0) {
    const n = stats.adHocCompletedCount;
    return `${n} ad-hoc ${n === 1 ? "activity" : "activities"} logged this week`;
  }

  const base = `${stats.plannedCompletedCount} of ${stats.plannedCount} planned ${stats.plannedCount === 1 ? "session" : "sessions"} completed`;
  const adHocSuffix =
    stats.adHocCompletedCount > 0 ? ` · +${stats.adHocCompletedCount} ad-hoc` : "";

  return `${base}${adHocSuffix}`;
}
