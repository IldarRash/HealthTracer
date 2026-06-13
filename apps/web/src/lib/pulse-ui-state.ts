/**
 * Pure UI-state helpers for the /pulse screen.
 *
 * Wellness-neutral framing throughout:
 * - Heart-rate zones are framed as fitness %HRmax bands (Z1–Z5), never clinical.
 * - No "normal/abnormal" — only "typical range" context.
 * - Readiness is a general wellness score, not a medical measure.
 */

import type {
  HrTrendPoint,
  PulseOverviewResponse,
  WorkoutHeartRateSummary,
  WorkoutHeartRateDetail,
} from "@health/types";
import { formatMonthDayShort } from "./date-format";

// ---------------------------------------------------------------------------
// Zone color map (fitness %HRmax, Z1–Z5)
// ---------------------------------------------------------------------------

/** Wellness-neutral zone labels — fitness effort bands, not clinical zones. */
export const ZONE_LABELS: Record<string, string> = {
  z1: "Z1 · Recovery",
  z2: "Z2 · Base",
  z3: "Z3 · Aerobic",
  z4: "Z4 · Threshold",
  z5: "Z5 · Peak",
};

export const ZONE_COLORS: Record<string, string> = {
  z1: "var(--color-metric-blue)",
  z2: "var(--color-metric-green)",
  z3: "var(--color-metric-amber)",
  z4: "#f97316",
  z5: "var(--color-metric-red)",
};

export const ZONE_KEYS = ["z1", "z2", "z3", "z4", "z5"] as const;
export type ZoneKey = (typeof ZONE_KEYS)[number];

// ---------------------------------------------------------------------------
// BPM formatting
// ---------------------------------------------------------------------------

/** Short formatted BPM without unit. */
export function formatBpmValue(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(Math.round(value));
}

// ---------------------------------------------------------------------------
// Trend chart model (RHR / HRV)
// ---------------------------------------------------------------------------

export type HrTrendChartPoint = {
  ts: number;
  value: number;
  label: string;
};

export type HrTrendChartModel = {
  points: HrTrendChartPoint[];
  unit: string;
  yDomain: [number, number];
};

const Y_PADDING_FRACTION = 0.08;

/** Build chart-ready points from a trend array. Returns null for <2 points. */
export function buildHrTrendChartModel(
  trend: readonly HrTrendPoint[],
  unit: string,
): HrTrendChartModel | null {
  if (trend.length < 2) return null;

  const sorted = [...trend].sort((a, b) => a.date.localeCompare(b.date));
  const points: HrTrendChartPoint[] = sorted.map((point) => {
    const date = new Date(point.date);
    return {
      ts: date.getTime(),
      value: point.value,
      label: Number.isNaN(date.getTime()) ? "" : formatMonthDayShort(date),
    };
  });

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = span === 0 ? Math.abs(max) * 0.1 || 1 : span * Y_PADDING_FRACTION;

  return {
    points,
    unit,
    yDomain: [min - pad, max + pad],
  };
}

// ---------------------------------------------------------------------------
// Readiness ring
// ---------------------------------------------------------------------------

/**
 * Clamps a readiness value (0–100) for the DsRing component.
 * Returns null when no readiness data.
 */
export function buildReadinessRingValue(
  readiness: PulseOverviewResponse["readiness"],
): number | null {
  if (!readiness) return null;
  return Math.min(100, Math.max(0, Math.round(readiness.value)));
}

/** Color for the readiness ring based on value. */
export function readinessRingColor(value: number): string {
  if (value >= 70) return "var(--color-metric-green)";
  if (value >= 40) return "var(--color-metric-amber)";
  return "var(--color-metric-red)";
}

// ---------------------------------------------------------------------------
// Zone distribution (donut segments)
// ---------------------------------------------------------------------------

export type ZoneSegment = {
  key: ZoneKey;
  label: string;
  minutes: number;
  pct: number;
  color: string;
};

/** Aggregate zone minutes across multiple workouts. Returns null when total = 0. */
export function buildAggregateZoneSegments(
  workouts: readonly WorkoutHeartRateSummary[],
): ZoneSegment[] | null {
  if (workouts.length === 0) return null;

  const totals = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
  for (const w of workouts) {
    totals.z1 += w.zoneSummary.z1Min;
    totals.z2 += w.zoneSummary.z2Min;
    totals.z3 += w.zoneSummary.z3Min;
    totals.z4 += w.zoneSummary.z4Min;
    totals.z5 += w.zoneSummary.z5Min;
  }

  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return ZONE_KEYS.map((key) => ({
    key,
    label: ZONE_LABELS[key]!,
    minutes: totals[key],
    pct: Math.round((totals[key] / total) * 100),
    color: ZONE_COLORS[key]!,
  }));
}

// ---------------------------------------------------------------------------
// Per-workout HR line
// ---------------------------------------------------------------------------

export type WorkoutHrLinePoint = {
  offsetSec: number;
  bpm: number;
  /** Formatted offset as "Xm Ys" for tooltip. */
  offsetLabel: string;
};

export function formatOffsetLabel(offsetSec: number): string {
  const m = Math.floor(offsetSec / 60);
  const s = offsetSec % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export function buildWorkoutHrLinePoints(
  detail: WorkoutHeartRateDetail,
): WorkoutHrLinePoint[] {
  return detail.samples.map((sample) => ({
    offsetSec: sample.offsetSec,
    bpm: sample.bpm,
    offsetLabel: formatOffsetLabel(sample.offsetSec),
  }));
}

// ---------------------------------------------------------------------------
// Workout row display
// ---------------------------------------------------------------------------

export type WorkoutRow = {
  snapshotId: string;
  dateLabel: string;
  activityLabel: string;
  durationLabel: string;
  avgBpmLabel: string;
  maxBpmLabel: string;
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function buildWorkoutRows(
  workouts: readonly WorkoutHeartRateSummary[],
  activityFallback = "Workout",
  bpmUnit = "bpm",
): WorkoutRow[] {
  return workouts.map((w) => ({
    snapshotId: w.snapshotId,
    dateLabel: formatMonthDayShort(new Date(w.observedAt)),
    activityLabel: w.activityType ?? activityFallback,
    durationLabel: formatDuration(Math.round(w.durationMinutes)),
    avgBpmLabel: `${w.avgBpm} ${bpmUnit}`,
    maxBpmLabel: `max ${w.maxBpm}`,
  }));
}

// ---------------------------------------------------------------------------
// Has data check
// ---------------------------------------------------------------------------

export function pulseHasData(overview: PulseOverviewResponse): boolean {
  return (
    overview.restingHeartRate.latest !== null ||
    overview.hrv.latest !== null ||
    overview.readiness !== null ||
    overview.recentWorkouts.length > 0
  );
}
