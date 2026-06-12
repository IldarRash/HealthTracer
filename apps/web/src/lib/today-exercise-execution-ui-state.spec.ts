import { describe, expect, it } from "vitest";
import type { TodayWorkoutDetail, WorkoutSessionExercise } from "@health/types";
import {
  buildExerciseDrillDownRows,
  buildQuickActionPayload,
  formatExercisePrescriptionLabel,
  formatExerciseExecutionRowSummary,
  isTerminalExerciseStatus,
  shouldShowExerciseDrillDown,
  toggleAdjustForm,
  isAdjustFormOpen,
  exerciseFeedbackToFormState,
  canSubmitExerciseExecutionUpdate,
  buildExerciseExecutionUpdatePayload,
} from "./today-exercise-execution-ui-state.js";

// ── Fixture helpers ────────────────────────────────────────────────────────────

const makeExercise = (
  overrides: Partial<WorkoutSessionExercise> = {},
): WorkoutSessionExercise => ({
  id: "ex-uuid-0001-0000-0000-000000000001",
  exerciseId: "catalog-id-0001",
  prescription: {
    snapshot: { name: "Back Squat", primaryMuscles: ["quads"], equipment: ["barbell"] },
    sets: 4,
    reps: "5",
    recommendedLoadGuidance: "RPE 8",
    restBetweenSetsSeconds: 90,
  },
  execution: { status: "planned" },
  ...overrides,
});

const makeWorkout = (
  overrides: Partial<TodayWorkoutDetail> = {},
): TodayWorkoutDetail => ({
  sessionId: "session-uuid-0001-0000-0000-000000000001",
  workoutPlanId: "plan-uuid-0001",
  workoutPlanRevisionId: "rev-uuid-0001",
  plannedDate: "2026-06-10",
  weekday: "tuesday",
  title: "Upper Body Push",
  focus: "Chest + Shoulders",
  status: "planned",
  isRestDay: false,
  exercises: [makeExercise()],
  ...overrides,
});

// ── isTerminalExerciseStatus ──────────────────────────────────────────────────

describe("isTerminalExerciseStatus", () => {
  it("returns true for completed and skipped", () => {
    expect(isTerminalExerciseStatus("completed")).toBe(true);
    expect(isTerminalExerciseStatus("skipped")).toBe(true);
  });

  it("returns false for planned and adjusted", () => {
    expect(isTerminalExerciseStatus("planned")).toBe(false);
    expect(isTerminalExerciseStatus("adjusted")).toBe(false);
  });
});

// ── formatExercisePrescriptionLabel ──────────────────────────────────────────

describe("formatExercisePrescriptionLabel", () => {
  it("formats sets × reps", () => {
    expect(
      formatExercisePrescriptionLabel({
        snapshot: { name: "Press", primaryMuscles: [], equipment: [] },
        sets: 3,
        reps: "8",
      }),
    ).toBe("3×8");
  });

  it("includes guidance when present", () => {
    expect(
      formatExercisePrescriptionLabel({
        snapshot: { name: "Squat", primaryMuscles: [], equipment: [] },
        sets: 4,
        reps: "5",
        recommendedLoadGuidance: "RPE 8",
      }),
    ).toBe("4×5 · RPE 8");
  });

  it("formats duration-only prescription", () => {
    expect(
      formatExercisePrescriptionLabel({
        snapshot: { name: "Plank", primaryMuscles: [], equipment: [] },
        durationSeconds: 120,
      }),
    ).toBe("2 min");
  });

  it("returns dash when prescription has no fields", () => {
    expect(
      formatExercisePrescriptionLabel({
        snapshot: { name: "Rest", primaryMuscles: [], equipment: [] },
      }),
    ).toBe("—");
  });
});

// ── formatExerciseExecutionRowSummary ─────────────────────────────────────────

describe("formatExerciseExecutionRowSummary", () => {
  it("returns null for planned status", () => {
    expect(formatExerciseExecutionRowSummary({ status: "planned" })).toBeNull();
  });

  it("returns 'Completed' when status is completed and no logged values", () => {
    expect(formatExerciseExecutionRowSummary({ status: "completed" })).toBe("Completed");
  });

  it("returns 'Skipped' when status is skipped", () => {
    expect(formatExerciseExecutionRowSummary({ status: "skipped" })).toBe("Skipped");
  });

  it("formats logged values when present", () => {
    expect(
      formatExerciseExecutionRowSummary({
        status: "completed",
        actualReps: "5",
        actualWeightKg: 80,
        perceivedEffort: 8,
        discomfortFlag: true,
      }),
    ).toBe("5 · 80 kg · RPE 8 · Discomfort noted");
  });
});

