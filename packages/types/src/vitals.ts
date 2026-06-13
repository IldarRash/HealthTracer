import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import { heartRateZoneSummarySchema } from "./device-metrics.js";

// ---------------------------------------------------------------------------
// Sleep overview read model
// ---------------------------------------------------------------------------

export const sleepStageSummaryResponseSchema = z.object({
  awakeMinutes: z.number().int().nonnegative().nullable(),
  remMinutes: z.number().int().nonnegative().nullable(),
  lightMinutes: z.number().int().nonnegative().nullable(),
  deepMinutes: z.number().int().nonnegative().nullable(),
});

export type SleepStageSummaryResponse = z.infer<typeof sleepStageSummaryResponseSchema>;

export const sleepNightSummarySchema = z.object({
  date: isoDateSchema,
  durationMinutes: z.number().nonnegative(),
  windowStart: isoDateTimeSchema.nullable(),
  windowEnd: isoDateTimeSchema.nullable(),
  stageSummary: sleepStageSummaryResponseSchema.nullable(),
});

export type SleepNightSummary = z.infer<typeof sleepNightSummarySchema>;

export const sleepTrendPointSchema = z.object({
  date: isoDateSchema,
  durationMinutes: z.number().nonnegative(),
});

export type SleepTrendPoint = z.infer<typeof sleepTrendPointSchema>;

/**
 * GET /health-metrics/sleep response shape.
 *
 * - `lastNight`: most recent sleep record (null when no data).
 * - `trend`: last 30 days of daily sleep durations for the bar chart.
 *   Ordered **oldest-first** (ascending date) so charts can plot left-to-right.
 * - `sevenDayAverageMinutes`: rolling 7-day average (null when fewer than 1 night available).
 * - `recentNights`: last 7 nights for the detail list.
 */
export const sleepOverviewResponseSchema = z.object({
  lastNight: sleepNightSummarySchema.nullable(),
  trend: z.array(sleepTrendPointSchema),
  sevenDayAverageMinutes: z.number().nonnegative().nullable(),
  recentNights: z.array(sleepNightSummarySchema),
});

export type SleepOverviewResponse = z.infer<typeof sleepOverviewResponseSchema>;

// ---------------------------------------------------------------------------
// Pulse overview read model
// ---------------------------------------------------------------------------

export const hrTrendPointSchema = z.object({
  date: isoDateTimeSchema,
  value: z.number(),
});

export type HrTrendPoint = z.infer<typeof hrTrendPointSchema>;

export const hrLatestSchema = z.object({
  value: z.number(),
  unit: z.string(),
  observedAt: isoDateTimeSchema,
});

export type HrLatest = z.infer<typeof hrLatestSchema>;

export const workoutHeartRateSummarySchema = z.object({
  snapshotId: z.string().uuid(),
  observedAt: isoDateTimeSchema,
  activityType: z.string().nullable(),
  durationMinutes: z.number().nonnegative(),
  avgBpm: z.number().int().positive(),
  maxBpm: z.number().int().positive(),
  minBpm: z.number().int().positive(),
  zoneSummary: heartRateZoneSummarySchema,
});

export type WorkoutHeartRateSummary = z.infer<typeof workoutHeartRateSummarySchema>;

export const workoutHeartRateDetailSchema = workoutHeartRateSummarySchema.extend({
  /** Downsampled HR samples for the per-workout HR line chart. */
  samples: z.array(
    z.object({
      offsetSec: z.number().int().nonnegative(),
      bpm: z.number().int().positive(),
    }),
  ),
});

export type WorkoutHeartRateDetail = z.infer<typeof workoutHeartRateDetailSchema>;

/**
 * GET /health-metrics/pulse response shape.
 *
 * - `restingHeartRate`: latest RHR value + 30-day trend.
 *   `trend` is **oldest-first** (ascending date) so charts can plot left-to-right.
 * - `hrv`: latest HRV value + 30-day trend.
 *   `trend` is **oldest-first** (ascending date).
 * - `readiness`: latest readiness score (null when no data).
 * - `recentWorkouts`: last 6 workout HR snapshots with zone summaries.
 */
export const pulseOverviewResponseSchema = z.object({
  restingHeartRate: z.object({
    latest: hrLatestSchema.nullable(),
    unit: z.string(),
    trend: z.array(hrTrendPointSchema),
  }),
  hrv: z.object({
    latest: hrLatestSchema.nullable(),
    unit: z.string(),
    trend: z.array(hrTrendPointSchema),
  }),
  readiness: hrLatestSchema.nullable(),
  recentWorkouts: z.array(workoutHeartRateSummarySchema),
});

export type PulseOverviewResponse = z.infer<typeof pulseOverviewResponseSchema>;
