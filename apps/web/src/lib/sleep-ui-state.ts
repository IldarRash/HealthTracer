/**
 * Pure UI-state helpers for the /sleep screen.
 *
 * Wellness-neutral framing throughout — no "normal/abnormal" or clinical
 * judgement; "typical" 7–9 h is framed as a general wellness target.
 */

import type { SleepNightSummary, SleepOverviewResponse, SleepTrendPoint } from "@health/types";
import { formatMonthDayShort } from "./date-format";

// ---------------------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------------------

/**
 * Formats a duration in minutes as "Xh Ym" (e.g. "7h 32m").
 * Falls back to "—" for null/zero.
 */
export function formatSleepDuration(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) {
    return "—";
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Formats a UTC ISO datetime as a short time string "HH:MM"
 * in the user's local timezone.
 */
export function formatTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

// ---------------------------------------------------------------------------
// Trend bar chart data
// ---------------------------------------------------------------------------

/** Typical sleep target band in minutes for the reference lines. */
export const SLEEP_TARGET_LOW_MINUTES = 7 * 60; // 420
export const SLEEP_TARGET_HIGH_MINUTES = 9 * 60; // 540

export type SleepBarPoint = {
  /** ISO date string — X axis label. */
  date: string;
  /** Short axis label, e.g. "Jun 5". */
  label: string;
  /** Duration in minutes (Y axis value). */
  minutes: number;
  /** Duration as formatted "Xh Ym" for tooltip. */
  durationLabel: string;
  /** Whether this bar meets the typical target range. */
  meetsTarget: boolean;
};

/** Build chart-ready bar data from a 30-day trend. Ordered oldest→newest. */
export function buildSleepBarPoints(trend: readonly SleepTrendPoint[]): SleepBarPoint[] {
  return [...trend]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => ({
      date: point.date,
      label: formatMonthDayShort(point.date),
      minutes: point.durationMinutes,
      durationLabel: formatSleepDuration(point.durationMinutes),
      meetsTarget:
        point.durationMinutes >= SLEEP_TARGET_LOW_MINUTES &&
        point.durationMinutes <= SLEEP_TARGET_HIGH_MINUTES,
    }));
}

// ---------------------------------------------------------------------------
// Stage donut / breakdown
// ---------------------------------------------------------------------------

export type SleepStageSegment = {
  key: "deep" | "rem" | "light" | "awake";
  minutes: number;
  /** 0–100 percent of tracked total (awake excluded from total for the sleep quality view). */
  pct: number;
  color: string;
};

const STAGE_COLORS: Record<string, string> = {
  deep: "var(--color-metric-green)",
  rem: "var(--color-metric-blue)",
  light: "var(--color-metric-amber)",
  awake: "rgba(255,255,255,0.22)",
};

/**
 * Build pie segments from a stage summary. Segments are ordered
 * deep→REM→light→awake. Returns null when all values are null/zero.
 */
export function buildSleepStageSegments(
  stageSummary: SleepNightSummary["stageSummary"],
): SleepStageSegment[] | null {
  if (!stageSummary) return null;

  const deep = stageSummary.deepMinutes ?? 0;
  const rem = stageSummary.remMinutes ?? 0;
  const light = stageSummary.lightMinutes ?? 0;
  const awake = stageSummary.awakeMinutes ?? 0;
  const total = deep + rem + light + awake;

  if (total === 0) return null;

  const toSegment = (
    key: SleepStageSegment["key"],
    minutes: number,
  ): SleepStageSegment => ({
    key,
    minutes,
    pct: Math.round((minutes / total) * 100),
    color: STAGE_COLORS[key]!,
  });

  return [
    toSegment("deep", deep),
    toSegment("rem", rem),
    toSegment("light", light),
    toSegment("awake", awake),
  ];
}

// ---------------------------------------------------------------------------
// Last-night hero model
// ---------------------------------------------------------------------------

export type SleepHeroView = {
  durationLabel: string;
  bedLabel: string;
  wakeLabel: string;
  stageSegments: SleepStageSegment[] | null;
  date: string;
};

export function buildSleepHeroView(night: SleepNightSummary): SleepHeroView {
  return {
    durationLabel: formatSleepDuration(night.durationMinutes),
    bedLabel: formatTimeShort(night.windowStart),
    wakeLabel: formatTimeShort(night.windowEnd),
    stageSegments: buildSleepStageSegments(night.stageSummary),
    date: formatMonthDayShort(night.date),
  };
}

// ---------------------------------------------------------------------------
// Seven-day average
// ---------------------------------------------------------------------------

export function formatSevenDayAverage(minutes: number | null | undefined): string {
  return formatSleepDuration(minutes);
}

// ---------------------------------------------------------------------------
// Recent-nights list
// ---------------------------------------------------------------------------

export type SleepNightRow = {
  date: string;
  dateLabel: string;
  durationLabel: string;
  bedLabel: string;
  wakeLabel: string;
  meetsTarget: boolean;
};

export function buildSleepNightRows(nights: readonly SleepNightSummary[]): SleepNightRow[] {
  return nights.map((night) => ({
    date: night.date,
    dateLabel: formatMonthDayShort(night.date),
    durationLabel: formatSleepDuration(night.durationMinutes),
    bedLabel: formatTimeShort(night.windowStart),
    wakeLabel: formatTimeShort(night.windowEnd),
    meetsTarget:
      night.durationMinutes >= SLEEP_TARGET_LOW_MINUTES &&
      night.durationMinutes <= SLEEP_TARGET_HIGH_MINUTES,
  }));
}

// ---------------------------------------------------------------------------
// Has data check
// ---------------------------------------------------------------------------

export function sleepHasData(overview: SleepOverviewResponse): boolean {
  return overview.lastNight !== null || overview.trend.length > 0;
}
