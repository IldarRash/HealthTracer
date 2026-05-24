import type {
  TodayAdherenceSummary,
  TodayChecklistItemKind,
  TodayChecklistItemStatus,
  TodayDailyFeedback,
  TodayDayResponse,
  TodayHistoryEntry,
  TodayWorkoutDetail,
} from "@health/types";
import { isTerminalSessionStatus, sessionStatusLabel } from "./training-ui-state";

export { formatLocalIsoDate } from "./training-ui-state";
export { sessionStatusLabel } from "./training-ui-state";

export function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(year, month - 1, day),
  );
}

export function todayItemStatusLabel(status: TodayChecklistItemStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
  }
}

export function todayItemKindLabel(kind: TodayChecklistItemKind): string {
  switch (kind) {
    case "workout":
      return "Workout";
    case "nutrition":
      return "Nutrition";
    case "hydration":
      return "Hydration";
    case "recovery":
      return "Recovery";
    case "habit":
      return "Habit";
  }
}

export function todayItemStatusBadgeClass(status: TodayChecklistItemStatus): string {
  return `badge badge-session-${status}`;
}

export function todayItemCardClass(status: TodayChecklistItemStatus): string {
  return `training-session-card nested-card training-session-card--${status}`;
}

export function canUpdateTodayItem(
  item: Pick<{ status: TodayChecklistItemStatus }, "status">,
): boolean {
  return item.status === "pending";
}

export function formatAdherenceScore(
  adherence: Pick<TodayAdherenceSummary, "score">,
): string {
  if (adherence.score == null) {
    return "—";
  }

  return `${Math.round(adherence.score * 100)}%`;
}

export function formatAdherenceSummary(
  adherence: Pick<
    TodayAdherenceSummary,
    "completedRequired" | "totalRequired" | "skippedRequired"
  >,
): string {
  if (adherence.totalRequired === 0) {
    return "No required tasks for this day.";
  }

  const parts = [
    `${adherence.completedRequired} of ${adherence.totalRequired} required tasks completed`,
  ];

  if (adherence.skippedRequired > 0) {
    parts.push(`${adherence.skippedRequired} skipped`);
  }

  return parts.join(" · ");
}

export function canSubmitTodayFeedback(input: {
  notes: string;
  energy: string;
  difficulty: string;
  existingFeedback: TodayDailyFeedback | null;
}): boolean {
  const trimmedNotes = input.notes.trim();
  const energy = input.energy.trim();
  const difficulty = input.difficulty.trim();

  const hasNotes = trimmedNotes.length > 0;
  const hasEnergy = energy.length > 0;
  const hasDifficulty = difficulty.length > 0;

  if (!hasNotes && !hasEnergy && !hasDifficulty) {
    return false;
  }

  if (hasEnergy && !isValidFeedbackScale(energy)) {
    return false;
  }

  if (hasDifficulty && !isValidFeedbackScale(difficulty)) {
    return false;
  }

  const nextFeedback = buildFeedbackPayload({
    notes: trimmedNotes,
    energy,
    difficulty,
  });

  return !feedbackMatchesExisting(nextFeedback, input.existingFeedback);
}

export function buildFeedbackPayload(input: {
  notes: string;
  energy: string;
  difficulty: string;
}): TodayDailyFeedback {
  const payload: TodayDailyFeedback = {};

  if (input.notes.trim()) {
    payload.notes = input.notes.trim();
  }

  if (input.energy.trim()) {
    payload.energy = Number(input.energy);
  }

  if (input.difficulty.trim()) {
    payload.difficulty = Number(input.difficulty);
  }

  return payload;
}

export function mergeTodayHistoryWithCurrentDay(
  entries: readonly TodayHistoryEntry[],
  currentDay: TodayDayResponse | null | undefined,
): TodayHistoryEntry[] {
  if (!currentDay) {
    return [...entries];
  }

  return entries.map((entry) => {
    if (entry.date !== currentDay.date) {
      return entry;
    }

    const hasFeedback =
      currentDay.feedback !== null && Object.keys(currentDay.feedback).length > 0;

    return {
      ...entry,
      adherence: currentDay.adherence,
      itemCount: currentDay.items.length,
      hasFeedback,
    };
  });
}

export function historyEntrySummaryLabel(entry: TodayHistoryEntry): string {
  const scoreLabel =
    entry.adherence.score == null
      ? "No score"
      : `${Math.round(entry.adherence.score * 100)}% adherence`;

  const taskLabel =
    entry.itemCount === 1 ? "1 task" : `${entry.itemCount} tasks`;

  const feedbackLabel = entry.hasFeedback ? "Feedback saved" : "No feedback";

  return `${scoreLabel} · ${taskLabel} · ${feedbackLabel}`;
}

export function hasTodayWorkoutExecutionStarted(
  workout: Pick<TodayWorkoutDetail, "exercises">,
): boolean {
  return workout.exercises.some((exercise) => exercise.execution.status !== "planned");
}

export function canStartTodayWorkout(
  workout: Pick<TodayWorkoutDetail, "isRestDay" | "status" | "exercises">,
): boolean {
  if (workout.isRestDay || isTerminalSessionStatus(workout.status)) {
    return false;
  }

  return !hasTodayWorkoutExecutionStarted(workout);
}

export function canExecuteTodayWorkout(
  workout: Pick<TodayWorkoutDetail, "isRestDay" | "status">,
): boolean {
  return !workout.isRestDay && !isTerminalSessionStatus(workout.status);
}

export function todayWorkoutStatusBadgeClass(
  status: TodayWorkoutDetail["status"],
): string {
  return `badge badge-session-${status}`;
}

export function todayWorkoutSummaryLabel(
  workout: Pick<TodayWorkoutDetail, "focus" | "plannedDate" | "status">,
): string {
  return `${workout.focus} · ${formatDisplayDate(workout.plannedDate)} · ${sessionStatusLabel(workout.status)}`;
}

function isValidFeedbackScale(value: string): boolean {
  if (!/^\d+$/.test(value)) {
    return false;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10;
}

function feedbackMatchesExisting(
  next: TodayDailyFeedback,
  existing: TodayDailyFeedback | null,
): boolean {
  if (!existing) {
    return Object.keys(next).length === 0;
  }

  return (
    (next.notes ?? null) === (existing.notes ?? null) &&
    (next.energy ?? null) === (existing.energy ?? null) &&
    (next.difficulty ?? null) === (existing.difficulty ?? null)
  );
}
