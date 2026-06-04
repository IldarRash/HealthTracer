import type {
  DeferredProgressDomain,
  ProgressDataStatus,
  ProgressDomain,
  ProgressSourceAggregates,
  TrendDataSufficiency,
  TrendDirection,
  TrendType,
  WorkoutProgressAggregate,
  WorkoutSession,
} from "@health/types";
import { countSufficientDomains } from "@health/types";
import {
  countStructuredWorkoutSessionExerciseProgress,
  isStructuredWorkoutSessionExercise,
} from "@health/types";

export interface WeekRange {
  weekStart: string;
  weekEnd: string;
}

export interface TrendDraft {
  domain: ProgressDomain;
  trendType: TrendType;
  direction: TrendDirection;
  dataSufficiency: TrendDataSufficiency;
  supportingAggregate: Record<string, unknown>;
  message: string;
}

const UNSAFE_PROGRESS_PATTERNS = [
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\btreat(ment|ing|ed)?\b/i,
  /\bprescri(be|ption|bed)\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bmedical(?:ly)?\b/i,
  /\bsymptom(s)?\b/i,
  /\binjur(y|ies|ed)\b/i,
  /\bmedication(s)?\b/i,
  /\bready(?:ness)? score\b/i,
  /\brecovery score\b/i,
];

