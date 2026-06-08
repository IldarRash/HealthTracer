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
  getUserById: async (_id: string) => ({
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
    findLatestTwoRevisionsByPlanId: async () => [],
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

  it("threads the user timezone into createIncident so near-midnight incidents land on the correct local day", async () => {
    // 2026-05-26T23:30:00Z is May 26 UTC but already May 27 in Asia/Tokyo (UTC+9).
    // The service must resolve the user's timezone and forward it to the repository.
    let capturedTimezone: string | undefined;

    const tokyoUsersService = {
      ...usersService,
      getUserById: async (_id: string) => ({
        id: userId,
        email: "user@example.com",
        displayName: null,
        timezone: "Asia/Tokyo",
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
      }),
    };

    const service = new NutritionService(
      createRepositoryMock({
        findIncidentBySourceProposalId: async () => null,
        createIncident: async (
          _userId: string,
          _sourceProposalId: string,
          _payload: unknown,
          _db: unknown,
          tz: string,
        ) => {
          capturedTimezone = tz;
          return { id: "incident-tz-1" };
        },
      }) as never,
      tokyoUsersService as never,
    );

    await service.applyNutritionIncidentProposal(
      userId,
      "14a08176-64a7-4a2d-8a44-581807368394",
      {
        incidentDateTime: "2026-05-26T23:30:00.000Z",
        items: [{ name: "Ramen", calories: 500 }],
        estimatedCalories: 500,
        estimatedMacros: { proteinGrams: 20, carbsGrams: 60, fatGrams: 15 },
        confidence: "medium",
        provenance: { source: "text_estimate", providerId: "chat_trigger" },
        imageRefs: [],
      },
    );

    expect(capturedTimezone).toBe("Asia/Tokyo");
  });
});

// ─── C4 swap path: adjust_nutrition_plan with swaps[] ─────────────────────

/**
 * The adjust_nutrition_plan proposal can carry optional swap metadata
 * (adjustNutritionPlanFromProgressChangesSchema.swaps[]).  The service must:
 *   1. Extract the nested plan payload (via extractNutritionPlanPayload).
 *   2. Call appendRevision — never createPlanWithRevision — when a plan already exists.
 *   3. Preserve the protein target (protein floor must not be cut by the swap path).
 *   4. Accept the proposal when swaps is absent (backward compat).
 */
const swapPayloadBase = {
  ...payload,
  caloriesPerDay: 1900,   // lighter than the base 2200
  proteinGrams: 140,      // protein floor preserved
};

describe("NutritionService — adjust_nutrition_plan with swaps (C4)", () => {
  it("calls appendRevision when an existing plan is present (swaps path)", async () => {
    let appendCalled = false;
    let createCalled = false;

    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({ id: "plan-swap-1" }),
        appendRevision: async () => {
          appendCalled = true;
          return { id: "rev-swap-1" };
        },
        createPlanWithRevision: async () => {
          createCalled = true;
          return { revision: { id: "rev-swap-create" } };
        },
      }) as never,
      usersService as never,
    );

    const reference = await service.applyNutritionPlanProposal(
      userId,
      swapPayloadBase,           // extractNutritionPlanPayload already unwrapped by caller
      "Make the plan lighter.",
      "adjust_nutrition_plan",
    );

    expect(reference).toBe("nutrition_revision:rev-swap-1");
    expect(appendCalled).toBe(true);
    expect(createCalled).toBe(false);
  });

  it("preserves protein target through the swap path (protein floor not cut)", async () => {
    let capturedPayload: unknown;

    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({ id: "plan-swap-2" }),
        appendRevision: async (
          _planId: string,
          appendedPayload: unknown,
        ) => {
          capturedPayload = appendedPayload;
          return { id: "rev-swap-2" };
        },
      }) as never,
      usersService as never,
    );

    await service.applyNutritionPlanProposal(
      userId,
      swapPayloadBase,
      "Lighter plan with ingredient swaps.",
      "adjust_nutrition_plan",
    );

    expect((capturedPayload as typeof swapPayloadBase).proteinGrams).toBe(140);
    expect((capturedPayload as typeof swapPayloadBase).caloriesPerDay).toBe(1900);
  });

  it("accepts adjust_nutrition_plan without swaps (backward compat)", async () => {
    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({ id: "plan-no-swaps" }),
        appendRevision: async () => ({ id: "rev-no-swaps" }),
      }) as never,
      usersService as never,
    );

    const reference = await service.applyNutritionPlanProposal(
      userId,
      payload,
      "Standard adjustment.",
      "adjust_nutrition_plan",
    );

    expect(reference).toBe("nutrition_revision:rev-no-swaps");
  });

  it("rejects adjust_nutrition_plan with swaps when plan has empty mealStructure", async () => {
    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({ id: "plan-swap-invalid" }),
      }) as never,
      usersService as never,
    );

    await expect(
      service.applyNutritionPlanProposal(
        userId,
        { ...swapPayloadBase, mealStructure: [] },
        "Invalid swap plan.",
        "adjust_nutrition_plan",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates a fresh plan revision when no existing plan (swaps path, new user)", async () => {
    let createCalled = false;
    let appendCalled = false;

    const service = new NutritionService(
      createRepositoryMock({
        // findActivePlanByUserId returns null → new plan
        createPlanWithRevision: async () => {
          createCalled = true;
          return { revision: { id: "rev-new-swap" } };
        },
        appendRevision: async () => {
          appendCalled = true;
          return { id: "rev-append-swap" };
        },
      }) as never,
      usersService as never,
    );

    const reference = await service.applyNutritionPlanProposal(
      userId,
      swapPayloadBase,
      "First plan with swap metadata.",
      "adjust_nutrition_plan",
    );

    expect(reference).toBe("nutrition_revision:rev-new-swap");
    expect(createCalled).toBe(true);
    expect(appendCalled).toBe(false);
  });
});

