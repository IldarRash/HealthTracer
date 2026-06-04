import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    listIncidentsByUserAndDate: async () => [],
    listIncidentsByUserAndDateRange: async () => [],
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
  afterEach(() => {
    vi.useRealTimers();
  });

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
    const service = new NutritionService(
      createRepositoryMock() as never,
      usersService as never,
    );

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
    const service = new NutritionService(
      createRepositoryMock() as never,
      usersService as never,
    );

    await expect(service.getCurrentActivePlan(auth as never)).resolves.toEqual({
      plan: null,
      activeRevision: null,
    });
  });

  it("returns null adherence when no record exists for the date", async () => {
    const service = new NutritionService(
      createRepositoryMock() as never,
      usersService as never,
    );

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
    const service = new NutritionService(
      createRepositoryMock() as never,
      usersService as never,
    );

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

  it("upserts today adherence using the user timezone date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T23:30:00.000Z"));

    let upsertDate: string | undefined;

    const service = new NutritionService(
      createRepositoryMock({
        upsertAdherenceByUserIdAndDate: async (_resolvedUserId: string, date: string) => {
          upsertDate = date;
          return {
            id: "adherence-1",
            userId,
            date,
            hydrationLitersConsumed: 1.5,
            mealCompletion: [],
            targetCompletion: {},
            notes: [],
            createdAt: new Date("2026-05-22T23:30:00.000Z"),
            updatedAt: new Date("2026-05-22T23:30:00.000Z"),
          };
        },
      }) as never,
      {
        resolveFromAuth: async () => ({
          id: userId,
          email: "user@example.com",
          displayName: null,
          timezone: "Asia/Tokyo",
          createdAt: "2026-05-22T12:00:00.000Z",
          updatedAt: "2026-05-22T12:00:00.000Z",
        }),
      } as never,
    );

    const response = await service.upsertAdherenceForToday(auth as never, {
      hydrationLitersConsumed: 1.5,
    });

    expect(upsertDate).toBe("2026-05-23");
    expect(response.adherence?.date).toBe("2026-05-23");
    expect(response.adherence?.hydrationLitersConsumed).toBe(1.5);
  });

  it("reads and writes today adherence against the same timezone-resolved date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T23:30:00.000Z"));

    const dates: string[] = [];

    const service = new NutritionService(
      createRepositoryMock({
        findAdherenceByUserIdAndDate: async (_resolvedUserId: string, date: string) => {
          dates.push(`read:${date}`);
          return null;
        },
        upsertAdherenceByUserIdAndDate: async (_resolvedUserId: string, date: string) => {
          dates.push(`write:${date}`);
          return {
            id: "adherence-1",
            userId,
            date,
            hydrationLitersConsumed: 1,
            mealCompletion: [],
            targetCompletion: {},
            notes: [],
            createdAt: new Date("2026-05-22T23:30:00.000Z"),
            updatedAt: new Date("2026-05-22T23:30:00.000Z"),
          };
        },
      }) as never,
      {
        resolveFromAuth: async () => ({
          id: userId,
          email: "user@example.com",
          displayName: null,
          timezone: "Asia/Tokyo",
          createdAt: "2026-05-22T12:00:00.000Z",
          updatedAt: "2026-05-22T12:00:00.000Z",
        }),
      } as never,
    );

    await service.getAdherenceForToday(auth as never);
    await service.upsertAdherenceForToday(auth as never, { hydrationLitersConsumed: 1 });

    expect(dates).toEqual(["read:2026-05-23", "write:2026-05-23"]);
  });

  it("returns null nutrition day detail when no active plan exists", async () => {
    const service = new NutritionService(
      createRepositoryMock() as never,
      usersService as never,
    );

    await expect(service.getNutritionDayDetail(auth as never, "2026-05-22")).resolves.toBeNull();
  });

  it("returns null nutrition day detail when active plan has no revision", async () => {
    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: "plan-1",
          userId,
          activeRevisionId: null,
          status: "active",
          createdAt: new Date("2026-05-22T12:00:00.000Z"),
          updatedAt: new Date("2026-05-22T12:00:00.000Z"),
        }),
      }) as never,
      usersService as never,
    );

    await expect(service.getNutritionDayDetail(auth as never, "2026-05-22")).resolves.toBeNull();
  });

  it("composes active revision and date-scoped adherence without plan writes", async () => {
    let appendCalled = false;
    let createCalled = false;
    let upsertCalled = false;
    let lookupDate: string | undefined;

    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: "plan-1",
          userId,
          activeRevisionId: "rev-1",
          status: "active",
          createdAt: new Date("2026-05-22T12:00:00.000Z"),
          updatedAt: new Date("2026-05-22T12:00:00.000Z"),
        }),
        findActiveRevisionByPlanId: async () => ({
          id: "rev-1",
          nutritionPlanId: "plan-1",
          revisionNumber: 1,
          reason: "Initial plan",
          source: "ai_proposal",
          payload,
          createdAt: new Date("2026-05-22T12:00:00.000Z"),
        }),
        findAdherenceByUserIdAndDate: async (_resolvedUserId: string, date: string) => {
          lookupDate = date;
          return {
            id: "adherence-1",
            userId,
            date,
            hydrationLitersConsumed: 1.5,
            mealCompletion: [{ label: "Breakfast", completed: true }],
            targetCompletion: { caloriesOnTarget: true },
            notes: [],
            createdAt: new Date("2026-05-22T12:00:00.000Z"),
            updatedAt: new Date("2026-05-22T12:00:00.000Z"),
          };
        },
        appendRevision: async () => {
          appendCalled = true;
          return { id: "rev-append-1" };
        },
        createPlanWithRevision: async () => {
          createCalled = true;
          return { revision: { id: "rev-create-1" } };
        },
        upsertAdherenceByUserIdAndDate: async () => {
          upsertCalled = true;
          return {
            id: "adherence-1",
            userId,
            date: "2026-05-22",
            hydrationLitersConsumed: 1.5,
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

    const detail = await service.getNutritionDayDetail(auth as never, "2026-05-22");

    expect(lookupDate).toBe("2026-05-22");
    expect(detail?.date).toBe("2026-05-22");
    expect(detail?.plan?.id).toBe("plan-1");
    expect(detail?.activeRevision?.payload.mealStructure).toHaveLength(3);
    expect(detail?.adherence?.hydrationLitersConsumed).toBe(1.5);
    expect(appendCalled).toBe(false);
    expect(createCalled).toBe(false);
    expect(upsertCalled).toBe(false);
  });

  it("rejects invalid dates when building nutrition day detail", async () => {
    const service = new NutritionService(
      createRepositoryMock() as never,
      usersService as never,
    );

    await expect(
      service.getNutritionDayDetail(auth as never, "05-22-2026"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("upserts adherence without creating nutrition plan revisions", async () => {
    let appendCalled = false;
    let createCalled = false;

    const service = new NutritionService(
      createRepositoryMock({
        appendRevision: async () => {
          appendCalled = true;
          return { id: "rev-append-1" };
        },
        createPlanWithRevision: async () => {
          createCalled = true;
          return { revision: { id: "rev-create-1" } };
        },
      }) as never,
      usersService as never,
    );

    await service.upsertAdherenceForDate(auth as never, "2026-05-22", {
      hydrationLitersConsumed: 2,
      mealCompletion: [{ label: "Breakfast", completed: true }],
      targetCompletion: { proteinOnTarget: true },
      notes: ["Felt steady."],
    });

    expect(appendCalled).toBe(false);
    expect(createCalled).toBe(false);
  });

  it("creates a nutrition incident using the provided transaction client", async () => {
    const tx = { insert: "tx-client" };
    let createDb: unknown;

    const service = new NutritionService(
      createRepositoryMock({
        findIncidentBySourceProposalId: async () => null,
        createIncident: async (
          _userId: string,
          _sourceProposalId: string,
          _payload: unknown,
          db?: unknown,
        ) => {
          createDb = db;
          return { id: "incident-1" };
        },
      }) as never,
      usersService as never,
    );

    const incidentId = await service.applyNutritionIncidentProposal(
      userId,
      "14a08176-64a7-4a2d-8a44-581807368394",
      {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Pizza slice", calories: 280 }],
        estimatedCalories: 280,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
        confidence: "medium",
        provenance: { source: "text_estimate", providerId: "chat_trigger" },
        imageRefs: [],
      },
      tx as never,
    );

    expect(incidentId).toBe("incident-1");
    expect(createDb).toBe(tx);
  });

  it("returns an existing incident id for idempotent proposal retries", async () => {
    let createCalled = false;

    const service = new NutritionService(
      createRepositoryMock({
        findIncidentBySourceProposalId: async () => ({
          id: "incident-existing",
          userId,
          sourceProposalId: "14a08176-64a7-4a2d-8a44-581807368394",
        }),
        createIncident: async () => {
          createCalled = true;
          return { id: "incident-new" };
        },
      }) as never,
      usersService as never,
    );

    const incidentId = await service.applyNutritionIncidentProposal(
      userId,
      "14a08176-64a7-4a2d-8a44-581807368394",
      {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Pizza slice", calories: 280 }],
        estimatedCalories: 280,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
        confidence: "medium",
        provenance: { source: "text_estimate", providerId: "chat_trigger" },
        imageRefs: [],
      },
    );

    expect(incidentId).toBe("incident-existing");
    expect(createCalled).toBe(false);
  });

  it("rejects nutrition incident payloads that fail domain validation before writes", async () => {
    let createCalled = false;

    const service = new NutritionService(
      createRepositoryMock({
        createIncident: async () => {
          createCalled = true;
          return { id: "incident-1" };
        },
      }) as never,
      usersService as never,
    );

    await expect(
      service.applyNutritionIncidentProposal(userId, "14a08176-64a7-4a2d-8a44-581807368394", {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Pizza slice", calories: 280 }],
        estimatedCalories: 280,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
        confidence: "low",
        provenance: { source: "text_estimate", providerId: "chat_trigger" },
        imageRefs: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createCalled).toBe(false);
  });
});
