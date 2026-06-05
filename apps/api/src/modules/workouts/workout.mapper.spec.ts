import { InternalServerErrorException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  toWorkoutPlan,
  toWorkoutPlanRevision,
  toWorkoutSession,
} from "./workout.mapper.js";

describe("workout mappers", () => {
  const timestamp = new Date("2026-05-22T12:00:00.000Z");

  it("maps workout plan rows to ISO timestamps", () => {
    const plan = toWorkoutPlan({
      id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(plan.createdAt).toBe("2026-05-22T12:00:00.000Z");
    expect(plan.status).toBe("active");
  });

  it("parses revision payloads and session exercise unions from stored JSON (B5/B6 removal)", () => {
    // B5 removal: weekday required. B6 removal: string exercises removed; object form required.
    const revision = toWorkoutPlanRevision({
      id: "880099c6-3b5f-4383-8246-97b72bf61818",
      workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      revisionNumber: 1,
      reason: "Initial plan",
      source: "ai_proposal",
      payload: {
        title: "Strength base",
        summary: "Mixed exercise formats.",
        days: [
          {
            weekday: "monday",
            focus: "Lower body",
            exercises: [{ name: "Squat" }, { name: "RDL", sets: 3, reps: "8" }],
          },
        ],
        notes: [],
      },
      createdAt: timestamp,
    });

    const session = toWorkoutSession({
      id: "78d40655-b4b5-47b3-b28e-470192e05f04",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      workoutPlanRevisionId: revision.id,
      plannedDate: "2026-05-23",
      title: "Lower body day",
      status: "completed",
      source: "planned",
      activityType: null,
      estimatedCalories: null,
      exercises: [{ name: "Squat", sets: 3, reps: "8" }],
      feedback: { fatigue: 6, notes: "Solid session." },
      completedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(revision.payload.days[0]?.exercises).toHaveLength(2);
    expect(revision.payload.days[0]?.weekday).toBe("monday");
    expect(revision.payload.days[0]?.exercises[0]).toMatchObject({
      snapshot: { name: "Squat" },
    });
    expect(revision.payload.days[0]?.exercises[1]).toMatchObject({
      snapshot: { name: "RDL" },
      sets: 3,
      reps: "8",
    });
    expect(session.exercises[0]).toMatchObject({ name: "Squat", sets: 3, reps: "8" });
    expect(session.feedback.fatigue).toBe(6);
    expect(session.completedAt).toBe("2026-05-22T12:00:00.000Z");
  });

  it("throws a stable internal error when stored revision payload is invalid", () => {
    const invalidRevisionRow = {
      id: "880099c6-3b5f-4383-8246-97b72bf61818",
      workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      revisionNumber: 1,
      reason: "Broken payload",
      source: "ai_proposal",
      payload: { title: "" },
      createdAt: timestamp,
    };

    expect(() => toWorkoutPlanRevision(invalidRevisionRow)).toThrow(
      InternalServerErrorException,
    );
    expect(() => toWorkoutPlanRevision(invalidRevisionRow)).toThrow(
      /Invalid stored workout revision payload\./,
    );
  });
});
