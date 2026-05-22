import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "@health/types";
import {
  buildSessionTitleFromDay,
  canCompleteSession,
  canSubmitScheduleForm,
  formatExerciseLabel,
  formatLocalIsoDate,
  hasActiveWorkoutPlan,
  isValidPlannedDate,
  sessionStatusLabel,
  sortSessionsByPlannedDate,
} from "./training-ui-state.js";

describe("training UI state", () => {
  it("formats string and structured exercises", () => {
    expect(formatExerciseLabel("Goblet squat")).toBe("Goblet squat");
    expect(
      formatExerciseLabel({
        name: "Romanian deadlift",
        sets: 3,
        reps: "8",
        target: "RPE 7",
      }),
    ).toBe("Romanian deadlift · 3×8 · RPE 7");
  });

  it("allows completion actions only for planned sessions", () => {
    expect(canCompleteSession({ status: "planned" })).toBe(true);
    expect(canCompleteSession({ status: "completed" })).toBe(false);
    expect(canCompleteSession({ status: "skipped" })).toBe(false);
  });

  it("sorts sessions by planned date ascending", () => {
    const sessions = [
      { plannedDate: "2026-05-25" },
      { plannedDate: "2026-05-20" },
      { plannedDate: "2026-05-22" },
    ] as WorkoutSession[];

    expect(sortSessionsByPlannedDate(sessions).map((session) => session.plannedDate)).toEqual([
      "2026-05-20",
      "2026-05-22",
      "2026-05-25",
    ]);
  });

  it("detects when an active plan and revision are present", () => {
    expect(
      hasActiveWorkoutPlan({
        plan: { id: "3f98f3dd-806d-4386-8c5f-43499626c5d6" },
        activeRevision: { id: "880099c6-3b5f-4383-8246-97b72bf61818" },
      }),
    ).toBe(true);

    expect(hasActiveWorkoutPlan({ plan: null, activeRevision: null })).toBe(false);
    expect(
      hasActiveWorkoutPlan({
        plan: { id: "3f98f3dd-806d-4386-8c5f-43499626c5d6" },
        activeRevision: null,
      }),
    ).toBe(false);
  });

  it("formats exercise labels with notes when sets are omitted", () => {
    expect(
      formatExerciseLabel({
        name: "Farmer carry",
        notes: "Use straps if grip fails",
      }),
    ).toBe("Farmer carry · (Use straps if grip fails)");
  });

  it("maps session status labels for display", () => {
    expect(sessionStatusLabel("planned")).toBe("Planned");
    expect(sessionStatusLabel("completed")).toBe("Completed");
    expect(sessionStatusLabel("skipped")).toBe("Skipped");
  });

  it("formats local ISO dates and validates planned date input", () => {
    expect(formatLocalIsoDate(new Date(2026, 4, 22))).toBe("2026-05-22");
    expect(isValidPlannedDate("2026-05-22")).toBe(true);
    expect(isValidPlannedDate("05/22/2026")).toBe(false);
  });

  it("builds session titles from plan days", () => {
    expect(
      buildSessionTitleFromDay({ day: "Day 1", focus: "Strength" }),
    ).toBe("Day 1 · Strength");
  });

  it("allows scheduling only with a valid date and selected day", () => {
    expect(
      canSubmitScheduleForm({
        plannedDate: "2026-05-22",
        dayIndex: 0,
        daysCount: 3,
      }),
    ).toBe(true);

    expect(
      canSubmitScheduleForm({
        plannedDate: "",
        dayIndex: 0,
        daysCount: 3,
      }),
    ).toBe(false);

    expect(
      canSubmitScheduleForm({
        plannedDate: "2026-05-22",
        dayIndex: 3,
        daysCount: 3,
      }),
    ).toBe(false);
  });
});
