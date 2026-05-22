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

describe("NutritionService", () => {
  it("creates a new plan revision when no active plan exists", async () => {
    let appendCalled = false;

    const service = new NutritionService({
      findActivePlanByUserId: async () => null,
      findActiveRevisionByPlanId: async () => null,
      listRevisionsByUserId: async () => [],
      createPlanWithRevision: async () => ({
        revision: { id: "rev-create-1" },
      }),
      appendRevision: async () => {
        appendCalled = true;
        return { id: "rev-append-1" };
      },
    } as never, usersService as never);

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

    const service = new NutritionService({
      findActivePlanByUserId: async () => ({ id: "plan-1" }),
      findActiveRevisionByPlanId: async () => null,
      listRevisionsByUserId: async () => [],
      createPlanWithRevision: async () => {
        createCalled = true;
        return { revision: { id: "rev-create-2" } };
      },
      appendRevision: async () => ({ id: "rev-append-2" }),
    } as never, usersService as never);

    const reference = await service.applyNutritionPlanProposal(
      userId,
      payload,
      "Adjusting the current plan.",
      "adjust_nutrition_plan",
    );

    expect(reference).toBe("nutrition_revision:rev-append-2");
    expect(createCalled).toBe(false);
  });

  it("appends a revision for create_nutrition_plan when an active plan exists", async () => {
    let createCalled = false;
    let appendCalled = false;

    const service = new NutritionService({
      findActivePlanByUserId: async () => ({ id: "plan-1" }),
      findActiveRevisionByPlanId: async () => null,
      listRevisionsByUserId: async () => [],
      createPlanWithRevision: async () => {
        createCalled = true;
        return { revision: { id: "rev-create-3" } };
      },
      appendRevision: async () => {
        appendCalled = true;
        return { id: "rev-append-3" };
      },
    } as never, usersService as never);

    const reference = await service.applyNutritionPlanProposal(
      userId,
      payload,
      "Replacing the current plan.",
      "create_nutrition_plan",
    );

    expect(reference).toBe("nutrition_revision:rev-append-3");
    expect(createCalled).toBe(false);
    expect(appendCalled).toBe(true);
  });

  it("returns an empty active plan response when no nutrition plan exists", async () => {
    const service = new NutritionService({
      findActivePlanByUserId: async () => null,
      findActiveRevisionByPlanId: async () => null,
      listRevisionsByUserId: async () => [],
      createPlanWithRevision: async () => ({ revision: { id: "rev-create-4" } }),
      appendRevision: async () => ({ id: "rev-append-4" }),
    } as never, usersService as never);

    await expect(service.getCurrentActivePlan(auth as never)).resolves.toEqual({
      plan: null,
      activeRevision: null,
    });
  });

  it("maps active nutrition plan and revision rows for reads", async () => {
    const timestamp = new Date("2026-05-22T12:00:00.000Z");

    const service = new NutritionService({
      findActivePlanByUserId: async () => ({
        id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        userId,
        activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
      findActiveRevisionByPlanId: async () => ({
        id: "880099c6-3b5f-4383-8246-97b72bf61818",
        nutritionPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai_proposal",
        payload,
        createdAt: timestamp,
      }),
      listRevisionsByUserId: async () => [],
      createPlanWithRevision: async () => ({ revision: { id: "rev-create-5" } }),
      appendRevision: async () => ({ id: "rev-append-5" }),
    } as never, usersService as never);

    const result = await service.getCurrentActivePlan(auth as never);

    expect(result.plan?.activeRevisionId).toBe(
      "880099c6-3b5f-4383-8246-97b72bf61818",
    );
    expect(result.activeRevision?.payload.title).toBe(
      "Balanced daily nutrition base",
    );
  });
});