// ── buildExerciseDrillDownRows ────────────────────────────────────────────────

describe("buildExerciseDrillDownRows", () => {
  it("maps planned exercises to updatable rows", () => {
    const workout = makeWorkout();
    const rows = buildExerciseDrillDownRows(workout);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error("Expected at least one row");
    expect(row.name).toBe("Back Squat");
    expect(row.prescriptionLabel).toBe("4×5 · RPE 8");
    expect(row.executionStatus).toBe("planned");
    expect(row.executionSummary).toBeNull();
    expect(row.canUpdate).toBe(true);
  });

  it("marks completed rows as non-updatable with summary", () => {
    const workout = makeWorkout({
      exercises: [
        makeExercise({
          execution: {
            status: "completed",
            actualReps: "5",
            actualWeightKg: 100,
            perceivedEffort: 9,
          },
        }),
      ],
    });

    const row = buildExerciseDrillDownRows(workout)[0];
    if (!row) throw new Error("Expected at least one row");
    expect(row.canUpdate).toBe(false);
    expect(row.executionSummary).toBe("5 · 100 kg · RPE 9");
  });

  it("marks skipped rows as non-updatable", () => {
    const workout = makeWorkout({
      exercises: [makeExercise({ execution: { status: "skipped" } })],
    });
    const row = buildExerciseDrillDownRows(workout)[0];
    if (!row) throw new Error("Expected at least one row");
    expect(row.canUpdate).toBe(false);
    expect(row.executionSummary).toBe("Skipped");
  });
});

// ── shouldShowExerciseDrillDown ───────────────────────────────────────────────

describe("shouldShowExerciseDrillDown", () => {
  it("returns false for rest days even when session status is completed", () => {
    expect(shouldShowExerciseDrillDown(makeWorkout({ isRestDay: true, status: "completed" }))).toBe(false);
  });

  it("returns false for planned sessions with all exercises planned", () => {
    expect(shouldShowExerciseDrillDown(makeWorkout({ status: "planned" }))).toBe(false);
  });

  it("returns true when session status is completed", () => {
    expect(shouldShowExerciseDrillDown(makeWorkout({ status: "completed" }))).toBe(true);
  });

  it("returns true when session status is skipped", () => {
    expect(shouldShowExerciseDrillDown(makeWorkout({ status: "skipped" }))).toBe(true);
  });

  it("returns true when at least one exercise has been updated", () => {
    const workout = makeWorkout({
      status: "planned",
      exercises: [makeExercise({ execution: { status: "completed" } })],
    });
    expect(shouldShowExerciseDrillDown(workout)).toBe(true);
  });
});

// ── buildQuickActionPayload ───────────────────────────────────────────────────

describe("buildQuickActionPayload", () => {
  it("builds a completed payload", () => {
    expect(buildQuickActionPayload("completed")).toEqual({ status: "completed" });
  });

  it("builds a skipped payload", () => {
    expect(buildQuickActionPayload("skipped")).toEqual({ status: "skipped" });
  });
});

// ── toggleAdjustForm ──────────────────────────────────────────────────────────

describe("toggleAdjustForm", () => {
  it("adds an id when not in set", () => {
    const result = toggleAdjustForm(new Set(), "ex-1");
    expect(result.has("ex-1")).toBe(true);
  });

  it("removes an id when already in set", () => {
    const result = toggleAdjustForm(new Set(["ex-1"]), "ex-1");
    expect(result.has("ex-1")).toBe(false);
  });

  it("does not mutate the original set", () => {
    const original = new Set(["ex-1"]);
    toggleAdjustForm(original, "ex-1");
    expect(original.has("ex-1")).toBe(true);
  });

  it("preserves other ids when toggling one", () => {
    const original = new Set(["ex-1", "ex-2"]);
    const result = toggleAdjustForm(original, "ex-2");
    expect(result.has("ex-1")).toBe(true);
    expect(result.has("ex-2")).toBe(false);
  });
});

// ── isAdjustFormOpen ──────────────────────────────────────────────────────────

