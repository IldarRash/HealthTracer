import { describe, expect, it } from "vitest";
import type { WorkoutSession } from "@health/types";
import {
  buildSessionTitleFromDay,
  canCompleteSession,
  canSubmitScheduleForm,
  formatExerciseLabel,
  formatLocalIsoDate,
  getRevisionNumberLabel,
  getSessionRevisionNote,
  hasActiveWorkoutPlan,
  isTerminalSessionStatus,
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

  it("detects terminal session statuses", () => {
    expect(isTerminalSessionStatus("completed")).toBe(true);
    expect(isTerminalSessionStatus("skipped")).toBe(true);
    expect(isTerminalSessionStatus("planned")).toBe(false);
  });

  it("resolves revision labels and session revision notes", () => {
    const revisions = [
      { id: "rev-1", revisionNumber: 1 },
      { id: "rev-2", revisionNumber: 2 },
    ];

    expect(getRevisionNumberLabel("rev-2", revisions)).toBe("#2");
    expect(getRevisionNumberLabel("missing", revisions)).toBeNull();

    expect(
      getSessionRevisionNote({
        session: { workoutPlanRevisionId: "rev-2", status: "planned" },
        activeRevisionId: "rev-2",
        revisions,
      }),
    ).toBe("Scheduled from active revision #2.");

    expect(
      getSessionRevisionNote({
        session: { workoutPlanRevisionId: "rev-1", status: "completed" },
        activeRevisionId: "rev-2",
        revisions,
      }),
    ).toBe(
      "Logged against prior revision #1. Sessions stay tied to the revision they were scheduled from.",
    );
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

  it("detects when the Training tab should show the empty state", () => {
    expect(hasActiveWorkoutPlan({ plan: null, activeRevision: null })).toBe(false);
    expect(
      hasActiveWorkoutPlan({
        plan: { id: "3f98f3dd-806d-4386-8c5f-43499626c5d6" },
        activeRevision: null,
      }),
    ).toBe(false);
    expect(
      hasActiveWorkoutPlan({
        plan: null,
        activeRevision: { id: "880099c6-3b5f-4383-8246-97b72bf61818" },
      }),
    ).toBe(false);
  });

  it("describes prior-revision planned sessions separately from terminal logs", () => {
    const revisions = [
      { id: "rev-1", revisionNumber: 1 },
      { id: "rev-2", revisionNumber: 2 },
    ];

    expect(
      getSessionRevisionNote({
        session: { workoutPlanRevisionId: "rev-1", status: "planned" },
        activeRevisionId: "rev-2",
        revisions,
      }),
    ).toBe(
      "Scheduled from prior revision #1. New sessions use your active revision.",
    );
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
