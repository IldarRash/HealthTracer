import {
  buildDefaultAiBehaviorConfig,
  formatTodaySummaryReadMessage as formatTodaySummaryReadMessageFromConfig,
  formatWorkoutMarkedDoneMessage as formatWorkoutMarkedDoneMessageFromConfig,
  interpolateBehaviorTemplate,
  type ActiveNutritionPlanResponse,
  type ActiveWorkoutPlanResponse,
  type DirectPathNutritionPlanReplies,
  type DirectPathReplyTemplates,
  type DirectPathWeeklyProgressReplies,
  type DirectPathWorkoutPlanReplies,
  type TodayDayResponseBase,
  type WeeklyProgressSummaryResponse,
} from "@health/types";

const DEFAULT_REPLY_TEMPLATES = buildDefaultAiBehaviorConfig().directPaths.replyTemplates;

/** @deprecated Import from @health/types or pass config replyTemplates explicitly. */
export const DIRECT_PATH_NO_PENDING_WORKOUT_MESSAGE =
  DEFAULT_REPLY_TEMPLATES.markWorkoutDone.noPendingWorkoutMessage;

/** @deprecated Import from @health/types or pass config replyTemplates explicitly. */
export const DIRECT_PATH_MULTIPLE_PENDING_WORKOUTS_MESSAGE =
  DEFAULT_REPLY_TEMPLATES.markWorkoutDone.multiplePendingWorkoutsMessage;

export function formatTodaySummaryReadMessage(
  day: TodayDayResponseBase,
  dateLabel: string,
  replyTemplates: DirectPathReplyTemplates = DEFAULT_REPLY_TEMPLATES,
): string {
  return formatTodaySummaryReadMessageFromConfig(day, dateLabel, replyTemplates.todaySummary);
}

export function formatWorkoutMarkedDoneMessage(
  label: string,
  replyTemplates: DirectPathReplyTemplates = DEFAULT_REPLY_TEMPLATES,
): string {
  return formatWorkoutMarkedDoneMessageFromConfig(label, replyTemplates.markWorkoutDone);
}

export function formatNutritionPlanReadMessage(
  activePlan: ActiveNutritionPlanResponse,
  templates: DirectPathNutritionPlanReplies = DEFAULT_REPLY_TEMPLATES.nutritionPlan,
): string {
  if (!activePlan.plan || !activePlan.activeRevision) {
    return templates.noActivePlanLine;
  }

  const { payload } = activePlan.activeRevision;
  const lines: string[] = [
    interpolateBehaviorTemplate(templates.introTemplate, { title: payload.title }),
  ];

  if (payload.mealStructure.length > 0) {
    lines.push("");
    for (const meal of payload.mealStructure) {
      const timingHint = meal.timingHint ? ` (${meal.timingHint})` : "";
      const dish = meal.dish ? ` — ${meal.dish}` : "";
      lines.push(
        interpolateBehaviorTemplate(templates.mealLineTemplate, {
          label: meal.label,
          timingHint,
          dish,
        }),
      );
    }
  }

  const hasMacros =
    payload.caloriesPerDay != null ||
    payload.proteinGrams != null ||
    payload.carbsGrams != null ||
    payload.fatGrams != null;

  if (hasMacros) {
    lines.push(
      "",
      interpolateBehaviorTemplate(templates.macrosLineTemplate, {
        caloriesPerDay: payload.caloriesPerDay ?? "—",
        proteinGrams: payload.proteinGrams ?? "—",
        carbsGrams: payload.carbsGrams ?? "—",
        fatGrams: payload.fatGrams ?? "—",
      }),
    );
  }

  return lines.join("\n");
}

const MAX_WEEKLY_PROGRESS_TREND_LINES = 3;

/** Renders ` (67% adherence)` or an empty string when adherence is unknown. */
function formatAdherencePercent(adherencePercent: number | null): string {
  return adherencePercent != null ? ` (${Math.round(adherencePercent)}% adherence)` : "";
}

export function formatWeeklyProgressReadMessage(
  weeklyProgress: WeeklyProgressSummaryResponse | null,
  templates: DirectPathWeeklyProgressReplies = DEFAULT_REPLY_TEMPLATES.weeklyProgress,
): string {
  if (!weeklyProgress) {
    return templates.noSummaryLine;
  }

  const { summary, trends } = weeklyProgress;
  const lines: string[] = [
    interpolateBehaviorTemplate(templates.introTemplate, {
      weekStart: summary.weekStart,
      weekEnd: summary.weekEnd,
    }),
  ];

  const adherenceLines: string[] = [];
  const workout = summary.sourceAggregates.workout;

  if (workout) {
    adherenceLines.push(
      interpolateBehaviorTemplate(templates.workoutLineTemplate, {
        completed: workout.plannedCompletedCount,
        planned: workout.plannedCount,
        adherenceNote: formatAdherencePercent(workout.adherencePercent),
      }),
    );
  }

  const habits = summary.sourceAggregates.habits;

  if (habits) {
    adherenceLines.push(
      interpolateBehaviorTemplate(templates.habitLineTemplate, {
        completed: habits.completedCount,
        missed: habits.missedCount,
        adherenceNote: formatAdherencePercent(habits.adherencePercent),
      }),
    );
  }

  if (adherenceLines.length > 0) {
    lines.push("", ...adherenceLines);
  }

  const topTrends = trends.slice(0, MAX_WEEKLY_PROGRESS_TREND_LINES);

  if (topTrends.length > 0) {
    lines.push("", templates.trendsHeaderLine);

    for (const trend of topTrends) {
      lines.push(interpolateBehaviorTemplate(templates.trendLineTemplate, {
        message: trend.message,
      }));
    }
  }

  return lines.join("\n");
}

const MAX_WORKOUT_PLAN_SESSION_LINES = 7;

export function formatWorkoutPlanReadMessage(
  activePlan: ActiveWorkoutPlanResponse,
  templates: DirectPathWorkoutPlanReplies = DEFAULT_REPLY_TEMPLATES.workoutPlan,
): string {
  if (!activePlan.plan || !activePlan.activeRevision) {
    return templates.noActivePlanLine;
  }

  const { payload } = activePlan.activeRevision;
  const lines: string[] = [
    interpolateBehaviorTemplate(templates.introTemplate, { title: payload.title }),
    "",
    interpolateBehaviorTemplate(templates.weeklyCadenceLineTemplate, {
      dayCount: payload.days.length,
    }),
  ];

  for (const day of payload.days.slice(0, MAX_WORKOUT_PLAN_SESSION_LINES)) {
    lines.push(
      interpolateBehaviorTemplate(templates.sessionLineTemplate, {
        weekday: capitalizeWeekday(day.weekday),
        focus: day.focus,
      }),
    );
  }

  const remainingDayCount = payload.days.length - MAX_WORKOUT_PLAN_SESSION_LINES;

  if (remainingDayCount > 0) {
    lines.push(
      interpolateBehaviorTemplate(templates.moreSessionsLineTemplate, {
        count: remainingDayCount,
      }),
    );
  }

  return lines.join("\n");
}

function capitalizeWeekday(weekday: string): string {
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}
