import { describe, expect, it } from "vitest";
import {
  buildSessionExercisesFromPlanDay,
  buildSessionTitle,
  resolveTodayWorkoutFromPlan,
  toTodayWorkoutDetail,
  updateStructuredSessionExercise,
} from "./workout-session-materializer.js";

describe("workout session materializer", () => {
  const planId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
  const revisionId = "880099c6-3b5f-4383-8246-97b72bf61818";

  it("builds structured session exercises from a plan day", () => {
    const exercises = buildSessionExercisesFromPlanDay({
      weekday: "monday",
      focus: "Lower body",
      exercises: [
        {
          exerciseId: "c1000001-0000-4000-8000-000000000099",
          snapshot: { name: "Squat", primaryMuscles: ["quads"], equipment: ["barbell"] },
          sets: 3,
          reps: "8",
        },
      ],
    });

    expect(exercises).toHaveLength(1);
    expect(exercises[0]?.prescription.snapshot.name).toBe("Squat");
    expect(exercises[0]?.execution.status).toBe("planned");
  });

  it("resolves idempotent materialization for an existing session", () => {
    const resolved = resolveTodayWorkoutFromPlan({
      plannedDate: "2026-05-18",
      plan: { id: planId, activeRevisionId: revisionId },
      activeRevision: {
        id: revisionId,
        workoutPlanId: planId,
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai_proposal",
        createdAt: "2026-05-20T12:00:00.000Z",
        payload: {
          title: "Strength base",
          summary: "Three training days.",
          days: [
            {
              weekday: "monday",
              focus: "Lower body",
              exercises: [
                {
                  exerciseId: "c1000001-0000-4000-8000-000000000099",
                  snapshot: { name: "Squat", primaryMuscles: ["quads"], equipment: ["barbell"] },
                  sets: 3,
                  reps: "8",
                },
              ],
            },
          ],
          notes: [],
        },
      },
      existingSessions: [
        {
          id: "78d40655-b4b5-47b3-b28e-470192e05f04",
          userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
          workoutPlanId: planId,
          workoutPlanRevisionId: revisionId,
          plannedDate: "2026-05-18",
          title: "Strength base — Lower body",
          status: "planned",
          exercises: [],
          feedback: {},
          completedAt: null,
          createdAt: "2026-05-20T12:00:00.000Z",
          updatedAt: "2026-05-20T12:00:00.000Z",
        },
      ],
    });

    expect(resolved?.shouldMaterialize).toBe(false);
    expect(resolved?.reusableSession?.id).toBe("78d40655-b4b5-47b3-b28e-470192e05f04");
  });

  it("requests materialization when no session exists for the active revision", () => {
    const resolved = resolveTodayWorkoutFromPlan({
      plannedDate: "2026-05-18",
      plan: { id: planId, activeRevisionId: revisionId },
      activeRevision: {
        id: revisionId,
        workoutPlanId: planId,
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai_proposal",
        createdAt: "2026-05-20T12:00:00.000Z",
        payload: {
          title: "Strength base",
          summary: "Three training days.",
          days: [
            {
              weekday: "monday",
              focus: "Lower body",
              exercises: [
                {
                  exerciseId: "c1000001-0000-4000-8000-000000000099",
                  snapshot: { name: "Squat", primaryMuscles: ["quads"], equipment: ["barbell"] },
                  sets: 3,
                  reps: "8",
                },
              ],
            },
          ],
          notes: [],
        },
      },
      existingSessions: [],
    });

    expect(resolved?.shouldMaterialize).toBe(true);
    expect(resolved?.sessionTitle).toBe(buildSessionTitle("Strength base", "Lower body"));
    expect(resolved?.sessionExercises).toHaveLength(1);
  });

  it("returns null when the active plan has no revision", () => {
    expect(
      resolveTodayWorkoutFromPlan({
        plannedDate: "2026-05-18",
        plan: { id: planId, activeRevisionId: null },
        activeRevision: null,
        existingSessions: [],
      }),
    ).toBeNull();
  });

  it("treats weekdays without plan days as rest days", () => {
    const resolved = resolveTodayWorkoutFromPlan({
      plannedDate: "2026-05-23",
      plan: { id: planId, activeRevisionId: revisionId },
      activeRevision: {
        id: revisionId,
        workoutPlanId: planId,
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai_proposal",
        createdAt: "2026-05-20T12:00:00.000Z",
        payload: {
          title: "Strength base",
          summary: "Monday-only plan.",
          days: [
            {
              weekday: "monday",
              focus: "Lower body",
              exercises: [
                {
                  exerciseId: "c1000001-0000-4000-8000-000000000099",
                  snapshot: { name: "Squat", primaryMuscles: ["quads"], equipment: ["barbell"] },
                  sets: 3,
                  reps: "8",
                },
              ],
            },
          ],
          notes: [],
        },
      },
      existingSessions: [],
    });

    expect(resolved?.weekday).toBe("saturday");
    expect(resolved?.planDay).toBeNull();
    expect(resolved?.shouldMaterialize).toBe(false);
    expect(resolved?.sessionExercises).toEqual([]);
  });

  it("updates structured exercise execution state by exercise id", () => {
    const exerciseId = "a1000001-0000-4000-8000-000000000001";
    const updated = updateStructuredSessionExercise(
      [
        {
          id: exerciseId,
          prescription: { snapshot: { name: "Squat" }, sets: 3, reps: "8" },
          execution: { status: "planned" },
        },
      ],
      exerciseId,
      {
        status: "adjusted",
        loadAdjustmentNotes: "Used lighter load.",
      },
    );

    expect(updated[0]).toMatchObject({
      execution: {
        status: "adjusted",
        loadAdjustmentNotes: "Used lighter load.",
      },
    });
  });

  it("persists bounded execution feedback without changing prescription", () => {
    const exerciseId = "a1000001-0000-4000-8000-000000000001";
    const updated = updateStructuredSessionExercise(
      [
        {
          id: exerciseId,
          exerciseId: "b1000001-0000-4000-8000-000000000016",
          prescription: {
            snapshot: { name: "Goblet Squat", primaryMuscles: ["quads"], equipment: ["dumbbell"] },
            sets: 3,
            reps: "8",
          },
          execution: { status: "planned" },
        },
      ],
      exerciseId,
      {
        status: "completed",
        perceivedEffort: 8,
        perceivedDifficulty: 7,
        discomfortFlag: false,
        notes: "Felt controlled.",
        actualReps: "8",
        actualWeightKg: 24,
      },
    );

    expect(updated[0]).toMatchObject({
      prescription: {
        snapshot: { name: "Goblet Squat" },
        sets: 3,
        reps: "8",
      },
      execution: {
        status: "completed",
        perceivedEffort: 8,
        perceivedDifficulty: 7,
        discomfortFlag: false,
        notes: "Felt controlled.",
        actualReps: "8",
        actualWeightKg: 24,
      },
    });
  });

  it("normalizes legacy session exercises for Today workout detail", () => {
    const sessionId = "78d40655-b4b5-47b3-b28e-470192e05f04";
    const detail = toTodayWorkoutDetail(
      {
        id: sessionId,
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        workoutPlanId: planId,
        workoutPlanRevisionId: revisionId,
        plannedDate: "2026-05-18",
        title: "Strength base — Lower body",
        status: "planned",
        exercises: [
          "Goblet squat",
          { name: "Romanian deadlift", sets: 3, reps: "8", target: "Moderate load" },
        ],
        feedback: {},
        completedAt: null,
        createdAt: "2026-05-20T12:00:00.000Z",
        updatedAt: "2026-05-20T12:00:00.000Z",
      },
      "monday",
      "Lower body",
    );

    expect(detail.exercises).toHaveLength(2);
    expect(detail.exercises[0]?.prescription.snapshot.name).toBe("Goblet squat");
    expect(detail.exercises[1]?.prescription.snapshot.name).toBe("Romanian deadlift");
    expect(detail.exercises[1]?.prescription.recommendedLoadGuidance).toBe("Moderate load");
  });
});
