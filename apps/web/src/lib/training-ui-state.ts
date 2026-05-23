import {
  isStructuredWorkoutPlanExercise,
  isStructuredWorkoutSessionExercise,
  type WorkoutExercisePayload,
  type WorkoutSessionExercise,
  type WorkoutSessionExerciseEntry,
  type WorkoutSessionExercisePrescription,
  type WorkoutSessionExerciseStatus,
  type WorkoutPlanDay,
  type WorkoutPlanExerciseEntry,
  type WorkoutExercise,
  type WorkoutSession,
  type WorkoutSessionStatus,
} from "@health/types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_LABELS: Record<NonNullable<WorkoutPlanDay["weekday"]>, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

function formatLegacyExerciseLabel(exercise: WorkoutExercise): string {
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

function formatExercisePrescriptionLabel(
  prescription: WorkoutSessionExercisePrescription,
): string {
  const parts = [prescription.snapshot.name];

  if (prescription.sets != null && prescription.reps) {
    parts.push(`${prescription.sets}×${prescription.reps}`);
  } else if (prescription.reps) {
    parts.push(prescription.reps);
  } else if (prescription.sets != null) {
    parts.push(`${prescription.sets} sets`);
  } else if (prescription.durationSeconds != null) {
    parts.push(`${Math.round(prescription.durationSeconds / 60)} min`);
  }

  if (prescription.recommendedLoadGuidance) {
    parts.push(prescription.recommendedLoadGuidance);
  }

  if (prescription.notes) {
    parts.push(`(${prescription.notes})`);
  }

  return parts.join(" · ");
}

export function formatExerciseLabel(
  exercise:
    | WorkoutExercisePayload
    | WorkoutPlanExerciseEntry
    | WorkoutSessionExerciseEntry,
): string {
  if (typeof exercise === "string") {
    return exercise;
  }

  if ("prescription" in exercise && isStructuredWorkoutSessionExercise(exercise)) {
    return formatExercisePrescriptionLabel(exercise.prescription);
  }

  if (!isStructuredWorkoutPlanExercise(exercise)) {
    return formatLegacyExerciseLabel(exercise);
  }

  return formatExercisePrescriptionLabel({
    snapshot: exercise.snapshot,
    sets: exercise.sets ?? null,
    reps: exercise.reps ?? null,
    durationSeconds: exercise.durationSeconds ?? null,
    recommendedLoadGuidance: exercise.recommendedLoadGuidance ?? null,
    weightKgGuidance: exercise.weightKgGuidance ?? null,
    restBetweenSetsSeconds: exercise.restBetweenSetsSeconds ?? null,
    restBetweenRepsSeconds: exercise.restBetweenRepsSeconds ?? null,
    circuitGroupId: exercise.circuitGroupId ?? null,
    circuitGroupLabel: exercise.circuitGroupLabel ?? null,
    restInsideCircuitSeconds: exercise.restInsideCircuitSeconds ?? null,
    restBetweenCircuitRoundsSeconds: exercise.restBetweenCircuitRoundsSeconds ?? null,
    notes: exercise.notes ?? null,
  });
}

export function isTerminalSessionStatus(status: WorkoutSessionStatus): boolean {
  return status === "completed" || status === "skipped";
}

export function canCompleteSession(
  session: Pick<WorkoutSession, "status">,
): boolean {
  return session.status === "planned";
}

export function getRevisionNumberLabel(
  revisionId: string,
  revisions: ReadonlyArray<{ id: string; revisionNumber: number }>,
): string | null {
  const revision = revisions.find((entry) => entry.id === revisionId);
  return revision ? `#${revision.revisionNumber}` : null;
}

export function getSessionRevisionNote(input: {
  session: Pick<WorkoutSession, "workoutPlanRevisionId" | "status">;
  activeRevisionId: string;
  revisions: ReadonlyArray<{ id: string; revisionNumber: number }>;
}): string | null {
  const revisionLabel = getRevisionNumberLabel(
    input.session.workoutPlanRevisionId,
    input.revisions,
  );
  if (!revisionLabel) {
    return null;
  }

  const isActiveRevision =
    input.session.workoutPlanRevisionId === input.activeRevisionId;
  const isTerminal = isTerminalSessionStatus(input.session.status);

  if (isActiveRevision) {
    return isTerminal
      ? `Logged against active revision ${revisionLabel}.`
      : `Scheduled from active revision ${revisionLabel}.`;
  }

  return isTerminal
    ? `Logged against prior revision ${revisionLabel}. Sessions stay tied to the revision they were scheduled from.`
    : `Scheduled from prior revision ${revisionLabel}. New sessions use your active revision.`;
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

export function getWorkoutPlanDayLabel(
  day: Pick<WorkoutPlanDay, "day" | "weekday">,
): string {
  return day.day ?? (day.weekday ? WEEKDAY_LABELS[day.weekday] : "Training day");
}

export function buildSessionTitleFromDay(
  day: Pick<WorkoutPlanDay, "day" | "weekday" | "focus">,
): string {
  return `${getWorkoutPlanDayLabel(day)} · ${day.focus}`;
}

export function toWorkoutSessionExercisePayload(
  exercise: WorkoutPlanExerciseEntry,
): WorkoutExercisePayload {
  if (typeof exercise === "string" || !isStructuredWorkoutPlanExercise(exercise)) {
    return exercise;
  }

  return {
    name: exercise.snapshot.name,
    sets: exercise.sets ?? null,
    reps:
      exercise.reps ??
      (exercise.durationSeconds != null
        ? `${Math.round(exercise.durationSeconds / 60)} min`
        : null),
    target: exercise.recommendedLoadGuidance ?? null,
    notes: exercise.notes ?? null,
  };
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

export function formatRestDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s rest`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  if (remainder === 0) {
    return `${minutes} min rest`;
  }

  return `${minutes}m ${remainder}s rest`;
}

export function formatSessionExercisePrescription(
  exercise: WorkoutSessionExercise,
): string {
  return formatExercisePrescriptionLabel(exercise.prescription);
}

export function formatSessionExerciseDetailLines(
  exercise: WorkoutSessionExercise,
): string[] {
  const { prescription } = exercise;
  const lines: string[] = [];

  if (prescription.restBetweenSetsSeconds != null) {
    lines.push(formatRestDuration(prescription.restBetweenSetsSeconds));
  }

  if (prescription.restBetweenRepsSeconds != null) {
    lines.push(`Between reps: ${formatRestDuration(prescription.restBetweenRepsSeconds)}`);
  }

  if (prescription.restInsideCircuitSeconds != null) {
    lines.push(`Inside circuit: ${formatRestDuration(prescription.restInsideCircuitSeconds)}`);
  }

  if (prescription.restBetweenCircuitRoundsSeconds != null) {
    lines.push(
      `Between rounds: ${formatRestDuration(prescription.restBetweenCircuitRoundsSeconds)}`,
    );
  }

  if (prescription.notes) {
    lines.push(prescription.notes);
  }

  return lines;
}

export type SessionExerciseGroup = {
  circuitLabel: string | null;
  exercises: WorkoutSessionExercise[];
};

export function groupSessionExercisesByCircuit(
  exercises: readonly WorkoutSessionExercise[],
): SessionExerciseGroup[] {
  const groups: SessionExerciseGroup[] = [];

  for (const exercise of exercises) {
    const circuitId = exercise.prescription.circuitGroupId ?? null;
    const lastGroup = groups.at(-1);
    const lastExercise = lastGroup?.exercises.at(-1);
    const lastCircuitId = lastExercise?.prescription.circuitGroupId ?? null;

    if (
      lastGroup &&
      circuitId &&
      circuitId === lastCircuitId &&
      lastGroup.circuitLabel === (exercise.prescription.circuitGroupLabel ?? null)
    ) {
      lastGroup.exercises.push(exercise);
      continue;
    }

    groups.push({
      circuitLabel: exercise.prescription.circuitGroupLabel ?? null,
      exercises: [exercise],
    });
  }

  return groups;
}

export function sessionExerciseStatusLabel(
  status: WorkoutSessionExerciseStatus,
): string {
  switch (status) {
    case "planned":
      return "Planned";
    case "completed":
      return "Completed";
    case "skipped":
      return "Skipped";
    case "adjusted":
      return "Adjusted";
  }
}

export function sessionExerciseStatusBadgeClass(
  status: WorkoutSessionExerciseStatus,
): string {
  return `badge badge-session-${status === "adjusted" ? "planned" : status}`;
}

export function canUpdateSessionExercise(
  exercise: Pick<WorkoutSessionExercise, "execution">,
): boolean {
  return exercise.execution.status === "planned";
}

export function formatSessionExerciseExecutionSummary(
  exercise: WorkoutSessionExercise,
): string | null {
  const { execution } = exercise;
  const parts: string[] = [];

  if (execution.actualReps) {
    parts.push(execution.actualReps);
  }

  if (execution.actualWeightKg != null) {
    parts.push(`${execution.actualWeightKg} kg`);
  }

  if (execution.loadAdjustmentNotes) {
    parts.push(execution.loadAdjustmentNotes);
  }

  if (execution.notes) {
    parts.push(execution.notes);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
