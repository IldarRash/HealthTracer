import type {
  DeferredProgressDomain,
  ProgressDataStatus,
  ProgressSourceAggregates,
  TrendDataSufficiency,
  TrendDirection,
  TrendType,
  WorkoutProgressAggregate,
  WorkoutSession,
} from "@health/types";
import {
  countStructuredWorkoutSessionExerciseProgress,
  isStructuredWorkoutSessionExercise,
} from "@health/types";

export interface WeekRange {
  weekStart: string;
  weekEnd: string;
}

export interface TrendDraft {
  domain: "workout";
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

  const plannedCount = weekSessions.length;
  const completedCount = weekSessions.filter((session) => session.status === "completed").length;
  const skippedCount = weekSessions.filter((session) => session.status === "skipped").length;
  const adherencePercent =
    plannedCount > 0 ? Math.round((completedCount / plannedCount) * 100) : null;

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

  for (const session of weekSessions) {
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
  };
}

export function buildDeferredDomains(): DeferredProgressDomain[] {
  return [
    {
      domain: "today",
      reason: "adherence_not_included",
      message:
        "Daily checklist completion is not included in this weekly summary yet.",
    },
    {
      domain: "nutrition",
      reason: "adherence_not_included",
      message:
        "Nutrition adherence is not included in this weekly summary yet.",
    },
    {
      domain: "recipes",
      reason: "domain_not_available",
      message: "Recipe insights are not available in this weekly summary yet.",
    },
    {
      domain: "recovery",
      reason: "metrics_not_available",
      message:
        "Recovery and synced wellness metrics are not included in this weekly summary yet.",
    },
  ];
}

export function resolveProgressDataStatus(
  aggregates: ProgressSourceAggregates,
): ProgressDataStatus {
  const workout = aggregates.workout;

  if (!workout || workout.plannedCount === 0) {
    return "insufficient";
  }

  return "partial";
}

export function buildSummaryUserMessage(
  aggregates: ProgressSourceAggregates,
  dataStatus: ProgressDataStatus,
): string {
  const workout = aggregates.workout;

  if (dataStatus === "insufficient" || !workout || workout.plannedCount === 0) {
    return "There is not enough workout history for a full weekly review yet. Log a few planned sessions to build a clearer picture.";
  }

  if (workout.completedCount === 0) {
    return `You had ${workout.plannedCount} planned workout session${workout.plannedCount === 1 ? "" : "s"} this week, but none were marked completed yet. Small consistent steps can help build momentum.`;
  }

  return `Based on the workout entries available, you completed ${workout.completedCount} of ${workout.plannedCount} planned sessions this week (${workout.adherencePercent ?? 0}% completion). Other domains such as nutrition and recovery are not included yet.`;
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
      completedCount: aggregate.completedCount,
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
  } else if (skipRate === 0 && aggregate.completedCount > 0) {
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
