import type { TodayWorkoutDetail } from "@health/types";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { TodayService } from "./today.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
const auth = {
  clerkUserId: "clerk-user-1",
  email: "test@example.com",
  displayName: "Test User",
};

const usersService = {
  resolveFromAuth: async () => ({
    id: userId,
    email: auth.email,
    displayName: auth.displayName,
    timezone: "UTC",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
};

const sessionId = "78d40655-b4b5-47b3-b28e-470192e05f04";
const checklistId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
const itemId = "880099c6-3b5f-4383-8246-97b72bf61818";
const date = "2026-05-22";
const timestamp = new Date("2026-05-22T12:00:00.000Z");

const nutritionPlanPayload = {
  title: "Balanced daily nutrition base",
  summary: "A moderate starting point focused on consistency.",
  caloriesPerDay: 2200,
  proteinGrams: 140,
  carbsGrams: 220,
  fatGrams: 70,
  hydrationLiters: 2.5,
  mealStructure: [
    { label: "Breakfast", timingHint: "Morning" },
    { label: "Lunch", timingHint: null },
    { label: "Dinner", timingHint: "Evening" },
  ],
  preferences: [],
  restrictions: [],
  allergies: [],
  notes: [],
};

const workoutsService: {
  ensureTodayWorkoutSession: () => Promise<TodayWorkoutDetail | null>;
} = {
  ensureTodayWorkoutSession: async () => null,
};

function buildChecklistRow(items: Record<string, unknown>[]) {
  return {
    id: checklistId,
    userId,
    date,
    items,
    source: "generated",
    feedback: null,
    adherenceScore: "1.0000",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const planId = "3f98f3dd-806d-4386-8c5f-43499626c5d6";
const revisionId = "880099c6-3b5f-4383-8246-97b72bf61818";
const staleSessionId = "a1000001-0000-4000-8000-000000000099";
const staleRevisionId = "b2000002-0000-4000-8000-000000000099";
const habitDefinitionId = "c3000003-0000-4000-8000-000000000003";
const habitPlanId = "d4000004-0000-4000-8000-000000000004";
const habitRevisionId = "e5000005-0000-4000-8000-000000000005";

function buildActiveHabitRevision(habits: Record<string, unknown>[]) {
  return {
    id: habitRevisionId,
    habitPlanId,
    revisionNumber: 1,
    reason: "Initial plan",
    source: "ai_proposal",
    payload: { habits },
    createdAt: timestamp,
  };
}

function buildSessionRow(
  id: string,
  revisionIdValue: string = revisionId,
  title = "Strength day",
  status = "planned",
) {
  return {
    id,
    title,
    status,
    workoutPlanId: planId,
    workoutPlanRevisionId: revisionIdValue,
  };
}

function createService(
  todayRepository: unknown,
  workoutsRepository: unknown,
  workoutsServiceOverride: Partial<typeof workoutsService> = {},
  habitsRepository: unknown = {},
  nutritionService: unknown = {},
) {
  const workoutsRepositoryWithDefaults = {
    findActivePlanByUserId: async () => null,
    ...(workoutsRepository as object),
  };

  const habitsRepositoryWithDefaults = {
    findActivePlanByUserId: async () => null,
    upsertCompletion: async () => ({}),
    ...(habitsRepository as object),
  };

  const nutritionServiceWithDefaults = {
    getNutritionDayDetail: async () => null,
    ...(nutritionService as object),
  };

  return new TodayService(
    todayRepository as never,
    workoutsRepositoryWithDefaults as never,
    { ...workoutsService, ...workoutsServiceOverride } as never,
    usersService as never,
    habitsRepositoryWithDefaults as never,
    nutritionServiceWithDefaults as never,
  );
}

describe("TodayService", () => {
  it("rejects invalid ISO dates", async () => {
    const service = createService({}, {});

    await expect(service.getOrGenerateDay(auth, "05/22/2026")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.getOrGenerateDay(auth, "2026-99-99")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("generates a checklist from workout sessions when none exists", async () => {
    let upsertCalled = false;

    const service = createService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          resolvedUserId: string,
          resolvedDate: string,
          items: { source: { type: string } }[],
        ) => {
          upsertCalled = true;
          expect(resolvedUserId).toBe(userId);
          expect(resolvedDate).toBe(date);
          expect(items[0]?.source.type).toBe("workout_session");

          return buildChecklistRow(items);
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [buildSessionRow(sessionId)],
      } as never,
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(upsertCalled).toBe(true);
    expect(day.items).toHaveLength(1);
    expect(day.items[0]?.source.id).toBe(sessionId);
  });

  it("returns idempotently when item status is unchanged", async () => {
    const existingItem = {
      id: itemId,
      label: "Strength day",
      kind: "workout",
      status: "completed",
      required: true,
      source: { type: "workout_session", id: sessionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () => {
          throw new Error("Should not persist when status is unchanged.");
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [
          { ...buildSessionRow(sessionId), status: "completed" },
        ],
      } as never,
    );

    const day = await service.updateItemStatus(auth, date, itemId, {
      status: "completed",
    });

    expect(day.items[0]?.status).toBe("completed");
  });

  it("reconciles workout session completion when a workout-linked item is updated", async () => {
    let completeCalled = false;
    const existingItem = {
      id: itemId,
      label: "Strength day",
      kind: "workout",
      status: "pending",
      required: true,
      source: { type: "workout_session", id: sessionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () =>
          buildChecklistRow([{ ...existingItem, status: "completed" }]),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [
          { ...buildSessionRow(sessionId), status: "planned" },
        ],
        findSessionByUserId: async () => ({
          id: sessionId,
          status: "planned",
          feedback: { notes: "Felt strong." },
        }),
        completeSession: async (
          resolvedUserId: string,
          resolvedSessionId: string,
          input: { status: string; feedback: { notes?: string | null } },
        ) => {
          completeCalled = true;
          expect(resolvedUserId).toBe(userId);
          expect(resolvedSessionId).toBe(sessionId);
          expect(input.status).toBe("completed");
          expect(input.feedback.notes).toBe("Felt strong.");
          return { id: sessionId };
        },
      } as never,
    );

    const day = await service.updateItemStatus(auth, date, itemId, {
      status: "completed",
    });

    expect(completeCalled).toBe(true);
    expect(day.items[0]?.status).toBe("completed");
  });

  it("does not overwrite already-terminal workout sessions from Today updates", async () => {
    let completeCalled = false;
    const existingItem = {
      id: itemId,
      label: "Strength day",
      kind: "workout",
      status: "pending",
      required: true,
      source: { type: "workout_session", id: sessionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () =>
          buildChecklistRow([{ ...existingItem, status: "skipped" }]),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [
          { ...buildSessionRow(sessionId), status: "completed" },
        ],
        findSessionByUserId: async () => ({
          id: sessionId,
          status: "completed",
          feedback: { notes: "Keep this feedback." },
        }),
        completeSession: async () => {
          completeCalled = true;
          return { id: sessionId };
        },
      } as never,
    );

    const day = await service.updateItemStatus(auth, date, itemId, {
      status: "skipped",
    });

    expect(completeCalled).toBe(false);
    expect(day.items[0]?.status).toBe("skipped");
  });

  it("throws when updating an unknown checklist item", async () => {
    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([]),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
    );

    await expect(
      service.updateItemStatus(auth, date, itemId, { status: "completed" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("returns idempotently when skip status is unchanged", async () => {
    const existingItem = {
      id: itemId,
      label: "Strength day",
      kind: "workout",
      status: "skipped",
      required: true,
      source: { type: "workout_session", id: sessionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () => {
          throw new Error("Should not persist when skip status is unchanged.");
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [
          { ...buildSessionRow(sessionId), status: "skipped" },
        ],
      } as never,
    );

    const day = await service.updateItemStatus(auth, date, itemId, {
      status: "skipped",
    });

    expect(day.items[0]?.status).toBe("skipped");
  });

  it("generates an empty checklist when no workout sessions exist", async () => {
    const service = createService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          _resolvedUserId: string,
          _resolvedDate: string,
          items: Record<string, unknown>[],
        ) => buildChecklistRow(items),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(day.items).toEqual([]);
    expect(day.adherence.score).toBeNull();
  });

  it("passes history limit to the repository", async () => {
    let capturedLimit = 0;

    const service = createService(
      {
        listRecentByUserId: async (_resolvedUserId: string, limit: number) => {
          capturedLimit = limit;
          return [];
        },
      } as never,
      {} as never,
    );

    const history = await service.getRecentHistory(auth, 14);

    expect(capturedLimit).toBe(14);
    expect(history.entries).toEqual([]);
  });

  it("rejects invalid ISO dates on feedback updates", async () => {
    const service = createService({}, {});

    await expect(
      service.updateFeedback(auth, "2026/05/22", { notes: "Steady day." }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("includes derived workout detail in the day response", async () => {
    const workoutDetail = {
      sessionId,
      workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
      plannedDate: date,
      weekday: "friday" as const,
      title: "Strength base — Lower body",
      focus: "Lower body",
      status: "planned" as const,
      exercises: [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          prescription: { snapshot: { name: "Squat" }, sets: 3, reps: "8" },
          execution: { status: "planned" as const },
        },
      ],
      isRestDay: false,
    };

    const service = createService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          _resolvedUserId: string,
          _resolvedDate: string,
          items: Record<string, unknown>[],
        ) => buildChecklistRow(items),
      },
      {
        listSessionsByUserAndPlannedDate: async () => [
          buildSessionRow(sessionId, revisionId, workoutDetail.title),
        ],
      },
      {
        ensureTodayWorkoutSession: async (): Promise<TodayWorkoutDetail> => workoutDetail,
      },
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(day.workout?.sessionId).toBe(sessionId);
    expect(day.workout?.exercises).toHaveLength(1);
  });

  it("merges accepted proposal items with existing workout-derived items", async () => {
    let upsertItems: { source: { type: string } }[] = [];

    const service = createService(
      {
        findByUserAndDate: async () => null,
        createChecklistFromProposal: async (
          _resolvedUserId: string,
          _payload: unknown,
          items: { source: { type: string } }[],
        ) => {
          upsertItems = items;
          return buildChecklistRow(items);
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [
          { ...buildSessionRow(sessionId), status: "planned" },
        ],
      } as never,
    );

    await service.applyTodayChecklistProposal(userId, {
      date,
      items: [{ label: "Drink water", kind: "hydration", completed: false }],
    });

    expect(upsertItems.some((item) => item.source.type === "workout_session")).toBe(true);
    expect(upsertItems.some((item) => item.source.type === "ai_proposal")).toBe(true);
  });

  it("excludes superseded workout sessions when an active plan revision exists", async () => {
    let persistedItems: { source: { type: string; id?: string } }[] = [];
    const staleItem = {
      id: itemId,
      label: "Old plan day",
      kind: "workout",
      status: "pending",
      required: true,
      source: { type: "workout_session", id: staleSessionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([staleItem]),
        updateChecklistState: async (
          _resolvedUserId: string,
          _checklistId: string,
          items: { source: { type: string; id?: string } }[],
        ) => {
          persistedItems = items;
          return buildChecklistRow(items);
        },
      } as never,
      {
        findActivePlanByUserId: async () => ({
          id: planId,
          activeRevisionId: revisionId,
        }),
        listSessionsByUserAndPlannedDate: async () => [
          buildSessionRow(staleSessionId, staleRevisionId, "Old plan day"),
          buildSessionRow(sessionId, revisionId, "Updated plan day"),
        ],
      } as never,
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(persistedItems).toHaveLength(1);
    expect(persistedItems[0]?.source.id).toBe(sessionId);
    expect(day.items).toHaveLength(1);
    expect(day.items[0]?.source.id).toBe(sessionId);
  });

  it("materializes scheduled habit items when an active plan exists", async () => {
    let persistedItems: { source: { type: string; id?: string } }[] = [];

    const service = createService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          _resolvedUserId: string,
          _resolvedDate: string,
          items: { source: { type: string; id?: string } }[],
        ) => {
          persistedItems = items;
          return buildChecklistRow(items);
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {
        findActivePlanByUserId: async () => ({
          id: habitPlanId,
          activeRevisionId: habitRevisionId,
        }),
        findActiveRevisionByPlanId: async () =>
          buildActiveHabitRevision([
            {
              habitDefinitionId,
              title: "Morning hydration",
              category: "hydration",
              status: "active",
              schedule: { type: "daily" },
              target: { type: "boolean" },
              required: true,
              displayOrder: 0,
            },
          ]),
      },
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(persistedItems).toHaveLength(1);
    expect(persistedItems[0]?.source).toEqual({ type: "habit", id: habitDefinitionId });
    expect(day.items[0]?.kind).toBe("habit");
  });

  it("upserts habit completion when a habit-linked item status changes", async () => {
    let completionUpserted = false;
    const existingItem = {
      id: itemId,
      label: "Morning hydration",
      kind: "habit",
      status: "pending",
      required: true,
      source: { type: "habit", id: habitDefinitionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () =>
          buildChecklistRow([{ ...existingItem, status: "completed" }]),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {
        findActivePlanByUserId: async () => ({
          id: habitPlanId,
          activeRevisionId: habitRevisionId,
        }),
        findActiveRevisionByPlanId: async () =>
          buildActiveHabitRevision([
            {
              habitDefinitionId,
              title: "Morning hydration",
              category: "hydration",
              status: "active",
              schedule: { type: "daily" },
              target: { type: "boolean" },
              required: true,
              displayOrder: 0,
            },
          ]),
        upsertCompletion: async (
          resolvedUserId: string,
          resolvedHabitDefinitionId: string,
          resolvedDate: string,
          status: string,
          sourceChecklistItemId: string,
        ) => {
          completionUpserted = true;
          expect(resolvedUserId).toBe(userId);
          expect(resolvedHabitDefinitionId).toBe(habitDefinitionId);
          expect(resolvedDate).toBe(date);
          expect(status).toBe("completed");
          expect(sourceChecklistItemId).toBe(itemId);
          return { id: "f6000006-0000-4000-8000-000000000006" };
        },
      },
    );

    const day = await service.updateItemStatus(auth, date, itemId, {
      status: "completed",
    });

    expect(completionUpserted).toBe(true);
    expect(day.items[0]?.status).toBe("completed");
  });

  it("preserves habit-linked items when merging accepted checklist proposals", async () => {
    let upsertItems: { source: { type: string } }[] = [];
    const habitItem = {
      id: itemId,
      label: "Morning hydration",
      kind: "habit",
      status: "pending",
      required: true,
      source: { type: "habit", id: habitDefinitionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([habitItem]),
        createChecklistFromProposal: async (
          _resolvedUserId: string,
          _payload: unknown,
          items: { source: { type: string } }[],
        ) => {
          upsertItems = items;
          return buildChecklistRow(items);
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {
        findActivePlanByUserId: async () => ({
          id: habitPlanId,
          activeRevisionId: habitRevisionId,
        }),
        findActiveRevisionByPlanId: async () =>
          buildActiveHabitRevision([
            {
              habitDefinitionId,
              title: "Morning hydration",
              category: "hydration",
              status: "active",
              schedule: { type: "daily" },
              target: { type: "boolean" },
              required: true,
              displayOrder: 0,
            },
          ]),
      },
    );

    await service.applyTodayChecklistProposal(userId, {
      date,
      items: [{ label: "Drink water", kind: "hydration", completed: false }],
    });

    expect(upsertItems.some((item) => item.source.type === "habit")).toBe(true);
    expect(upsertItems.some((item) => item.source.type === "ai_proposal")).toBe(true);
  });

  it("returns idempotently when reloading an already synced habit checklist", async () => {
    let updateCalled = false;
    const existingItem = {
      id: itemId,
      label: "Morning hydration",
      kind: "habit",
      status: "pending",
      required: true,
      source: { type: "habit", id: habitDefinitionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () => {
          updateCalled = true;
          throw new Error("Should not persist when checklist is already synced.");
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {
        findActivePlanByUserId: async () => ({
          id: habitPlanId,
          activeRevisionId: habitRevisionId,
        }),
        findActiveRevisionByPlanId: async () =>
          buildActiveHabitRevision([
            {
              habitDefinitionId,
              title: "Morning hydration",
              category: "hydration",
              status: "active",
              schedule: { type: "daily" },
              target: { type: "boolean" },
              required: true,
              displayOrder: 0,
            },
          ]),
      },
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(updateCalled).toBe(false);
    expect(day.items).toHaveLength(1);
    expect(day.items[0]?.source).toEqual({ type: "habit", id: habitDefinitionId });
  });

  it("drops duplicate habit-kind checklist proposals when habit-linked items exist", async () => {
    let upsertItems: { label: string; kind: string; source: { type: string } }[] = [];
    const habitItem = {
      id: itemId,
      label: "Morning hydration",
      kind: "habit",
      status: "pending",
      required: true,
      source: { type: "habit", id: habitDefinitionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([habitItem]),
        createChecklistFromProposal: async (
          _resolvedUserId: string,
          _payload: unknown,
          items: { label: string; kind: string; source: { type: string } }[],
        ) => {
          upsertItems = items;
          return buildChecklistRow(items);
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {
        findActivePlanByUserId: async () => ({
          id: habitPlanId,
          activeRevisionId: habitRevisionId,
        }),
        findActiveRevisionByPlanId: async () =>
          buildActiveHabitRevision([
            {
              habitDefinitionId,
              title: "Morning hydration",
              category: "hydration",
              status: "active",
              schedule: { type: "daily" },
              target: { type: "boolean" },
              required: true,
              displayOrder: 0,
            },
          ]),
      },
    );

    await service.applyTodayChecklistProposal(userId, {
      date,
      items: [
        { label: "Evening walk", kind: "habit", completed: false },
        { label: "Morning hydration", kind: "hydration", completed: false },
        { label: "Stretch", kind: "recovery", completed: false },
      ],
    });

    expect(upsertItems.some((item) => item.kind === "habit" && item.source.type === "ai_proposal")).toBe(
      false,
    );
    expect(upsertItems.some((item) => item.label === "Morning hydration" && item.source.type === "ai_proposal")).toBe(
      false,
    );
    expect(upsertItems.some((item) => item.label === "Stretch")).toBe(true);
    expect(upsertItems.some((item) => item.source.type === "habit")).toBe(true);
  });

  it("preserves nutrition detail when habit sync runs on an existing checklist", async () => {
    const nutritionPlanId = "a1000001-0000-4000-8000-000000000001";
    const nutritionRevisionId = "b2000002-0000-4000-8000-000000000002";
    const existingItem = {
      id: itemId,
      label: "Morning hydration",
      kind: "habit",
      status: "pending",
      required: true,
      source: { type: "habit", id: habitDefinitionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async (
          _resolvedUserId: string,
          _checklistId: string,
          items: Record<string, unknown>[],
        ) => buildChecklistRow(items),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {
        findActivePlanByUserId: async () => ({
          id: habitPlanId,
          activeRevisionId: habitRevisionId,
        }),
        findActiveRevisionByPlanId: async () =>
          buildActiveHabitRevision([
            {
              habitDefinitionId,
              title: "Morning hydration",
              category: "hydration",
              status: "active",
              schedule: { type: "daily" },
              target: { type: "boolean" },
              required: true,
              displayOrder: 0,
            },
          ]),
      },
      {
        getNutritionDayDetail: async (_auth: unknown, resolvedDate: string) => ({
          date: resolvedDate,
          plan: {
            id: nutritionPlanId,
            userId,
            activeRevisionId: nutritionRevisionId,
            status: "active",
            createdAt: timestamp.toISOString(),
            updatedAt: timestamp.toISOString(),
          },
          activeRevision: {
            id: nutritionRevisionId,
            nutritionPlanId,
            revisionNumber: 1,
            reason: "Initial plan",
            source: "ai_proposal",
            payload: nutritionPlanPayload,
            createdAt: timestamp.toISOString(),
          },
          adherence: null,
        }),
      },
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(day.nutrition?.plan?.id).toBe(nutritionPlanId);
    expect(day.items.some((item) => item.source.type === "habit")).toBe(true);
  });

  it("materializes workout and habit items together when both are scheduled", async () => {
    let persistedItems: { source: { type: string; id?: string } }[] = [];

    const service = createService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          _resolvedUserId: string,
          _resolvedDate: string,
          items: { source: { type: string; id?: string } }[],
        ) => {
          persistedItems = items;
          return buildChecklistRow(items);
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [buildSessionRow(sessionId)],
      } as never,
      {},
      {
        findActivePlanByUserId: async () => ({
          id: habitPlanId,
          activeRevisionId: habitRevisionId,
        }),
        findActiveRevisionByPlanId: async () =>
          buildActiveHabitRevision([
            {
              habitDefinitionId,
              title: "Morning hydration",
              category: "hydration",
              status: "active",
              schedule: { type: "daily" },
              target: { type: "boolean" },
              required: true,
              displayOrder: 0,
            },
          ]),
      },
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(persistedItems).toHaveLength(2);
    expect(persistedItems.some((item) => item.source.type === "workout_session")).toBe(true);
    expect(persistedItems.some((item) => item.source.type === "habit")).toBe(true);
    expect(day.items).toHaveLength(2);
  });

  it("excludes habits not scheduled for the requested date", async () => {
    let persistedItems: { source: { type: string } }[] = [];

    const service = createService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          _resolvedUserId: string,
          _resolvedDate: string,
          items: { source: { type: string } }[],
        ) => {
          persistedItems = items;
          return buildChecklistRow(items);
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {
        findActivePlanByUserId: async () => ({
          id: habitPlanId,
          activeRevisionId: habitRevisionId,
        }),
        findActiveRevisionByPlanId: async () =>
          buildActiveHabitRevision([
            {
              habitDefinitionId,
              title: "Monday-only walk",
              category: "movement",
              status: "active",
              schedule: { type: "selected_weekdays", daysOfWeek: [1] },
              target: { type: "boolean" },
              required: true,
              displayOrder: 0,
            },
          ]),
      },
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(persistedItems).toEqual([]);
    expect(day.items).toEqual([]);
  });

  it("reconciles stale habit items when syncing an existing checklist", async () => {
    let persistedItems: { source: { type: string; id?: string } }[] = [];
    const staleHabitId = "f6000006-0000-4000-8000-000000000006";
    const staleItem = {
      id: itemId,
      label: "Removed habit",
      kind: "habit",
      status: "pending",
      required: true,
      source: { type: "habit", id: staleHabitId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([staleItem]),
        updateChecklistState: async (
          _resolvedUserId: string,
          _checklistId: string,
          items: { source: { type: string; id?: string } }[],
        ) => {
          persistedItems = items;
          return buildChecklistRow(items);
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {
        findActivePlanByUserId: async () => ({
          id: habitPlanId,
          activeRevisionId: habitRevisionId,
        }),
        findActiveRevisionByPlanId: async () =>
          buildActiveHabitRevision([
            {
              habitDefinitionId,
              title: "Morning hydration",
              category: "hydration",
              status: "active",
              schedule: { type: "daily" },
              target: { type: "boolean" },
              required: true,
              displayOrder: 0,
            },
          ]),
      },
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(persistedItems).toHaveLength(1);
    expect(persistedItems[0]?.source.id).toBe(habitDefinitionId);
    expect(day.items.some((item) => item.source.id === staleHabitId)).toBe(false);
  });

  it("returns idempotently without upserting habit completion when status is unchanged", async () => {
    let completionUpserted = false;
    const existingItem = {
      id: itemId,
      label: "Morning hydration",
      kind: "habit",
      status: "completed",
      required: true,
      source: { type: "habit", id: habitDefinitionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () => {
          throw new Error("Should not persist when habit status is unchanged.");
        },
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {
        findActivePlanByUserId: async () => ({
          id: habitPlanId,
          activeRevisionId: habitRevisionId,
        }),
        findActiveRevisionByPlanId: async () =>
          buildActiveHabitRevision([
            {
              habitDefinitionId,
              title: "Morning hydration",
              category: "hydration",
              status: "active",
              schedule: { type: "daily" },
              target: { type: "boolean" },
              required: true,
              displayOrder: 0,
            },
          ]),
        upsertCompletion: async () => {
          completionUpserted = true;
          return { id: "f6000006-0000-4000-8000-000000000006" };
        },
      },
    );

    const day = await service.updateItemStatus(auth, date, itemId, {
      status: "completed",
    });

    expect(completionUpserted).toBe(false);
    expect(day.items[0]?.status).toBe("completed");
  });

  it("upserts skipped status when a habit-linked item is skipped", async () => {
    let capturedStatus = "";
    const existingItem = {
      id: itemId,
      label: "Morning hydration",
      kind: "habit",
      status: "pending",
      required: true,
      source: { type: "habit", id: habitDefinitionId },
    };

    const service = createService(
      {
        findByUserAndDate: async () => buildChecklistRow([existingItem]),
        updateChecklistState: async () =>
          buildChecklistRow([{ ...existingItem, status: "skipped" }]),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {
        findActivePlanByUserId: async () => ({
          id: habitPlanId,
          activeRevisionId: habitRevisionId,
        }),
        findActiveRevisionByPlanId: async () =>
          buildActiveHabitRevision([
            {
              habitDefinitionId,
              title: "Morning hydration",
              category: "hydration",
              status: "active",
              schedule: { type: "daily" },
              target: { type: "boolean" },
              required: true,
              displayOrder: 0,
            },
          ]),
        upsertCompletion: async (
          _userId: string,
          _habitDefinitionId: string,
          _date: string,
          status: string,
        ) => {
          capturedStatus = status;
          return { id: "f6000006-0000-4000-8000-000000000006" };
        },
      },
    );

    const day = await service.updateItemStatus(auth, date, itemId, {
      status: "skipped",
    });

    expect(capturedStatus).toBe("skipped");
    expect(day.items[0]?.status).toBe("skipped");
  });

  it("includes selected-date nutrition detail when an active plan exists", async () => {
    const nutritionPlanId = "a1000001-0000-4000-8000-000000000001";
    const nutritionRevisionId = "b2000002-0000-4000-8000-000000000002";
    let requestedDate: string | undefined;

    const service = createService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          _resolvedUserId: string,
          _resolvedDate: string,
          items: Record<string, unknown>[],
        ) => buildChecklistRow(items),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {},
      {
        getNutritionDayDetail: async (_auth: unknown, resolvedDate: string) => {
          requestedDate = resolvedDate;
          return {
            date: resolvedDate,
            plan: {
              id: nutritionPlanId,
              userId,
              activeRevisionId: nutritionRevisionId,
              status: "active",
              createdAt: timestamp.toISOString(),
              updatedAt: timestamp.toISOString(),
            },
            activeRevision: {
              id: nutritionRevisionId,
              nutritionPlanId,
              revisionNumber: 1,
              reason: "Initial plan",
              source: "ai_proposal",
              payload: nutritionPlanPayload,
              createdAt: timestamp.toISOString(),
            },
            adherence: null,
          };
        },
      },
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(requestedDate).toBe(date);
    expect(day.nutrition?.date).toBe(date);
    expect(day.nutrition?.plan?.id).toBe(nutritionPlanId);
    expect(day.nutrition?.activeRevision?.payload.mealStructure).toHaveLength(3);
    expect(day.nutrition?.adherence).toBeNull();
  });

  it("returns null nutrition detail when no active nutrition plan exists", async () => {
    const service = createService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          _resolvedUserId: string,
          _resolvedDate: string,
          items: Record<string, unknown>[],
        ) => buildChecklistRow(items),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(day.nutrition).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Part B — nutrition_incident for the day appears in TodayNutritionDetail.eaten
// ---------------------------------------------------------------------------

describe("TodayService — TodayNutritionDetail.eaten from nutrition incidents (Part B)", () => {
  const nutritionPlanId = "a1000001-0000-4000-8000-000000000001";
  const nutritionRevisionId = "b2000002-0000-4000-8000-000000000002";

  it("populates eaten totals from confirmed nutrition incidents via NutritionService", async () => {
    const service = createService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          _resolvedUserId: string,
          _resolvedDate: string,
          items: Record<string, unknown>[],
        ) => buildChecklistRow(items),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {},
      {
        getNutritionDayDetail: async () => ({
          date,
          plan: {
            id: nutritionPlanId,
            userId,
            activeRevisionId: nutritionRevisionId,
            status: "active",
            createdAt: timestamp.toISOString(),
            updatedAt: timestamp.toISOString(),
          },
          activeRevision: {
            id: nutritionRevisionId,
            nutritionPlanId,
            revisionNumber: 1,
            reason: "Initial plan",
            source: "ai_proposal",
            payload: nutritionPlanPayload,
            createdAt: timestamp.toISOString(),
          },
          adherence: null,
          eaten: {
            calories: 900,
            proteinGrams: 54,
            carbsGrams: 85,
            fatGrams: 28,
            incidentCount: 2,
          },
        }),
      },
    );

    const day = await service.getOrGenerateDay(auth, date);

    // The eaten block from NutritionService should pass through to the TodayDayResponse
    expect(day.nutrition?.eaten).not.toBeNull();
    expect(day.nutrition?.eaten?.calories).toBe(900);
    expect(day.nutrition?.eaten?.proteinGrams).toBe(54);
    expect(day.nutrition?.eaten?.carbsGrams).toBe(85);
    expect(day.nutrition?.eaten?.fatGrams).toBe(28);
    expect(day.nutrition?.eaten?.incidentCount).toBe(2);
  });

  it("returns null eaten when no incidents were logged for the date", async () => {
    const service = createService(
      {
        findByUserAndDate: async () => null,
        upsertChecklist: async (
          _resolvedUserId: string,
          _resolvedDate: string,
          items: Record<string, unknown>[],
        ) => buildChecklistRow(items),
      } as never,
      {
        listSessionsByUserAndPlannedDate: async () => [],
      } as never,
      {},
      {},
      {
        getNutritionDayDetail: async () => ({
          date,
          plan: {
            id: nutritionPlanId,
            userId,
            activeRevisionId: nutritionRevisionId,
            status: "active",
            createdAt: timestamp.toISOString(),
            updatedAt: timestamp.toISOString(),
          },
          activeRevision: {
            id: nutritionRevisionId,
            nutritionPlanId,
            revisionNumber: 1,
            reason: "Initial plan",
            source: "ai_proposal",
            payload: nutritionPlanPayload,
            createdAt: timestamp.toISOString(),
          },
          adherence: null,
          eaten: null, // No incidents
        }),
      },
    );

    const day = await service.getOrGenerateDay(auth, date);

    expect(day.nutrition?.eaten).toBeNull();
  });
});