describe("isAdjustFormOpen", () => {
  it("returns true when id is in the set", () => {
    expect(isAdjustFormOpen(new Set(["ex-1"]), "ex-1")).toBe(true);
  });

  it("returns false when id is not in the set", () => {
    expect(isAdjustFormOpen(new Set(["ex-2"]), "ex-1")).toBe(false);
  });

  it("returns false for empty set", () => {
    expect(isAdjustFormOpen(new Set(), "ex-1")).toBe(false);
  });
});

// ── exerciseFeedbackToFormState (re-exported) ─────────────────────────────────

describe("exerciseFeedbackToFormState (re-export)", () => {
  it("maps populated execution to form state", () => {
    const form = exerciseFeedbackToFormState({
      status: "adjusted",
      perceivedEffort: 8,
      perceivedDifficulty: 7,
      actualReps: "5",
      actualWeightKg: 80,
      notes: "Felt heavy",
      loadAdjustmentNotes: "Dropped 5 kg",
      discomfortFlag: true,
    });
    expect(form.perceivedEffort).toBe("8");
    expect(form.perceivedDifficulty).toBe("7");
    expect(form.actualReps).toBe("5");
    expect(form.actualWeightKg).toBe("80");
    expect(form.notes).toBe("Felt heavy");
    expect(form.loadAdjustmentNotes).toBe("Dropped 5 kg");
    expect(form.discomfortFlag).toBe(true);
  });

  it("returns empty strings and false for sparse execution", () => {
    const form = exerciseFeedbackToFormState({ status: "planned" });
    expect(form.perceivedEffort).toBe("");
    expect(form.perceivedDifficulty).toBe("");
    expect(form.actualReps).toBe("");
    expect(form.actualWeightKg).toBe("");
    expect(form.notes).toBe("");
    expect(form.loadAdjustmentNotes).toBe("");
    expect(form.discomfortFlag).toBe(false);
  });
});

// ── canSubmitExerciseExecutionUpdate (re-exported) ────────────────────────────

describe("canSubmitExerciseExecutionUpdate (re-export)", () => {
  const emptyForm = {
    perceivedEffort: "",
    perceivedDifficulty: "",
    discomfortFlag: false,
    notes: "",
    actualReps: "",
    actualWeightKg: "",
    loadAdjustmentNotes: "",
  };

  it("returns false for an empty form with no status", () => {
    expect(canSubmitExerciseExecutionUpdate({ form: emptyForm })).toBe(false);
  });

  it("returns true when status is provided", () => {
    expect(canSubmitExerciseExecutionUpdate({ form: emptyForm, status: "adjusted" })).toBe(true);
  });

  it("returns true when at least one field is filled", () => {
    expect(
      canSubmitExerciseExecutionUpdate({ form: { ...emptyForm, actualReps: "5" } }),
    ).toBe(true);
  });

  it("returns false when weight value is invalid (non-positive)", () => {
    expect(
      canSubmitExerciseExecutionUpdate({ form: { ...emptyForm, actualWeightKg: "-5" } }),
    ).toBe(false);
  });

  it("returns false when RPE is out of bounds (> 10)", () => {
    expect(
      canSubmitExerciseExecutionUpdate({ form: { ...emptyForm, perceivedEffort: "15" } }),
    ).toBe(false);
  });
});

// ── buildExerciseExecutionUpdatePayload for adjust (re-exported) ──────────────

describe("buildExerciseExecutionUpdatePayload for adjust (re-export)", () => {
  const emptyForm = {
    perceivedEffort: "",
    perceivedDifficulty: "",
    discomfortFlag: false,
    notes: "",
    actualReps: "",
    actualWeightKg: "",
    loadAdjustmentNotes: "",
  };

  it("returns null for an empty form with no status", () => {
    expect(buildExerciseExecutionUpdatePayload({ form: emptyForm })).toBeNull();
  });

  it("returns payload with status=adjusted and mapped fields", () => {
    const payload = buildExerciseExecutionUpdatePayload({
      form: { ...emptyForm, actualReps: "5", actualWeightKg: "80", perceivedEffort: "8" },
      status: "adjusted",
    });
    expect(payload).not.toBeNull();
    expect(payload?.status).toBe("adjusted");
    expect(payload?.actualReps).toBe("5");
    expect(payload?.actualWeightKg).toBe(80);
    expect(payload?.perceivedEffort).toBe(8);
  });

  it("returns null for invalid weight (zero)", () => {
    const payload = buildExerciseExecutionUpdatePayload({
      form: { ...emptyForm, actualWeightKg: "0" },
      status: "adjusted",
    });
    expect(payload).toBeNull();
  });
});
