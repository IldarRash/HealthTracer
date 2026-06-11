import { describe, expect, it, vi } from "vitest";
import type { ActiveNutritionPlanResponse, TodayDayResponse } from "@health/types";
import { getTodayIsoDateInTimezone } from "@health/types";
import { createAiPolicyTestStack } from "../ai/test-ai-behavior-fixtures.js";
import {
  DIRECT_PATH_MULTIPLE_PENDING_WORKOUTS_MESSAGE,
  DIRECT_PATH_NO_PENDING_WORKOUT_MESSAGE,
  formatNutritionPlanReadMessage,
  formatTodaySummaryReadMessage,
} from "./direct-chat-path-formatters.js";
import { DirectChatPathService } from "./direct-chat-path.service.js";

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

const workoutItemId = "880099c6-3b5f-4383-8246-97b72bf61818";
const hydrationItemId = "a1000001-0000-4000-8000-000000000001";

const todayIsoDate = getTodayIsoDateInTimezone(user.timezone);

function buildTodayDay(overrides?: Partial<TodayDayResponse>): TodayDayResponse {
  return {
    id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
    userId: user.id,
    date: todayIsoDate,
    items: [
      {
        id: workoutItemId,
        label: "Strength session",
        kind: "workout",
        status: "pending",
        required: true,
        source: { type: "workout_session", id: "78d40655-b4b5-47b3-b28e-470192e05f04" },
      },
      {
        id: hydrationItemId,
        label: "Drink water",
        kind: "hydration",
        status: "completed",
        required: false,
        source: { type: "custom" },
      },
    ],
    source: "generated",
    feedback: null,
    adherence: {
      score: 0.5,
      completedRequired: 0,
      totalRequired: 1,
      completedOptional: 1,
      skippedRequired: 0,
      skippedOptional: 0,
    },
    createdAt: new Date("2026-05-27T12:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-05-27T12:00:00.000Z").toISOString(),
    workout: {
      sessionId: "78d40655-b4b5-47b3-b28e-470192e05f04",
      workoutPlanId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
      workoutPlanRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
      plannedDate: todayIsoDate,
      weekday: "wednesday",
      title: "Strength session",
      focus: "Upper body",
      status: "planned",
      exercises: [],
      isRestDay: false,
    },
    nutrition: null,
    ...overrides,
  };
}

function createDirectChatPathService(deps: {
  todayService: {
    getOrGenerateDay: ReturnType<typeof vi.fn>;
    updateItemStatus?: ReturnType<typeof vi.fn>;
  };
  nutritionService?: {
    getCurrentActivePlan: ReturnType<typeof vi.fn>;
  };
}) {
  const { systemPlannerService, aiBehaviorConfigService } = createAiPolicyTestStack();

  return new DirectChatPathService(
    systemPlannerService,
    aiBehaviorConfigService,
    deps.todayService as never,
    {
      resolveFromAuth: async () => user,
    } as never,
    (deps.nutritionService ?? {
      getCurrentActivePlan: vi.fn().mockResolvedValue({ plan: null, activeRevision: null }),
    }) as never,
  );
}

