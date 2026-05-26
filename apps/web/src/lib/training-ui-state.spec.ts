import { describe, expect, it } from "vitest";
import type { WorkoutSession, WorkoutSessionExercise } from "@health/types";
import {
  buildSessionTitleFromDay,
  buildTrainingWeekStripView,
  canCompleteSession,
  canSubmitScheduleForm,
  canUpdateSessionExercise,
  formatExerciseLabel,
  formatLocalIsoDate,
  formatRestDuration,
  formatSessionExerciseDetailLines,
  formatSessionExerciseExecutionSummary,
  formatSessionExercisePrescription,
  getWorkoutPlanDayKey,
  getWorkoutPlanDayLabel,
  groupSessionExercisesByCircuit,
  getRevisionNumberLabel,
  getSessionRevisionNote,
  hasActiveWorkoutPlan,
  isTerminalSessionStatus,
  isValidPlannedDate,
  sessionExerciseStatusBadgeClass,
  sessionExerciseStatusLabel,
  sessionStatusLabel,
  sortSessionsByPlannedDate,
  toWorkoutSessionExercisePayload,
} from "./training-ui-state.js";

const sampleExercise = (
  overrides: Partial<WorkoutSessionExercise> = {},
): WorkoutSessionExercise => ({
  id: "78d40655-b4b5-47b3-b28e-470192e05f04",
  exerciseId: null,
  prescription: {
    snapshot: { name: "Back squat" },
    sets: 4,
    reps: "5",
    recommendedLoadGuidance: "RPE 8",
    restBetweenSetsSeconds: 90,
    circuitGroupId: null,
    circuitGroupLabel: null,
  },
  execution: { status: "planned" },
  ...overrides,
});

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

  it("builds a sparse week strip when no sessions are scheduled this week", () => {
    const view = buildTrainingWeekStripView([], new Date("2026-05-25T12:00:00"));

    expect(view.dayLabels).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(view.trend).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(view.sparse).toBe(true);
    expect(view.ariaLabel).toContain("No workouts scheduled");
  });

  it("maps current-week session statuses into trend strip values", () => {
    const sessions = [
      {
        plannedDate: "2026-05-25",
        status: "completed",
      },
      {
        plannedDate: "2026-05-27",
        status: "planned",
      },
    ] as WorkoutSession[];

    const view = buildTrainingWeekStripView(sessions, new Date("2026-05-25T12:00:00"));

    expect(view.sparse).toBe(false);
    expect(view.trend[0]).toBe(100);
    expect(view.trend[2]).toBe(55);
    expect(view.ariaLabel).toContain("1 completed workout");
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

  it("formats catalog-backed workout plan exercises", () => {
    expect(
      formatExerciseLabel({
        snapshot: { name: "Back squat" },
        sets: 4,
        reps: "5",
        recommendedLoadGuidance: "RPE 8",
      }),
    ).toBe("Back squat · 4×5 · RPE 8");
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
    expect(
      buildSessionTitleFromDay({ weekday: "monday", focus: "Upper body" }),
    ).toBe("Monday · Upper body");
    expect(getWorkoutPlanDayLabel({ weekday: "wednesday" })).toBe("Wednesday");
    expect(getWorkoutPlanDayLabel({ day: "Day 2" })).toBe("Day 2");
  });

  it("builds stable React keys from weekday or legacy day labels", () => {
    expect(
      getWorkoutPlanDayKey({ weekday: "monday", focus: "Upper body" }),
    ).toBe("monday-Upper body");
    expect(getWorkoutPlanDayKey({ day: "Day 1", focus: "Strength" })).toBe(
      "Day 1-Strength",
    );
    expect(getWorkoutPlanDayKey({ weekday: "friday", focus: "Lower body" }, 2)).toBe(
      "friday-Lower body-2",
    );
  });

  it("converts catalog-backed plan exercises for session scheduling", () => {
    expect(
      toWorkoutSessionExercisePayload({
        snapshot: { name: "Back squat" },
        sets: 4,
        reps: "5",
        recommendedLoadGuidance: "RPE 8",
        notes: "Controlled tempo",
      }),
    ).toEqual({
      name: "Back squat",
      sets: 4,
      reps: "5",
      target: "RPE 8",
      notes: "Controlled tempo",
    });
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

  it("formats structured session prescriptions with rest and load guidance", () => {
    expect(formatSessionExercisePrescription(sampleExercise())).toBe("Back squat · 4×5 · RPE 8");
    expect(formatRestDuration(90)).toBe("1m 30s rest");
    expect(formatRestDuration(60)).toBe("1 min rest");
    expect(formatSessionExerciseDetailLines(sampleExercise())).toEqual(["1m 30s rest"]);
  });

  it("groups consecutive circuit exercises together", () => {
    const grouped = groupSessionExercisesByCircuit([
      sampleExercise({
        id: "11111111-1111-4111-8111-111111111111",
        prescription: {
          snapshot: { name: "Push-up" },
          circuitGroupId: "a",
          circuitGroupLabel: "Finisher",
        },
      }),
      sampleExercise({
        id: "22222222-2222-4222-8222-222222222222",
        prescription: {
          snapshot: { name: "Plank" },
          circuitGroupId: "a",
          circuitGroupLabel: "Finisher",
        },
      }),
      sampleExercise({
        id: "33333333-3333-4333-8333-333333333333",
        prescription: {
          snapshot: { name: "Back squat" },
        },
      }),
    ]);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.circuitLabel).toBe("Finisher");
    expect(grouped[0]?.exercises).toHaveLength(2);
    expect(grouped[1]?.exercises).toHaveLength(1);
  });

  it("allows exercise updates only while execution is planned", () => {
    expect(canUpdateSessionExercise(sampleExercise())).toBe(true);
    expect(
      canUpdateSessionExercise(
        sampleExercise({ execution: { status: "completed" } }),
      ),
    ).toBe(false);
    expect(sessionExerciseStatusLabel("adjusted")).toBe("Adjusted");
    expect(sessionExerciseStatusBadgeClass("adjusted")).toBe("badge badge-session-planned");
    expect(sessionExerciseStatusBadgeClass("completed")).toBe("badge badge-session-completed");
  });

  it("formats execution summaries and duration-based prescriptions", () => {
    expect(
      formatSessionExerciseExecutionSummary(
        sampleExercise({
          execution: {
            status: "adjusted",
            actualReps: "10",
            actualWeightKg: 40,
            loadAdjustmentNotes: "Used lighter load.",
            perceivedEffort: 6,
          },
        }),
      ),
    ).toBe("10 · 40 kg · Used lighter load. · Effort 6/10");

    expect(
      toWorkoutSessionExercisePayload({
        snapshot: { name: "Plank" },
        durationSeconds: 60,
        sets: 3,
        recommendedLoadGuidance: "Hold steady posture.",
      }),
    ).toEqual({
      name: "Plank",
      sets: 3,
      reps: "1 min",
      target: "Hold steady posture.",
      notes: null,
    });
  });
});
