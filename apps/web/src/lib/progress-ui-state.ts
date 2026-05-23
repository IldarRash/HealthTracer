import type {
  DeferredProgressDomain,
  ProgressDataStatus,
  ProgressDomain,
  TrendDataSufficiency,
  TrendDirection,
  TrendObservation,
  TrendType,
  WeeklyProgressSummary,
  WorkoutProgressAggregate,
} from "@health/types";

export const PROGRESS_PLAN_CHANGE_NOTICE =
  "Plan changes still require a coach proposal that you review and accept before anything updates.";

export function isProgressSummaryNotFoundError(error: string): boolean {
  const normalized = error.toLowerCase();
  return normalized.includes("not found") || normalized.includes("returned 404");
}

export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T12:00:00`);
  const end = new Date(`${weekEnd}T12:00:00`);
  const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

  return `${formatter.format(start)} – ${formatter.format(end)}`;
}

export function formatProgressTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function progressDataStatusLabel(status: ProgressDataStatus): string {
  switch (status) {
    case "sufficient":
      return "Enough workout data";
    case "partial":
      return "Partial workout data";
    case "insufficient":
      return "Not enough workout data yet";
  }
}

export function progressDataStatusBadgeTone(
  status: ProgressDataStatus,
): "success" | "pending" | "neutral" {
  switch (status) {
    case "sufficient":
      return "success";
    case "partial":
      return "pending";
    case "insufficient":
      return "neutral";
  }
}

export function trendDataSufficiencyLabel(sufficiency: TrendDataSufficiency): string {
  switch (sufficiency) {
    case "sufficient":
      return "Reliable trend";
    case "partial":
      return "Limited data";
    case "insufficient":
      return "Not enough data";
  }
}

export function trendDataSufficiencyBadgeTone(
  sufficiency: TrendDataSufficiency,
): "success" | "pending" | "neutral" {
  switch (sufficiency) {
    case "sufficient":
      return "success";
    case "partial":
      return "pending";
    case "insufficient":
      return "neutral";
  }
}

export function trendTypeLabel(type: TrendType): string {
  switch (type) {
    case "completion_rate":
      return "Completion rate";
    case "consistency":
      return "Consistency";
    case "skip_rate":
      return "Skip rate";
    case "fatigue_pattern":
      return "Fatigue pattern";
  }
}

export function trendDirectionLabel(direction: TrendDirection): string {
  switch (direction) {
    case "up":
      return "Trending up";
    case "down":
      return "Trending down";
    case "stable":
      return "Holding steady";
    case "unknown":
      return "Unclear pattern";
  }
}

export function progressDomainLabel(domain: ProgressDomain): string {
  switch (domain) {
    case "workout":
      return "Workouts";
    case "today":
      return "Today checklist";
    case "nutrition":
      return "Nutrition";
    case "recipes":
      return "Recipes";
    case "recovery":
      return "Recovery";
  }
}

export function deferredDomainAvailabilityLabel(domain: ProgressDomain): string {
  switch (domain) {
    case "today":
      return "Deferred for this summary";
    case "nutrition":
      return "Not included yet";
    case "recipes":
      return "Not available yet";
    case "recovery":
      return "Not available yet";
    case "workout":
      return "Unavailable";
  }
}

export function summarizeWorkoutAggregate(
  aggregate: WorkoutProgressAggregate | null,
): { headline: string; detail: string } {
  if (!aggregate || aggregate.plannedCount === 0) {
    return {
      headline: "No planned workout sessions this week",
      detail: "Schedule or complete workouts to build a weekly summary.",
    };
  }

  const adherence =
    aggregate.adherencePercent === null
      ? "Adherence not calculated"
      : `${aggregate.adherencePercent}% adherence`;

  const detailParts = [
    adherence,
    `${aggregate.skippedCount} skipped`,
    `${aggregate.activeDays} active day${aggregate.activeDays === 1 ? "" : "s"}`,
  ];

  if (aggregate.averageFatigue !== null) {
    detailParts.push(`average fatigue ${aggregate.averageFatigue}/10`);
  }

  if (
    aggregate.exercisePlannedCount > 0 &&
    aggregate.exerciseCompletionPercent !== null
  ) {
    detailParts.push(`${aggregate.exerciseCompletionPercent}% exercises completed`);
  }

  if (aggregate.partialSessionCount > 0) {
    detailParts.push(
      `${aggregate.partialSessionCount} partial session${
        aggregate.partialSessionCount === 1 ? "" : "s"
      }`,
    );
  }

  return {
    headline: `${aggregate.completedCount} of ${aggregate.plannedCount} sessions completed`,
    detail: detailParts.join(" · "),
  };
}

export function shouldShowLatestSummarySection(
  current: WeeklyProgressSummary | null,
  latest: WeeklyProgressSummary | null,
): boolean {
  if (!current || !latest) {
    return false;
  }

  return latest.id !== current.id;
}

export function sortTrendObservations(
  trends: readonly TrendObservation[],
): TrendObservation[] {
  return [...trends].sort((left, right) => {
    const leftRank = trendSortRank(left.trendType);
    const rightRank = trendSortRank(right.trendType);
    return leftRank - rightRank || left.message.localeCompare(right.message);
  });
}

export function summarizeDeferredDomains(
  deferredDomains: readonly DeferredProgressDomain[],
): string {
  if (deferredDomains.length === 0) {
    return "All supported domains are included in this summary.";
  }

  return deferredDomains.map((entry) => entry.message).join(" ");
}

function trendSortRank(type: TrendType): number {
  switch (type) {
    case "completion_rate":
      return 0;
    case "consistency":
      return 1;
    case "skip_rate":
      return 2;
    case "fatigue_pattern":
      return 3;
  }
}
