import type {
  HabitAdherenceHabitSummary,
  HabitAdherenceResponse,
} from "@health/types";

export function formatHabitCompletionRate(rate: number | null): string {
  if (rate == null) {
    return "—";
  }

  return `${Math.round(rate * 100)}%`;
}

export function formatHabitStreak(streak: number): string {
  if (streak === 0) {
    return "No active streak";
  }

  if (streak === 1) {
    return "1-day streak";
  }

  return `${streak}-day streak`;
}

export function selectPrimaryRequiredHabit(
  habits: HabitAdherenceHabitSummary[],
): HabitAdherenceHabitSummary | null {
  const requiredHabits = habits.filter((habit) => habit.required);

  if (requiredHabits.length === 0) {
    return null;
  }

  return [...requiredHabits].sort((left, right) => {
    if (right.currentStreak !== left.currentStreak) {
      return right.currentStreak - left.currentStreak;
    }

    if (right.scheduled !== left.scheduled) {
      return right.scheduled - left.scheduled;
    }

    return left.title.localeCompare(right.title);
  })[0] ?? null;
}

export type HabitAdherenceSummaryView =
  | { status: "empty" }
  | {
      status: "ready";
      requiredCompletionRate: string;
      streakTitle: string;
      streakDetail: string;
    };

export function buildHabitAdherenceSummaryView(
  response: HabitAdherenceResponse | null | undefined,
): HabitAdherenceSummaryView {
  if (!response || response.habits.length === 0) {
    return { status: "empty" };
  }

  const primaryHabit = selectPrimaryRequiredHabit(response.habits);

  if (!primaryHabit) {
    return {
      status: "ready",
      requiredCompletionRate: formatHabitCompletionRate(response.plan.requiredCompletionRate),
      streakTitle: "Required habit streak",
      streakDetail: "No required habits in your plan yet.",
    };
  }

  return {
    status: "ready",
    requiredCompletionRate: formatHabitCompletionRate(response.plan.requiredCompletionRate),
    streakTitle: primaryHabit.title,
    streakDetail: formatHabitStreak(primaryHabit.currentStreak),
  };
}