describe("DirectChatPathService", () => {
  it("returns null for non-direct messages", async () => {
    const getOrGenerateDay = vi.fn();
    const service = createDirectChatPathService({
      todayService: {
        getOrGenerateDay,
      },
    });

    const result = await service.tryExecute({
      auth,
      userMessage: "How can I improve my sleep?",
      hasAttachments: false,
    });

    expect(result).toBeNull();
    expect(getOrGenerateDay).not.toHaveBeenCalled();
  });

  it("executes today summary read without mutation", async () => {
    const day = buildTodayDay();
    const getOrGenerateDay = vi.fn(async () => day);
    const updateItemStatus = vi.fn();
    const service = createDirectChatPathService({
      todayService: {
        getOrGenerateDay,
        updateItemStatus,
      },
    });

    const result = await service.tryExecute({
      auth,
      userMessage: "What is today?",
      hasAttachments: false,
    });

    expect(getOrGenerateDay).toHaveBeenCalledTimes(1);
    expect(updateItemStatus).not.toHaveBeenCalled();
    expect(result).toEqual({
      reply: formatTodaySummaryReadMessage(day, todayIsoDate),
      metadata: {
        candidate: {
          kind: "today_summary_read",
          confidence: 0.95,
          routingMethod: "rule_based",
        },
        outcome: {
          kind: "today_summary_read",
          status: "executed",
          message: formatTodaySummaryReadMessage(day, todayIsoDate),
          refreshHints: ["today"],
        },
      },
    });
  });

  it("marks a single pending workout done through TodayService", async () => {
    const day = buildTodayDay();
    const getOrGenerateDay = vi.fn(async () => day);
    const updateItemStatus = vi.fn(async () =>
      buildTodayDay({
        items: day.items.map((item) =>
          item.id === workoutItemId ? { ...item, status: "completed" } : item,
        ),
        adherence: {
          ...day.adherence,
          score: 1,
          completedRequired: 1,
        },
      }),
    );
    const service = createDirectChatPathService({
      todayService: {
        getOrGenerateDay,
        updateItemStatus,
      },
    });

    const result = await service.tryExecute({
      auth,
      userMessage: "Mark today's workout done",
      hasAttachments: false,
    });

    expect(getOrGenerateDay).toHaveBeenCalledTimes(1);
    expect(updateItemStatus).toHaveBeenCalledWith(auth, todayIsoDate, workoutItemId, {
      status: "completed",
    });
    expect(result?.metadata.outcome).toMatchObject({
      kind: "mark_today_workout_done",
      status: "executed",
      message: 'Marked "Strength session" as done on your Today checklist.',
      refreshHints: ["today", "dashboard", "longevity"],
    });
  });

  it("returns clarification when no pending workout exists", async () => {
    const day = buildTodayDay({
      items: [
        {
          id: workoutItemId,
          label: "Strength session",
          kind: "workout",
          status: "completed",
          required: true,
          source: { type: "workout_session", id: "78d40655-b4b5-47b3-b28e-470192e05f04" },
        },
      ],
      adherence: {
        score: 1,
        completedRequired: 1,
        totalRequired: 1,
        completedOptional: 0,
        skippedRequired: 0,
        skippedOptional: 0,
      },
    });
    const updateItemStatus = vi.fn();
    const service = createDirectChatPathService({
      todayService: {
        getOrGenerateDay: vi.fn(async () => day),
        updateItemStatus,
      },
    });

    const result = await service.tryExecute({
      auth,
      userMessage: "Mark today's workout done",
      hasAttachments: false,
    });

    expect(updateItemStatus).not.toHaveBeenCalled();
    expect(result?.metadata.outcome).toMatchObject({
      kind: "mark_today_workout_done",
      status: "clarification_required",
      message: DIRECT_PATH_NO_PENDING_WORKOUT_MESSAGE,
      refreshHints: [],
    });
  });

  it("returns clarification when multiple pending workouts exist", async () => {
    const day = buildTodayDay({
      items: [
        {
          id: workoutItemId,
          label: "Morning strength",
          kind: "workout",
          status: "pending",
          required: true,
          source: { type: "workout_session", id: "78d40655-b4b5-47b3-b28e-470192e05f04" },
        },
        {
          id: "b2000002-0000-4000-8000-000000000002",
          label: "Evening cardio",
          kind: "workout",
          status: "pending",
          required: true,
          source: { type: "workout_session", id: "c3000003-0000-4000-8000-000000000003" },
        },
      ],
      adherence: {
        score: 0,
        completedRequired: 0,
        totalRequired: 2,
        completedOptional: 0,
        skippedRequired: 0,
        skippedOptional: 0,
      },
    });
    const updateItemStatus = vi.fn();
    const service = createDirectChatPathService({
      todayService: {
        getOrGenerateDay: vi.fn(async () => day),
        updateItemStatus,
      },
    });

    const result = await service.tryExecute({
      auth,
      userMessage: "Complete my workout today",
      hasAttachments: false,
    });

    expect(updateItemStatus).not.toHaveBeenCalled();
    expect(result?.metadata.outcome).toMatchObject({
      kind: "mark_today_workout_done",
      status: "clarification_required",
      message: DIRECT_PATH_MULTIPLE_PENDING_WORKOUTS_MESSAGE,
      refreshHints: [],
    });
  });

  it("blocks direct path when attachments are present", async () => {
    const service = createDirectChatPathService({
      todayService: {
        getOrGenerateDay: vi.fn(),
      },
    });

    const result = await service.tryExecute({
      auth,
      userMessage: "What is today?",
      hasAttachments: true,
    });

    expect(result).toBeNull();
  });

  it("executes nutrition_plan_read and returns formatted plan when active plan exists", async () => {
    const activePlan: ActiveNutritionPlanResponse = {
      plan: {
        id: "a1000001-0000-4000-8000-000000000001",
        userId: user.id,
        activeRevisionId: "b2000002-0000-4000-8000-000000000002",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      activeRevision: {
        id: "b2000002-0000-4000-8000-000000000002",
        nutritionPlanId: "a1000001-0000-4000-8000-000000000001",
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai",
        payload: {
          title: "Balanced Diet",
          summary: "A well-balanced daily diet",
          caloriesPerDay: 2000,
          proteinGrams: 150,
          carbsGrams: 200,
          fatGrams: 70,
          hydrationLiters: 2.5,
          mealStructure: [
            { label: "Breakfast", timingHint: "08:00", dish: "Oatmeal with berries" },
            { label: "Lunch", timingHint: "13:00" },
          ],
          preferences: [],
          restrictions: [],
          allergies: [],
          notes: [],
        },
        createdAt: new Date().toISOString(),
      },
    };
    const getCurrentActivePlan = vi.fn().mockResolvedValue(activePlan);
    const service = createDirectChatPathService({
      todayService: { getOrGenerateDay: vi.fn() },
      nutritionService: { getCurrentActivePlan },
    });

    const result = await service.tryExecute({
      auth,
      userMessage: "Show my nutrition plan",
      hasAttachments: false,
    });

    expect(getCurrentActivePlan).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result?.metadata.outcome).toMatchObject({
      kind: "nutrition_plan_read",
      status: "executed",
      refreshHints: [],
    });
    expect(result?.reply).toBe(formatNutritionPlanReadMessage(activePlan));
    expect(result?.reply).toContain("Balanced Diet");
    expect(result?.reply).toContain("Breakfast");
    expect(result?.reply).toContain("2000 kcal");
  });

  it("executes nutrition_plan_read and returns fallback when no active plan", async () => {
    const noActivePlan: ActiveNutritionPlanResponse = { plan: null, activeRevision: null };
    const getCurrentActivePlan = vi.fn().mockResolvedValue(noActivePlan);
    const service = createDirectChatPathService({
      todayService: { getOrGenerateDay: vi.fn() },
      nutritionService: { getCurrentActivePlan },
    });

    const result = await service.tryExecute({
      auth,
      userMessage: "My nutrition plan",
      hasAttachments: false,
    });

    expect(getCurrentActivePlan).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result?.metadata.outcome).toMatchObject({
      kind: "nutrition_plan_read",
      status: "executed",
      refreshHints: [],
    });
    expect(result?.reply).toBe(formatNutritionPlanReadMessage(noActivePlan));
    expect(result?.reply).toContain("don't have an active nutrition plan");
  });

  it("blocks direct path when proposal revision is present", async () => {
    const service = createDirectChatPathService({
      todayService: {
        getOrGenerateDay: vi.fn(),
      },
    });

    const result = await service.tryExecute({
      auth,
      userMessage: "What is today?",
      hasAttachments: false,
      proposalRevision: {
        supersededProposalId: "a1000001-0000-4000-8000-000000000001",
        originalProposal: {
          intent: "create_workout_plan",
          targetDomain: "workout",
          title: "Weekly plan",
          reason: "Build consistency",
          proposedChanges: {
            title: "Weekly plan",
            summary: "Build consistency with a simple weekly structure.",
            days: [{ weekday: "monday" as const, focus: "Strength", exercises: [{ name: "Squat" }] }],
            notes: [],
          },
        },
        modificationFeedback: "Make it easier on Wednesdays",
      },
    });

    expect(result).toBeNull();
  });
});

