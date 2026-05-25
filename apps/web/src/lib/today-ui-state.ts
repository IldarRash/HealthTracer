import type {
  TodayAdherenceSummary,
  TodayChecklistItem,
  TodayChecklistItemKind,
  TodayChecklistItemStatus,
  TodayDailyFeedback,
  TodayDayResponse,
  TodayHistoryEntry,
  TodayWorkoutDetail,
} from "@health/types";
import { isTerminalSessionStatus, sessionStatusLabel } from "./training-ui-state";

export { formatTodayHierarchySourceRef } from "./onboarding-ui-state";
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

export function isTodayHabitItem(
  item: Pick<
    { kind: TodayChecklistItemKind; source: { type: string; id?: string } },
    "kind" | "source"
  >,
): boolean {
  return item.kind === "habit" || item.source.type === "habit";
}

export function formatTodayHabitItemSourceLabel(): string {
  return "From your habit plan · one completion per day";
}

export function todayHabitItemClosedMessage(status: TodayChecklistItemStatus): string {
  switch (status) {
    case "completed":
      return "Habit logged as complete for this day.";
    case "skipped":
      return "Habit marked skipped for this day.";
    default:
      return "This habit is closed for the day.";
  }
}

export function todayItemClosedMessage(
  item: Pick<
    {
      kind: TodayChecklistItemKind;
      source: { type: string; id?: string };
      status: TodayChecklistItemStatus;
    },
    "kind" | "source" | "status"
  >,
): string {
  if (isTodayHabitItem(item)) {
    return todayHabitItemClosedMessage(item.status);
  }

  return "This task is closed for the day.";
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

export function formatTaskCountChip(
  adherence: Pick<TodayAdherenceSummary, "completedRequired" | "totalRequired">,
): string {
  if (adherence.totalRequired === 0) {
    return "0 tasks";
  }

  return `${adherence.completedRequired}/${adherence.totalRequired} tasks`;
}

export function formatHistoryTaskCountBadge(
  entry: Pick<TodayHistoryEntry, "adherence">,
): string {
  const { completedRequired, totalRequired } = entry.adherence;

  if (totalRequired === 0) {
    return "0 tasks";
  }

  return `${completedRequired}/${totalRequired} tasks`;
}

export type TodayNextActionKind =
  | "recovery_wellbeing"
  | "workout"
  | "habit_checklist"
  | "nutrition_meal"
  | "caught_up";

export type TodayPlanSection = "movement" | "nutrition" | "habits";

export type TodayNextActionView = {
  kind: TodayNextActionKind;
  title: string;
  description: string;
  anchorId: string;
  ctaLabel: string;
};

export type ResolveTodayNextActionInput = {
  items: readonly TodayChecklistItem[];
  workout: TodayWorkoutDetail | null | undefined;
  hasWellbeingCheckIn: boolean | null;
  hasRecoveryCheckIn: boolean | null;
  hasPendingNutritionMeal: boolean;
  pendingNutritionMealLabel: string | null;
  existingFeedback: TodayDailyFeedback | null;
};

export function isWorkoutActionNeeded(
  workout: TodayWorkoutDetail | null | undefined,
): boolean {
  if (!workout || workout.isRestDay || isTerminalSessionStatus(workout.status)) {
    return false;
  }

  if (canStartTodayWorkout(workout)) {
    return true;
  }

  return workout.exercises.some((exercise) => exercise.execution.status === "planned");
}

export function findFirstPendingRequiredItem(
  items: readonly TodayChecklistItem[],
): TodayChecklistItem | null {
  return items.find((item) => item.status === "pending" && item.required) ?? null;
}

export function resolveTodayNextAction(
  input: ResolveTodayNextActionInput,
): TodayNextActionView {
  const checkInsLoaded =
    input.hasWellbeingCheckIn !== null && input.hasRecoveryCheckIn !== null;

  if (checkInsLoaded) {
    const missingWellbeing = input.hasWellbeingCheckIn === false;
    const missingRecovery = input.hasRecoveryCheckIn === false;

    if (missingWellbeing && missingRecovery) {
      return {
        kind: "recovery_wellbeing",
        title: "Log recovery and wellbeing",
        description: "Quick check-ins help your coach tailor movement and recovery guidance.",
        anchorId: "today-check-ins",
        ctaLabel: "Open check-ins",
      };
    }

    if (missingRecovery) {
      return {
        kind: "recovery_wellbeing",
        title: "Log recovery check-in",
        description: "Capture soreness and fatigue before your movement plan.",
        anchorId: "today-check-ins",
        ctaLabel: "Open recovery check-in",
      };
    }

    if (missingWellbeing) {
      return {
        kind: "recovery_wellbeing",
        title: "Log wellbeing check-in",
        description: "A quick mood and stress snapshot for wellness coaching.",
        anchorId: "today-check-ins",
        ctaLabel: "Open wellbeing check-in",
      };
    }
  }

  const workout = input.workout;
  if (workout && isWorkoutActionNeeded(workout)) {
    const starting = canStartTodayWorkout(workout);

    return {
      kind: "workout",
      title: starting ? "Start your workout" : "Finish your workout",
      description: `${workout.title} · ${workout.focus}`,
      anchorId: "today-movement",
      ctaLabel: starting ? "Start workout" : "Continue workout",
    };
  }

  const pendingItem = findFirstPendingRequiredItem(input.items);
  if (pendingItem) {
    return {
      kind: "habit_checklist",
      title: isTodayHabitItem(pendingItem) ? "Complete your habit" : "Complete your next task",
      description: pendingItem.label,
      anchorId: "today-habits",
      ctaLabel: isTodayHabitItem(pendingItem) ? "Mark habit complete" : "Mark task complete",
    };
  }

  if (input.hasPendingNutritionMeal) {
    return {
      kind: "nutrition_meal",
      title: "Log your next meal",
      description: input.pendingNutritionMealLabel ?? "Track today's meal plan.",
      anchorId: "today-nutrition",
      ctaLabel: "Open nutrition",
    };
  }

  const hasReflection =
    input.existingFeedback != null && Object.keys(input.existingFeedback).length > 0;

  return {
    kind: "caught_up",
    title: "You're caught up",
    description: hasReflection
      ? "Required tasks are done. Review recent days or update your reflection."
      : "Required tasks are done. Optional: add a daily reflection.",
    anchorId: "today-details",
    ctaLabel: hasReflection ? "Review details" : "Add reflection",
  };
}

export function shouldExpandTodayPlanSection(
  section: TodayPlanSection,
  input: {
    nextAction: TodayNextActionView;
    workout: TodayWorkoutDetail | null | undefined;
    items: readonly TodayChecklistItem[];
    hasPendingNutritionMeal: boolean;
  },
): boolean {
  switch (section) {
    case "movement":
      return (
        input.nextAction.kind === "workout" ||
        (input.workout != null && isWorkoutActionNeeded(input.workout))
      );
    case "nutrition":
      return input.nextAction.kind === "nutrition_meal" || input.hasPendingNutritionMeal;
    case "habits":
      return (
        input.nextAction.kind === "habit_checklist" ||
        input.items.some((item) => item.status === "pending")
      );
  }
}

export function shouldExpandTodayCheckInsSection(input: {
  nextAction: TodayNextActionView;
  hasWellbeingCheckIn: boolean | null;
  hasRecoveryCheckIn: boolean | null;
  wellbeingIndicatesCrisisSupport?: boolean | null;
}): boolean {
  if (input.wellbeingIndicatesCrisisSupport === true) {
    return true;
  }

  if (input.nextAction.kind === "recovery_wellbeing") {
    return true;
  }

  if (input.hasWellbeingCheckIn === null || input.hasRecoveryCheckIn === null) {
    return true;
  }

  return input.hasWellbeingCheckIn === false || input.hasRecoveryCheckIn === false;
}

export function shouldExpandTodayDetailsSection(nextAction: TodayNextActionView): boolean {
  return nextAction.kind === "caught_up";
}

export function buildTodayDisclosureResetKey(
  disclosureId: string,
  selectedDate: string,
  smartDefaultOpen: boolean,
): string {
  return `${disclosureId}:${selectedDate}:${smartDefaultOpen}`;
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
  const taskProgressLabel =
    entry.adherence.totalRequired === 0
      ? entry.itemCount === 1
        ? "1 checklist item"
        : `${entry.itemCount} checklist items`
      : formatAdherenceSummary(entry.adherence);

  const feedbackLabel = entry.hasFeedback ? "Feedback saved" : "No feedback";

  return `${taskProgressLabel} · ${feedbackLabel}`;
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
