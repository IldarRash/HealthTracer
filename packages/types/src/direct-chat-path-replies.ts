import { z } from "zod";
import type { TodayChecklistItem, TodayDayResponseBase } from "./today.js";
import { interpolateBehaviorTemplate } from "./behavior-template.js";

export const directPathItemStatusLabelsSchema = z.object({
  completed: z.string().min(1).max(40).default("done"),
  skipped: z.string().min(1).max(40).default("skipped"),
  pending: z.string().min(1).max(40).default("pending"),
});

export type DirectPathItemStatusLabels = z.infer<typeof directPathItemStatusLabelsSchema>;

export const directPathTodaySummaryRepliesSchema = z.object({
  introTemplate: z.string().min(1).max(500),
  emptyChecklistLine: z.string().min(1).max(500),
  checklistHeaderTemplate: z.string().min(1).max(500),
  checklistItemLineTemplate: z.string().min(1).max(500),
  restDayLine: z.string().min(1).max(200),
  workoutLineTemplate: z.string().min(1).max(500),
  adherenceLineTemplate: z.string().min(1).max(500),
  itemStatusLabels: directPathItemStatusLabelsSchema,
});

export type DirectPathTodaySummaryReplies = z.infer<typeof directPathTodaySummaryRepliesSchema>;

export const directPathMarkWorkoutDoneRepliesSchema = z.object({
  noPendingWorkoutMessage: z.string().min(1).max(1_000),
  multiplePendingWorkoutsMessage: z.string().min(1).max(1_000),
  markedDoneTemplate: z.string().min(1).max(500),
});

export type DirectPathMarkWorkoutDoneReplies = z.infer<typeof directPathMarkWorkoutDoneRepliesSchema>;

export const directPathNutritionPlanRepliesSchema = z.object({
  introTemplate: z.string().min(1).max(500),
  mealLineTemplate: z.string().min(1).max(500),
  macrosLineTemplate: z.string().min(1).max(500),
  noActivePlanLine: z.string().min(1).max(500),
});

export type DirectPathNutritionPlanReplies = z.infer<typeof directPathNutritionPlanRepliesSchema>;

export const directPathReplyTemplatesSchema = z.object({
  todaySummary: directPathTodaySummaryRepliesSchema,
  markWorkoutDone: directPathMarkWorkoutDoneRepliesSchema,
  nutritionPlan: directPathNutritionPlanRepliesSchema,
});

export type DirectPathReplyTemplates = z.infer<typeof directPathReplyTemplatesSchema>;

export const DEFAULT_DIRECT_PATH_REPLY_TEMPLATES: DirectPathReplyTemplates = {
  todaySummary: {
    introTemplate: "Here's your Today summary for {{dateLabel}}:",
    emptyChecklistLine: "Your checklist is empty for today.",
    checklistHeaderTemplate:
      "Checklist ({{completedRequired}}/{{totalRequired}} required done):",
    checklistItemLineTemplate: "- [{{statusLabel}}] {{label}} ({{kind}})",
    restDayLine: "Workout: Rest day",
    workoutLineTemplate:
      "Workout: {{title}} — {{status}}, {{exerciseCount}} exercise(s)",
    adherenceLineTemplate:
      "Adherence: {{percent}}% ({{completedRequired}} of {{totalRequired}} required items completed)",
    itemStatusLabels: {
      completed: "done",
      skipped: "skipped",
      pending: "pending",
    },
  },
  markWorkoutDone: {
    noPendingWorkoutMessage:
      "I couldn't find a pending workout on your Today checklist. Open Today to review your items.",
    multiplePendingWorkoutsMessage:
      "You have multiple pending workout items today. Open Today and mark the specific workout you completed.",
    markedDoneTemplate: 'Marked "{{label}}" as done on your Today checklist.',
  },
  nutritionPlan: {
    introTemplate: "Your active nutrition plan — {{title}}:",
    mealLineTemplate: "- {{label}}{{timingHint}}{{dish}}",
    macrosLineTemplate:
      "Daily targets: {{caloriesPerDay}} kcal, {{proteinGrams}}g protein, {{carbsGrams}}g carbs, {{fatGrams}}g fat",
    noActivePlanLine:
      "You don't have an active nutrition plan yet. Ask me to create one for you!",
  },
};

function formatItemStatusLabel(
  status: TodayChecklistItem["status"],
  labels: DirectPathItemStatusLabels,
): string {
  switch (status) {
    case "completed":
      return labels.completed;
    case "skipped":
      return labels.skipped;
    default:
      return labels.pending;
  }
}

export function formatTodaySummaryReadMessage(
  day: TodayDayResponseBase,
  dateLabel: string,
  templates: DirectPathTodaySummaryReplies = DEFAULT_DIRECT_PATH_REPLY_TEMPLATES.todaySummary,
): string {
  const lines: string[] = [
    interpolateBehaviorTemplate(templates.introTemplate, { dateLabel }),
  ];

  if (day.items.length === 0) {
    lines.push("", templates.emptyChecklistLine);
  } else {
    const { adherence } = day;
    lines.push(
      "",
      interpolateBehaviorTemplate(templates.checklistHeaderTemplate, {
        completedRequired: adherence.completedRequired,
        totalRequired: adherence.totalRequired,
      }),
    );

    for (const item of day.items) {
      lines.push(
        interpolateBehaviorTemplate(templates.checklistItemLineTemplate, {
          statusLabel: formatItemStatusLabel(item.status, templates.itemStatusLabels),
          label: item.label,
          kind: item.kind,
        }),
      );
    }
  }

  if (day.workout) {
    if (day.workout.isRestDay) {
      lines.push("", templates.restDayLine);
    } else {
      lines.push(
        "",
        interpolateBehaviorTemplate(templates.workoutLineTemplate, {
          title: day.workout.title,
          status: day.workout.status,
          exerciseCount: day.workout.exercises.length,
        }),
      );
    }
  }

  const { adherence } = day;

  if (adherence.totalRequired > 0 && adherence.score != null) {
    const percent = Math.round(adherence.score * 100);
    lines.push(
      "",
      interpolateBehaviorTemplate(templates.adherenceLineTemplate, {
        percent,
        completedRequired: adherence.completedRequired,
        totalRequired: adherence.totalRequired,
      }),
    );
  }

  return lines.join("\n");
}

export function formatWorkoutMarkedDoneMessage(
  label: string,
  templates: DirectPathMarkWorkoutDoneReplies = DEFAULT_DIRECT_PATH_REPLY_TEMPLATES.markWorkoutDone,
): string {
  return interpolateBehaviorTemplate(templates.markedDoneTemplate, { label });
}