describe("formatTodaySummaryReadMessage", () => {
  it("formats checklist, workout, and adherence deterministically", () => {
    const day = buildTodayDay();

    expect(formatTodaySummaryReadMessage(day, todayIsoDate)).toBe(
      [
        `Here's your Today summary for ${todayIsoDate}:`,
        "",
        "Checklist (0/1 required done):",
        "- [pending] Strength session (workout)",
        "- [done] Drink water (hydration)",
        "",
        "Workout: Strength session — planned, 0 exercise(s)",
        "",
        "Adherence: 50% (0 of 1 required items completed)",
      ].join("\n"),
    );
  });
});

describe("formatNutritionPlanReadMessage", () => {
  it("returns fallback line when no active plan", () => {
    const noActivePlan: ActiveNutritionPlanResponse = { plan: null, activeRevision: null };
    const result = formatNutritionPlanReadMessage(noActivePlan);

    expect(result).toContain("don't have an active nutrition plan");
  });

  it("formats title, meals with timing/dish, and macro targets", () => {
    const activePlan: ActiveNutritionPlanResponse = {
      plan: {
        id: "a1000001-0000-4000-8000-000000000001",
        userId: user.id,
        activeRevisionId: "b2000002-0000-4000-8000-000000000002",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      activeRevision: {
        id: "b2000002-0000-4000-8000-000000000002",
        nutritionPlanId: "a1000001-0000-4000-8000-000000000001",
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai",
        payload: {
          title: "Clean Bulk",
          summary: "High protein",
          caloriesPerDay: 2500,
          proteinGrams: 180,
          carbsGrams: 250,
          fatGrams: 80,
          hydrationLiters: 3,
          mealStructure: [
            { label: "Breakfast", timingHint: "07:30", dish: "Eggs and toast" },
            { label: "Dinner", timingHint: null },
          ],
          preferences: [],
          restrictions: [],
          allergies: [],
          notes: [],
        },
        createdAt: new Date().toISOString(),
      },
    };

    const result = formatNutritionPlanReadMessage(activePlan);

    expect(result).toContain("Clean Bulk");
    expect(result).toContain("Breakfast");
    expect(result).toContain("(07:30)");
    expect(result).toContain("Eggs and toast");
    expect(result).toContain("Dinner");
    expect(result).toContain("2500 kcal");
    expect(result).toContain("180g protein");
    expect(result).toContain("250g carbs");
    expect(result).toContain("80g fat");
  });

  it("omits macro line when all macro fields are null", () => {
    const activePlan: ActiveNutritionPlanResponse = {
      plan: {
        id: "a1000001-0000-4000-8000-000000000001",
        userId: user.id,
        activeRevisionId: "b2000002-0000-4000-8000-000000000002",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      activeRevision: {
        id: "b2000002-0000-4000-8000-000000000002",
        nutritionPlanId: "a1000001-0000-4000-8000-000000000001",
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai",
        payload: {
          title: "Simple Plan",
          summary: "No macros",
          caloriesPerDay: null,
          proteinGrams: null,
          carbsGrams: null,
          fatGrams: null,
          hydrationLiters: null,
          mealStructure: [{ label: "Lunch", timingHint: null }],
          preferences: [],
          restrictions: [],
          allergies: [],
          notes: [],
        },
        createdAt: new Date().toISOString(),
      },
    };

    const result = formatNutritionPlanReadMessage(activePlan);

    expect(result).toContain("Simple Plan");
    expect(result).not.toContain("kcal");
    expect(result).not.toContain("protein");
  });
});
