import type { AiProposal } from "@health/types";
import {
  adaptHabitPlanFromProgressChangesSchema,
  adaptWorkoutPlanFromProgressChangesSchema,
  adjustNutritionPlanFromProgressChangesSchema,
  createGoalProposalChangesSchema,
  habitPlanPayloadSchema,
  nutritionPlanPayloadSchema,
  summarizeWorkoutPlanForCoaching,
  todayChecklistPayloadSchema,
  workoutPlanProposalChangesSchema,
} from "@health/types";
import { summarizeNutritionProposalChanges } from "./nutrition-ui-state";

export type WorkoutDayExerciseSummary = {
  name: string;
  sets: number | null;
  reps: string | null;
  durationSeconds: number | null;
};

export type WorkoutDaySummary = {
  /** Flat day line, e.g. "Monday: Upper body (5 exercises)" — identical to the matching `after` entry. */
  label: string;
  exercises: WorkoutDayExerciseSummary[];
};

export type ProposalChangeSummary = {
  before: string[];
  after: string[];
  /**
   * Structured per-day breakdown, present only for workout-plan proposals whose
   * payload parsed. The last `workoutDays.length` entries of `after` are the
   * matching flat day lines (the view swaps them for expandable day rows).
   */
  workoutDays?: WorkoutDaySummary[];
};

/**
 * Format one exercise prescription for the expandable day rows:
 * - sets + reps            → "3×8-12"
 * - duration (reps absent) → "10min" (sets-prefixed when sets are present)
 * - reps only              → "8-12"
 * Returns null when the entry carries no prescription details.
 */
export function formatWorkoutExercisePrescription(
  exercise: WorkoutDayExerciseSummary,
): string | null {
  if (exercise.sets != null && exercise.reps != null) {
    return `${exercise.sets}×${exercise.reps}`;
  }

  if (exercise.durationSeconds != null) {
    const minutes = Math.max(1, Math.round(exercise.durationSeconds / 60));
    const duration = `${minutes}min`;
    return exercise.sets != null ? `${exercise.sets}×${duration}` : duration;
  }

  if (exercise.reps != null) {
    return exercise.reps;
  }

  return null;
}

const WEEKDAY_LABELS: Record<string, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

function formatWeekdayLabel(weekday: string | undefined): string | null {
  if (!weekday) {
    return null;
  }

  return WEEKDAY_LABELS[weekday] ?? weekday;
}

function summarizeWorkoutProposalChanges(proposal: AiProposal): ProposalChangeSummary {
  const progressParsed = adaptWorkoutPlanFromProgressChangesSchema.safeParse(
    proposal.proposedChanges,
  );
  const directParsed = workoutPlanProposalChangesSchema.safeParse(proposal.proposedChanges);
  const payload = progressParsed.success
    ? progressParsed.data.plan
    : directParsed.success
      ? directParsed.data
      : null;

  if (!payload) {
    return { before: [], after: [] };
  }

  const coachingSummary = summarizeWorkoutPlanForCoaching(payload);
  const workoutDays: WorkoutDaySummary[] = coachingSummary.days.map((day) => {
    const label = formatWeekdayLabel(day.weekday) ?? "Training day";
    const exerciseLabel =
      day.exerciseCount === 1 ? "1 exercise" : `${day.exerciseCount} exercises`;

    return {
      label: `${label}: ${day.focus} (${exerciseLabel})`,
      exercises: day.exercises.map((exercise) => ({
        name: exercise.name,
        sets: exercise.sets ?? null,
        reps: exercise.reps ?? null,
        durationSeconds: exercise.durationSeconds ?? null,
      })),
    };
  });

  const after: string[] = [
    coachingSummary.title,
    coachingSummary.summary,
    ...workoutDays.map((day) => day.label),
  ];

  const before =
    payload.adaptationMetadata?.operations.map((operation) => operation.description) ?? [];

  return { before, after, workoutDays };
}

function summarizeHabitProposalChanges(proposal: AiProposal): ProposalChangeSummary {
  const wrapped = adaptHabitPlanFromProgressChangesSchema.safeParse(proposal.proposedChanges);
  const direct = habitPlanPayloadSchema.safeParse(
    wrapped.success ? wrapped.data.plan : proposal.proposedChanges,
  );

  if (!direct.success) {
    return { before: [], after: [] };
  }

  const activeHabits = direct.data.habits.filter((habit) => habit.status === "active");

  if (activeHabits.length === 0) {
    return { before: [], after: [] };
  }

  return {
    before: [],
    after: activeHabits.map((habit) => {
      const schedule =
        habit.schedule.type === "daily"
          ? "daily"
          : habit.schedule.type === "selected_weekdays"
            ? `${habit.schedule.daysOfWeek.length} days per week`
            : "scheduled";
      return `${habit.title} — ${schedule}`;
    }),
  };
}

function summarizeTodayProposalChanges(proposal: AiProposal): ProposalChangeSummary {
  const parsed = todayChecklistPayloadSchema.safeParse(proposal.proposedChanges);
  if (!parsed.success) {
    return { before: [], after: [] };
  }

  return {
    before: [],
    after: parsed.data.items.map((item) => `${parsed.data.date}: ${item.label}`),
  };
}

function summarizeGoalProposalChanges(proposal: AiProposal): ProposalChangeSummary {
  if (proposal.intent === "create_goal") {
    const parsed = createGoalProposalChangesSchema.safeParse(proposal.proposedChanges);
    if (!parsed.success) {
      return { before: [], after: [] };
    }

    const lines = [`Goal: ${parsed.data.title}`];
    if (parsed.data.horizon) {
      lines.push(`Horizon: ${parsed.data.horizon.replaceAll("_", " ")}`);
    }

    return { before: [], after: lines };
  }

  return { before: [], after: [] };
}

function summarizeNutritionProposalChangeSummary(proposal: AiProposal): ProposalChangeSummary {
  const nutritionPayload = nutritionPlanPayloadSchema.safeParse(proposal.proposedChanges);
  if (nutritionPayload.success) {
    return {
      before: [],
      after: summarizeNutritionProposalChanges({
        targetDomain: "nutrition",
        proposedChanges: nutritionPayload.data,
      } as AiProposal),
    };
  }

  const progressParsed = adjustNutritionPlanFromProgressChangesSchema.safeParse(
    proposal.proposedChanges,
  );
  if (progressParsed.success) {
    return {
      before: [],
      after: summarizeNutritionProposalChanges({
        targetDomain: "nutrition",
        proposedChanges: progressParsed.data.plan,
      } as AiProposal),
    };
  }

  return { before: [], after: summarizeNutritionProposalChanges(proposal) };
}

export function summarizeProposalChanges(proposal: AiProposal): ProposalChangeSummary {
  switch (proposal.targetDomain) {
    case "workout":
      return summarizeWorkoutProposalChanges(proposal);
    case "nutrition":
      return summarizeNutritionProposalChangeSummary(proposal);
    case "today":
      return summarizeTodayProposalChanges(proposal);
    case "goal":
      return summarizeGoalProposalChanges(proposal);
    case "general":
      if (proposal.intent === "create_habit_plan" || proposal.intent === "adapt_habit_plan") {
        return summarizeHabitProposalChanges(proposal);
      }
      return { before: [], after: [] };
    default:
      return { before: [], after: [] };
  }
}