// ─── C1: getMealCaloriesBreakdown ──────────────────────────────────────────

const mealPayloadWithCalories = {
  title: "Plan with per-meal data",
  summary: "Balanced plan.",
  caloriesPerDay: 2100,
  proteinGrams: 140,
  carbsGrams: 220,
  fatGrams: 70,
  hydrationLiters: 2.5,
  mealStructure: [
    {
      label: "Breakfast",
      timingHint: "Morning",
      mealTime: "07:30",
      dish: "Oatmeal",
      kcal: 480,
      proteinGrams: 32,
      carbsGrams: 58,
      fatGrams: 14,
    },
    {
      label: "Lunch",
      timingHint: null,
      mealTime: "14:00",
      dish: "Chicken quinoa",
      kcal: 620,
      proteinGrams: 44,
      carbsGrams: 62,
      fatGrams: 20,
    },
    {
      label: "Dinner",
      timingHint: "Evening",
      mealTime: "20:00",
      dish: "Salmon + veg",
      kcal: 540,
      proteinGrams: 38,
      carbsGrams: 30,
      fatGrams: 24,
    },
  ],
  preferences: [],
  restrictions: [],
  allergies: [],
  notes: [],
};

describe("NutritionService — getMealCaloriesBreakdown (C1)", () => {
  it("returns null when no active nutrition plan exists", async () => {
    const service = new NutritionService(
      createRepositoryMock() as never,
      usersService as never,
    );

    await expect(service.getMealCaloriesBreakdown(auth as never)).resolves.toBeNull();
  });

  it("returns null when active plan has no active revision id", async () => {
    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: "plan-c1-1",
          userId,
          activeRevisionId: null,
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      }) as never,
      usersService as never,
    );

    await expect(service.getMealCaloriesBreakdown(auth as never)).resolves.toBeNull();
  });

  it("returns the read model for a plan with one revision (no previous)", async () => {
    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: "plan-c1-2",
          userId,
          activeRevisionId: "rev-c1-1",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findLatestTwoRevisionsByPlanId: async () => [
          {
            id: "rev-c1-1",
            nutritionPlanId: "plan-c1-2",
            revisionNumber: 1,
            reason: "Initial",
            source: "seed",
            payload: mealPayloadWithCalories,
            createdAt: new Date(),
          },
        ],
      }) as never,
      usersService as never,
    );

    const model = await service.getMealCaloriesBreakdown(auth as never);

    expect(model).not.toBeNull();
    expect(model?.revisionNumber).toBe(1);
    expect(model?.totalKcal).toBe(480 + 620 + 540); // 1640
    expect(model?.remaining).toBe(2100 - 1640);     // 460
    expect(model?.hasPerMealData).toBe(true);
    // All meals changed = true (no previous revision).
    expect(model?.meals.every((m) => m.changed)).toBe(true);
  });

  it("computes changed=false for unchanged slots vs previous revision", async () => {
    const legacyPayload = {
      ...mealPayloadWithCalories,
      mealStructure: mealPayloadWithCalories.mealStructure.map((s) => ({
        label: s.label,
        timingHint: s.timingHint,
        // Same kcal/macros/dish → should NOT be marked changed.
        kcal: s.kcal,
        proteinGrams: s.proteinGrams,
        carbsGrams: s.carbsGrams,
        fatGrams: s.fatGrams,
        dish: s.dish,
      })),
    };

    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: "plan-c1-3",
          userId,
          activeRevisionId: "rev-c1-2",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findLatestTwoRevisionsByPlanId: async () => [
          {
            id: "rev-c1-2",
            nutritionPlanId: "plan-c1-3",
            revisionNumber: 2,
            reason: "Same data",
            source: "seed",
            payload: mealPayloadWithCalories,
            createdAt: new Date(),
          },
          {
            id: "rev-c1-1",
            nutritionPlanId: "plan-c1-3",
            revisionNumber: 1,
            reason: "Previous",
            source: "seed",
            payload: legacyPayload,
            createdAt: new Date(),
          },
        ],
      }) as never,
      usersService as never,
    );

    const model = await service.getMealCaloriesBreakdown(auth as never);

    expect(model?.meals.every((m) => !m.changed)).toBe(true);
  });

  it("does not call any write methods (read-only guarantee)", async () => {
    let appendCalled = false;
    let createCalled = false;
    let upsertCalled = false;

    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: "plan-c1-4",
          userId,
          activeRevisionId: "rev-c1-ro",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findLatestTwoRevisionsByPlanId: async () => [
          {
            id: "rev-c1-ro",
            nutritionPlanId: "plan-c1-4",
            revisionNumber: 1,
            reason: "RO test",
            source: "seed",
            payload: mealPayloadWithCalories,
            createdAt: new Date(),
          },
        ],
        appendRevision: async () => { appendCalled = true; return { id: "x" }; },
        createPlanWithRevision: async () => { createCalled = true; return { revision: { id: "x" } }; },
        upsertAdherenceByUserIdAndDate: async () => { upsertCalled = true; return {} as never; },
      }) as never,
      usersService as never,
    );

    await service.getMealCaloriesBreakdown(auth as never);

    expect(appendCalled).toBe(false);
    expect(createCalled).toBe(false);
    expect(upsertCalled).toBe(false);
  });

  it("returns null when findLatestTwoRevisionsByPlanId returns an empty array despite activeRevisionId being set", async () => {
    // Defensive edge case: plan row has activeRevisionId but the revision query
    // returns nothing (e.g. data inconsistency).  Service must return null safely.
    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: "plan-c1-empty",
          userId,
          activeRevisionId: "rev-c1-ghost",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findLatestTwoRevisionsByPlanId: async () => [], // returns nothing
      }) as never,
      usersService as never,
    );

    await expect(service.getMealCaloriesBreakdown(auth as never)).resolves.toBeNull();
  });

  it("marks only the meal slot with changed kcal as changed=true, not all slots", async () => {
    const prevPayload = {
      ...mealPayloadWithCalories,
      mealStructure: mealPayloadWithCalories.mealStructure.map((s) => ({
        ...s,
        // Set kcal lower on Breakfast to trigger a change in the active revision.
        kcal: s.label === "Breakfast" ? 400 : s.kcal,
      })),
    };

    const service = new NutritionService(
      createRepositoryMock({
        findActivePlanByUserId: async () => ({
          id: "plan-c1-partial-change",
          userId,
          activeRevisionId: "rev-c1-active",
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findLatestTwoRevisionsByPlanId: async () => [
          {
            id: "rev-c1-active",
            nutritionPlanId: "plan-c1-partial-change",
            revisionNumber: 2,
            reason: "Breakfast kcal updated",
            source: "ai_proposal",
            payload: mealPayloadWithCalories, // active: Breakfast=480
            createdAt: new Date(),
          },
          {
            id: "rev-c1-prev",
            nutritionPlanId: "plan-c1-partial-change",
            revisionNumber: 1,
            reason: "Initial",
            source: "ai_proposal",
            payload: prevPayload, // previous: Breakfast=400
            createdAt: new Date(),
          },
        ],
      }) as never,
      usersService as never,
    );

    const model = await service.getMealCaloriesBreakdown(auth as never);

    const breakfast = model?.meals.find((m) => m.label === "Breakfast");
    const notBreakfast = model?.meals.filter((m) => m.label !== "Breakfast") ?? [];

    expect(breakfast?.changed).toBe(true);
    // All other slots should not be changed (they match the previous revision).
    expect(notBreakfast.every((m) => !m.changed)).toBe(true);
  });
});
