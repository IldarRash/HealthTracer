import { describe, expect, it } from "vitest";
import {
  buildFeedbackPayload,
  canExecuteTodayWorkout,
  canStartTodayWorkout,
  canSubmitTodayFeedback,
  canUpdateTodayItem,
  formatAdherenceScore,
  formatAdherenceSummary,
  formatDisplayDate,
  formatLocalIsoDate,
  formatTodayHabitItemSourceLabel,
  hasTodayWorkoutExecutionStarted,
  historyEntrySummaryLabel,
  isTodayHabitItem,
  mergeTodayHistoryWithCurrentDay,
  todayHabitItemClosedMessage,
  todayItemClosedMessage,
  todayItemKindLabel,
  todayItemStatusBadgeClass,
  todayItemStatusLabel,
  todayWorkoutStatusBadgeClass,
  todayWorkoutSummaryLabel,
} from "./today-ui-state.js";

const sampleWorkout = {
  sessionId: "78d40655-b4b5-47b3-b28e-470192e05f04",
  workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
  workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
  plannedDate: "2026-05-23",
  weekday: "friday" as const,
  title: "Strength day",
  focus: "Lower body",
  status: "planned" as const,
  exercises: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      prescription: { snapshot: { name: "Back squat" } },
      execution: { status: "planned" as const },
    },
  ],
  isRestDay: false,
};

