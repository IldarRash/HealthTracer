import { describe, expect, it } from "vitest";
import {
  countStructuredWorkoutSessionExerciseProgress,
  deriveWorkoutSessionStatusFromExercises,
  deterministicWorkoutSessionExerciseId,
  findReusableWorkoutSession,
  findWorkoutPlanDayForWeekday,
  normalizeWorkoutSessionExercises,
  resolveWeekdayFromIsoDate,
  type WorkoutSession,
} from "./workouts.js";

describe("workout session execution helpers", () => {
  it("resolves weekdays from ISO calendar dates", () => {
    expect(resolveWeekdayFromIsoDate("2026-05-18")).toBe("monday");
    expect(resolveWeekdayFromIsoDate("2026-05-23")).toBe("saturday");
  });

  it("finds the active plan day for a weekday", () => {
    const day = findWorkoutPlanDayForWeekday(
      {
        title: "Strength base",
        summary: "Three training days.",
        days: [
          { weekday: "monday", focus: "Lower body", exercises: ["Squat"] },
          { weekday: "wednesday", focus: "Upper body", exercises: ["Push-up"] },
        ],
        notes: [],
      },
      "wednesday",
    );

    expect(day?.focus).toBe("Upper body");
  });

  it("reuses a session materialized for the same date and revision", () => {
    const sessions: Pick<
      WorkoutSession,
      "id" | "workoutPlanId" | "workoutPlanRevisionId" | "plannedDate"
    >[] = [
      {
        id: "78d40655-b4b5-47b3-b28e-470192e05f04",
        workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
        plannedDate: "2026-05-23",
      },
    ];

    expect(
      findReusableWorkoutSession(sessions, {
        workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
        plannedDate: "2026-05-23",
      })?.id,
    ).toBe("78d40655-b4b5-47b3-b28e-470192e05f04");
  });

  it("derives session status from structured exercise completion", () => {
    const exercises = [
      {
        id: "a1000001-0000-4000-8000-000000000001",
        prescription: { snapshot: { name: "Squat" }, sets: 3, reps: "8" },
        execution: { status: "completed" as const },
      },
      {
        id: "a1000001-0000-4000-8000-000000000002",
        prescription: { snapshot: { name: "Lunge" }, sets: 3, reps: "10" },
        execution: { status: "planned" as const },
      },
    ];

    expect(deriveWorkoutSessionStatusFromExercises(exercises, "planned")).toBe("planned");

    expect(
      deriveWorkoutSessionStatusFromExercises(
        exercises.map((exercise, index) =>
          index === 1 ? { ...exercise, execution: { status: "completed" as const } } : exercise,
        ),
        "planned",
      ),
    ).toBe("completed");

    expect(
      deriveWorkoutSessionStatusFromExercises(
        exercises.map((exercise) => ({
          ...exercise,
          execution: { status: "skipped" as const },
        })),
        "planned",
      ),
    ).toBe("skipped");
  });

  it("counts structured exercise progress for weekly aggregation", () => {
    const progress = countStructuredWorkoutSessionExerciseProgress([
      {
        id: "a1000001-0000-4000-8000-000000000001",
        prescription: { snapshot: { name: "Squat" } },
        execution: { status: "completed" },
      },
      {
        id: "a1000001-0000-4000-8000-000000000002",
        prescription: { snapshot: { name: "Lunge" } },
        execution: { status: "adjusted" },
      },
      {
        id: "a1000001-0000-4000-8000-000000000003",
        prescription: { snapshot: { name: "Plank" } },
        execution: { status: "planned" },
      },
    ]);

    expect(progress.completed).toBe(1);
    expect(progress.adjusted).toBe(1);
    expect(progress.planned).toBe(1);
    expect(progress.completionPercent).toBe(67);
  });

  it("normalizes legacy string and object session exercises with stable ids", () => {
    const sessionId = "78d40655-b4b5-47b3-b28e-470192e05f04";
    const normalized = normalizeWorkoutSessionExercises(sessionId, [
      "Goblet squat",
      { name: "Romanian deadlift", sets: 3, reps: "8" },
    ]);

    expect(normalized).toHaveLength(2);
    expect(normalized[0]?.id).toBe(deterministicWorkoutSessionExerciseId(sessionId, 0));
    expect(normalized[1]?.id).toBe(deterministicWorkoutSessionExerciseId(sessionId, 1));
    expect(normalized[0]?.prescription.snapshot.name).toBe("Goblet squat");
    expect(normalized[1]?.prescription.sets).toBe(3);
  });
});
