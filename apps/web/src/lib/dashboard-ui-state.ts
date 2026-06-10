import type { AiProposal, Goal, WorkoutSession } from "@health/types";
import { aggregateWorkoutWeek, formatWorkoutWeekLabel } from "@health/types";

export type WeeklyConsistency = {
  percent: number;
  subtitle: string;
  activeDaysLabel: string;
  trend: number[];
};

export type WorkoutAdherenceSummary = {
  completed: number;
  planned: number;
  label: string;
};

function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Summarizes workout adherence for the current Mon–Sun week.
 * Delegates to aggregateWorkoutWeek so ad-hoc sessions are excluded from the
 * planned denominator (fixes the inflated count bug).
 */
export function summarizeWorkoutAdherence(
  sessions: readonly WorkoutSession[],
  now = new Date(),
): WorkoutAdherenceSummary {
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const stats = aggregateWorkoutWeek(sessions, toIsoDate(weekStart), toIsoDate(weekEnd));

  return {
    completed: stats.plannedCompletedCount,
    planned: stats.plannedCount,
    label: stats.plannedCount === 0 && stats.adHocCompletedCount === 0
      ? "No sessions scheduled this week"
      : formatWorkoutWeekLabel(stats),
  };
}

export function computeWeeklyConsistency(
  sessions: readonly WorkoutSession[],
  goals: readonly Goal[],
  now = new Date(),
): WeeklyConsistency {
  const adherence = summarizeWorkoutAdherence(sessions, now);
  const activeGoals = goals.filter((goal) => goal.status === "active").length;
  const denominator = Math.max(adherence.planned, activeGoals > 0 ? 1 : 0, 1);
  const numerator = adherence.completed + (activeGoals > 0 ? 1 : 0);
  const percent = Math.min(100, Math.round((numerator / denominator) * 100));

  const weekStart = startOfWeek(now);
  const trend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + index);
    const iso = toIsoDate(day);
    const daySessions = sessions.filter((session) => session.plannedDate === iso);
    if (daySessions.some((session) => session.status === "completed")) {
      return 100;
    }
    if (daySessions.some((session) => session.status === "skipped")) {
      return 35;
    }
    if (daySessions.length > 0) {
      return 20;
    }
    return 0;
  });

  const activeDays = trend.filter((value) => value > 0).length;

  return {
    percent,
    subtitle: "Based on your logged workouts and active goals this week.",
    activeDaysLabel: `${activeDays} of 7 days active`,
    trend,
  };
}

export function getTimeOfDayGreeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) {
    return "Good morning";
  }
  if (hour < 17) {
    return "Good afternoon";
  }
  return "Good evening";
}

export function summarizeRecentProposals(
  proposals: readonly AiProposal[],
): AiProposal[] {
  return [...proposals]
    .filter((proposal) => proposal.status === "accepted" || proposal.status === "rejected")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 3);
}

export function goalStatusLabel(status: Goal["status"]): string {
  switch (status) {
    case "active":
      return "In progress";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "archived":
      return "Archived";
  }
}

export function goalTypeLabel(type: Goal["type"]): string {
  switch (type) {
    case "fat_loss":
      return "Fat loss";
    case "muscle_gain":
      return "Muscle gain";
    case "maintenance":
      return "Maintenance";
    case "endurance":
      return "Endurance";
    case "general_wellness":
      return "General wellness";
  }
}
