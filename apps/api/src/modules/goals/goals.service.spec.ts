import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
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
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const goalRow = {
  id: "14a08176-64a7-4a2d-8a44-581807368394",
  userId: user.id,
  type: "general_wellness" as const,
  status: "active" as const,
  priority: "primary" as const,
  title: "Move daily",
  target: {},
  startDate: null,
  targetDate: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

describe("GoalsService", () => {
  it("creates goals for the resolved current user", async () => {
    const service = new GoalsService(
      {
        create: async () => goalRow,
        listByUserId: async () => [],
        update: async () => null,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

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
    const service = new GoalsService(
      {
        create: async () => goalRow,
        listByUserId: async () => [],
        update: async () => null,
      } as never,
      {
        resolveFromAuth: async () => user,
      } as never,
    );

    await expect(
      service.updateCurrentGoal(auth, goalRow.id, { status: "completed" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
