import { z } from "zod";
import { isoDateSchema } from "./dates.js";

// ---------------------------------------------------------------------------
// Progress history review summary — the numeric-only deep-review packet.
//
// CRITICAL INVARIANT: this schema must be structurally unable to carry free
// text. Every field is a number, a z.enum value, or an ISO date validated by
// regex (isoDateSchema). There is NO unconstrained z.string() anywhere in this
// file. That structural guarantee is what lets wellbeing/recovery TRENDS reach
// a deep review while the allowSensitiveHealthContext=false code floor stays
// untouched (see docs/product/features/ideal-chat-pipeline.md).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Granularity ladder + clamp (pure, unit-testable)
// ---------------------------------------------------------------------------

export const progressHistoryGranularitySchema = z.enum(["daily", "weekly", "monthly"]);

export type ProgressHistoryGranularity = z.infer<typeof progressHistoryGranularitySchema>;

/** Requested periods up to this many days are bucketed daily. */
export const PROGRESS_HISTORY_DAILY_MAX_DAYS = 14 as const;
/** Requested periods up to this many days (~26 weeks) are bucketed weekly. */
export const PROGRESS_HISTORY_WEEKLY_MAX_DAYS = 182 as const;
/**
 * Monthly granularity grants at most 24 calendar months of lookback
 * (~731 days incl. a leap day). Longer requests are clamped, never refused.
 */
export const PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS = 731 as const;

/** Per-granularity bucket-count caps (cost bound — see the granularity ladder). */
export const PROGRESS_HISTORY_BUCKET_CAPS: Readonly<
  Record<ProgressHistoryGranularity, number>
> = {
  daily: 31,
  weekly: 26,
  monthly: 24,
};

/** Absolute upper bound on buckets[] length (the daily cap is the largest). */
export const MAX_PROGRESS_HISTORY_BUCKETS = 31 as const;

/** Server-side minimum periodDays for the getProgressHistory tool. */
export const MIN_PROGRESS_HISTORY_PERIOD_DAYS = 7 as const;

/**
 * Granularity ladder: ≤14 days → daily, ≤182 days → weekly, longer → monthly.
 */
export function resolveProgressHistoryGranularity(
  requestedDays: number,
): ProgressHistoryGranularity {
  const normalized = normalizeRequestedDays(requestedDays);

  if (normalized <= PROGRESS_HISTORY_DAILY_MAX_DAYS) {
    return "daily";
  }

  if (normalized <= PROGRESS_HISTORY_WEEKLY_MAX_DAYS) {
    return "weekly";
  }

  return "monthly";
}

export interface ProgressHistoryLookbackGrant {
  granularity: ProgressHistoryGranularity;
  /** Days actually granted after the ladder clamp (clamp made visible). */
  grantedPeriodDays: number;
  /** Maximum bucket count for the resolved granularity. */
  bucketCap: number;
  /** True when the requested period exceeded what the ladder grants. */
  clamped: boolean;
}

/**
 * Clamp a requested lookback to the granularity ladder. Cost is bounded by
 * granularity + bucket caps — the period is clamped (with `clamped: true`),
 * never refused.
 */
export function clampProgressHistoryLookback(
  requestedDays: number,
): ProgressHistoryLookbackGrant {
  const normalized = normalizeRequestedDays(requestedDays);
  const granularity = resolveProgressHistoryGranularity(normalized);
  const grantedPeriodDays =
    granularity === "monthly"
      ? Math.min(normalized, PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS)
      : normalized;

  return {
    granularity,
    grantedPeriodDays,
    bucketCap: PROGRESS_HISTORY_BUCKET_CAPS[granularity],
    clamped: grantedPeriodDays < normalized,
  };
}

function normalizeRequestedDays(requestedDays: number): number {
  if (!Number.isFinite(requestedDays)) {
    return 1;
  }

  return Math.max(1, Math.floor(requestedDays));
}

// ---------------------------------------------------------------------------
// Bucket + summary schemas (numbers / enums / ISO dates only)
// ---------------------------------------------------------------------------

