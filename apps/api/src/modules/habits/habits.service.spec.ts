import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { ClerkAuthContext } from "../../auth.types.js";
import { HabitsService } from "./habits.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const planId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
const revisionId = "880099c6-3b5f-4383-8246-97b72bf61818";
const habitDefinitionId = "a1000001-0000-4000-8000-000000000001";
const timestamp = new Date("2026-05-22T12:00:00.000Z");

const auth: ClerkAuthContext = {
  clerkUserId: "clerk-user-1",
  email: "user@example.com",
  displayName: null,
};

const usersService = {
  resolveFromAuth: async () => ({
    id: userId,
    email: "user@example.com",
    displayName: null,
    timezone: "UTC",
    createdAt: "2026-05-22T12:00:00.000Z",
    updatedAt: "2026-05-22T12:00:00.000Z",
  }),
};

const revisionPayload = {
  habits: [
    {
      habitDefinitionId,
      title: "Evening walk",
      category: "movement" as const,
      status: "active" as const,
      schedule: { type: "selected_weekdays" as const, daysOfWeek: [1, 3, 5] },
      target: { type: "duration_minutes" as const, value: 20 },
      required: true,
      displayOrder: 0,
    },
  ],
};

function createRepositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    findActivePlanByUserId: async () => null,
    findActiveRevisionByPlanId: async () => null,
    listRevisionsByUserId: async () => [],
    listCompletionsInDateRange: async () => [],
    createPlanWithRevision: async () => ({
      revision: { id: "rev-create-1" },
    }),
    appendRevision: async () => ({ id: "rev-append-1" }),
    ...overrides,
  };
}