describe("today UI state", () => {
  it("formats display dates from ISO strings", () => {
    expect(formatDisplayDate("2026-05-22")).not.toBe("2026-05-22");
    expect(formatDisplayDate("2026-05-22")).toContain("2026");
    expect(formatLocalIsoDate(new Date(2026, 4, 22))).toBe("2026-05-22");
    expect(formatDisplayDate("not-a-date")).toBe("not-a-date");
  });

  it("maps item status and kind labels", () => {
    expect(todayItemStatusLabel("pending")).toBe("Pending");
    expect(todayItemStatusLabel("completed")).toBe("Completed");
    expect(todayItemKindLabel("workout")).toBe("Workout");
    expect(todayItemKindLabel("habit")).toBe("Habit");
    expect(todayItemStatusBadgeClass("skipped")).toBe("badge badge-session-skipped");
  });

  it("identifies habit checklist items and formats one-per-day execution copy", () => {
    const habitItem = {
      kind: "habit" as const,
      source: { type: "habit" as const, id: "a1000001-0000-4000-8000-000000000001" },
      status: "completed" as const,
    };

    expect(isTodayHabitItem(habitItem)).toBe(true);
    expect(formatTodayHabitItemSourceLabel()).toContain("one completion per day");
    expect(todayHabitItemClosedMessage("completed")).toContain("logged as complete");
    expect(todayHabitItemClosedMessage("skipped")).toContain("marked skipped");
    expect(todayItemClosedMessage(habitItem)).toBe(todayHabitItemClosedMessage("completed"));
    expect(
      todayItemClosedMessage({
        kind: "workout",
        source: { type: "workout_session", id: "78d40655-b4b5-47b3-b28e-470192e05f04" },
        status: "completed",
      }),
    ).toBe("This task is closed for the day.");
  });

  it("allows updates only for pending items", () => {
    expect(canUpdateTodayItem({ status: "pending" })).toBe(true);
    expect(canUpdateTodayItem({ status: "completed" })).toBe(false);
  });

  it("formats adherence score and summary", () => {
    expect(formatAdherenceScore({ score: null })).toBe("—");
    expect(formatAdherenceScore({ score: 0.75 })).toBe("75%");
    expect(
      formatAdherenceSummary({
        completedRequired: 2,
        totalRequired: 4,
        skippedRequired: 1,
      }),
    ).toBe("2 of 4 required tasks completed · 1 skipped");
    expect(
      formatAdherenceSummary({
        completedRequired: 0,
        totalRequired: 0,
        skippedRequired: 0,
      }),
    ).toBe("No required tasks for this day.");
  });

  it("builds feedback payloads from form values", () => {
    expect(
      buildFeedbackPayload({
        notes: "Felt steady",
        energy: "7",
        difficulty: "",
      }),
    ).toEqual({ notes: "Felt steady", energy: 7 });

    expect(
      buildFeedbackPayload({
        notes: "",
        energy: "",
        difficulty: "5",
      }),
    ).toEqual({ difficulty: 5 });
  });

  it("validates feedback submit button state", () => {
    expect(
      canSubmitTodayFeedback({
        notes: "",
        energy: "",
        difficulty: "",
        existingFeedback: null,
      }),
    ).toBe(false);

    expect(
      canSubmitTodayFeedback({
        notes: "Quick note only",
        energy: "",
        difficulty: "",
        existingFeedback: null,
      }),
    ).toBe(true);

    expect(
      canSubmitTodayFeedback({
        notes: "Good day",
        energy: "11",
        difficulty: "",
        existingFeedback: null,
      }),
    ).toBe(false);

    expect(
      canSubmitTodayFeedback({
        notes: "Good day",
        energy: "7",
        difficulty: "4",
        existingFeedback: { notes: "Good day", energy: 7, difficulty: 4 },
      }),
    ).toBe(false);

    expect(
      canSubmitTodayFeedback({
        notes: "Updated note",
        energy: "7",
        difficulty: "4",
        existingFeedback: { notes: "Good day", energy: 7, difficulty: 4 },
      }),
    ).toBe(true);
  });

  it("summarizes history entries", () => {
    expect(
      historyEntrySummaryLabel({
        date: "2026-05-20",
        adherence: {
          score: 0.5,
          completedRequired: 1,
          totalRequired: 2,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        itemCount: 2,
        hasFeedback: true,
      }),
    ).toBe("50% adherence · 2 tasks · Feedback saved");

    expect(
      historyEntrySummaryLabel({
        date: "2026-05-21",
        adherence: {
          score: null,
          completedRequired: 0,
          totalRequired: 0,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        itemCount: 0,
        hasFeedback: false,
      }),
    ).toBe("No score · 0 tasks · No feedback");

    expect(
      historyEntrySummaryLabel({
        date: "2026-05-19",
        adherence: {
          score: 1,
          completedRequired: 1,
          totalRequired: 1,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        itemCount: 1,
        hasFeedback: false,
      }),
    ).toBe("100% adherence · 1 task · No feedback");
  });

  it("overlays fresh day adherence onto matching history entries", () => {
    const staleHistory = [
      {
        date: "2026-05-23",
        adherence: {
          score: 0,
          completedRequired: 0,
          totalRequired: 1,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        itemCount: 1,
        hasFeedback: false,
      },
      {
        date: "2026-05-22",
        adherence: {
          score: 0.5,
          completedRequired: 1,
          totalRequired: 2,
          completedOptional: 0,
          skippedRequired: 0,
          skippedOptional: 0,
        },
        itemCount: 2,
        hasFeedback: false,
      },
    ];

    const merged = mergeTodayHistoryWithCurrentDay(staleHistory, {
      id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      userId: "880099c6-3b5f-4383-8246-97b72bf61818",
      date: "2026-05-23",
      items: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          label: "Strength day",
          kind: "workout",
          status: "completed",
          required: true,
          source: { type: "workout_session", id: "78d40655-b4b5-47b3-b28e-470192e05f04" },
        },
      ],
      source: "generated",
      feedback: null,
      adherence: {
        score: 1,
        completedRequired: 1,
        totalRequired: 1,
        completedOptional: 0,
        skippedRequired: 0,
        skippedOptional: 0,
      },
      createdAt: "2026-05-23T12:00:00.000Z",
      updatedAt: "2026-05-23T12:00:00.000Z",
      workout: null,
      nutrition: null,
    });

    expect(merged[0]?.adherence.score).toBe(1);
    expect(formatAdherenceScore(merged[0]!.adherence)).toBe("100%");
    expect(merged[1]?.adherence.score).toBe(0.5);
  });

  it("detects when a today workout can be started or executed", () => {
    expect(canStartTodayWorkout(sampleWorkout)).toBe(true);
    expect(hasTodayWorkoutExecutionStarted(sampleWorkout)).toBe(false);
    expect(canExecuteTodayWorkout(sampleWorkout)).toBe(true);
    expect(todayWorkoutSummaryLabel(sampleWorkout)).toContain("Lower body");

    const started = {
      ...sampleWorkout,
      exercises: [
        {
          ...sampleWorkout.exercises[0]!,
          execution: { status: "completed" as const },
        },
      ],
    };

    expect(hasTodayWorkoutExecutionStarted(started)).toBe(true);
    expect(canStartTodayWorkout(started)).toBe(false);
    expect(canStartTodayWorkout({ ...sampleWorkout, isRestDay: true })).toBe(false);
    expect(canExecuteTodayWorkout({ ...sampleWorkout, status: "completed" })).toBe(false);
  });

  it("maps workout status to badge classes", () => {
    expect(todayWorkoutStatusBadgeClass("planned")).toBe("badge badge-session-planned");
    expect(todayWorkoutStatusBadgeClass("completed")).toBe("badge badge-session-completed");
  });

  it("tracks exercise completion progress for execution state", () => {
    const inProgress = {
      ...sampleWorkout,
      exercises: [
        {
          ...sampleWorkout.exercises[0]!,
          execution: { status: "completed" as const },
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          prescription: { snapshot: { name: "Romanian deadlift" } },
          execution: { status: "planned" as const },
        },
      ],
    };

    expect(hasTodayWorkoutExecutionStarted(inProgress)).toBe(true);
    expect(canStartTodayWorkout(inProgress)).toBe(false);
    expect(canExecuteTodayWorkout(inProgress)).toBe(true);
  });
});
