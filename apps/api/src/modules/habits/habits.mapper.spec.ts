import { InternalServerErrorException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { toHabitPlan, toHabitPlanRevision, toHabitTemplate } from "./habits.mapper.js";

describe("habits mappers", () => {
  const timestamp = new Date("2026-05-22T12:00:00.000Z");
  const habitDefinitionId = "a1000001-0000-4000-8000-000000000001";

  const validPayload = {
    habits: [
      {
        habitDefinitionId,
        title: "Morning hydration",
        category: "hydration" as const,
        status: "active" as const,
        schedule: { type: "daily" as const },
        target: { type: "boolean" as const },
        required: true,
        timeOfDayHint: "morning" as const,
        displayOrder: 0,
      },
    ],
  };

  it("maps habit plan rows to ISO timestamps", () => {
    const plan = toHabitPlan({
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

  it("preserves null activeRevisionId on mapped plans", () => {
    const plan = toHabitPlan({
      id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      activeRevisionId: null,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(plan.activeRevisionId).toBeNull();
  });

  it("parses revision payloads from stored JSON", () => {
    const revision = toHabitPlanRevision({
      id: "880099c6-3b5f-4383-8246-97b72bf61818",
      habitPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      revisionNumber: 1,
      reason: "Initial plan",
      source: "ai_proposal",
      payload: validPayload,
      createdAt: timestamp,
    });

    expect(revision.payload.habits).toHaveLength(1);
    expect(revision.payload.habits[0]?.title).toBe("Morning hydration");
    expect(revision.createdAt).toBe("2026-05-22T12:00:00.000Z");
  });

  it("throws a stable internal error when stored revision payload is invalid", () => {
    expect(() =>
      toHabitPlanRevision({
        id: "880099c6-3b5f-4383-8246-97b72bf61818",
        habitPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        revisionNumber: 1,
        reason: "Broken payload",
        source: "ai_proposal",
        payload: { habits: [{ title: "Missing fields" }] },
        createdAt: timestamp,
      }),
    ).toThrow(InternalServerErrorException);
  });

  it("maps stored habit template rows to typed templates", () => {
    const template = toHabitTemplate({
      id: "d1000001-0000-4000-8000-000000000001",
      slug: "daily-hydration",
      title: "Daily hydration",
      category: "hydration",
      defaultTarget: { type: "boolean" },
      targetConstraints: { allowedTargetTypes: ["boolean"] },
      defaultSchedule: { type: "daily" },
      linkedSourceHint: "nutrition_hydration_target",
      defaultRequired: true,
      defaultTimeOfDayHint: "morning",
      coachingNoteDefault: "Start with water.",
      source: "health_tracer_seed",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    expect(template.slug).toBe("daily-hydration");
    expect(template.linkedSourceHint).toBe("nutrition_hydration_target");
  });
});