describe("HabitsService", () => {
  it("returns null plan and revision when user has no active habit plan", async () => {
    const service = new HabitsService(createRepositoryMock() as never, usersService as never);

    const result = await service.getCurrentActivePlan(auth);

    expect(result).toEqual({ plan: null, activeRevision: null });
  });

  it("returns plan with null activeRevision when activeRevisionId is unset", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          userId,
          activeRevisionId: null,
          status: "active",
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      }) as never,
      usersService as never,
    );

    const result = await service.getCurrentActivePlan(auth);

    expect(result.plan?.id).toBe(planId);
    expect(result.activeRevision).toBeNull();
  });

  it("returns plan with null activeRevision when stored revision is missing", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          userId,
          activeRevisionId: revisionId,
          status: "active",
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
        findActiveRevisionByPlanId: async () => null,
      }) as never,
      usersService as never,
    );

    const result = await service.getCurrentActivePlan(auth);

    expect(result.plan?.id).toBe(planId);
    expect(result.activeRevision).toBeNull();
  });

  it("returns active plan with parsed active revision", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          userId,
          activeRevisionId: revisionId,
          status: "active",
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
        findActiveRevisionByPlanId: async () => ({
          id: revisionId,
          habitPlanId: planId,
          revisionNumber: 1,
          reason: "Initial habit plan",
          source: "ai_proposal",
          payload: revisionPayload,
          createdAt: timestamp,
        }),
      }) as never,
      usersService as never,
    );

    const result = await service.getCurrentActivePlan(auth);

    expect(result.plan?.id).toBe(planId);
    expect(result.activeRevision?.payload.habits[0]?.title).toBe("Evening walk");
  });

  it("lists revisions for the authenticated user", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        listRevisionsByUserId: async () => [
          {
            id: revisionId,
            habitPlanId: planId,
            revisionNumber: 1,
            reason: "Initial habit plan",
            source: "ai_proposal",
            payload: revisionPayload,
            createdAt: timestamp,
          },
        ],
      }) as never,
      usersService as never,
    );

    const result = await service.listCurrentRevisions(auth);

    expect(result.revisions).toHaveLength(1);
    expect(result.revisions[0]?.revisionNumber).toBe(1);
  });

  it("creates a new plan revision when no active plan exists", async () => {
    let appendCalled = false;

    const service = new HabitsService(
      createRepositoryMock({
        appendRevision: async () => {
          appendCalled = true;
          return { id: "rev-append-1" };
        },
      }) as never,
      usersService as never,
    );

    const reference = await service.applyHabitPlanProposal(
      userId,
      revisionPayload,
      "Starting a new habit plan.",
      "create_habit_plan",
    );

    expect(reference).toBe("habit_revision:rev-create-1");
    expect(appendCalled).toBe(false);
  });

  it("appends a revision when adapting an existing plan", async () => {
    let createCalled = false;

    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          activeRevisionId: revisionId,
        }),
        findActiveRevisionByPlanId: async () => ({
          id: revisionId,
          payload: revisionPayload,
        }),
        createPlanWithRevision: async () => {
          createCalled = true;
          return { revision: { id: "rev-create-2" } };
        },
        appendRevision: async () => ({ id: "rev-append-2" }),
      }) as never,
      usersService as never,
    );

    const reference = await service.applyHabitPlanProposal(
      userId,
      revisionPayload,
      "Adjusting the current habit plan.",
      "adapt_habit_plan",
    );

    expect(reference).toBe("habit_revision:rev-append-2");
    expect(createCalled).toBe(false);
  });

  it("rejects create_habit_plan when an active plan already exists", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({ id: planId, activeRevisionId: revisionId }),
      }) as never,
      usersService as never,
    );

    await expect(
      service.applyHabitPlanProposal(
        userId,
        revisionPayload,
        "Starting another plan.",
        "create_habit_plan",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects adapt_habit_plan when no active plan exists", async () => {
    const service = new HabitsService(createRepositoryMock() as never, usersService as never);

    await expect(
      service.applyHabitPlanProposal(
        userId,
        revisionPayload,
        "Adjusting the current habit plan.",
        "adapt_habit_plan",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("appends an adaptation revision when stable habitDefinitionId values are preserved", async () => {
    const adaptedPayload = {
      habits: [
        {
          ...revisionPayload.habits[0]!,
          title: "Longer evening walk",
          target: { type: "duration_minutes" as const, value: 30 },
        },
      ],
    };

    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          activeRevisionId: revisionId,
        }),
        findActiveRevisionByPlanId: async () => ({
          id: revisionId,
          payload: revisionPayload,
        }),
        appendRevision: async () => ({ id: "rev-adapt-stable-1" }),
      }) as never,
      usersService as never,
    );

    const reference = await service.applyHabitPlanProposal(
      userId,
      adaptedPayload,
      "Increasing walk duration.",
      "adapt_habit_plan",
    );

    expect(reference).toBe("habit_revision:rev-adapt-stable-1");
  });

  it("rejects adapt_habit_plan when continuity ids are dropped", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          activeRevisionId: revisionId,
        }),
        findActiveRevisionByPlanId: async () => ({
          id: revisionId,
          payload: revisionPayload,
        }),
      }) as never,
      usersService as never,
    );

    const adaptedPayload = {
      habits: [
        {
          ...revisionPayload.habits[0]!,
          habitDefinitionId: "b2000002-0000-4000-8000-000000000002",
        },
      ],
    };

    await expect(
      service.applyHabitPlanProposal(
        userId,
        adaptedPayload,
        "Replacing habit ids.",
        "adapt_habit_plan",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects habit proposals that fail domain validation", async () => {
    const service = new HabitsService(createRepositoryMock() as never, usersService as never);
    const baseHabit = revisionPayload.habits[0]!;

    const duplicateHabits = {
      habits: [baseHabit, { ...baseHabit, displayOrder: 1 }],
    };

    await expect(
      service.applyHabitPlanProposal(
        userId,
        duplicateHabits,
        "Invalid plan.",
        "create_habit_plan",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns empty adherence summaries when no active plan exists", async () => {
    const service = new HabitsService(createRepositoryMock() as never, usersService as never);

    const result = await service.getAdherenceForUser(userId, "UTC", 7);

    expect(result.habits).toEqual([]);
    expect(result.plan).toMatchObject({
      window: 7,
      scheduled: 0,
      completed: 0,
      skipped: 0,
      missed: 0,
      requiredCompletionRate: null,
    });
  });

  it("dedupes duplicate completion rows before computing adherence", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          activeRevisionId: revisionId,
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: revisionPayload,
        }),
        listCompletionsInDateRange: async () => [
          {
            habitDefinitionId,
            date: "2026-05-22",
            status: "skipped",
          },
          {
            habitDefinitionId,
            date: "2026-05-22",
            status: "completed",
          },
        ],
      }) as never,
      usersService as never,
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T12:00:00.000Z"));

    try {
      const result = await service.getAdherenceForUser(userId, "UTC", 7);

      expect(result.habits[0]).toMatchObject({
        completed: 1,
        skipped: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("computes adherence from active revision and completion rows", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          activeRevisionId: revisionId,
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: revisionPayload,
        }),
        listCompletionsInDateRange: async () => [
          {
            habitDefinitionId,
            date: "2026-05-22",
            status: "completed",
          },
        ],
      }) as never,
      usersService as never,
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T12:00:00.000Z"));

    try {
      const result = await service.getAdherenceForUser(userId, "UTC", 7);

      expect(result.habits).toHaveLength(1);
      expect(result.habits[0]).toMatchObject({
        habitDefinitionId,
        title: "Evening walk",
        scheduled: 3,
        completed: 1,
      });
      expect(result.plan.windowEnd).toBe("2026-05-22");
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to UTC when user timezone is invalid", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          activeRevisionId: revisionId,
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: revisionPayload,
        }),
      }) as never,
      {
        resolveFromAuth: async () => ({
          id: userId,
          email: "user@example.com",
          displayName: null,
          timezone: "Invalid/Timezone",
          createdAt: "2026-05-22T12:00:00.000Z",
          updatedAt: "2026-05-22T12:00:00.000Z",
        }),
      } as never,
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T12:00:00.000Z"));

    try {
      const result = await service.getAdherence(auth, 7);

      expect(result.plan.windowEnd).toBe("2026-05-22");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null coaching summary when adherence has no active habits", async () => {
    const service = new HabitsService(createRepositoryMock() as never, usersService as never);

    const summary = await service.getRecentAdherenceForCoaching(userId, "UTC");

    expect(summary).toBeNull();
  });

  it("returns a 7-day coaching summary when active habits exist", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          activeRevisionId: revisionId,
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: revisionPayload,
        }),
        listCompletionsInDateRange: async () => [
          {
            habitDefinitionId,
            date: "2026-05-22",
            status: "completed",
          },
        ],
      }) as never,
      usersService as never,
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T12:00:00.000Z"));

    try {
      const summary = await service.getRecentAdherenceForCoaching(userId, "UTC");

      expect(summary).toMatchObject({
        windowDays: 7,
        windowEnd: "2026-05-22",
        habits: [
          expect.objectContaining({
            habitDefinitionId,
            title: "Evening walk",
          }),
        ],
      });
      expect(summary?.requiredCompletionRate).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("queries a 30-day completion range for 30-day adherence windows", async () => {
    const listCompletionsInDateRange = vi.fn(async () => []);

    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          activeRevisionId: revisionId,
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: revisionPayload,
        }),
        listCompletionsInDateRange,
      }) as never,
      usersService as never,
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00.000Z"));

    try {
      const result = await service.getAdherenceForUser(userId, "UTC", 30);

      expect(listCompletionsInDateRange).toHaveBeenCalledWith(userId, "2026-04-25", "2026-05-24");
      expect(result.plan).toMatchObject({
        window: 30,
        windowStart: "2026-04-25",
        windowEnd: "2026-05-24",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the user's timezone for windowEnd near UTC midnight", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: planId,
          activeRevisionId: revisionId,
        }),
        findActiveRevisionByPlanId: async () => ({
          payload: revisionPayload,
        }),
      }) as never,
      usersService as never,
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T06:00:00.000Z"));

    try {
      const utcResult = await service.getAdherenceForUser(userId, "UTC", 7);
      const laResult = await service.getAdherenceForUser(userId, "America/Los_Angeles", 7);

      expect(utcResult.plan.windowEnd).toBe("2026-05-24");
      expect(laResult.plan.windowEnd).toBe("2026-05-23");
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists active habit templates from the catalog", async () => {
    const templateRow = {
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
    };

    const service = new HabitsService(
      createRepositoryMock({
        listActiveTemplates: async () => [templateRow],
      }) as never,
      usersService as never,
    );

    const result = await service.listTemplates();

    expect(result.templates).toHaveLength(1);
    expect(result.templates[0]?.slug).toBe("daily-hydration");
  });

  it("returns template reference errors for unknown template ids", async () => {
    const service = new HabitsService(
      createRepositoryMock({
        findActiveTemplatesByIds: async () => [],
        findActiveTemplatesBySlugs: async () => [],
      }) as never,
      usersService as never,
    );

    const errors = await service.getHabitTemplateReferenceErrors({
      habits: [
        {
          habitDefinitionId,
          title: "Morning hydration",
          category: "hydration",
          status: "active",
          schedule: { type: "daily" },
          target: { type: "boolean" },
          required: true,
          linkedSource: "nutrition_hydration_target",
          templateId: "d1000001-0000-4000-8000-000000000099",
          displayOrder: 0,
        },
      ],
    });

    expect(errors[0]).toMatch(/templateId/);
    expect(errors[0]).toMatch(/not found in the active habit template catalog/);
  });
});