export function isWellnessSafeProgressMessage(message: string): boolean {
  return !UNSAFE_PROGRESS_PATTERNS.some((pattern) => pattern.test(message));
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00`);
}

export function resolveWeekRange(referenceDate = new Date(), weekStartOverride?: string): WeekRange {
  if (weekStartOverride) {
    const weekStartDate = parseIsoDate(weekStartOverride);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);

    return {
      weekStart: weekStartOverride,
      weekEnd: toIsoDate(weekEndDate),
    };
  }

  const copy = new Date(referenceDate);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);

  const weekEnd = new Date(copy);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return {
    weekStart: toIsoDate(copy),
    weekEnd: toIsoDate(weekEnd),
  };
}

export function resolvePriorWeekRange(weekStart: string): WeekRange {
  const priorStart = parseIsoDate(weekStart);
  priorStart.setDate(priorStart.getDate() - 7);
  return resolveWeekRange(priorStart);
}

function isDateWithinRange(isoDate: string, weekStart: string, weekEnd: string): boolean {
  return isoDate >= weekStart && isoDate <= weekEnd;
}

export function aggregateWorkoutSessions(
  sessions: readonly WorkoutSession[],
  weekStart: string,
  weekEnd: string,
): WorkoutProgressAggregate {
  const weekSessions = sessions.filter((session) =>
    isDateWithinRange(session.plannedDate, weekStart, weekEnd),
  );

  // Ad-hoc sessions are already-completed activities; they count toward
  // completedCount and activeDays but must NOT inflate plannedCount or the
  // adherence denominator (adherence = "of planned sessions").
  const adHocSessions = weekSessions.filter((session) => session.source === "ad_hoc");
  const plannedSessions = weekSessions.filter((session) => session.source !== "ad_hoc");

  const plannedCount = plannedSessions.length;
  const completedCount = weekSessions.filter((session) => session.status === "completed").length;
  const skippedCount = plannedSessions.filter((session) => session.status === "skipped").length;
  // Adherence is measured against planned sessions only.
  const plannedCompletedCount = plannedSessions.filter((session) => session.status === "completed").length;
  const adherencePercent =
    plannedCount > 0 ? Math.round((plannedCompletedCount / plannedCount) * 100) : null;

  const activeDays = new Set(
    weekSessions
      .filter((session) => session.status === "completed" || session.status === "skipped")
      .map((session) => session.plannedDate),
  ).size;

  const fatigueValues = weekSessions
    .filter((session) => session.status === "completed")
    .map((session) => session.feedback.fatigue)
    .filter((value): value is number => typeof value === "number");

  const averageFatigue =
    fatigueValues.length > 0
      ? Math.round(
          (fatigueValues.reduce((total, value) => total + value, 0) / fatigueValues.length) * 10,
        ) / 10
      : null;

  let exercisePlannedCount = 0;
  let exerciseCompletedCount = 0;
  let exerciseSkippedCount = 0;
  let exerciseAdjustedCount = 0;
  let partialSessionCount = 0;

  // Exercise progress only from planned sessions (ad-hoc sessions have no structured exercises).
  for (const session of plannedSessions) {
    const progress = countStructuredWorkoutSessionExerciseProgress(session.exercises);

    exercisePlannedCount += progress.planned;
    exerciseCompletedCount += progress.completed;
    exerciseSkippedCount += progress.skipped;
    exerciseAdjustedCount += progress.adjusted;

    const hasStructuredExercises = session.exercises.some(isStructuredWorkoutSessionExercise);

    if (
      hasStructuredExercises &&
      session.status === "planned" &&
      progress.completed + progress.adjusted + progress.skipped > 0 &&
      progress.planned > 0
    ) {
      partialSessionCount += 1;
    }
  }

  const totalTrackedExercises =
    exercisePlannedCount +
    exerciseCompletedCount +
    exerciseSkippedCount +
    exerciseAdjustedCount;
  const exerciseCompletionPercent =
    totalTrackedExercises > 0
      ? Math.round(
          ((exerciseCompletedCount + exerciseAdjustedCount) / totalTrackedExercises) * 100,
        )
      : null;

  const adHocCompletedCount = adHocSessions.filter(
    (session) => session.status === "completed",
  ).length;

  return {
    plannedCount,
    completedCount,
    skippedCount,
    adherencePercent,
    activeDays,
    sessionIds: weekSessions.map((session) => session.id),
    averageFatigue,
    exercisePlannedCount,
    exerciseCompletedCount,
    exerciseSkippedCount,
    exerciseAdjustedCount,
    exerciseCompletionPercent,
    partialSessionCount,
    adHocCompletedCount,
    plannedCompletedCount,
  };
}

export function buildDeferredDomains(
  aggregates: Pick<
    ProgressSourceAggregates,
    "today" | "nutrition" | "habits" | "recipes" | "recovery"
  >,
): DeferredProgressDomain[] {
  const deferredDomains: DeferredProgressDomain[] = [];

  const today = aggregates.today;
  const habits = aggregates.habits;
  if (!today || today.dataSufficiency === "deferred") {
    const habitsSuffix =
      habits?.dataSufficiency === "deferred" && habits.message
        ? ` ${habits.message}`
        : "";

    deferredDomains.push({
      domain: "today",
      reason: today ? "insufficient_data" : "adherence_not_included",
      message:
        (today?.message ??
          "Daily checklist completion was not available for this weekly summary.") + habitsSuffix,
    });
  }

  const nutrition = aggregates.nutrition;
  if (!nutrition || nutrition.dataSufficiency === "deferred") {
    deferredDomains.push({
      domain: "nutrition",
      reason: nutrition ? "insufficient_data" : "adherence_not_included",
      message:
        nutrition?.message ??
        "Nutrition adherence was not available for this weekly summary.",
    });
  }

  const recipes = aggregates.recipes;
  if (!recipes || recipes.dataSufficiency === "deferred") {
    deferredDomains.push({
      domain: "recipes",
      reason: recipes ? "insufficient_data" : "domain_not_available",
      message:
        recipes?.message ?? "Recipe insights were not available in this weekly summary.",
    });
  }

  const recovery = aggregates.recovery;
  if (!recovery || recovery.daysWithContext === 0) {
    deferredDomains.push({
      domain: "recovery",
      reason: "metrics_not_available",
      message:
        recovery?.message ??
        "Recovery and synced wellness metrics were not included in this weekly summary yet.",
    });
  }

  return deferredDomains;
}

export function resolveProgressDataStatus(
  aggregates: ProgressSourceAggregates,
): ProgressDataStatus {
  const sufficientDomains = countSufficientDomains({
    workout: aggregates.workout,
    today: aggregates.today ?? null,
    nutrition: aggregates.nutrition ?? null,
    habits: aggregates.habits ?? null,
    recovery: aggregates.recovery ?? null,
  });

  const partialSignals = [
    aggregates.workout && aggregates.workout.plannedCount > 0,
    aggregates.today && aggregates.today.dataSufficiency !== "deferred",
    aggregates.nutrition && aggregates.nutrition.dataSufficiency !== "deferred",
    aggregates.habits && aggregates.habits.dataSufficiency !== "deferred",
    aggregates.recovery && aggregates.recovery.daysWithContext > 0,
  ].filter(Boolean).length;

  if (sufficientDomains >= 2) {
    return "sufficient";
  }

  if (partialSignals >= 1) {
    return "partial";
  }

  return "insufficient";
}

export function buildSummaryUserMessage(
  aggregates: ProgressSourceAggregates,
  dataStatus: ProgressDataStatus,
): string {
  const segments: string[] = [];
  const workout = aggregates.workout;
  const today = aggregates.today;
  const nutrition = aggregates.nutrition;
  const habits = aggregates.habits;
  const recovery = aggregates.recovery;

  if (dataStatus === "insufficient") {
    return "There is not enough structured history across workouts, Today, nutrition, habits, or recovery for a full cross-domain weekly review yet. Log a few entries in the domains you care about to build a clearer picture.";
  }

  if (workout && workout.plannedCount > 0) {
    if (workout.plannedCompletedCount === 0) {
      segments.push(
        `You had ${workout.plannedCount} planned workout session${workout.plannedCount === 1 ? "" : "s"} this week, but none were marked completed yet.`,
      );
    } else {
      segments.push(
        `Workouts: you completed ${workout.plannedCompletedCount} of ${workout.plannedCount} planned sessions (${workout.adherencePercent ?? 0}% completion) based on the entries available.`,
      );
    }
  }
  if (workout && workout.adHocCompletedCount > 0) {
    const n = workout.adHocCompletedCount;
    segments.push(
      `Plus ${n} logged ad-hoc ${n === 1 ? "activity" : "activities"} this week.`,
    );
  }

  if (today && today.dataSufficiency !== "deferred") {
    segments.push(`Today: ${today.message}`);
  }

  if (nutrition && nutrition.dataSufficiency !== "deferred") {
    segments.push(`Nutrition: ${nutrition.message}`);
  }

  if (habits && habits.dataSufficiency !== "deferred") {
    segments.push(`Habits: ${habits.message}`);
  }

  if (recovery && recovery.daysWithContext > 0) {
    segments.push(`Recovery: ${recovery.message}`);
  }

  if (segments.length === 0) {
    return "This weekly review reflects the structured entries available so far. Some domains may still be partial or deferred.";
  }

  const observationPrefix =
    dataStatus === "partial"
      ? "This is a partial cross-domain weekly review based on the structured entries available. "
      : "This cross-domain weekly review reflects your structured entries this week. ";

  return `${observationPrefix}${segments.join(" ")} These are observations only; any plan changes still require your approval.`;
}

export function detectWorkoutTrends(
  currentAggregate: WorkoutProgressAggregate,
  priorAggregate: WorkoutProgressAggregate | null,
  weekStart: string,
  weekEnd: string,
): TrendDraft[] {
  const trends: TrendDraft[] = [];

  if (currentAggregate.plannedCount >= 2) {
    trends.push(buildConsistencyTrend(currentAggregate, weekStart, weekEnd));
  } else {
    trends.push({
      domain: "workout",
      trendType: "consistency",
      direction: "unknown",
      dataSufficiency: "insufficient",
      supportingAggregate: {
        plannedCount: currentAggregate.plannedCount,
        minimumPlannedSessions: 2,
      },
      message:
        "Not enough planned workout sessions this week to describe a consistency pattern.",
    });
  }

  if (
    currentAggregate.plannedCount >= 2 &&
    priorAggregate &&
    priorAggregate.plannedCount >= 1
  ) {
    trends.push(buildCompletionRateTrend(currentAggregate, priorAggregate, weekStart, weekEnd));
  } else {
    trends.push({
      domain: "workout",
      trendType: "completion_rate",
      direction: "unknown",
      dataSufficiency: "insufficient",
      supportingAggregate: {
        currentPlannedCount: currentAggregate.plannedCount,
        priorPlannedCount: priorAggregate?.plannedCount ?? 0,
        minimumCurrentPlannedSessions: 2,
        minimumPriorPlannedSessions: 1,
      },
      message:
        "Not enough workout history across this week and the prior week to compare completion patterns.",
    });
  }

  if (currentAggregate.plannedCount >= 3) {
    trends.push(buildSkipRateTrend(currentAggregate, weekStart, weekEnd));
  } else if (currentAggregate.plannedCount > 0) {
    trends.push({
      domain: "workout",
      trendType: "skip_rate",
      direction: "unknown",
      dataSufficiency: "insufficient",
      supportingAggregate: {
        plannedCount: currentAggregate.plannedCount,
        minimumPlannedSessions: 3,
      },
      message:
        "Not enough planned workout sessions this week to describe a skip pattern.",
    });
  }

  return trends;
}

export function detectCrossDomainTrends(
  aggregates: ProgressSourceAggregates,
  weekStart: string,
  weekEnd: string,
): TrendDraft[] {
  const trends: TrendDraft[] = [];
  const sufficientDomains = countSufficientDomains({
    workout: aggregates.workout,
    today: aggregates.today ?? null,
    nutrition: aggregates.nutrition ?? null,
    habits: aggregates.habits ?? null,
    recovery: aggregates.recovery ?? null,
  });

  if (sufficientDomains < 2) {
    trends.push({
      domain: "today",
      trendType: "cross_domain_execution",
      direction: "unknown",
      dataSufficiency: "insufficient",
      supportingAggregate: {
        weekStart,
        weekEnd,
        sufficientDomains,
        minimumSufficientDomains: 2,
      },
      message:
        "Not enough cross-domain data this week to describe a combined execution pattern yet.",
    });
  } else {
    const executionNotes: string[] = [];

    if (aggregates.workout && aggregates.workout.plannedCount > 0) {
      executionNotes.push("workout");
    }

    if (aggregates.today && aggregates.today.dataSufficiency !== "deferred") {
      executionNotes.push("Today");
    }

    if (aggregates.nutrition && aggregates.nutrition.dataSufficiency !== "deferred") {
      executionNotes.push("nutrition");
    }

    if (aggregates.habits && aggregates.habits.dataSufficiency !== "deferred") {
      executionNotes.push("habits");
    }

    trends.push({
      domain: "today",
      trendType: "cross_domain_execution",
      direction: "stable",
      dataSufficiency: sufficientDomains >= 3 ? "sufficient" : "partial",
      supportingAggregate: {
        weekStart,
        weekEnd,
        sufficientDomains,
        domainsIncluded: executionNotes,
      },
      message: `This week includes structured signals across ${executionNotes.join(", ")} based on the entries available, which may suggest a broader weekly execution pattern rather than a single-domain snapshot.`,
    });
  }

  const habits = aggregates.habits;
  if (!habits || habits.dataSufficiency === "deferred" || habits.activeHabitCount === 0) {
    trends.push({
      domain: "today",
      trendType: "habit_consistency",
      direction: "unknown",
      dataSufficiency: "insufficient",
      supportingAggregate: {
        weekStart,
        weekEnd,
        activeHabitCount: habits?.activeHabitCount ?? 0,
      },
      message:
        "Not enough habit completion entries this week to describe a habit consistency pattern.",
    });
  } else {
    const direction: TrendDirection =
      (habits.adherencePercent ?? 0) >= 70
        ? "up"
        : (habits.adherencePercent ?? 0) >= 40
          ? "stable"
          : "down";

    trends.push({
      domain: "today",
      trendType: "habit_consistency",
      direction,
      dataSufficiency: habits.dataSufficiency === "sufficient" ? "sufficient" : "partial",
      supportingAggregate: {
        weekStart,
        weekEnd,
        adherencePercent: habits.adherencePercent,
        completedCount: habits.completedCount,
        missedCount: habits.missedCount,
      },
      message:
        habits.adherencePercent != null
          ? `Habit completions were marked on roughly ${habits.adherencePercent}% of tracked habit opportunities this week based on the entries available.`
          : "Habit completion entries were limited this week based on the data available.",
    });
  }

  const workout = aggregates.workout;
  const recovery = aggregates.recovery;
  if (
    !workout ||
    workout.plannedCount < 2 ||
    !recovery ||
    recovery.daysWithContext < 2
  ) {
    trends.push({
      domain: "recovery",
      trendType: "recovery_load_balance",
      direction: "unknown",
      dataSufficiency: "insufficient",
      supportingAggregate: {
        weekStart,
        weekEnd,
        workoutPlannedCount: workout?.plannedCount ?? 0,
        recoveryDaysWithContext: recovery?.daysWithContext ?? 0,
      },
      message:
        "Not enough combined workout and recovery entries this week to describe load-balance patterns.",
    });
  } else {
    const highSkipRate =
      workout.plannedCount > 0 &&
      workout.skippedCount / workout.plannedCount >= 0.34;
    const recoveryHeavy =
      recovery.dominantBand === "prioritize_recovery" ||
      recovery.bandCounts.prioritize_recovery >= 2;
    let direction: TrendDirection = "stable";
    let message =
      "Workout and recovery entries look broadly aligned this week based on the data available.";

    if (highSkipRate && recoveryHeavy) {
      direction = "down";
      message =
        "Skipped workouts and recovery-focused signals appeared in the same week, which could suggest room to simplify load or recovery balance.";
    } else if (!highSkipRate && recovery.dominantBand === "well_supported") {
      direction = "up";
      message =
        "Workout completion and recovery signals look relatively supported together this week based on the entries available.";
    }

    trends.push({
      domain: "recovery",
      trendType: "recovery_load_balance",
      direction,
      dataSufficiency:
        workout.plannedCount >= 3 && recovery.daysWithContext >= 3 ? "sufficient" : "partial",
      supportingAggregate: {
        weekStart,
        weekEnd,
        skipRate:
          workout.plannedCount > 0
            ? Math.round((workout.skippedCount / workout.plannedCount) * 100)
            : 0,
        dominantRecoveryBand: recovery.dominantBand,
      },
      message,
    });
  }

  return trends;
}

function buildConsistencyTrend(
  aggregate: WorkoutProgressAggregate,
  weekStart: string,
  weekEnd: string,
): TrendDraft {
  const direction: TrendDirection =
    aggregate.activeDays >= 4 ? "up" : aggregate.activeDays >= 2 ? "stable" : "down";

  const message =
    aggregate.activeDays >= 4
      ? `You logged activity on ${aggregate.activeDays} days this week, which may suggest a fairly consistent workout rhythm.`
      : aggregate.activeDays >= 2
        ? `You logged activity on ${aggregate.activeDays} days this week, which could suggest a moderate consistency pattern.`
        : `You logged activity on ${aggregate.activeDays} day${aggregate.activeDays === 1 ? "" : "s"} this week, so consistency may still be building.`;

  return {
    domain: "workout",
    trendType: "consistency",
    direction,
    dataSufficiency: aggregate.plannedCount >= 3 ? "sufficient" : "partial",
    supportingAggregate: {
      weekStart,
      weekEnd,
      activeDays: aggregate.activeDays,
      plannedCount: aggregate.plannedCount,
      plannedCompletedCount: aggregate.plannedCompletedCount,
      adHocCompletedCount: aggregate.adHocCompletedCount,
    },
    message,
  };
}

function buildCompletionRateTrend(
  currentAggregate: WorkoutProgressAggregate,
  priorAggregate: WorkoutProgressAggregate,
  weekStart: string,
  weekEnd: string,
): TrendDraft {
  const currentRate = currentAggregate.adherencePercent ?? 0;
  const priorRate = priorAggregate.adherencePercent ?? 0;
  const delta = currentRate - priorRate;

  let direction: TrendDirection = "stable";
  let message =
    "Your workout completion pattern looks similar to the prior week based on the entries available.";

  if (delta >= 15) {
    direction = "up";
    message =
      "You completed a higher share of planned workouts this week than the prior week based on the entries available.";
  } else if (delta <= -15) {
    direction = "down";
    message =
      "You completed fewer planned workouts this week than the prior week based on the entries available.";
  }

  return {
    domain: "workout",
    trendType: "completion_rate",
    direction,
    dataSufficiency:
      currentAggregate.plannedCount >= 3 && priorAggregate.plannedCount >= 2
        ? "sufficient"
        : "partial",
    supportingAggregate: {
      weekStart,
      weekEnd,
      currentRate,
      priorRate,
      delta,
    },
    message,
  };
}

function buildSkipRateTrend(
  aggregate: WorkoutProgressAggregate,
  weekStart: string,
  weekEnd: string,
): TrendDraft {
  const skipRate =
    aggregate.plannedCount > 0
      ? Math.round((aggregate.skippedCount / aggregate.plannedCount) * 100)
      : 0;

  let direction: TrendDirection = "stable";
  let message =
    "Skipped sessions were limited this week based on the entries available.";

  if (skipRate >= 34) {
    direction = "down";
    message =
      "A few planned workouts were marked skipped this week, which could suggest room to simplify scheduling or recovery balance.";
  } else if (skipRate === 0 && aggregate.plannedCount > 0 && aggregate.plannedCompletedCount > 0) {
    direction = "up";
    message =
      "No planned workouts were marked skipped this week based on the entries available.";
  }

  return {
    domain: "workout",
    trendType: "skip_rate",
    direction,
    dataSufficiency: aggregate.plannedCount >= 4 ? "sufficient" : "partial",
    supportingAggregate: {
      weekStart,
      weekEnd,
      skipRate,
      skippedCount: aggregate.skippedCount,
      plannedCount: aggregate.plannedCount,
    },
    message,
  };
}
