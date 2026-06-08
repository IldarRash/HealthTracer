import { describe, expect, it } from "vitest";
import { ProposalValidationService } from "./proposal-validation.service.js";

const structuredExercise = {
  exerciseId: "b1000001-0000-4000-8000-000000000016",
  snapshot: {
    name: "Goblet Squat",
    primaryMuscles: ["quads", "glutes"],
    equipment: ["dumbbell", "kettlebell"],
  },
  sets: 3,
  reps: "8",
  recommendedLoadGuidance: "Choose a controlled working weight.",
  restBetweenSetsSeconds: 90,
};

const workoutPlan = {
  title: "Strength base",
  summary: "Reduced volume based on weekly completion patterns.",
  days: [{ weekday: "monday", focus: "Strength", exercises: [structuredExercise] }],
};

function createService(
  progressRepository: {
    summaryExistsForUser?: (userId: string, summaryId: string) => Promise<boolean>;
    findTrendsOwnedByUser?: (
      userId: string,
      trendIds: readonly string[],
    ) => Promise<Array<{ id: string; summaryId: string }>>;
  } = {},
  exercisesService: {
    findInaccessibleExerciseIds?: (
      exerciseIds: readonly string[],
      userId: string,
    ) => Promise<string[]>;
  } = {},
  habitsService: {
    getHabitTemplateReferenceErrors?: (payload: unknown) => Promise<string[]>;
  } = {},
  documentSignalsRepository: {
    findApprovedSignalById?: (userId: string, signalId: string) => Promise<unknown>;
    findCorrelationEligibleSignalById?: (userId: string, signalId: string) => Promise<unknown>;
  } = {},
  metricsAiContextService: {
    buildSummaryForUser?: (userId: string) => Promise<{
      items: Array<{ metricType: string; periodStart: string; periodEnd: string }>;
      generatedAt: string;
    }>;
  } = {},
  goalsRepository: {
    listByUserId?: (userId: string) => Promise<unknown[]>;
  } = {},
  recoveryContextService: {
    computeAndPersistSnapshot?: (
      userId: string,
      date: string,
    ) => Promise<{ id: string; band: string }>;
  } = {},
  workoutsRepository: {
    findActivePlanByUserId?: (userId: string) => Promise<{ activeRevisionId: string | null } | null>;
    findRevisionById?: (revisionId: string) => Promise<{ payload: unknown } | null>;
  } = {},
  usersRepository: {
    findByUserId?: (userId: string) => Promise<{ timezone: string } | null>;
  } = {},
  habitsRepository: {
    findActivePlanByUserId?: (
      userId: string,
    ) => Promise<{ id: string; activeRevisionId: string | null } | null>;
    findActiveRevisionByPlanId?: (
      habitPlanId: string,
      activeRevisionId: string,
    ) => Promise<{ payload: unknown } | null>;
  } = {},
  wellbeingCheckInsRepository: {
    findByUserAndDate?: (userId: string, date: string) => Promise<{ id: string } | null>;
  } = {},
  nutritionRepository: {
    listOwnedFoodPhotoAnalysesByImageRefIds?: (
      userId: string,
      imageRefIds: readonly string[],
    ) => Promise<Array<{ analysisId: string; imageRefId: string }>>;
    findFoodPhotoAnalysisByIdForUser?: (
      userId: string,
      analysisId: string,
    ) => Promise<{ id: string; imageRefId: string } | null>;
    findActivePlanByUserId?: (
      userId: string,
    ) => Promise<{ activeRevisionId: string | null } | null>;
    findRevisionOwnedByUser?: (
      userId: string,
      revisionId: string,
    ) => Promise<{ id: string } | null>;
  } = {},
  recipesRepository: {
    findRecommendationById?: (
      userId: string,
      recommendationId: string,
    ) => Promise<{
      recommendation: { status: string };
      recipe: unknown;
    } | null>;
  } = {},
) {
  return new ProposalValidationService(
    {
      summaryExistsForUser: async () => true,
      findTrendsOwnedByUser: async () => [],
      ...progressRepository,
    } as never,
    {
      findInaccessibleExerciseIds: async () => [],
      ...exercisesService,
    } as never,
    {
      getHabitTemplateReferenceErrors: async () => [],
      ...habitsService,
    } as never,
    {
      findApprovedSignalById: async () => null,
      findCorrelationEligibleSignalById: async () => null,
      ...documentSignalsRepository,
    } as never,
    {
      buildSummaryForUser: async () => ({ items: [], generatedAt: new Date().toISOString() }),
      ...metricsAiContextService,
    } as never,
    {
      listByUserId: async () => [],
      ...goalsRepository,
    } as never,
    {
      computeAndPersistSnapshot: async () => ({
        id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
        band: "moderate_load",
      }),
      ...recoveryContextService,
    } as never,
    {
      findActivePlanByUserId: async () => null,
      findRevisionById: async () => null,
      ...workoutsRepository,
    } as never,
    {
      findByUserId: async () => ({ timezone: "UTC" }),
      ...usersRepository,
    } as never,
    {
      findActivePlanByUserId: async () => null,
      findActiveRevisionByPlanId: async () => null,
      ...habitsRepository,
    } as never,
    {
      findByUserAndDate: async () => null,
      ...wellbeingCheckInsRepository,
    } as never,
    {
      listOwnedFoodPhotoAnalysesByImageRefIds: async () => [],
      findFoodPhotoAnalysisByIdForUser: async () => null,
      findActivePlanByUserId: async () => null,
      findRevisionOwnedByUser: async () => null,
      ...nutritionRepository,
    } as never,
    {
      findRecommendationById: async () => null,
      ...recipesRepository,
    } as never,
    {
      listByIdsForUser: async () => [],
    } as never,
  );
}

