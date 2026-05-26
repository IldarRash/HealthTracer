import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "today-workspace.tsx"),
  "utf8",
);

const workoutPanelSource = componentSource.slice(
  componentSource.indexOf("function TodayWorkoutPanel"),
  componentSource.indexOf("export function TodayWorkspace"),
);

const exerciseCardSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "today-workout-exercise-card.tsx"),
  "utf8",
);

describe("Today workout exercise execution UI", () => {
  it("wires bounded feedback fields through session exercise updates", () => {
    expect(workoutPanelSource).toContain("buildExerciseExecutionUpdatePayload");
    expect(workoutPanelSource).toContain("updateWorkoutSessionExercise");
    expect(workoutPanelSource).toContain("<TodayWorkoutExerciseCard");
  });

  it("renders catalog metadata and bounded feedback capture on exercise cards", () => {
    expect(exerciseCardSource).toContain("ExerciseCatalogDetails");
    expect(exerciseCardSource).toContain("DetailLineList");
    expect(exerciseCardSource).toContain("resolveSessionExerciseCatalogMetadata");
    expect(exerciseCardSource).toContain("Perceived effort (1–10)");
    expect(exerciseCardSource).toContain("Perceived difficulty (1–10)");
    expect(exerciseCardSource).toContain("exercise-discomfort-");
    expect(exerciseCardSource).toContain("<fieldset");
    expect(exerciseCardSource).toContain('aria-label={`Exercise status:');
    expect(exerciseCardSource).toContain("Noted discomfort during this exercise");
    expect(exerciseCardSource).toContain("Actual reps");
    expect(exerciseCardSource).toContain("Actual load (kg)");
    expect(exerciseCardSource).not.toMatch(/diagnos/i);
  });

  it("guards status transitions and shows logged feedback after terminal states", () => {
    expect(exerciseCardSource).toContain("canSubmitExerciseExecutionUpdate");
    expect(exerciseCardSource).toContain("canUpdateSessionExercise");
    expect(exerciseCardSource).toContain('handleStatus("completed")');
    expect(exerciseCardSource).toContain('handleStatus("skipped")');
    expect(exerciseCardSource).toContain('handleStatus("adjusted")');
    expect(exerciseCardSource).toContain("training-session-card--${cardStatus}");
    expect(exerciseCardSource).toContain("formatExerciseFeedbackSummary");
    expect(exerciseCardSource).toContain("today-workout-exercise-log");
  });
});
