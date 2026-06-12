import type {
  ProgressHistoryBucket,
  ProgressHistoryDomainSufficiency,
  ProgressHistoryGranularity,
  ProgressHistoryNoteCode,
  ProgressHistoryPlanChangeMarker,
  ProgressHistoryReviewSummary,
  WorkoutSession,
  WorkoutWeekStatsSessionInput,
} from "@health/types";
import {
  aggregateWorkoutWeek,
  buildManualCheckInSignals,
  clampProgressHistoryLookback,
  computeRecoveryBand,
  formatIsoDateInTimezone,
  getTodayIsoDateInTimezone,
  getWeekStartIsoDate,
  MAX_PROGRESS_HISTORY_PLAN_CHANGE_MARKERS,
  progressHistoryReviewSummarySchema,
  shiftIsoDate,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { HabitsRepository } from "../habits/habits.repository.js";
import { NutritionRepository } from "../nutrition/nutrition.repository.js";
import { RecoveryCheckInsRepository } from "../recovery/recovery-check-ins.repository.js";
import { UsersService } from "../users/users.service.js";
import { WellbeingCheckInsRepository } from "../wellbeing-check-ins/wellbeing-check-ins.repository.js";
import { WorkoutsRepository } from "../workouts/workouts.repository.js";

/**
 * Per-domain data-sufficiency calibration (owner decision, review F4):
 *
 * - workout: ratio of planned (non ad-hoc) sessions in range that carry a
 *   recorded final status (completed/skipped). A fully adherent 3x/week user
 *   scores 1.0 regardless of window length — sufficiency measures how well the
 *   PLAN was tracked, not how many calendar days had a workout. No planned
 *   sessions in range → "insufficient".
 * - habits / recovery / wellbeing: ratio of BUCKETS containing at least one
 *   data point — periodic check-ins are judged against the report's own
 *   granularity, not raw days.
 *
 * Shared thresholds on the resulting coverage ratio:
 *   coverage <  0.2 → insufficient
 *   coverage <  0.6 → partial
 *   otherwise       → sufficient
 */
const INSUFFICIENT_COVERAGE_BELOW_RATIO = 0.2;
const SUFFICIENT_COVERAGE_FROM_RATIO = 0.6;

/**
 * Padding applied to the SQL createdAt range for plan-change markers: a UTC
 * timestamp up to ±14h away from the user-timezone window edge can still
 * format into the window, so the coarse SQL filter widens by one day on each
 * side and buildPlanChangeMarkers re-applies the exact per-timezone day filter.
 */
const REVISION_RANGE_PADDING_MS = 24 * 60 * 60 * 1000;

interface BucketRange {
  bucketStart: string;
  bucketEnd: string;
}

interface SessionExecutionRow extends WorkoutWeekStatsSessionInput {
  completionFatigue: number | null;
}

/**
 * On-demand, numeric-only progress-history aggregation for deep reviews.
 *
 * Reads ONLY numeric/enum/date projections — never note or free-text columns
 * (workout titles/feedback notes, wellbeing notes/tags are never selected; see
 * the narrow repository methods). The result is parsed through
 * progressHistoryReviewSummarySchema, which is structurally unable to carry
 * free text. Default turns never invoke this service (lazy, plan/tool-driven).
 */
@Injectable()
export class ProgressHistoryAggregateService {
  constructor(
    private readonly workoutsRepository: WorkoutsRepository,
    private readonly nutritionRepository: NutritionRepository,
    private readonly habitsRepository: HabitsRepository,
    private readonly recoveryCheckInsRepository: RecoveryCheckInsRepository,
    private readonly wellbeingCheckInsRepository: WellbeingCheckInsRepository,
    private readonly usersService: UsersService,
  ) {}

  async buildReviewSummaryForAuth(
    auth: ClerkAuthContext,
    requestedPeriodDays: number,
  ): Promise<ProgressHistoryReviewSummary> {
    const user = await this.usersService.resolveFromAuth(auth);

    return this.buildReviewSummary(user.id, requestedPeriodDays, new Date(), user.timezone);
  }

  async buildReviewSummary(
    userId: string,
    requestedPeriodDays: number,
    now: Date = new Date(),
    timezone = "UTC",
  ): Promise<ProgressHistoryReviewSummary> {
    const normalizedRequestedDays = Math.max(1, Math.floor(requestedPeriodDays));
    const grant = clampProgressHistoryLookback(normalizedRequestedDays);
    const endDate = getTodayIsoDateInTimezone(timezone, now);
    const startDate = shiftIsoDate(endDate, -(grant.grantedPeriodDays - 1));
    const bucketRanges = buildBucketRanges(startDate, endDate, grant.granularity, grant.bucketCap);
    // Coarse SQL bounds for revision timestamps (exact per-timezone day filter
    // happens in buildPlanChangeMarkers).
    const revisionCreatedFrom = new Date(
      Date.parse(`${startDate}T00:00:00.000Z`) - REVISION_RANGE_PADDING_MS,
    );
    const revisionCreatedTo = new Date(
      Date.parse(`${endDate}T23:59:59.999Z`) + REVISION_RANGE_PADDING_MS,
    );

    const [
      sessionRows,
      habitRows,
      recoveryRows,
      wellbeingRows,
      workoutRevisionDates,
      nutritionRevisionDates,
    ] = await Promise.all([
      this.workoutsRepository.listSessionExecutionRowsByUserIdInDateRange(
        userId,
        startDate,
        endDate,
      ),
      this.habitsRepository.listCompletionsInDateRange(userId, startDate, endDate),
      this.recoveryCheckInsRepository.listByUserAndDateRange(userId, startDate, endDate),
      this.wellbeingCheckInsRepository.listScoreRowsByUserAndDateRange(
        userId,
        startDate,
        endDate,
      ),
      this.workoutsRepository.listRevisionCreatedAtByUserId(
        userId,
        revisionCreatedFrom,
        revisionCreatedTo,
      ),
      this.nutritionRepository.listRevisionCreatedAtByUserId(
        userId,
        revisionCreatedFrom,
        revisionCreatedTo,
      ),
    ]);

    const sessions: SessionExecutionRow[] = sessionRows.map((row) => ({
      plannedDate: row.plannedDate,
      // The DB columns are unconstrained text; runtime values are the session
      // status/source unions enforced at write time by the workouts module.
      status: row.status as WorkoutSession["status"],
      source: row.source as WorkoutSession["source"],
      completionFatigue: row.completionFatigue,
    }));

    const recoveryBandByDate = new Map<string, ReturnType<typeof computeRecoveryBand>["band"]>(
      recoveryRows.map((row) => [
        row.date,
        computeRecoveryBand({
          signals: buildManualCheckInSignals({
            soreness: row.soreness,
            fatigue: row.fatigue,
            moodScore: row.moodScore,
            perceivedStress: row.perceivedStress,
          }),
        }).band,
      ]),
    );

    const buckets: ProgressHistoryBucket[] = bucketRanges.map((range) =>
      buildBucket(range, sessions, habitRows, recoveryBandByDate, wellbeingRows),
    );

    const workoutDays = new Set(sessions.map((row) => row.plannedDate));
    const habitDays = new Set(habitRows.map((row) => row.date));
    const recoveryDays = new Set(recoveryRows.map((row) => row.date));
    const wellbeingDays = new Set(wellbeingRows.map((row) => row.date));
    const coveredDays = new Set([
      ...workoutDays,
      ...habitDays,
      ...recoveryDays,
      ...wellbeingDays,
    ]).size;

    const plannedSessions = sessions.filter((row) => row.source !== "ad_hoc");
    const dataSufficiency = {
      workout: resolveWorkoutSufficiency(plannedSessions),
      habits: resolveBucketCoverageSufficiency(
        buckets,
        (bucket) => bucket.habits.adherencePercent !== null,
      ),
      recovery: resolveBucketCoverageSufficiency(
        buckets,
        (bucket) =>
          bucket.recovery.wellSupportedDays +
            bucket.recovery.moderateLoadDays +
            bucket.recovery.prioritizeRecoveryDays +
            bucket.recovery.insufficientDataDays >
          0,
      ),
      wellbeing: resolveBucketCoverageSufficiency(
        buckets,
        (bucket) => bucket.wellbeing.checkInCount > 0,
      ),
    };

    const noteCodes: ProgressHistoryNoteCode[] = [];

    if (grant.clamped) {
      noteCodes.push("lookback_clamped");
    }

    // Mirrors the workout sufficiency denominator: with no PLANNED sessions in
    // range, plan adherence cannot be evaluated (ad-hoc-only data included).
    if (plannedSessions.length === 0) {
      noteCodes.push("no_workout_data");
    }

    if (dataSufficiency.recovery === "insufficient") {
      noteCodes.push("sparse_recovery_data");
    }

    if (dataSufficiency.wellbeing === "insufficient") {
      noteCodes.push("sparse_wellbeing_data");
    }

    const planChangeMarkers = buildPlanChangeMarkers(
      workoutRevisionDates,
      nutritionRevisionDates,
      startDate,
      endDate,
      timezone,
    );

    // Final parse guarantees the numeric-only structural contract; any drift
    // (e.g. an accidental free-text field) fails loudly here.
    return progressHistoryReviewSummarySchema.parse({
      requestedPeriodDays: normalizedRequestedDays,
      grantedPeriodDays: grant.grantedPeriodDays,
      granularity: grant.granularity,
      buckets,
      planChangeMarkers,
      dataSufficiency,
      coveredDays,
      noteCodes,
    });
  }
}

// ---------------------------------------------------------------------------
// Pure aggregation helpers
// ---------------------------------------------------------------------------

function buildBucket(
  range: BucketRange,
  sessions: readonly SessionExecutionRow[],
  habitRows: ReadonlyArray<{ date: string; status: string }>,
  recoveryBandByDate: ReadonlyMap<string, string>,
  wellbeingRows: ReadonlyArray<{ date: string; moodScore: number; stressScore: number }>,
): ProgressHistoryBucket {
  const inRange = (date: string) => date >= range.bucketStart && date <= range.bucketEnd;

  // Workout execution: reuse the shared canonical week aggregation (it works
  // for any [start, end] window, not just Mon-Sun weeks).
  const workoutStats = aggregateWorkoutWeek(sessions, range.bucketStart, range.bucketEnd);
  const fatigueValues = sessions
    .filter(
      (row) =>
        inRange(row.plannedDate) && row.status === "completed" && row.completionFatigue != null,
    )
    .map((row) => row.completionFatigue as number);

  // Habit adherence: completed share of logged outcomes (completed/skipped/missed).
  // Unresolved "pending" rows are excluded from the denominator.
  const habitOutcomes = habitRows.filter(
    (row) => inRange(row.date) && row.status !== "pending",
  );
  const habitCompleted = habitOutcomes.filter((row) => row.status === "completed").length;

  // Recovery: per-day readiness bands derived from numeric check-in scores via
  // the shared computeRecoveryBand helper (one check-in per user+date).
  const bandCounts = {
    well_supported: 0,
    moderate_load: 0,
    prioritize_recovery: 0,
    insufficient_data: 0,
  };

  for (const [date, band] of recoveryBandByDate) {
    if (inRange(date) && band in bandCounts) {
      bandCounts[band as keyof typeof bandCounts] += 1;
    }
  }

  const bucketWellbeingRows = wellbeingRows.filter((row) => inRange(row.date));

  return {
    bucketStart: range.bucketStart,
    workout: {
      plannedCount: workoutStats.plannedCount,
      completedCount: workoutStats.completedCount,
      skippedCount: workoutStats.skippedCount,
      adherencePercent: workoutStats.plannedCount > 0 ? workoutStats.adherencePercent : null,
      activeDays: workoutStats.activeDays,
      avgFatigue: roundedAverage(fatigueValues),
    },
    habits: {
      adherencePercent:
        habitOutcomes.length > 0
          ? Math.round((habitCompleted / habitOutcomes.length) * 100)
          : null,
    },
    recovery: {
      wellSupportedDays: bandCounts.well_supported,
      moderateLoadDays: bandCounts.moderate_load,
      prioritizeRecoveryDays: bandCounts.prioritize_recovery,
      insufficientDataDays: bandCounts.insufficient_data,
    },
    wellbeing: {
      avgMoodScore: roundedAverage(bucketWellbeingRows.map((row) => row.moodScore)),
      avgStressScore: roundedAverage(bucketWellbeingRows.map((row) => row.stressScore)),
      checkInCount: bucketWellbeingRows.length,
    },
  };
}

function buildBucketRanges(
  startDate: string,
  endDate: string,
  granularity: ProgressHistoryGranularity,
  bucketCap: number,
): BucketRange[] {
  const ranges: BucketRange[] = [];

  // The leading weekly/monthly bucket is clamped to the queried startDate so
  // the first bucket never claims pre-window days that were never queried
  // (they would otherwise read as silent zero-data).
  const clampToWindow = (bucketStart: string): string =>
    bucketStart < startDate ? startDate : bucketStart;

  if (granularity === "daily") {
    let current = startDate;

    while (current <= endDate) {
      ranges.push({ bucketStart: current, bucketEnd: current });
      current = shiftIsoDate(current, 1);
    }
  } else if (granularity === "weekly") {
    // ISO weeks, Monday-start — the same convention as getWeekStartIsoDate /
    // resolveWeekRange used by the weekly progress module.
    let current = getWeekStartIsoDate(startDate);

    while (current <= endDate) {
      ranges.push({ bucketStart: clampToWindow(current), bucketEnd: shiftIsoDate(current, 6) });
      current = shiftIsoDate(current, 7);
    }
  } else {
    // Calendar months.
    let current = `${startDate.slice(0, 7)}-01`;

    while (current <= endDate) {
      const next = nextMonthStart(current);
      ranges.push({ bucketStart: clampToWindow(current), bucketEnd: shiftIsoDate(next, -1) });
      current = next;
    }
  }

  // Defensive cap enforcement: keep the most recent buckets (oldest-first trim).
  return ranges.length > bucketCap ? ranges.slice(ranges.length - bucketCap) : ranges;
}

function nextMonthStart(monthStartIsoDate: string): string {
  const year = Number.parseInt(monthStartIsoDate.slice(0, 4), 10);
  const month = Number.parseInt(monthStartIsoDate.slice(5, 7), 10);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

function gradeCoverageRatio(coverage: number): ProgressHistoryDomainSufficiency {
  if (coverage < INSUFFICIENT_COVERAGE_BELOW_RATIO) {
    return "insufficient";
  }

  if (coverage < SUFFICIENT_COVERAGE_FROM_RATIO) {
    return "partial";
  }

  return "sufficient";
}

/**
 * Workout sufficiency = recorded final statuses over planned sessions (see the
 * calibration comment on the threshold constants). `plannedSessions` must
 * already exclude ad-hoc sessions.
 */
function resolveWorkoutSufficiency(
  plannedSessions: readonly SessionExecutionRow[],
): ProgressHistoryDomainSufficiency {
  if (plannedSessions.length === 0) {
    return "insufficient";
  }

  const resolvedCount = plannedSessions.filter((row) => row.status !== "planned").length;

  return gradeCoverageRatio(resolvedCount / plannedSessions.length);
}

/** Check-in domains: sufficiency = fraction of buckets containing any data. */
function resolveBucketCoverageSufficiency(
  buckets: readonly ProgressHistoryBucket[],
  hasData: (bucket: ProgressHistoryBucket) => boolean,
): ProgressHistoryDomainSufficiency {
  if (buckets.length === 0) {
    return "insufficient";
  }

  return gradeCoverageRatio(buckets.filter(hasData).length / buckets.length);
}

function buildPlanChangeMarkers(
  workoutRevisionDates: readonly Date[],
  nutritionRevisionDates: readonly Date[],
  startDate: string,
  endDate: string,
  timezone: string,
): ProgressHistoryPlanChangeMarker[] {
  const markers = new Map<string, ProgressHistoryPlanChangeMarker>();

  const addMarkers = (dates: readonly Date[], domain: "workout" | "nutrition") => {
    for (const createdAt of dates) {
      // Same timezone convention as the bucket window (endDate is the user's
      // local "today") — a near-midnight UTC timestamp must not land the
      // marker on the wrong local day.
      const isoDate = formatIsoDateInTimezone(timezone, createdAt);

      if (isoDate >= startDate && isoDate <= endDate) {
        markers.set(`${domain}:${isoDate}`, { isoDate, domain });
      }
    }
  };

  addMarkers(workoutRevisionDates, "workout");
  addMarkers(nutritionRevisionDates, "nutrition");

  // Chronological, deduped per (domain, day), most recent markers kept on overflow.
  return [...markers.values()]
    .sort((left, right) => left.isoDate.localeCompare(right.isoDate))
    .slice(-MAX_PROGRESS_HISTORY_PLAN_CHANGE_MARKERS);
}

function roundedAverage(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return Math.round((total / values.length) * 10) / 10;
}
