import type { TodayChecklistItem, TodayDayResponse } from "@health/types";

function formatItemStatusLabel(status: TodayChecklistItem["status"]): string {
  switch (status) {
    case "completed":
      return "done";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

export function formatTodaySummaryReadMessage(
  day: TodayDayResponse,
  dateLabel: string,
): string {
  const lines: string[] = [`Here's your Today summary for ${dateLabel}:`];

  if (day.items.length === 0) {
    lines.push("", "Your checklist is empty for today.");
  } else {
    const { adherence } = day;
    lines.push(
      "",
      `Checklist (${adherence.completedRequired}/${adherence.totalRequired} required done):`,
    );

    for (const item of day.items) {
      lines.push(
        `- [${formatItemStatusLabel(item.status)}] ${item.label} (${item.kind})`,
      );
    }
  }

  if (day.workout) {
    if (day.workout.isRestDay) {
      lines.push("", "Workout: Rest day");
    } else {
      lines.push(
        "",
        `Workout: ${day.workout.title} — ${day.workout.status}, ${day.workout.exercises.length} exercise(s)`,
      );
    }
  }

  const { adherence } = day;

  if (adherence.totalRequired > 0 && adherence.score != null) {
    const percent = Math.round(adherence.score * 100);
    lines.push(
      "",
      `Adherence: ${percent}% (${adherence.completedRequired} of ${adherence.totalRequired} required items completed)`,
    );
  }

  return lines.join("\n");
}

export const DIRECT_PATH_NO_PENDING_WORKOUT_MESSAGE =
  "I couldn't find a pending workout on your Today checklist. Open Today to review your items.";

export const DIRECT_PATH_MULTIPLE_PENDING_WORKOUTS_MESSAGE =
  "You have multiple pending workout items today. Open Today and mark the specific workout you completed.";

export function formatWorkoutMarkedDoneMessage(label: string): string {
  return `Marked "${label}" as done on your Today checklist.`;
}
