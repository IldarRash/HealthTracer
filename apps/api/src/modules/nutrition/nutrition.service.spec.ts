import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { NutritionService } from "./nutrition.service.js";

const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";

const payload = {
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
  preferences: ["Whole foods first"],
  restrictions: ["No shellfish"],
  allergies: [],
  notes: ["Prioritize whole foods."],
};

const auth = { userId: "clerk-user-1", claims: {} };

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

function createRepositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    findActivePlanByUserId: async () => null,
    findActiveRevisionByPlanId: async () => null,
    listRevisionsByUserId: async () => [],
    findAdherenceByUserIdAndDate: async () => null,
    upsertAdherenceByUserIdAndDate: async () => ({
      id: "adherence-1",
      userId,
      date: "2026-05-22",
      hydrationLitersConsumed: 1.5,
      mealCompletion: [{ label: "Breakfast", completed: true }],
      targetCompletion: { caloriesOnTarget: true },
      notes: [],
      createdAt: new Date("2026-05-22T12:00:00.000Z"),
      updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    }),
    createPlanWithRevision: async () => ({
      revision: { id: "rev-create-1" },
    }),
    appendRevision: async () => ({ id: "rev-append-1" }),
    ...overrides,
  };
}

describe("NutritionService", () => {
  it("creates a new plan revision when no active plan exists", async () => {
    let appendCalled = false;

    const service = new NutritionService(
      createRepositoryMock({
        appendRevision: async () => {
          appendCalled = true;
          return { id: "rev-append-1" };
        },
      }) as never,
      usersService as never,
    );

    const reference = await service.applyNutritionPlanProposal(
      userId,
      payload,
      "Starting a new plan.",
      "create_nutrition_plan",
    );

    expect(reference).toBe("nutrition_revision:rev-create-1");
    expect(appendCalled).toBe(false);
  });

  it("appends a revision when adjusting an existing plan", async () => {
    let createCalled = false;

    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({ id: "plan-1" }),
        createPlanWithRevision: async () => {
          createCalled = true;
          return { revision: { id: "rev-create-2" } };
        },
        appendRevision: async () => ({ id: "rev-append-2" }),
      }) as never,
      usersService as never,
    );

    const reference = await service.applyNutritionPlanProposal(
      userId,
      payload,
      "Adjusting the current plan.",
      "adjust_nutrition_plan",
    );

    expect(reference).toBe("nutrition_revision:rev-append-2");
    expect(createCalled).toBe(false);
  });

  it("rejects nutrition proposals that fail domain validation", async () => {
    const service = new NutritionService(createRepositoryMock() as never, usersService as never);

    await expect(
      service.applyNutritionPlanProposal(
        userId,
        { ...payload, mealStructure: [] },
        "Invalid plan.",
        "create_nutrition_plan",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns an empty active plan response when no nutrition plan exists", async () => {
    const service = new NutritionService(createRepositoryMock() as never, usersService as never);

    await expect(service.getCurrentActivePlan(auth as never)).resolves.toEqual({
      plan: null,
      activeRevision: null,
    });
  });

  it("returns null adherence when no record exists for the date", async () => {
    const service = new NutritionService(createRepositoryMock() as never, usersService as never);

    await expect(service.getAdherenceForDate(auth as never, "2026-05-22")).resolves.toEqual({
      adherence: null,
    });
  });

  it("upserts adherence idempotently for the same user and date", async () => {
    let upsertCount = 0;

    const service = new NutritionService(
      createRepositoryMock({
        upsertAdherenceByUserIdAndDate: async () => {
          upsertCount += 1;
          return {
            id: "adherence-1",
            userId,
            date: "2026-05-22",
            hydrationLitersConsumed: 2,
            mealCompletion: [{ label: "Breakfast", completed: true }],
            targetCompletion: { caloriesOnTarget: true },
            notes: ["Updated"],
            createdAt: new Date("2026-05-22T12:00:00.000Z"),
            updatedAt: new Date("2026-05-22T13:00:00.000Z"),
          };
        },
      }) as never,
      usersService as never,
    );

    const first = await service.upsertAdherenceForDate(auth as never, "2026-05-22", {
      hydrationLitersConsumed: 1,
    });
    const second = await service.upsertAdherenceForDate(auth as never, "2026-05-22", {
      hydrationLitersConsumed: 2,
      notes: ["Updated"],
    });

    expect(first.adherence?.id).toBe("adherence-1");
    expect(second.adherence?.hydrationLitersConsumed).toBe(2);
    expect(upsertCount).toBe(2);
  });

  it("rejects invalid adherence dates", async () => {
    const service = new NutritionService(createRepositoryMock() as never, usersService as never);

    await expect(
      service.getAdherenceForDate(auth as never, "05-22-2026"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("scopes adherence reads and writes to the resolved user", async () => {
    let lookupUserId: string | undefined;
    let upsertUserId: string | undefined;

    const service = new NutritionService(
      createRepositoryMock({
        findAdherenceByUserIdAndDate: async (resolvedUserId: string) => {
          lookupUserId = resolvedUserId;
          return null;
        },
        upsertAdherenceByUserIdAndDate: async (resolvedUserId: string) => {
          upsertUserId = resolvedUserId;
          return {
            id: "adherence-1",
            userId: resolvedUserId,
            date: "2026-05-22",
            hydrationLitersConsumed: 1,
            mealCompletion: [],
            targetCompletion: {},
            notes: [],
            createdAt: new Date("2026-05-22T12:00:00.000Z"),
            updatedAt: new Date("2026-05-22T12:00:00.000Z"),
          };
        },
      }) as never,
      usersService as never,
    );

    await service.getAdherenceForDate(auth as never, "2026-05-22");
    await service.upsertAdherenceForDate(auth as never, "2026-05-22", {
      hydrationLitersConsumed: 1,
    });

    expect(lookupUserId).toBe(userId);
    expect(upsertUserId).toBe(userId);
  });
});