const nonNegativeIntSchema = z.number().int().nonnegative();
const percentSchema = z.number().min(0).max(100);
const scoreAverageSchema = z.number().min(0).max(10);

export const progressHistoryWorkoutBucketSchema = z
  .object({
    plannedCount: nonNegativeIntSchema,
    completedCount: nonNegativeIntSchema,
    skippedCount: nonNegativeIntSchema,
    adherencePercent: percentSchema.nullable(),
    activeDays: nonNegativeIntSchema,
    avgFatigue: scoreAverageSchema.nullable(),
  })
  .strict();

export type ProgressHistoryWorkoutBucket = z.infer<typeof progressHistoryWorkoutBucketSchema>;

export const progressHistoryHabitBucketSchema = z
  .object({
    adherencePercent: percentSchema.nullable(),
  })
  .strict();

export type ProgressHistoryHabitBucket = z.infer<typeof progressHistoryHabitBucketSchema>;

export const progressHistoryRecoveryBucketSchema = z
  .object({
    wellSupportedDays: nonNegativeIntSchema,
    moderateLoadDays: nonNegativeIntSchema,
    prioritizeRecoveryDays: nonNegativeIntSchema,
    insufficientDataDays: nonNegativeIntSchema,
  })
  .strict();

export type ProgressHistoryRecoveryBucket = z.infer<typeof progressHistoryRecoveryBucketSchema>;

export const progressHistoryWellbeingBucketSchema = z
  .object({
    avgMoodScore: scoreAverageSchema.nullable(),
    avgStressScore: scoreAverageSchema.nullable(),
    checkInCount: nonNegativeIntSchema,
  })
  .strict();

export type ProgressHistoryWellbeingBucket = z.infer<typeof progressHistoryWellbeingBucketSchema>;

export const progressHistoryBucketSchema = z
  .object({
    bucketStart: isoDateSchema,
    workout: progressHistoryWorkoutBucketSchema,
    habits: progressHistoryHabitBucketSchema,
    recovery: progressHistoryRecoveryBucketSchema,
    wellbeing: progressHistoryWellbeingBucketSchema,
  })
  .strict();

export type ProgressHistoryBucket = z.infer<typeof progressHistoryBucketSchema>;

export const progressHistoryPlanChangeDomainSchema = z.enum(["workout", "nutrition"]);

export type ProgressHistoryPlanChangeDomain = z.infer<
  typeof progressHistoryPlanChangeDomainSchema
>;

export const progressHistoryPlanChangeMarkerSchema = z
  .object({
    isoDate: isoDateSchema,
    domain: progressHistoryPlanChangeDomainSchema,
  })
  .strict();

export type ProgressHistoryPlanChangeMarker = z.infer<
  typeof progressHistoryPlanChangeMarkerSchema
>;

export const MAX_PROGRESS_HISTORY_PLAN_CHANGE_MARKERS = 20 as const;

export const progressHistoryDomainSufficiencySchema = z.enum([
  "sufficient",
  "partial",
  "insufficient",
]);

export type ProgressHistoryDomainSufficiency = z.infer<
  typeof progressHistoryDomainSufficiencySchema
>;

export const progressHistoryDataSufficiencySchema = z
  .object({
    workout: progressHistoryDomainSufficiencySchema,
    habits: progressHistoryDomainSufficiencySchema,
    recovery: progressHistoryDomainSufficiencySchema,
    wellbeing: progressHistoryDomainSufficiencySchema,
  })
  .strict();

export type ProgressHistoryDataSufficiency = z.infer<
  typeof progressHistoryDataSufficiencySchema
>;

export const progressHistoryNoteCodeSchema = z.enum([
  "lookback_clamped",
  "sparse_wellbeing_data",
  "sparse_recovery_data",
  "no_workout_data",
]);

export type ProgressHistoryNoteCode = z.infer<typeof progressHistoryNoteCodeSchema>;

