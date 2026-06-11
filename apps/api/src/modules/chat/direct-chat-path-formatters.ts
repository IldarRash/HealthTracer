import {
  buildDefaultAiBehaviorConfig,
  formatTodaySummaryReadMessage as formatTodaySummaryReadMessageFromConfig,
  formatWorkoutMarkedDoneMessage as formatWorkoutMarkedDoneMessageFromConfig,
  interpolateBehaviorTemplate,
  type ActiveNutritionPlanResponse,
  type DirectPathNutritionPlanReplies,
  type DirectPathReplyTemplates,
  type TodayDayResponseBase,
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
