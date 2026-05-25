import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { GoalsService } from "./goals.service.js";

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const quarterlyGoalId = "44444444-4444-4444-8444-444444444444";

const goalRow = {
  id: "14a08176-64a7-4a2d-8a44-581807368394",
  userId: user.id,
  type: "general_wellness" as const,
  status: "active" as const,
  priority: "primary" as const,
  title: "Move daily",
  target: {},
  horizon: null,
  parentGoalId: null,
  weekStart: null,
  startDate: null,
  targetDate: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function createService(goalsRepository: Record<string, unknown> = {}) {
  return new GoalsService(
    {
      create: async () => goalRow,
      listByUserId: async () => [],
      update: async () => null,
      ...goalsRepository,
    } as never,
    {
      upsertFromAuth: async () => user,
    } as never,
  );
}

describe("GoalsService", () => {
  it("creates goals for the resolved current user", async () => {
    const service = createService();

    await expect(
      service.createCurrentGoal(auth, {
        priority: "primary",
        target: {},
        title: "Move daily",
        type: "general_wellness",
      }),
    ).resolves.toMatchObject({
      id: goalRow.id,
      userId: user.id,
      title: "Move daily",
    });
  });

  it("throws when an update does not match a user-owned goal", async () => {
    const service = createService();

    await expect(
      service.updateCurrentGoal(auth, goalRow.id, { status: "completed" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects creating a second active quarterly goal", async () => {
    const create = vi.fn();
    const service = createService({
      create,
      listByUserId: async () => [{ ...goalRow, horizon: "quarterly" }],
    });

    const result = service.createCurrentGoal(auth, {
      priority: "primary",
      target: {},
      title: "Second quarterly focus",
      type: "general_wellness",
      horizon: "quarterly",
    });

    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toMatchObject({
      response: {
        message: "goal: At most 1 active quarterly goal is allowed.",
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("requires parentGoalId when creating weekly goals", async () => {
    const create = vi.fn();
    const service = createService({
      create,
      listByUserId: async () => [],
    });

    await expect(
      service.createCurrentGoal(auth, {
        priority: "secondary",
        target: {},
        title: "Weekly mobility focus",
        type: "general_wellness",
        horizon: "weekly",
        weekStart: "2026-05-25",
      }),
    ).rejects.toMatchObject({
      response: {
        message: "goal: parentGoalId is required when horizon is weekly.",
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("requires weekStart when creating weekly goals", async () => {
    const create = vi.fn();
    const service = createService({
      create,
      listByUserId: async () => [],
    });

    await expect(
      service.createCurrentGoal(auth, {
        priority: "secondary",
        target: {},
        title: "Weekly mobility focus",
        type: "general_wellness",
        horizon: "weekly",
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          "goal: weekStart is required when horizon is weekly. goal: parentGoalId is required when horizon is weekly.",
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects creating a fourth active weekly focus goal", async () => {
    const create = vi.fn();
    const service = createService({
      create,
      listByUserId: async () => [
        {
          ...goalRow,
          id: quarterlyGoalId,
          horizon: "quarterly",
          status: "active",
        },
        { ...goalRow, id: "11111111-1111-4111-8111-111111111111", horizon: "weekly", parentGoalId: quarterlyGoalId },
        { ...goalRow, id: "22222222-2222-4222-8222-222222222222", horizon: "weekly", parentGoalId: quarterlyGoalId },
        { ...goalRow, id: "33333333-3333-4333-8333-333333333333", horizon: "weekly", parentGoalId: quarterlyGoalId },
      ],
    });

    await expect(
      service.createCurrentGoal(auth, {
        priority: "secondary",
        target: {},
        title: "Fourth weekly focus",
        type: "general_wellness",
        horizon: "weekly",
        weekStart: "2026-05-25",
        parentGoalId: quarterlyGoalId,
      }),
    ).rejects.toMatchObject({
      response: {
        message: "goal: At most 3 active weekly focus goals are allowed.",
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects invalid parent and weekStart hierarchy combinations", async () => {
    const service = createService({
      listByUserId: async () => [goalRow],
      update: async () => goalRow,
    });

    await expect(
      service.createCurrentGoal(auth, {
        priority: "primary",
        target: {},
        title: "Quarterly with parent",
        type: "general_wellness",
        horizon: "quarterly",
        parentGoalId: quarterlyGoalId,
      }),
    ).rejects.toMatchObject({
      response: {
        message: "goal: parentGoalId is not allowed for quarterly goals.",
      },
    });

    await expect(
      service.updateCurrentGoal(auth, goalRow.id, {
        horizon: "daily",
        weekStart: "2026-05-25",
      }),
    ).rejects.toMatchObject({
      response: {
        message:
          "goal: weekStart is only allowed when horizon is weekly. goal: parentGoalId is required when horizon is daily.",
      },
    });
  });

  it("validates partial updates against merged persisted hierarchy state", async () => {
    const service = createService({
      listByUserId: async () => [
        {
          ...goalRow,
          id: quarterlyGoalId,
          horizon: "quarterly",
          status: "active",
        },
        {
          ...goalRow,
          horizon: "weekly",
          weekStart: "2026-05-19",
          parentGoalId: quarterlyGoalId,
        },
      ],
      update: async () => goalRow,
    });

    await expect(
      service.updateCurrentGoal(auth, goalRow.id, {
        weekStart: null,
      }),
    ).rejects.toMatchObject({
      response: {
        message: "goal: weekStart is required when horizon is weekly.",
      },
    });
  });

  it("rejects weekly goals whose parent is missing or not an active quarterly goal", async () => {
    const create = vi.fn();
    const service = createService({
      create,
      listByUserId: async () => [
        {
          ...goalRow,
          id: quarterlyGoalId,
          horizon: "quarterly",
          status: "paused",
        },
      ],
    });

    await expect(
      service.createCurrentGoal(auth, {
        priority: "secondary",
        target: {},
        title: "Weekly focus",
        type: "general_wellness",
        horizon: "weekly",
        weekStart: "2026-05-25",
        parentGoalId: quarterlyGoalId,
      }),
    ).rejects.toMatchObject({
      response: {
        message: "goal: weekly goals must reference an active quarterly parent goal.",
      },
    });

    await expect(
      service.createCurrentGoal(auth, {
        priority: "secondary",
        target: {},
        title: "Weekly focus",
        type: "general_wellness",
        horizon: "weekly",
        weekStart: "2026-05-25",
        parentGoalId: "99999999-9999-4999-8999-999999999999",
      }),
    ).rejects.toMatchObject({
      response: {
        message: "goal: parentGoalId was not found for this user.",
      },
    });
    expect(create).not.toHaveBeenCalled();
  });
});