export const progressHistoryReviewSummarySchema = z
  .object({
    requestedPeriodDays: z.number().int().min(1).max(36500),
    grantedPeriodDays: z.number().int().min(1).max(PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS),
    granularity: progressHistoryGranularitySchema,
    buckets: z.array(progressHistoryBucketSchema).max(MAX_PROGRESS_HISTORY_BUCKETS),
    planChangeMarkers: z
      .array(progressHistoryPlanChangeMarkerSchema)
      .max(MAX_PROGRESS_HISTORY_PLAN_CHANGE_MARKERS),
    dataSufficiency: progressHistoryDataSufficiencySchema,
    coveredDays: z.number().int().nonnegative(),
    noteCodes: z.array(progressHistoryNoteCodeSchema).max(8),
  })
  .strict()
  .superRefine((summary, ctx) => {
    const cap = PROGRESS_HISTORY_BUCKET_CAPS[summary.granularity];

    if (summary.buckets.length > cap) {
      ctx.addIssue({
        code: "custom",
        message: `buckets length ${summary.buckets.length} exceeds the ${summary.granularity} bucket cap of ${cap}`,
        path: ["buckets"],
      });
    }
  });

export type ProgressHistoryReviewSummary = z.infer<typeof progressHistoryReviewSummarySchema>;

// ---------------------------------------------------------------------------
// Deep-review prompt context (Phase 4 — sufficiency framing)
//
// Carried on FinalDecisionRequest and DomainLlmStepRequest for review turns so
// the prompt templates can frame what is observed vs uncertain, name the
// analyzed range, and (when data quality is not "sufficient") offer exactly
// one narrowing follow-up. Numbers + enum only — never free text.
// ---------------------------------------------------------------------------

export const deepReviewPromptContextSchema = z
  .object({
    /** Lookback the user asked for. Null when no explicit period was requested. */
    requestedPeriodDays: z.number().int().min(1).max(36500).nullable(),
    /** Lookback actually granted after the ladder/profile clamp. */
    grantedPeriodDays: z
      .number()
      .int()
      .min(1)
      .max(PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS),
    /**
     * Worst-of data quality across the review summary's per-domain
     * dataSufficiency values (and the compression summary's dataQuality when
     * present). Derived via deriveDeepReviewDataQuality.
     */
    dataQuality: progressHistoryDomainSufficiencySchema,
  })
  .strict();

export type DeepReviewPromptContext = z.infer<typeof deepReviewPromptContextSchema>;

const DATA_SUFFICIENCY_SEVERITY: Readonly<
  Record<ProgressHistoryDomainSufficiency, number>
> = {
  sufficient: 0,
  partial: 1,
  insufficient: 2,
};

/**
 * Worst-of reduction over sufficiency values:
 * insufficient > partial > sufficient. Empty input → "sufficient".
 */
export function resolveWorstDataSufficiency(
  values: readonly ProgressHistoryDomainSufficiency[],
): ProgressHistoryDomainSufficiency {
  let worst: ProgressHistoryDomainSufficiency = "sufficient";

  for (const value of values) {
    if (DATA_SUFFICIENCY_SEVERITY[value] > DATA_SUFFICIENCY_SEVERITY[worst]) {
      worst = value;
    }
  }

  return worst;
}

/**
 * Derive the deepReview dataQuality: the worst of the review summary's
 * per-domain dataSufficiency values, further degraded by the compression
 * summary's dataQuality when present (same enum values by construction).
 */
export function deriveDeepReviewDataQuality(
  dataSufficiency: ProgressHistoryDataSufficiency,
  compressionDataQuality?: ProgressHistoryDomainSufficiency | null,
): ProgressHistoryDomainSufficiency {
  const values: ProgressHistoryDomainSufficiency[] = [
    dataSufficiency.workout,
    dataSufficiency.habits,
    dataSufficiency.recovery,
    dataSufficiency.wellbeing,
  ];

  if (compressionDataQuality != null) {
    values.push(compressionDataQuality);
  }

  return resolveWorstDataSufficiency(values);
}

// ---------------------------------------------------------------------------
// Static metric legend (code-owned, NOT user data).
//
// One-line EN/RU description per bucket metric. Rides in the static prefix of
// the domain/decision prompt templates (Phase 4) — cache-friendly, byte-stable.
// ---------------------------------------------------------------------------