describe("ProposalValidationService", () => {
  const service = createService();

  it("validates workout proposal payloads by intent", () => {
    const result = service.validateStoredProposal("create_workout_plan", workoutPlan);

    expect(result.valid).toBe(true);
  });

  it("validates adapt_workout_plan payloads with the workout schema", () => {
    const result = service.validateStoredProposal("adapt_workout_plan", workoutPlan);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects workout proposals with missing weekday (B5 removal — schema enforces weekday)", () => {
    // B5 removal: weekday is now required by workoutPlanDaySchema; missing weekday fails parse
    // and the proposal validation service catches the invalid schema.
    const result = service.validateStoredProposal("create_workout_plan", {
      title: "Strength base",
      summary: "Three repeatable training days.",
      days: [{ focus: "Strength", exercises: [{ name: "Squat" }] }],
    });

    expect(result.valid).toBe(false);
  });

  it("rejects workout proposals with unsupported medical wording", () => {
    const result = service.validateStoredProposal("create_workout_plan", {
      ...workoutPlan,
      summary: "Follow this clinical treatment protocol.",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("medical wording"))).toBe(true);
  });

  it("rejects workout proposals with legacy object exercises (no snapshot/exerciseId) (B6 removal)", () => {
    // B6 removal: string arm deleted; legacy object {name} form fails the requireStructuredPlan check.
    const result = service.validateStoredProposal("adapt_workout_plan", {
      ...workoutPlan,
      days: [{ weekday: "monday", focus: "Strength", exercises: [{ name: "Squat" }] }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("structured catalog-backed exercises"))).toBe(
      true,
    );
  });

  it("rejects workout proposals without training days", () => {
    const result = service.validateStoredProposal("create_workout_plan", {
      title: "Strength base",
      summary: "Missing days.",
      days: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects malformed goal update payloads", () => {
    const result = service.validateStoredProposal("update_goal", {
      goalId: "not-a-uuid",
      changes: {},
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects create_goal proposals with invalid hierarchy fields before apply", () => {
    const result = service.validateStoredProposal("create_goal", {
      type: "general_wellness",
      title: "Weekly without weekStart",
      target: {},
      horizon: "weekly",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("goal: weekStart is required when horizon is weekly.");
  });

  it("rejects create_goal proposals without a quarterly parent", () => {
    const result = service.validateStoredProposal("create_goal", {
      type: "general_wellness",
      title: "Weekly without parent",
      target: {},
      horizon: "weekly",
      weekStart: "2026-05-25",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("goal: parentGoalId is required when horizon is weekly.");
  });

  it("rejects create_goal proposals that exceed active quarterly caps", async () => {
    const quarterlyGoalId = "44444444-4444-4444-8444-444444444444";
    const goalService = createService({}, {}, {}, {}, {}, {
      listByUserId: async () => [
        {
          id: quarterlyGoalId,
          userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
          type: "general_wellness",
          status: "active",
          priority: "primary",
          title: "Existing quarterly",
          target: {},
          horizon: "quarterly",
          parentGoalId: null,
          weekStart: null,
          startDate: "2026-05-01",
          targetDate: "2026-07-31",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });

    const errors = await goalService.validateGoalProposalHierarchy(
      "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      "create_goal",
      {
        type: "general_wellness",
        title: "Another quarterly",
        target: {},
        horizon: "quarterly",
      },
    );

    expect(errors).toContain("goal: At most 1 active quarterly goal is allowed.");
  });

  it("rejects create_goal proposals with invalid owned parent hierarchy", async () => {
    const weeklyParentId = "33333333-3333-4333-8333-333333333333";
    const goalService = createService({}, {}, {}, {}, {}, {
      listByUserId: async () => [
        {
          id: weeklyParentId,
          userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
          type: "general_wellness",
          status: "active",
          priority: "secondary",
          title: "Existing weekly focus",
          target: {},
          horizon: "weekly",
          parentGoalId: "44444444-4444-4444-8444-444444444444",
          weekStart: "2026-05-25",
          startDate: null,
          targetDate: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });

    const errors = await goalService.validateGoalProposalHierarchy(
      "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      "create_goal",
      {
        type: "general_wellness",
        title: "Daily walk",
        target: {},
        horizon: "weekly",
        weekStart: "2026-05-25",
        parentGoalId: weeklyParentId,
      },
    );

    expect(errors).toContain(
      "goal: weekly goals must reference an active quarterly parent goal.",
    );
  });

  it("rejects update_goal proposals after merging persisted hierarchy state", async () => {
    const weeklyGoalId = "33333333-3333-4333-8333-333333333333";
    const quarterlyGoalId = "44444444-4444-4444-8444-444444444444";
    const goalService = createService({}, {}, {}, {}, {}, {
      listByUserId: async () => [
        {
          id: weeklyGoalId,
          userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
          type: "general_wellness",
          status: "active",
          priority: "secondary",
          title: "Existing weekly focus",
          target: {},
          horizon: "weekly",
          parentGoalId: quarterlyGoalId,
          weekStart: "2026-05-25",
          startDate: null,
          targetDate: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
        {
          id: quarterlyGoalId,
          userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
          type: "general_wellness",
          status: "active",
          priority: "primary",
          title: "Existing quarterly goal",
          target: {},
          horizon: "quarterly",
          parentGoalId: null,
          weekStart: null,
          startDate: "2026-05-01",
          targetDate: "2026-07-31",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });

    const errors = await goalService.validateGoalProposalHierarchy(
      "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      "update_goal",
      {
        goalId: weeklyGoalId,
        changes: {
          weekStart: null,
        },
      },
    );

    expect(errors).toContain("goal: weekStart is required when horizon is weekly.");
  });

  it("rejects update_goal proposals for goals not owned by the user", async () => {
    const goalService = createService({}, {}, {}, {}, {}, {
      listByUserId: async () => [],
    });

    const errors = await goalService.validateGoalProposalHierarchy(
      "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      "update_goal",
      {
        goalId: "33333333-3333-4333-8333-333333333333",
        changes: {
          title: "Rename goal",
        },
      },
    );

    expect(errors).toEqual(["proposedChanges.goalId: Goal was not found for this user."]);
  });

  it("rejects today checklist proposals with unsupported source refs", () => {
    const result = service.validateStoredProposal("create_today_checklist", {
      date: "2026-05-22",
      items: [
        {
          label: "Workout",
          kind: "workout",
          source: {
            type: "workout_session",
            id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
          },
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("weekly_focus or goal"))).toBe(true);
  });

  it("rejects today checklist proposals when goal source refs are not owned", async () => {
    const todayService = createService({}, {}, {}, {}, {}, {
      listByUserId: async () => [],
    });

    const errors = await todayService.validateTodayChecklistGoalSourceRefs(
      "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      "create_today_checklist",
      {
        date: "2026-05-22",
        items: [
          {
            label: "Walk after lunch",
            kind: "habit",
            source: {
              type: "goal",
              id: "44444444-4444-4444-8444-444444444444",
            },
          },
        ],
      },
    );

    expect(errors[0]).toMatch(/Referenced goal was not found/);
  });

  it("rejects today checklist goal source refs with the wrong horizon or status", async () => {
    const todayService = createService({}, {}, {}, {}, {}, {
      listByUserId: async () => [
        {
          id: "33333333-3333-4333-8333-333333333333",
          userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
          type: "general_wellness",
          status: "paused",
          priority: "secondary",
          title: "Paused weekly focus",
          target: {},
          horizon: "weekly",
          parentGoalId: "44444444-4444-4444-8444-444444444444",
          weekStart: "2026-05-25",
          startDate: null,
          targetDate: null,
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
          type: "general_wellness",
          status: "active",
          priority: "primary",
          title: "Active quarterly goal",
          target: {},
          horizon: "quarterly",
          parentGoalId: null,
          weekStart: null,
          startDate: "2026-05-01",
          targetDate: "2026-07-31",
          createdAt: new Date("2026-05-01T00:00:00.000Z"),
          updatedAt: new Date("2026-05-01T00:00:00.000Z"),
        },
      ],
    });

    const errors = await todayService.validateTodayChecklistGoalSourceRefs(
      "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      "create_today_checklist",
      {
        date: "2026-05-22",
        items: [
          {
            label: "Walk after lunch",
            kind: "habit",
            source: {
              type: "goal",
              id: "33333333-3333-4333-8333-333333333333",
            },
          },
          {
            label: "Mobility reset",
            kind: "recovery",
            source: {
              type: "weekly_focus",
              id: "44444444-4444-4444-8444-444444444444",
            },
          },
        ],
      },
    );

    expect(errors).toEqual([
      "proposedChanges.items[0].source.id: Goal source refs must point to an active quarterly goal.",
      "proposedChanges.items[1].source.id: weekly_focus source refs must point to an active weekly goal.",
    ]);
  });

  it("validates nutrition and today payloads by intent", () => {
    expect(
      service.validateStoredProposal("create_nutrition_plan", {
        title: "Balanced base",
        summary: "Moderate macros and hydration.",
        caloriesPerDay: 2200,
        proteinGrams: 140,
        carbsGrams: 220,
        fatGrams: 70,
        hydrationLiters: 2.5,
        mealStructure: [{ label: "Breakfast", timingHint: null }],
        preferences: [],
        restrictions: [],
        notes: [],
      }).valid,
    ).toBe(true);

    expect(
      service.validateStoredProposal("create_today_checklist", {
        date: "2026-05-22",
        items: [{ label: "Drink water", kind: "hydration" }],
      }).valid,
    ).toBe(true);
  });

  it("rejects today checklist proposals with invalid dates or empty items", () => {
    expect(
      service.validateStoredProposal("create_today_checklist", {
        date: "05/22/2026",
        items: [{ label: "Drink water", kind: "hydration" }],
      }).valid,
    ).toBe(false);

    expect(
      service.validateStoredProposal("create_today_checklist", {
        date: "2026-05-22",
        items: [],
      }).valid,
    ).toBe(false);
  });

  it("rejects nutrition proposals without meal structure", () => {
    const result = service.validateStoredProposal("adjust_nutrition_plan", {
      title: "Balanced base",
      summary: "Missing meal structure.",
      caloriesPerDay: 2200,
      proteinGrams: 140,
      carbsGrams: 220,
      fatGrams: 70,
      hydrationLiters: 2.5,
      mealStructure: [],
      notes: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects nutrition proposals without any daily targets", () => {
    const result = service.validateStoredProposal("create_nutrition_plan", {
      title: "Balanced base",
      summary: "Missing targets.",
      caloriesPerDay: null,
      proteinGrams: null,
      carbsGrams: null,
      fatGrams: null,
      hydrationLiters: null,
      mealStructure: [{ label: "Breakfast", timingHint: null }],
      notes: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "nutrition: At least one daily target (calories, macros, or hydration) is required.",
    );
  });

  // ── C1: per-meal kcal fields in nutrition proposals ──────────────

  it("accepts create_nutrition_plan with per-meal C1 fields (kcal, macros, mealTime, dish)", () => {
    const result = service.validateStoredProposal("create_nutrition_plan", {
      title: "Plan with per-meal data",
      summary: "Breakfast and lunch have calorie estimates.",
      caloriesPerDay: 2100,
      proteinGrams: 130,
      carbsGrams: 210,
      fatGrams: 65,
      hydrationLiters: 2.5,
      mealStructure: [
        {
          label: "Breakfast",
          timingHint: "Morning",
          mealTime: "07:30",
          dish: "Oatmeal with berries",
          kcal: 480,
          proteinGrams: 32,
          carbsGrams: 58,
          fatGrams: 14,
        },
        {
          label: "Lunch",
          timingHint: null,
          mealTime: "13:00",
          dish: "Chicken + quinoa",
          kcal: 620,
          proteinGrams: 44,
          carbsGrams: 62,
          fatGrams: 20,
        },
      ],
      preferences: [],
      restrictions: [],
      allergies: [],
      notes: [],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts adjust_nutrition_plan with per-meal C1 fields (C1 additive fields preserve backward compat)", () => {
    const result = service.validateStoredProposal("adjust_nutrition_plan", {
      title: "Updated with per-meal data",
      summary: "All meals now have kcal estimates.",
      caloriesPerDay: 2000,
      proteinGrams: 120,
      carbsGrams: 200,
      fatGrams: 60,
      hydrationLiters: 2.0,
      mealStructure: [
        { label: "Breakfast", timingHint: "Morning", kcal: 450, proteinGrams: 30, carbsGrams: 50, fatGrams: 12 },
        { label: "Dinner", timingHint: "Evening", kcal: 550, dish: "Salmon", mealTime: "20:00" },
      ],
      preferences: [],
      restrictions: [],
      allergies: [],
      notes: [],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects create_nutrition_plan with per-meal kcal exceeding 5000", () => {
    const result = service.validateStoredProposal("create_nutrition_plan", {
      title: "Over-kcal plan",
      summary: "One meal has an out-of-range kcal.",
      caloriesPerDay: 2200,
      proteinGrams: 140,
      carbsGrams: 220,
      fatGrams: 70,
      hydrationLiters: 2.5,
      mealStructure: [
        { label: "Breakfast", timingHint: null, kcal: 5001 },
      ],
      notes: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts create_nutrition_plan with partial per-meal data (only kcal, no macros)", () => {
    // Per-meal macros are optional — only kcal on some slots is valid.
    const result = service.validateStoredProposal("create_nutrition_plan", {
      title: "Partial per-meal plan",
      summary: "Only kcal, no per-meal macros.",
      caloriesPerDay: 1800,
      proteinGrams: 110,
      carbsGrams: 180,
      fatGrams: 55,
      hydrationLiters: 2.0,
      mealStructure: [
        { label: "Breakfast", timingHint: "Morning", kcal: 400 },
        { label: "Lunch", timingHint: null }, // legacy-style, no C1 fields
      ],
      notes: [],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validates recommend_recipes payloads by intent", () => {
    const result = service.validateStoredProposal("recommend_recipes", {
      recommendations: [
        {
          recipeId: "a1000001-0000-4000-8000-000000000001",
          reason: "Fits your breakfast protein target.",
          fitSummary: "Estimated macros align with your active plan.",
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("flags stale nutrition revision references for recommend_recipes proposals", async () => {
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const staleRevisionId = "ad000002-0000-4000-8000-000000000001";
    const activeRevisionId = "ad000003-0000-4000-8000-000000000001";
    const validationService = createService({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {
      findActivePlanByUserId: async () => ({ activeRevisionId }),
      findRevisionOwnedByUser: async (_userId, revisionId) =>
        revisionId === staleRevisionId ? { id: staleRevisionId } : null,
    });

    const errors = await validationService.validateRecipeRecommendationProposalContext(
      userId,
      "recommend_recipes",
      {
        relatedNutritionPlanRevisionId: staleRevisionId,
        recommendations: [
          {
            recipeId: "a1000001-0000-4000-8000-000000000001",
            reason: "Fits your plan.",
            fitSummary: "Estimated macros fit.",
          },
        ],
      },
    );

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("no longer active");
  });

  it("flags owned revision references when no active nutrition plan exists", async () => {
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const ownedRevisionId = "ad000002-0000-4000-8000-000000000001";
    const validationService = createService({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {
      findActivePlanByUserId: async () => null,
      findRevisionOwnedByUser: async (_userId, revisionId) =>
        revisionId === ownedRevisionId ? { id: ownedRevisionId } : null,
    });

    const errors = await validationService.validateRecipeRecommendationProposalContext(
      userId,
      "recommend_recipes",
      {
        relatedNutritionPlanRevisionId: ownedRevisionId,
        recommendations: [
          {
            recipeId: "a1000001-0000-4000-8000-000000000001",
            reason: "Fits your plan.",
            fitSummary: "Estimated macros fit.",
          },
        ],
      },
    );

    expect(errors).toContain(
      "proposedChanges.relatedNutritionPlanRevisionId: Related nutrition plan revision is no longer active.",
    );
  });

  it("flags missing nutrition revision ownership for recommend_recipes proposals", async () => {
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const missingRevisionId = "ad000004-0000-4000-8000-000000000001";
    const validationService = createService({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {
      findActivePlanByUserId: async () => ({
        activeRevisionId: "ad000003-0000-4000-8000-000000000001",
      }),
      findRevisionOwnedByUser: async () => null,
    });

    const errors = await validationService.validateRecipeRecommendationProposalContext(
      userId,
      "recommend_recipes",
      {
        relatedNutritionPlanRevisionId: missingRevisionId,
        recommendations: [
          {
            recipeId: "a1000001-0000-4000-8000-000000000001",
            reason: "Fits your plan.",
            fitSummary: "Estimated macros fit.",
          },
        ],
      },
    );

    expect(errors).toContain(
      "proposedChanges.relatedNutritionPlanRevisionId: Related nutrition plan revision was not found for this user.",
    );
  });

  it("allows summarize_progress without domain payload schema", () => {
    const result = service.validateStoredProposal("summarize_progress", {});

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validates adapt_workout_plan_from_progress payloads with plan and source refs", () => {
    const result = service.validateStoredProposal("adapt_workout_plan_from_progress", {
      plan: workoutPlan,
      sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
      sourceTrendObservationIds: ["24b19287-75b8-4a3e-9c10-691908479405"],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects progress-derived workout proposals without training days", () => {
    const result = service.validateStoredProposal("adapt_workout_plan_from_progress", {
      plan: {
        title: "Strength base",
        summary: "Missing days.",
        days: [],
      },
      sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects progress-derived workout proposals with malformed source refs", () => {
    const result = service.validateStoredProposal("adapt_workout_plan_from_progress", {
      plan: workoutPlan,
      sourceSummaryId: "not-a-uuid",
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects raw proposals with unsupported intents", () => {
    const result = service.validateRawProposal({
      intent: "diagnose_condition" as never,
      targetDomain: "general",
      title: "Unsafe",
      reason: "Unsafe",
      proposedChanges: {},
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  describe("progress provenance ownership", () => {
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const summaryId = "14a08176-64a7-4a2d-8a44-581807368394";
    const trendId = "24b19287-75b8-4a3e-9c10-691908479405";

    it("accepts owned progress summary and trend references", async () => {
      const provenanceService = createService({
        summaryExistsForUser: async () => true,
        findTrendsOwnedByUser: async () => [{ id: trendId, summaryId }],
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "adapt_workout_plan_from_progress",
        {
          plan: workoutPlan,
          sourceSummaryId: summaryId,
          sourceTrendObservationIds: [trendId],
        },
      );

      expect(errors).toEqual([]);
    });

    it("rejects foreign or missing progress summary references", async () => {
      const provenanceService = createService({
        summaryExistsForUser: async () => false,
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "adapt_workout_plan_from_progress",
        {
          plan: workoutPlan,
          sourceSummaryId: summaryId,
        },
      );

      expect(errors).toContain(
        "proposedChanges.sourceSummaryId: Weekly progress summary was not found for this user.",
      );
    });

    it("rejects foreign or missing trend observation references", async () => {
      const provenanceService = createService({
        summaryExistsForUser: async () => true,
        findTrendsOwnedByUser: async () => [],
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "adapt_workout_plan_from_progress",
        {
          plan: workoutPlan,
          sourceSummaryId: summaryId,
          sourceTrendObservationIds: [trendId],
        },
      );

      expect(errors).toContain(
        "proposedChanges.sourceTrendObservationIds: One or more cited trend observations were not found for this user.",
      );
    });

    it("rejects trend observations that do not belong to the cited summary", async () => {
      const provenanceService = createService({
        summaryExistsForUser: async () => true,
        findTrendsOwnedByUser: async () => [
          { id: trendId, summaryId: "34c29398-86c9-5b4f-ad21-7a2919585046" },
        ],
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "adapt_workout_plan_from_progress",
        {
          plan: workoutPlan,
          sourceSummaryId: summaryId,
          sourceTrendObservationIds: [trendId],
        },
      );

      expect(errors).toContain(
        "proposedChanges.sourceTrendObservationIds: One or more cited trend observations do not belong to the cited weekly progress summary.",
      );
    });

    it("skips provenance checks for other intents", async () => {
      const provenanceService = createService({
        summaryExistsForUser: async () => false,
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "create_workout_plan",
        workoutPlan,
      );

      expect(errors).toEqual([]);
    });

    it("accepts owned progress provenance for nutrition adjustments", async () => {
      const nutritionPlan = {
        title: "Balanced week",
        summary: "Adjusted targets based on weekly adherence patterns.",
        caloriesPerDay: 2200,
        proteinGrams: null,
        carbsGrams: null,
        fatGrams: null,
        hydrationLiters: null,
        mealStructure: [{ label: "Breakfast" }],
      };
      const provenanceService = createService({
        summaryExistsForUser: async () => true,
        findTrendsOwnedByUser: async () => [{ id: trendId, summaryId }],
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "adjust_nutrition_plan",
        {
          plan: nutritionPlan,
          sourceSummaryId: summaryId,
          sourceTrendObservationIds: [trendId],
        },
      );

      expect(errors).toEqual([]);
    });

    it("rejects nutrition adjustments with missing progress summary references", async () => {
      const nutritionPlan = {
        title: "Balanced week",
        summary: "Adjusted targets based on weekly adherence patterns.",
        caloriesPerDay: 2200,
        proteinGrams: null,
        carbsGrams: null,
        fatGrams: null,
        hydrationLiters: null,
        mealStructure: [{ label: "Breakfast" }],
      };
      const provenanceService = createService({
        summaryExistsForUser: async () => false,
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "adjust_nutrition_plan",
        {
          plan: nutritionPlan,
          sourceSummaryId: summaryId,
        },
      );

      expect(errors).toContain(
        "proposedChanges.sourceSummaryId: Weekly progress summary was not found for this user.",
      );
    });

    it("accepts owned progress provenance for habit adaptations", async () => {
      const provenanceService = createService({
        summaryExistsForUser: async () => true,
        findTrendsOwnedByUser: async () => [{ id: trendId, summaryId }],
      });

      const errors = await provenanceService.validateProvenanceOwnership(
        userId,
        "adapt_habit_plan",
        {
          plan: {
            habits: [
              {
                habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
                title: "Morning hydration",
                category: "hydration",
                status: "active",
                schedule: { type: "daily" },
                target: { type: "boolean" },
                required: true,
                displayOrder: 0,
              },
            ],
          },
          sourceSummaryId: summaryId,
          sourceTrendObservationIds: [trendId],
        },
      );

      expect(errors).toEqual([]);
    });
  });

  describe("correlation evidence ownership", () => {
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const signalId = "14a08176-64a7-4a2d-8a44-581807368394";
    const summaryId = "24b19287-75b8-4a3e-9c10-691908479405";

    it("accepts owned approved document signals and weekly progress evidence refs", async () => {
      const evidenceService = createService(
        {
          summaryExistsForUser: async () => true,
        },
        {},
        {},
        {
          findApprovedSignalById: async () => ({ id: signalId }),
          findCorrelationEligibleSignalById: async () => ({ id: signalId }),
        },
      );

      const errors = await evidenceService.validateCorrelationEvidenceOwnership(userId, [
        {
          type: "document_signal",
          id: signalId,
          label: "Energy level from uploaded document",
        },
        {
          type: "weekly_progress_summary",
          id: summaryId,
          label: "Weekly workout completion",
        },
      ]);

      expect(errors).toEqual([]);
    });

    it("rejects evidence refs that are not owned or approved for the user", async () => {
      const evidenceService = createService(
        {
          summaryExistsForUser: async () => false,
        },
        {},
        {},
        {
          findApprovedSignalById: async () => null,
          findCorrelationEligibleSignalById: async () => null,
        },
      );

      const errors = await evidenceService.validateCorrelationEvidenceOwnership(userId, [
        {
          type: "document_signal",
          id: signalId,
          label: "Energy level from uploaded document",
        },
        {
          type: "weekly_progress_summary",
          id: summaryId,
          label: "Weekly workout completion",
        },
      ]);

      expect(errors).toEqual([
        "evidenceRefs[0].id: Approved document signal was not found for this user.",
        "evidenceRefs[1].id: Weekly progress summary was not found for this user.",
      ]);
    });

    it("rejects unverifiable habit adherence evidence refs", async () => {
      const evidenceService = createService();

      const errors = await evidenceService.validateCorrelationEvidenceOwnership(userId, [
        {
          type: "habit_adherence",
          id: "habit-plan:2026-05-15",
          label: "Recent habit adherence",
        },
      ]);

      expect(errors).toEqual([
        "evidenceRefs[0].type: Habit adherence evidence refs cannot be verified yet.",
      ]);
    });

    it("rejects health metric aggregate refs that are not in the user context", async () => {
      const evidenceService = createService(
        {},
        {},
        {},
        {},
        {
          buildSummaryForUser: async () => ({
            items: [
              {
                metricType: "sleep",
                periodStart: "2026-05-15",
                periodEnd: "2026-05-21",
              },
            ],
            generatedAt: "2026-05-22T12:00:00.000Z",
          }),
        },
      );

      const errors = await evidenceService.validateCorrelationEvidenceOwnership(userId, [
        {
          type: "health_metric_aggregate",
          id: "sleep:2026-05-01:2026-05-07",
          label: "Recent sleep summary",
        },
      ]);

      expect(errors).toEqual([
        "evidenceRefs[0].id: Health metric aggregate was not found for this user.",
      ]);
    });
  });

  describe("exercise catalog references", () => {
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const unknownExerciseId = "c1000001-0000-4000-8000-000000000099";

    it("accepts proposals that reference accessible catalog exercises", async () => {
      const exerciseService = createService({}, {
        findInaccessibleExerciseIds: async (exerciseIds) =>
          exerciseIds.filter((id) => id === unknownExerciseId),
      });

      const errors = await exerciseService.validateExerciseReferences(
        userId,
        "adapt_workout_plan",
        workoutPlan,
      );

      expect(errors).toEqual([]);
    });

    it("rejects proposals that reference unknown catalog exercise ids", async () => {
      const exerciseService = createService({}, {
        findInaccessibleExerciseIds: async (exerciseIds) =>
          exerciseIds.filter((id) => id === unknownExerciseId),
      });

      const errors = await exerciseService.validateExerciseReferences(
        userId,
        "create_workout_plan",
        {
          ...workoutPlan,
          days: [
            {
              weekday: "monday",
              focus: "Strength",
              exercises: [
                {
                  ...structuredExercise,
                  exerciseId: unknownExerciseId,
                },
              ],
            },
          ],
        },
      );

      expect(errors).toContain(
        `proposedChanges: exerciseId "${unknownExerciseId}" was not found in the visible exercise catalog.`,
      );
    });

    it("rejects pending exercise refs without matching pendingExercises definitions", () => {
      const result = service.validateStoredProposal("adapt_workout_plan", {
        ...workoutPlan,
        days: [
          {
            weekday: "monday",
            focus: "Strength",
            exercises: [
              {
                pendingExerciseRef: "band-pull-apart",
                snapshot: {
                  name: "Band Pull-Apart",
                  primaryMuscles: ["back"],
                  equipment: ["resistance_band"],
                },
                sets: 3,
                reps: "12",
              },
            ],
          },
        ],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.includes("pendingExercises"))).toBe(true);
    });

    it("accepts proposals with pending exercise refs and matching definitions", () => {
      const result = service.validateStoredProposal("adapt_workout_plan", {
        ...workoutPlan,
        days: [
          {
            weekday: "monday",
            focus: "Strength",
            exercises: [
              {
                pendingExerciseRef: "band-pull-apart",
                snapshot: {
                  name: "Band Pull-Apart",
                  primaryMuscles: ["back"],
                  equipment: ["resistance_band"],
                },
                sets: 3,
                reps: "12",
              },
            ],
          },
        ],
        pendingExercises: {
          "band-pull-apart": {
            name: "Band Pull-Apart",
            aliases: [],
            primaryMuscles: ["back"],
            secondaryMuscles: [],
            equipment: ["resistance_band"],
            movementPatterns: ["pull"],
            modalities: ["strength"],
            difficulty: "beginner",
            instructions: ["Pull the band apart with control."],
            safetyNotes: ["Use a light band."],
            source: "ai_generated",
          },
        },
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("accepts adaptation metadata on workout proposals", () => {
      const result = service.validateStoredProposal("adapt_workout_plan", {
        ...workoutPlan,
        adaptationMetadata: {
          operations: [
            {
              operation: "reduce_load",
              description: "Lower recommended load guidance on Monday.",
              weekday: "monday",
            },
          ],
        },
      });

      expect(result.valid).toBe(true);
    });
  });

  describe("habit plan proposals", () => {
    const habitDefinitionId = "a1000001-0000-4000-8000-000000000001";

    const habitPayload = {
      habits: [
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
      ],
    };

    it("validates create_habit_plan payloads", () => {
      const result = service.validateStoredProposal("create_habit_plan", habitPayload);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("validates adapt_habit_plan payloads", () => {
      const result = service.validateStoredProposal("adapt_habit_plan", habitPayload);

      expect(result.valid).toBe(true);
    });

    it("validates progress-wrapped adapt_habit_plan payloads without emptying habits", () => {
      const result = service.validateStoredProposal("adapt_habit_plan", {
        plan: habitPayload,
        sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
        sourceTrendObservationIds: [],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("rejects habit proposals with invalid proposedChanges shape", () => {
      const result = service.validateStoredProposal("create_habit_plan", {
        habits: [{ title: "Missing fields" }],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("rejects habit proposals with more than twelve active habits", () => {
      const habits = Array.from({ length: 13 }, (_, index) => ({
        habitDefinitionId: `a1000001-0000-4000-8000-${(index + 1).toString(16).padStart(12, "0")}`,
        title: `Habit ${index}`,
        category: "other",
        status: "active",
        schedule: { type: "daily" },
        target: { type: "boolean" },
        required: true,
        displayOrder: index,
      }));

      const result = service.validateStoredProposal("create_habit_plan", { habits });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("habits: At most 12 active habits are allowed.");
    });

    it("rejects create_habit_plan when an active habit plan already exists", async () => {
      const intentService = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          findActivePlanByUserId: async () => ({
            id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
            activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
          }),
        },
      );

      const errors = await intentService.validateHabitPlanProposalState(
        "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        "create_habit_plan",
        habitPayload,
      );

      expect(errors[0]).toMatch(/create_habit_plan requires no active habit plan/);
    });

    it("rejects adapt_habit_plan when no active habit plan exists", async () => {
      const intentService = createService();

      const errors = await intentService.validateHabitPlanProposalState(
        "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        "adapt_habit_plan",
        habitPayload,
      );

      expect(errors[0]).toMatch(/adapt_habit_plan requires an active habit plan/);
    });

    it("rejects adapt_habit_plan when continuity ids are dropped", async () => {
      const currentPayload = habitPayload;
      const proposedPayload = {
        habits: [
          {
            ...habitPayload.habits[0]!,
            habitDefinitionId: "b2000002-0000-4000-8000-000000000002",
          },
        ],
      };
      const intentService = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          findActivePlanByUserId: async () => ({
            id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
            activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
          }),
          findActiveRevisionByPlanId: async () => ({ payload: currentPayload }),
        },
      );

      const errors = await intentService.validateHabitPlanProposalState(
        "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        "adapt_habit_plan",
        proposedPayload,
      );

      expect(errors[0]).toMatch(/must include habitDefinitionId/);
    });

    it("accepts adapt_habit_plan when removed habits are omitted", async () => {
      const currentPayload = {
        habits: [
          habitPayload.habits[0]!,
          {
            ...habitPayload.habits[0]!,
            habitDefinitionId: "b2000002-0000-4000-8000-000000000002",
            title: "Evening walk",
            status: "removed",
            displayOrder: 1,
          },
        ],
      };
      const intentService = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          findActivePlanByUserId: async () => ({
            id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
            activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
          }),
          findActiveRevisionByPlanId: async () => ({ payload: currentPayload }),
        },
      );

      const errors = await intentService.validateHabitPlanProposalState(
        "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        "adapt_habit_plan",
        habitPayload,
      );

      expect(errors).toEqual([]);
    });
  });

  describe("habit template references", () => {
    const hydrationTemplateId = "d1000001-0000-4000-8000-000000000001";

    const habitPayload = {
      habits: [
        {
          habitDefinitionId: "a1000001-0000-4000-8000-000000000001",
          title: "Morning hydration",
          category: "hydration",
          status: "active",
          schedule: { type: "daily" },
          target: { type: "boolean" },
          required: true,
          linkedSource: "nutrition_hydration_target",
          templateId: hydrationTemplateId,
          displayOrder: 0,
        },
      ],
    };

    it("accepts proposals when template references resolve in the catalog", async () => {
      const templateService = createService({}, {}, {
        getHabitTemplateReferenceErrors: async () => [],
      });

      const errors = await templateService.validateHabitTemplateReferences(
        "create_habit_plan",
        habitPayload,
      );

      expect(errors).toEqual([]);
    });

    it("rejects proposals with unknown template ids", async () => {
      const unknownTemplateId = "d1000001-0000-4000-8000-000000000099";
      const templateService = createService({}, {}, {
        getHabitTemplateReferenceErrors: async () => [
          `habits: "Morning hydration" templateId "${unknownTemplateId}" was not found in the active habit template catalog.`,
        ],
      });

      const errors = await templateService.validateHabitTemplateReferences(
        "create_habit_plan",
        {
          habits: [
            {
              ...habitPayload.habits[0],
              templateId: unknownTemplateId,
            },
          ],
        },
      );

      expect(errors[0]).toMatch(/templateId/);
      expect(errors[0]).toMatch(/not found in the active habit template catalog/);
    });

    it("skips template validation for non-habit intents", async () => {
      const templateService = createService({}, {}, {
        getHabitTemplateReferenceErrors: async () => {
          throw new Error("Should not be called.");
        },
      });

      const errors = await templateService.validateHabitTemplateReferences(
        "create_workout_plan",
        habitPayload,
      );

      expect(errors).toEqual([]);
    });
  });

  describe("validateHabitProposalContext", () => {
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const habitDefinitionId = "a1000001-0000-4000-8000-000000000001";
    const hydrationTemplateId = "d1000001-0000-4000-8000-000000000099";

    const habitPayload = {
      habits: [
        {
          habitDefinitionId,
          title: "Morning hydration",
          category: "hydration",
          status: "active",
          schedule: { type: "daily" },
          target: { type: "boolean" },
          required: true,
          templateId: hydrationTemplateId,
          displayOrder: 0,
        },
      ],
    };

    it("combines template reference and plan state validation errors", async () => {
      const contextService = createService(
        {},
        {},
        {
          getHabitTemplateReferenceErrors: async () => [
            `habits: "Morning hydration" templateId "${hydrationTemplateId}" was not found in the active habit template catalog.`,
          ],
        },
        {},
        {},
        {},
        {},
        {},
        {},
        {
          findActivePlanByUserId: async () => ({
            id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
            activeRevisionId: "880099c6-3b5f-4383-8246-97b72bf61818",
          }),
        },
      );

      const errors = await contextService.validateHabitProposalContext(
        userId,
        "create_habit_plan",
        habitPayload,
      );

      expect(errors).toHaveLength(2);
      expect(errors[0]).toMatch(/templateId/);
      expect(errors[1]).toMatch(/create_habit_plan requires no active habit plan/);
    });

    it("returns no errors for non-habit intents", async () => {
      const contextService = createService({}, {}, {
        getHabitTemplateReferenceErrors: async () => {
          throw new Error("Should not be called.");
        },
      });

      const errors = await contextService.validateHabitProposalContext(
        userId,
        "create_workout_plan",
        habitPayload,
      );

      expect(errors).toEqual([]);
    });
  });

  describe("recovery-aware workout adaptations", () => {
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const activeRevisionId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b85";
    const currentPlan = {
      title: "Strength base",
      summary: "Three day plan.",
      days: [
        {
          weekday: "monday",
          focus: "Strength",
          exercises: [structuredExercise],
        },
      ],
    };
    const increasedPlan = {
      ...currentPlan,
      days: [
        ...currentPlan.days,
        {
          weekday: "wednesday",
          focus: "Extra work",
          exercises: [{ ...structuredExercise, sets: 4 }],
        },
      ],
    };

    it("rejects volume increases during prioritize_recovery without override", async () => {
      const recoveryService = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {
          computeAndPersistSnapshot: async () => ({
            id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
            band: "prioritize_recovery",
          }),
        },
        {
          findActivePlanByUserId: async () => ({ activeRevisionId }),
          findRevisionById: async () => ({ payload: currentPlan }),
        },
      );

      const errors = await recoveryService.validateRecoveryAwareWorkoutAdaptation(
        userId,
        "adapt_workout_plan",
        increasedPlan,
      );

      expect(errors.some((error) => error.includes("prioritized"))).toBe(true);
    });

    it("allows volume increases during prioritize_recovery when override is set", async () => {
      const recoveryService = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {
          computeAndPersistSnapshot: async () => ({
            id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
            band: "prioritize_recovery",
          }),
        },
        {
          findActivePlanByUserId: async () => ({ activeRevisionId }),
          findRevisionById: async () => ({ payload: currentPlan }),
        },
      );

      const errors = await recoveryService.validateRecoveryAwareWorkoutAdaptation(
        userId,
        "adapt_workout_plan",
        {
          ...increasedPlan,
          adaptationMetadata: {
            operations: [{ operation: "create", description: "User requested extra day." }],
            allowVolumeIncrease: true,
          },
        },
      );

      expect(errors).toEqual([]);
    });

    it("rejects progress-derived volume increases during prioritize_recovery without override", async () => {
      const recoveryService = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {
          computeAndPersistSnapshot: async () => ({
            id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
            band: "prioritize_recovery",
          }),
        },
        {
          findActivePlanByUserId: async () => ({ activeRevisionId }),
          findRevisionById: async () => ({ payload: currentPlan }),
        },
      );

      const errors = await recoveryService.validateRecoveryAwareWorkoutAdaptation(
        userId,
        "adapt_workout_plan_from_progress",
        {
          plan: increasedPlan,
          sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
          recoverySourceRefs: [
            {
              date: "2026-05-25",
              snapshotId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
            },
          ],
        },
      );

      expect(errors.some((error) => error.includes("allowVolumeIncrease"))).toBe(true);
    });

    it("allows progress-derived volume increases during prioritize_recovery with top-level override", async () => {
      const recoveryService = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {
          computeAndPersistSnapshot: async () => ({
            id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
            band: "prioritize_recovery",
          }),
        },
        {
          findActivePlanByUserId: async () => ({ activeRevisionId }),
          findRevisionById: async () => ({ payload: currentPlan }),
        },
      );

      const errors = await recoveryService.validateRecoveryAwareWorkoutAdaptation(
        userId,
        "adapt_workout_plan_from_progress",
        {
          plan: increasedPlan,
          sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
          recoverySourceRefs: [
            {
              date: "2026-05-25",
              snapshotId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
            },
          ],
          allowVolumeIncrease: true,
        },
      );

      expect(errors).toEqual([]);
    });

    it("rejects stale recovery source refs", async () => {
      const recoveryService = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {
          computeAndPersistSnapshot: async () => ({
            id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b99",
            band: "prioritize_recovery",
          }),
        },
        {
          findActivePlanByUserId: async () => ({ activeRevisionId }),
          findRevisionById: async () => ({ payload: currentPlan }),
        },
      );

      const errors = await recoveryService.validateRecoveryAwareWorkoutAdaptation(
        userId,
        "adapt_workout_plan",
        {
          ...currentPlan,
          adaptationMetadata: {
            operations: [{ operation: "reduce_load", description: "Lower load." }],
            recoverySourceRefs: [
              {
                date: "2026-05-25",
                snapshotId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
              },
            ],
          },
        },
      );

      expect(errors.some((error) => error.includes("stale"))).toBe(true);
    });

    it("rejects stale top-level recovery source refs on progress-derived adaptations", async () => {
      const recoveryService = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {
          computeAndPersistSnapshot: async () => ({
            id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b99",
            band: "moderate_load",
          }),
        },
        {
          findActivePlanByUserId: async () => ({ activeRevisionId }),
          findRevisionById: async () => ({ payload: currentPlan }),
        },
      );

      const errors = await recoveryService.validateRecoveryAwareWorkoutAdaptation(
        userId,
        "adapt_workout_plan_from_progress",
        {
          plan: currentPlan,
          sourceSummaryId: "14a08176-64a7-4a2d-8a44-581807368394",
          recoverySourceRefs: [
            {
              date: "2026-05-25",
              snapshotId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b84",
            },
          ],
        },
      );

      expect(errors).toEqual([
        "proposedChanges.recoverySourceRefs[0].snapshotId: Recovery context snapshot is stale for the cited date.",
      ]);
    });
  });

  describe("action proposal validation", () => {
    it("validates bounded wellbeing check-in payloads", () => {
      const service = createService();

      const result = service.validateStoredProposal("capture_wellbeing_checkin", {
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
        energyLevel: 2,
        note: "Rough day.",
        tags: [],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("rejects wellbeing check-in payloads with out-of-range scores", () => {
      const service = createService();

      const result = service.validateStoredProposal("capture_wellbeing_checkin", {
        date: "2026-05-26",
        moodScore: 6,
        stressScore: 3,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("validates nutrition incident payloads with confidence and provenance", () => {
      const service = createService();

      const result = service.validateStoredProposal("log_nutrition_incident", {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Pizza slice", calories: 280 }],
        estimatedCalories: 280,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
        confidence: "medium",
        provenance: { source: "text_estimate", providerId: "chat_trigger" },
        imageRefs: [],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("rejects low-confidence nutrition incident payloads without userEdits", () => {
      const service = createService();

      const result = service.validateStoredProposal("log_nutrition_incident", {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Pizza slice", calories: 280 }],
        estimatedCalories: 280,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
        confidence: "low",
        provenance: { source: "text_estimate", providerId: "chat_trigger" },
        imageRefs: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "proposedChanges: nutrition_incident: low-confidence estimates require userEdits before acceptance.",
      );
    });

    it("requires saved or completed recipe recommendations for recipe-backed nutrition incidents", async () => {
      const recommendationId = "b2000001-0000-4000-8000-000000000001";
      const validationService = createService({}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {
        findRecommendationById: async () => ({
          recommendation: { status: "pending" },
          recipe: {},
        }),
      });

      const errors = await validationService.validateNutritionIncidentRecipeRecommendationContext(
        "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        "log_nutrition_incident",
        {
          incidentDateTime: "2026-05-26T18:00:00.000Z",
          items: [{ name: "Lentil power bowl", quantity: "1 serving", calories: 690 }],
          estimatedCalories: 690,
          estimatedMacros: { proteinGrams: 48, carbsGrams: 82, fatGrams: 18 },
          confidence: "medium",
          provenance: {
            source: "recipe_recommendation",
            providerId: recommendationId,
          },
          imageRefs: [],
        },
      );

      expect(errors).toContain(
        "proposedChanges.provenance.providerId: Only saved or completed recipe recommendations can be logged as nutrition incidents.",
      );
    });

    it("validates recipe recommendation provenance for nutrition incident payloads", () => {
      const service = createService();

      const result = service.validateStoredProposal("log_nutrition_incident", {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Lentil power bowl", quantity: "1 serving", calories: 690 }],
        estimatedCalories: 690,
        estimatedMacros: { proteinGrams: 48, carbsGrams: 82, fatGrams: 18 },
        confidence: "medium",
        provenance: {
          source: "recipe_recommendation",
          providerId: "b2000001-0000-4000-8000-000000000001",
        },
        imageRefs: [],
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("validates wellbeing check-in date against user timezone", async () => {
      const testUserId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const service = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          findByUserId: async () => ({ timezone: "UTC" }),
        },
      );

      const errors = await service.validateWellbeingCheckinProposalContext(
        testUserId,
        "capture_wellbeing_checkin",
        {
          date: yesterday,
          moodScore: 2,
          stressScore: 3,
        },
      );

      expect(errors).toEqual([
        "proposedChanges.date: Wellbeing check-in date must match the user's current day.",
      ]);
    });

    it("rejects stale wellbeing proposals when today's check-in already exists", async () => {
      const testUserId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
      const today = new Date().toISOString().slice(0, 10);
      const service = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          findByUserId: async () => ({ timezone: "UTC" }),
        },
        {},
        {
          findByUserAndDate: async () => ({ id: "checkin-existing-1" }),
        },
      );

      const errors = await service.validateWellbeingCheckinProposalContext(
        testUserId,
        "capture_wellbeing_checkin",
        {
          date: today,
          moodScore: 2,
          stressScore: 3,
        },
      );

      expect(errors).toContain(
        "proposedChanges.date: A wellbeing check-in already exists for this day and cannot be overwritten by a stale proposal.",
      );
    });

    it("allows idempotent wellbeing accept when appliedReference matches existing check-in", async () => {
      const testUserId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
      const today = new Date().toISOString().slice(0, 10);
      const service = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          findByUserId: async () => ({ timezone: "UTC" }),
        },
        {},
        {
          findByUserAndDate: async () => ({ id: "checkin-existing-1" }),
        },
      );

      const errors = await service.validateWellbeingCheckinProposalContext(
        testUserId,
        "capture_wellbeing_checkin",
        {
          date: today,
          moodScore: 2,
          stressScore: 3,
        },
        { appliedReference: "wellbeing_checkin:checkin-existing-1" },
      );

      expect(errors).toEqual([]);
    });

    it("rejects nutrition incident payloads with unowned image references", async () => {
      const testUserId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
      const service = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          listOwnedFoodPhotoAnalysesByImageRefIds: async () => [],
          findFoodPhotoAnalysisByIdForUser: async () => null,
        },
      );

      const errors = await service.validateNutritionIncidentImageRefOwnership(
        testUserId,
        "log_nutrition_incident",
        {
          incidentDateTime: "2026-05-26T18:00:00.000Z",
          items: [{ name: "Pizza slice", calories: 280 }],
          estimatedCalories: 280,
          estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
          confidence: "medium",
          provenance: {
            source: "dev_stub",
            providerId: "dev_food_photo",
            analysisId: "b1000001-0000-4000-8000-000000000002",
          },
          imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
        },
      );

      expect(errors).toContain(
        "proposedChanges.provenance.analysisId: Food photo analysis was not found for this user.",
      );
      expect(errors).toContain(
        "proposedChanges.imageRefs[0].id: Image reference was not analyzed for this user.",
      );
    });

    it("accepts nutrition incident payloads when image refs are owned analyses", async () => {
      const testUserId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
      const service = createService(
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {
          listOwnedFoodPhotoAnalysesByImageRefIds: async () => [
            {
              analysisId: "b1000001-0000-4000-8000-000000000002",
              imageRefId: "a1000001-0000-4000-8000-000000000001",
            },
          ],
          findFoodPhotoAnalysisByIdForUser: async () => ({
            id: "b1000001-0000-4000-8000-000000000002",
            imageRefId: "a1000001-0000-4000-8000-000000000001",
          }),
        },
      );

      const errors = await service.validateNutritionIncidentImageRefOwnership(
        testUserId,
        "log_nutrition_incident",
        {
          incidentDateTime: "2026-05-26T18:00:00.000Z",
          items: [{ name: "Pizza slice", calories: 280 }],
          estimatedCalories: 280,
          estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
          confidence: "medium",
          provenance: {
            source: "dev_stub",
            providerId: "dev_food_photo",
            analysisId: "b1000001-0000-4000-8000-000000000002",
          },
          imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
        },
      );

      expect(errors).toEqual([]);
    });
  });

  describe("vision_llm_estimate imageRef ownership via chat attachments", () => {
    const userId = "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81";
    const ownedAttachmentId = "a1000001-0000-4000-8000-000000000001";
    const foreignAttachmentId = "a1000002-0000-4000-8000-000000000002";

    const visionLlmPayload = {
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      items: [{ name: "Chicken salad", calories: 450 }],
      estimatedCalories: 450,
      estimatedMacros: { proteinGrams: 35, carbsGrams: 20, fatGrams: 18 },
      confidence: "medium" as const,
      provenance: { source: "vision_llm_estimate" as const },
      imageRefs: [{ id: ownedAttachmentId }],
    };

    it("accepts a vision_llm_estimate proposal whose imageRef is an owned chat attachment", async () => {
      // The owned attachment row returned by chatAttachmentsRepository
      const chatAttachmentsRepository = {
        listByIdsForUser: async (_uid: string, ids: readonly string[]) =>
          ids.includes(ownedAttachmentId)
            ? [{ id: ownedAttachmentId, userId, category: "food_photo", status: "ready" }]
            : [],
      };

      const service = new ProposalValidationService(
        { summaryExistsForUser: async () => true, findTrendsOwnedByUser: async () => [] } as never,
        { findInaccessibleExerciseIds: async () => [] } as never,
        { getHabitTemplateReferenceErrors: async () => [] } as never,
        { findApprovedSignalById: async () => null, findCorrelationEligibleSignalById: async () => null } as never,
        { buildSummaryForUser: async () => ({ items: [], generatedAt: new Date().toISOString() }) } as never,
        { listByUserId: async () => [] } as never,
        { computeAndPersistSnapshot: async () => ({ id: "snap-1", band: "moderate_load" }) } as never,
        { findActivePlanByUserId: async () => null, findRevisionById: async () => null } as never,
        { findByUserId: async () => ({ timezone: "UTC" }) } as never,
        { findActivePlanByUserId: async () => null, findActiveRevisionByPlanId: async () => null } as never,
        { findByUserAndDate: async () => null } as never,
        {
          listOwnedFoodPhotoAnalysesByImageRefIds: async () => [],
          findFoodPhotoAnalysisByIdForUser: async () => null,
          findActivePlanByUserId: async () => null,
          findRevisionOwnedByUser: async () => null,
        } as never,
        { findRecommendationById: async () => null } as never,
        chatAttachmentsRepository as never,
      );

      const errors = await service.validateNutritionIncidentImageRefOwnership(
        userId,
        "log_nutrition_incident",
        visionLlmPayload,
      );

      expect(errors).toEqual([]);
    });

    it("rejects a vision_llm_estimate proposal whose imageRef is NOT an owned chat attachment", async () => {
      // Repository returns empty: the attachment is not owned by this user (IDOR guard)
      const chatAttachmentsRepository = {
        listByIdsForUser: async () => [],
      };

      const service = new ProposalValidationService(
        { summaryExistsForUser: async () => true, findTrendsOwnedByUser: async () => [] } as never,
        { findInaccessibleExerciseIds: async () => [] } as never,
        { getHabitTemplateReferenceErrors: async () => [] } as never,
        { findApprovedSignalById: async () => null, findCorrelationEligibleSignalById: async () => null } as never,
        { buildSummaryForUser: async () => ({ items: [], generatedAt: new Date().toISOString() }) } as never,
        { listByUserId: async () => [] } as never,
        { computeAndPersistSnapshot: async () => ({ id: "snap-1", band: "moderate_load" }) } as never,
        { findActivePlanByUserId: async () => null, findRevisionById: async () => null } as never,
        { findByUserId: async () => ({ timezone: "UTC" }) } as never,
        { findActivePlanByUserId: async () => null, findActiveRevisionByPlanId: async () => null } as never,
        { findByUserAndDate: async () => null } as never,
        {
          listOwnedFoodPhotoAnalysesByImageRefIds: async () => [],
          findFoodPhotoAnalysisByIdForUser: async () => null,
          findActivePlanByUserId: async () => null,
          findRevisionOwnedByUser: async () => null,
        } as never,
        { findRecommendationById: async () => null } as never,
        chatAttachmentsRepository as never,
      );

      const payloadWithForeignRef = {
        ...visionLlmPayload,
        imageRefs: [{ id: foreignAttachmentId }],
      };

      const errors = await service.validateNutritionIncidentImageRefOwnership(
        userId,
        "log_nutrition_incident",
        payloadWithForeignRef,
      );

      expect(errors).toContain(
        `proposedChanges.imageRefs[0].id: Image reference was not found as an owned chat attachment for this user.`,
      );
    });

    it("still rejects food_photo_analysis provenance with unowned analysis records (existing path unchanged)", async () => {
      const chatAttachmentsRepository = {
        listByIdsForUser: async () => [],
      };

      const service = new ProposalValidationService(
        { summaryExistsForUser: async () => true, findTrendsOwnedByUser: async () => [] } as never,
        { findInaccessibleExerciseIds: async () => [] } as never,
        { getHabitTemplateReferenceErrors: async () => [] } as never,
        { findApprovedSignalById: async () => null, findCorrelationEligibleSignalById: async () => null } as never,
        { buildSummaryForUser: async () => ({ items: [], generatedAt: new Date().toISOString() }) } as never,
        { listByUserId: async () => [] } as never,
        { computeAndPersistSnapshot: async () => ({ id: "snap-1", band: "moderate_load" }) } as never,
        { findActivePlanByUserId: async () => null, findRevisionById: async () => null } as never,
        { findByUserId: async () => ({ timezone: "UTC" }) } as never,
        { findActivePlanByUserId: async () => null, findActiveRevisionByPlanId: async () => null } as never,
        { findByUserAndDate: async () => null } as never,
        {
          listOwnedFoodPhotoAnalysesByImageRefIds: async () => [],
          findFoodPhotoAnalysisByIdForUser: async () => null,
          findActivePlanByUserId: async () => null,
          findRevisionOwnedByUser: async () => null,
        } as never,
        { findRecommendationById: async () => null } as never,
        chatAttachmentsRepository as never,
      );

      const errors = await service.validateNutritionIncidentImageRefOwnership(
        userId,
        "log_nutrition_incident",
        {
          incidentDateTime: "2026-05-26T18:00:00.000Z",
          items: [{ name: "Pizza slice", calories: 280 }],
          estimatedCalories: 280,
          estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
          confidence: "medium",
          provenance: {
            source: "food_photo_analysis",
            analysisId: "b1000001-0000-4000-8000-000000000002",
          },
          imageRefs: [{ id: ownedAttachmentId }],
        },
      );

      expect(errors).toContain(
        "proposedChanges.provenance.analysisId: Food photo analysis was not found for this user.",
      );
      expect(errors).toContain(
        "proposedChanges.imageRefs[0].id: Image reference was not analyzed for this user.",
      );
    });
  });
});
