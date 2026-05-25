import { describe, expect, it } from "vitest";
import {
  buildFeedbackPayload,
  canExecuteTodayWorkout,
  canStartTodayWorkout,
  canSubmitTodayFeedback,
  canUpdateTodayItem,
  findFirstPendingRequiredItem,
  formatAdherenceScore,
  formatAdherenceSummary,
  formatDisplayDate,
  formatHistoryTaskCountBadge,
  formatLocalIsoDate,
  formatTaskCountChip,
  formatTodayHabitItemSourceLabel,
  hasTodayWorkoutExecutionStarted,
  historyEntrySummaryLabel,
  isTodayHabitItem,
  isWorkoutActionNeeded,
  mergeTodayHistoryWithCurrentDay,
  resolveTodayNextAction,
  shouldExpandTodayCheckInsSection,
  shouldExpandTodayDetailsSection,
  shouldExpandTodayPlanSection,
  buildTodayDisclosureResetKey,
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
    expect(formatTaskCountChip({ completedRequired: 2, totalRequired: 4 })).toBe("2/4 tasks");
    expect(formatTaskCountChip({ completedRequired: 0, totalRequired: 0 })).toBe("0 tasks");
    expect(formatHistoryTaskCountBadge({
      adherence: { completedRequired: 1, totalRequired: 3, score: 0.33, completedOptional: 0, skippedRequired: 0, skippedOptional: 0 },
    })).toBe("1/3 tasks");
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

  it("summarizes history entries with task-count copy", () => {
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
    ).toBe("1 of 2 required tasks completed · Feedback saved");

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
    ).toBe("0 checklist items · No feedback");

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
    ).toBe("1 of 1 required tasks completed · No feedback");
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

  it("resolves next action priority from daily state", () => {
    const pendingHabit = {
      id: "a1000001-0000-4000-8000-000000000001",
      label: "Morning mobility",
      kind: "habit" as const,
      status: "pending" as const,
      required: true,
      source: { type: "habit" as const, id: "a1000001-0000-4000-8000-000000000002" },
    };

    expect(
      resolveTodayNextAction({
        items: [],
        workout: null,
        hasWellbeingCheckIn: false,
        hasRecoveryCheckIn: false,
        hasPendingNutritionMeal: false,
        pendingNutritionMealLabel: null,
        existingFeedback: null,
      }).kind,
    ).toBe("recovery_wellbeing");

    expect(
      resolveTodayNextAction({
        items: [],
        workout: null,
        hasWellbeingCheckIn: true,
        hasRecoveryCheckIn: false,
        hasPendingNutritionMeal: false,
        pendingNutritionMealLabel: null,
        existingFeedback: null,
      }).title,
    ).toBe("Log recovery check-in");

    expect(
      resolveTodayNextAction({
        items: [pendingHabit],
        workout: sampleWorkout,
        hasWellbeingCheckIn: true,
        hasRecoveryCheckIn: true,
        hasPendingNutritionMeal: false,
        pendingNutritionMealLabel: null,
        existingFeedback: null,
      }),
    ).toMatchObject({
      kind: "workout",
      anchorId: "today-movement",
    });

    const startedWorkout = {
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

    expect(
      resolveTodayNextAction({
        items: [pendingHabit],
        workout: startedWorkout,
        hasWellbeingCheckIn: true,
        hasRecoveryCheckIn: true,
        hasPendingNutritionMeal: false,
        pendingNutritionMealLabel: null,
        existingFeedback: null,
      }).title,
    ).toBe("Finish your workout");

    expect(
      resolveTodayNextAction({
        items: [pendingHabit],
        workout: { ...sampleWorkout, isRestDay: true },
        hasWellbeingCheckIn: true,
        hasRecoveryCheckIn: true,
        hasPendingNutritionMeal: false,
        pendingNutritionMealLabel: null,
        existingFeedback: null,
      }),
    ).toMatchObject({
      kind: "habit_checklist",
      description: "Morning mobility",
      anchorId: "today-habits",
    });

    expect(
      resolveTodayNextAction({
        items: [],
        workout: null,
        hasWellbeingCheckIn: true,
        hasRecoveryCheckIn: true,
        hasPendingNutritionMeal: true,
        pendingNutritionMealLabel: "Lunch",
        existingFeedback: null,
      }),
    ).toMatchObject({
      kind: "nutrition_meal",
      description: "Lunch",
      anchorId: "today-nutrition",
    });

    expect(
      resolveTodayNextAction({
        items: [],
        workout: null,
        hasWellbeingCheckIn: true,
        hasRecoveryCheckIn: true,
        hasPendingNutritionMeal: false,
        pendingNutritionMealLabel: null,
        existingFeedback: null,
      }),
    ).toMatchObject({
      kind: "caught_up",
      anchorId: "today-details",
    });
  });

  it("skips check-in priority while check-in state is still loading", () => {
    expect(
      resolveTodayNextAction({
        items: [],
        workout: sampleWorkout,
        hasWellbeingCheckIn: null,
        hasRecoveryCheckIn: null,
        hasPendingNutritionMeal: false,
        pendingNutritionMealLabel: null,
        existingFeedback: null,
      }).kind,
    ).toBe("workout");

    expect(
      resolveTodayNextAction({
        items: [],
        workout: sampleWorkout,
        hasWellbeingCheckIn: true,
        hasRecoveryCheckIn: null,
        hasPendingNutritionMeal: false,
        pendingNutritionMealLabel: null,
        existingFeedback: null,
      }).kind,
    ).toBe("workout");
  });

  it("prioritizes missing wellbeing when recovery is already logged", () => {
    expect(
      resolveTodayNextAction({
        items: [],
        workout: null,
        hasWellbeingCheckIn: false,
        hasRecoveryCheckIn: true,
        hasPendingNutritionMeal: false,
        pendingNutritionMealLabel: null,
        existingFeedback: null,
      }),
    ).toMatchObject({
      kind: "recovery_wellbeing",
      title: "Log wellbeing check-in",
      anchorId: "today-check-ins",
    });
  });

  it("varies caught-up copy when reflection already exists", () => {
    expect(
      resolveTodayNextAction({
        items: [],
        workout: null,
        hasWellbeingCheckIn: true,
        hasRecoveryCheckIn: true,
        hasPendingNutritionMeal: false,
        pendingNutritionMealLabel: null,
        existingFeedback: null,
      }).ctaLabel,
    ).toBe("Add reflection");

    expect(
      resolveTodayNextAction({
        items: [],
        workout: null,
        hasWellbeingCheckIn: true,
        hasRecoveryCheckIn: true,
        hasPendingNutritionMeal: false,
        pendingNutritionMealLabel: null,
        existingFeedback: { notes: "Steady day" },
      }),
    ).toMatchObject({
      kind: "caught_up",
      ctaLabel: "Review details",
      description: expect.stringContaining("Review recent days"),
    });
  });

  it("finds pending required items and workout action needs", () => {
    const pendingItem = {
      id: "11111111-1111-4111-8111-111111111111",
      label: "Hydrate",
      kind: "hydration" as const,
      status: "pending" as const,
      required: true,
      source: { type: "custom" as const },
    };

    expect(findFirstPendingRequiredItem([pendingItem])?.label).toBe("Hydrate");
    expect(isWorkoutActionNeeded(sampleWorkout)).toBe(true);
    expect(isWorkoutActionNeeded({ ...sampleWorkout, isRestDay: true })).toBe(false);
  });

  it("derives smart default expansion for plan, check-ins, and details", () => {
    const caughtUp = resolveTodayNextAction({
      items: [],
      workout: null,
      hasWellbeingCheckIn: true,
      hasRecoveryCheckIn: true,
      hasPendingNutritionMeal: false,
      pendingNutritionMealLabel: null,
      existingFeedback: null,
    });

    expect(
      shouldExpandTodayPlanSection("movement", {
        nextAction: caughtUp,
        workout: sampleWorkout,
        items: [],
        hasPendingNutritionMeal: false,
      }),
    ).toBe(true);

    expect(
      shouldExpandTodayCheckInsSection({
        nextAction: caughtUp,
        hasWellbeingCheckIn: true,
        hasRecoveryCheckIn: true,
      }),
    ).toBe(false);

    expect(
      shouldExpandTodayCheckInsSection({
        nextAction: caughtUp,
        hasWellbeingCheckIn: true,
        hasRecoveryCheckIn: true,
        wellbeingIndicatesCrisisSupport: true,
      }),
    ).toBe(true);

    expect(shouldExpandTodayDetailsSection(caughtUp)).toBe(true);

    const checkInAction = resolveTodayNextAction({
      items: [],
      workout: null,
      hasWellbeingCheckIn: false,
      hasRecoveryCheckIn: true,
      hasPendingNutritionMeal: false,
      pendingNutritionMealLabel: null,
      existingFeedback: null,
    });

    expect(
      shouldExpandTodayCheckInsSection({
        nextAction: checkInAction,
        hasWellbeingCheckIn: false,
        hasRecoveryCheckIn: true,
      }),
    ).toBe(true);

    expect(
      shouldExpandTodayCheckInsSection({
        nextAction: caughtUp,
        hasWellbeingCheckIn: null,
        hasRecoveryCheckIn: null,
      }),
    ).toBe(true);

    const nutritionAction = resolveTodayNextAction({
      items: [],
      workout: null,
      hasWellbeingCheckIn: true,
      hasRecoveryCheckIn: true,
      hasPendingNutritionMeal: true,
      pendingNutritionMealLabel: "Lunch",
      existingFeedback: null,
    });

    expect(
      shouldExpandTodayPlanSection("nutrition", {
        nextAction: nutritionAction,
        workout: null,
        items: [],
        hasPendingNutritionMeal: true,
      }),
    ).toBe(true);

    const pendingHabit = {
      id: "a1000001-0000-4000-8000-000000000001",
      label: "Evening stretch",
      kind: "habit" as const,
      status: "pending" as const,
      required: false,
      source: { type: "habit" as const, id: "a1000001-0000-4000-8000-000000000002" },
    };

    expect(
      shouldExpandTodayPlanSection("habits", {
        nextAction: caughtUp,
        workout: null,
        items: [pendingHabit],
        hasPendingNutritionMeal: false,
      }),
    ).toBe(true);

    expect(
      shouldExpandTodayPlanSection("movement", {
        nextAction: caughtUp,
        workout: { ...sampleWorkout, isRestDay: true },
        items: [],
        hasPendingNutritionMeal: false,
      }),
    ).toBe(false);
  });

  it("builds disclosure reset keys from date and smart defaults", () => {
    expect(buildTodayDisclosureResetKey("movement", "2026-05-25", true)).toBe(
      "movement:2026-05-25:true",
    );
    expect(buildTodayDisclosureResetKey("check-ins", "2026-05-25", false)).toBe(
      "check-ins:2026-05-25:false",
    );
  });
});
