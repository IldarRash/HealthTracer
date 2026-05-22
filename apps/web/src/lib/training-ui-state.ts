import type {
  WorkoutExercise,
  WorkoutSession,
  WorkoutSessionStatus,
} from "@health/types";

type WorkoutExercisePayload = string | WorkoutExercise;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatExerciseLabel(exercise: WorkoutExercisePayload): string {
  if (typeof exercise === "string") {
    return exercise;
  }

  const parts = [exercise.name];

  if (exercise.sets != null && exercise.reps) {
    parts.push(`${exercise.sets}×${exercise.reps}`);
  } else if (exercise.reps) {
    parts.push(exercise.reps);
  } else if (exercise.sets != null) {
    parts.push(`${exercise.sets} sets`);
  }

  if (exercise.target) {
    parts.push(exercise.target);
  }

  if (exercise.notes) {
    parts.push(`(${exercise.notes})`);
  }

  return parts.join(" · ");
}

export function canCompleteSession(
  session: Pick<WorkoutSession, "status">,
): boolean {
  return session.status === "planned";
}

export function sessionStatusLabel(status: WorkoutSessionStatus): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
  }
}

export function sortSessionsByPlannedDate(
  sessions: readonly WorkoutSession[],
): WorkoutSession[] {
  return [...sessions].sort((left, right) =>
    left.plannedDate.localeCompare(right.plannedDate),
  );
}

export function hasActiveWorkoutPlan(
  response: { plan: { id: string } | null; activeRevision: { id: string } | null },
): boolean {
  return response.plan !== null && response.activeRevision !== null;
}

export function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidPlannedDate(value: string): boolean {
  return ISO_DATE_PATTERN.test(value);
}

export function buildSessionTitleFromDay(day: {
  day: string;
  focus: string;
}): string {
  return `${day.day} · ${day.focus}`;
}

export function canSubmitScheduleForm(input: {
  plannedDate: string;
  dayIndex: number;
  daysCount: number;
}): boolean {
  return (
    isValidPlannedDate(input.plannedDate) &&
    input.dayIndex >= 0 &&
    input.dayIndex < input.daysCount
  );
}