export const PROGRESS_HISTORY_BUCKET_METRICS = [
  "bucketStart",
  "workoutPlannedCount",
  "workoutCompletedCount",
  "workoutSkippedCount",
  "workoutAdherencePercent",
  "workoutActiveDays",
  "avgFatigue",
  "habitAdherencePercent",
  "recoveryWellSupportedDays",
  "recoveryModerateLoadDays",
  "recoveryPrioritizeRecoveryDays",
  "recoveryInsufficientDataDays",
  "avgMoodScore",
  "avgStressScore",
  "wellbeingCheckInCount",
] as const;

export type ProgressHistoryBucketMetric = (typeof PROGRESS_HISTORY_BUCKET_METRICS)[number];

export interface ProgressHistoryMetricLegend {
  readonly en: Readonly<Record<ProgressHistoryBucketMetric, string>>;
  readonly ru: Readonly<Record<ProgressHistoryBucketMetric, string>>;
}

export const PROGRESS_HISTORY_METRIC_LEGEND: ProgressHistoryMetricLegend = {
  en: {
    bucketStart: "first calendar date (YYYY-MM-DD) of the aggregation bucket",
    workoutPlannedCount: "number of planned workout sessions scheduled in the bucket",
    workoutCompletedCount: "number of workout sessions completed in the bucket (planned + ad hoc)",
    workoutSkippedCount: "number of planned workout sessions marked skipped in the bucket",
    workoutAdherencePercent:
      "completed planned sessions as a percent of planned sessions (null when nothing was planned)",
    workoutActiveDays: "number of distinct days with at least one completed workout",
    avgFatigue: "average self-reported fatigue 1-10 from post-workout check-ins (null when none)",
    habitAdherencePercent:
      "completed habit entries as a percent of logged habit outcomes (null when none logged)",
    recoveryWellSupportedDays: "days whose recovery check-in mapped to the well-supported band",
    recoveryModerateLoadDays: "days whose recovery check-in mapped to the moderate-load band",
    recoveryPrioritizeRecoveryDays:
      "days whose recovery check-in mapped to the prioritize-recovery band",
    recoveryInsufficientDataDays:
      "days whose recovery check-in had too little signal to assign a band",
    avgMoodScore: "average self-reported mood 1-5 from wellbeing check-ins (null when none)",
    avgStressScore: "average self-reported stress 1-5 from wellbeing check-ins (null when none)",
    wellbeingCheckInCount: "number of wellbeing check-ins logged in the bucket",
  },
  ru: {
    bucketStart: "первая календарная дата (YYYY-MM-DD) интервала агрегации",
    workoutPlannedCount: "количество запланированных тренировок в интервале",
    workoutCompletedCount:
      "количество выполненных тренировок в интервале (плановые + разовые)",
    workoutSkippedCount: "количество пропущенных плановых тренировок в интервале",
    workoutAdherencePercent:
      "выполненные плановые тренировки в процентах от запланированных (null, если ничего не планировалось)",
    workoutActiveDays: "число дней хотя бы с одной выполненной тренировкой",
    avgFatigue:
      "средняя самооценка усталости 1-10 из чек-инов после тренировок (null, если их нет)",
    habitAdherencePercent:
      "выполненные привычки в процентах от отмеченных исходов (null, если отметок нет)",
    recoveryWellSupportedDays:
      "дни, когда чек-ин восстановления попал в зону хорошей поддержки",
    recoveryModerateLoadDays:
      "дни, когда чек-ин восстановления попал в зону умеренной нагрузки",
    recoveryPrioritizeRecoveryDays:
      "дни, когда чек-ин восстановления указывал приоритет восстановления",
    recoveryInsufficientDataDays:
      "дни, когда сигналов чек-ина не хватило для определения зоны",
    avgMoodScore:
      "средняя самооценка настроения 1-5 из чек-инов самочувствия (null, если их нет)",
    avgStressScore:
      "средняя самооценка стресса 1-5 из чек-инов самочувствия (null, если их нет)",
    wellbeingCheckInCount: "число чек-инов самочувствия в интервале",
  },
};
