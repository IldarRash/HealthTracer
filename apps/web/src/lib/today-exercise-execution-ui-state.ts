/**
 * today-exercise-execution-ui-state.ts
 *
 * Pure helpers for the per-exercise execution drill-down in the Today workout card.
 * No React, no TanStack Query — purely functional state derivations so they are
 * easy to unit-test.
 *
 * The drill-down appears after a session starts and allows the user to:
 *   - Mark each exercise as completed, skipped, or adjusted
 *   - Record actual reps/weight and RPE where the Zod contract supports it
 *
 * Execution writes session state only — plan mutations are forbidden from Today.
 */

import type {
  TodayWorkoutDetail,
  WorkoutSessionExercise,
  WorkoutSessionExerciseExecution,
  UpdateWorkoutSessionExerciseInput,
} from "@health/types";

// ── Exercise-level display model ──────────────────────────────────────────────

export type ExerciseExecutionDisplayStatus = "planned" | "completed" | "skipped" | "adjusted";

export type ExerciseDrillDownRow = {
  id: string;
  exerciseId: string | null;
  name: string;
  prescriptionLabel: string;
  executionStatus: ExerciseExecutionDisplayStatus;
  /** Human-readable summary of what was logged (if anything). */
  executionSummary: string | null;
  /** Whether this exercise can still be updated (terminal statuses block updates). */
  canUpdate: boolean;
};

const TERMINAL_EXERCISE_STATUSES: ReadonlySet<WorkoutSessionExerciseExecution["status"]> = new Set([
  "completed",
  "skipped",
]);

export function isTerminalExerciseStatus(
  status: WorkoutSessionExerciseExecution["status"],
): boolean {
  return TERMINAL_EXERCISE_STATUSES.has(status);
}

// ── Prescription label formatter ──────────────────────────────────────────────

export function formatExercisePrescriptionLabel(
  prescription: WorkoutSessionExercise["prescription"],
): string {
  const parts: string[] = [];

  if (prescription.sets != null && prescription.reps) {
    parts.push(`${prescription.sets}×${prescription.reps}`);
  } else if (prescription.reps) {
    parts.push(prescription.reps);
  } else if (prescription.sets != null) {
    parts.push(`${prescription.sets} sets`);
  }

  if (prescription.durationSeconds != null) {
    const mins = Math.max(1, Math.round(prescription.durationSeconds / 60));
    parts.push(`${mins} min`);
  }

  if (prescription.recommendedLoadGuidance) {
    parts.push(prescription.recommendedLoadGuidance);
  }

  return parts.join(" · ") || "—";
}

// ── Execution summary formatter ───────────────────────────────────────────────

export function formatExerciseExecutionRowSummary(
  execution: WorkoutSessionExerciseExecution,
): string | null {
  if (execution.status === "planned") return null;

  const parts: string[] = [];

  if (execution.actualReps) {
    parts.push(execution.actualReps);
  }
  if (execution.actualWeightKg != null) {
    parts.push(`${execution.actualWeightKg} kg`);
  }
  if (execution.perceivedEffort != null) {
    parts.push(`RPE ${execution.perceivedEffort}`);
  }
  if (execution.discomfortFlag === true) {
    parts.push("Discomfort noted");
  }

  if (parts.length === 0) {
    switch (execution.status) {
      case "completed":
        return "Completed";
      case "skipped":
        return "Skipped";
      case "adjusted":
        return "Adjusted";
      default:
        return null;
    }
  }

  return parts.join(" · ");
}

// ── Build the drill-down rows from a TodayWorkoutDetail ───────────────────────

export function buildExerciseDrillDownRows(
  workout: Pick<TodayWorkoutDetail, "exercises">,
): ExerciseDrillDownRow[] {
  return workout.exercises.map((ex) => ({
    id: ex.id,
    exerciseId: ex.exerciseId ?? null,
    name: ex.prescription.snapshot.name,
    prescriptionLabel: formatExercisePrescriptionLabel(ex.prescription),
    executionStatus: ex.execution.status as ExerciseExecutionDisplayStatus,
    executionSummary: formatExerciseExecutionRowSummary(ex.execution),
    canUpdate: !isTerminalExerciseStatus(ex.execution.status),
  }));
}

// ── Drill-down visibility gate ────────────────────────────────────────────────

/**
 * The drill-down is shown when the session status is "completed" or "skipped"
 * (terminal session statuses), or when at least one exercise has been updated
 * beyond "planned". This covers the flow where startTodayWorkout creates the
 * session and exercises become immediately actionable.
 */
export function shouldShowExerciseDrillDown(
  workout: Pick<TodayWorkoutDetail, "status" | "exercises" | "isRestDay">,
): boolean {
  if (workout.isRestDay) return false;
  if (workout.status === "completed" || workout.status === "skipped") return true;
  return workout.exercises.some((ex) => ex.execution.status !== "planned");
}

// ── Quick action: build payload for complete / skip ───────────────────────────

export function buildQuickActionPayload(
  action: "completed" | "skipped",
): UpdateWorkoutSessionExerciseInput {
  return { status: action };
}

// ── Adjust form visibility state ──────────────────────────────────────────────

/**
 * Derive which exercise rows have the adjust form expanded.
 * Pure helper — no React dependency, easy to test.
 */
export function toggleAdjustForm(
  openIds: ReadonlySet<string>,
  exerciseRowId: string,
): Set<string> {
  const next = new Set(openIds);
  if (next.has(exerciseRowId)) {
    next.delete(exerciseRowId);
  } else {
    next.add(exerciseRowId);
  }
  return next;
}

export function isAdjustFormOpen(
  openIds: ReadonlySet<string>,
  exerciseRowId: string,
): boolean {
  return openIds.has(exerciseRowId);
}

// ── Adjust payload builder (wraps exercise-catalog-ui-state helper) ───────────

export {
  buildExerciseExecutionUpdatePayload,
  exerciseFeedbackToFormState,
  canSubmitExerciseExecutionUpdate,
  type ExerciseFeedbackFormState,
} from "./exercise-catalog-ui-state";

// ── Query invalidation keys ───────────────────────────────────────────────────
//
// Re-exported here so the component can import from one place.
// The source of truth remains api.ts (getWorkoutExecutionRefreshQueryKeys).

export { getWorkoutExecutionRefreshQueryKeys } from "./api";
