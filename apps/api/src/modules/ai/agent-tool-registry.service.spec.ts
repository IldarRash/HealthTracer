import { describe, expect, it, vi } from "vitest";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";

const auth = {
  clerkUserId: "clerk-user-1",
  email: "test@example.com",
  displayName: "Test User",
};

function createStubContextBudgetPolicyService() {
  return {
    applyBudgetToBuiltSlice: vi.fn((slice: unknown) => slice),
  } as never;
}

function createStubExercisesService(exercises: unknown[] = []) {
  return { listExercises: vi.fn(async () => ({ exercises })) };
}

function createStubRecipesService(recipes: unknown[] = []) {
  return { listRecipes: vi.fn(async () => ({ recipes })) };
}

function createStubWorkoutsService(plan: unknown = null, revision: unknown = null, sessions: unknown[] = []) {
  return { getCurrentActivePlan: vi.fn(async () => ({ plan, activeRevision: revision, sessions })) };
}

function createStubNutritionService(plan: unknown = null, revision: unknown = null) {
  return { getCurrentActivePlan: vi.fn(async () => ({ plan, activeRevision: revision })) };
}

function createService(
  coachingContext: object = {},
  exercisesService?: ReturnType<typeof createStubExercisesService>,
  recipesService?: ReturnType<typeof createStubRecipesService>,
  workoutsService?: ReturnType<typeof createStubWorkoutsService>,
  nutritionService?: ReturnType<typeof createStubNutritionService>,
) {
  return new AgentToolRegistryService(
    coachingContext as never,
    createStubContextBudgetPolicyService(),
    (exercisesService ?? createStubExercisesService()) as never,
    (recipesService ?? createStubRecipesService()) as never,
    (workoutsService ?? createStubWorkoutsService()) as never,
    (nutritionService ?? createStubNutritionService()) as never,
  );
}

describe("AgentToolRegistryService", () => {
  it("lists all six live read-only agent tools (getDocumentContext removed)", () => {
    const service = createService();

    const tools = service.listAvailableTools();
    expect(tools).toEqual([
      "getUserContextSlice",
      "getWeeklyProgressContext",
      "searchExerciseCatalog",
      "searchRecipeCatalog",
      "getActivePlanDetail",
      "getRecentAdherence",
    ]);
    // Regression: getDocumentContext must not be advertised
    expect(tools).not.toContain("getDocumentContext");
  });

  it("returns typed validation errors for unknown tool requests", async () => {
    const service = createService();

    const result = await service.executeTool(auth, {
      tool: "deleteUserData",
      input: {},
    } as never);

    expect(result.ok).toBe(false);
    expect(result.tool).toBe("getUserContextSlice");
    expect(result.errors.some((error) => /tool/i.test(error))).toBe(true);
  });

  it("returns typed validation errors for invalid getUserContextSlice input", async () => {
    const getUserContextSlice = vi.fn();
    const service = createService({ getUserContextSlice });

    const result = await service.executeTool(auth, {
      tool: "getUserContextSlice",
      input: { purpose: "not_a_valid_purpose" },
    });

    expect(result.ok).toBe(false);
    expect(result.tool).toBe("getUserContextSlice");
    expect(result.errors.some((error) => /purpose/i.test(error))).toBe(true);
    expect(getUserContextSlice).not.toHaveBeenCalled();
  });

  it("returns validation errors when getWeeklyProgressContext result shape is invalid", async () => {
    const getUserContextSlice = vi.fn(async () => ({
      purpose: "weekly_review",
      weeklyProgress: { weekStart: "not-a-date" },
    }));

    const service = createService({ getUserContextSlice });

    const result = await service.executeTool(auth, {
      tool: "getWeeklyProgressContext",
      input: {},
    });

    expect(result.ok).toBe(false);
    expect(result.tool).toBe("getWeeklyProgressContext");
    expect(result.errors.some((error) => /weekStart|result/i.test(error))).toBe(true);
  });

  it("loads weekly progress context without document access", async () => {
    const getUserContextSlice = vi.fn(async () => ({
      purpose: "weekly_review",
      weeklyProgress: {
        weekStart: "2026-05-19",
        weekEnd: "2026-05-25",
        dataStatus: "partial",
        userMessage: "You completed 2 of 3 planned workouts this week.",
        trends: [],
      },
    }));

    const service = createService({ getUserContextSlice });

    const result = await service.executeTool(auth, {
      tool: "getWeeklyProgressContext",
      input: {},
    });

    expect(getUserContextSlice).toHaveBeenCalledWith(auth, {
      purpose: "weekly_review",
      includeRawData: false,
      includeDocuments: false,
    });
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      userMessage: "You completed 2 of 3 planned workouts this week.",
    });
  });

  it("getDocumentContext is not accepted as a valid tool name (removed from schema)", async () => {
    const service = createService();

    // agentToolCallRequestSchema no longer has getDocumentContext in its enum,
    // so executeTool must return a validation error without calling any handler.
    const result = await service.executeTool(auth, {
      tool: "getDocumentContext",
      input: {},
    } as never);

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // searchExerciseCatalog
  // ---------------------------------------------------------------------------

  it("searchExerciseCatalog — returns compact exercise items from exercises service", async () => {
    const exerciseId = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const exercisesService = createStubExercisesService([
      {
        id: exerciseId,
        name: "Barbell Squat",
        primaryMuscles: ["quadriceps"],
        equipment: ["barbell"],
        difficulty: "intermediate",
        media: { refs: [{ url: "https://example.com/squat.mp4" }] },
      },
    ]);
    const service = createService({}, exercisesService);

    const result = await service.executeTool(auth, {
      tool: "searchExerciseCatalog",
      input: { query: "squat" },
    });

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      total: 1,
      items: [
        {
          id: exerciseId,
          name: "Barbell Squat",
          primaryMuscles: ["quadriceps"],
          equipment: ["barbell"],
          difficulty: "intermediate",
          hasMedia: true,
        },
      ],
    });
    expect(exercisesService.listExercises).toHaveBeenCalledWith(
      expect.objectContaining({ search: "squat", includeUserCreated: true }),
      auth,
    );
  });

  it("searchExerciseCatalog — silently drops unknown muscle/equipment values (free-text coercion)", async () => {
    const exercisesService = createStubExercisesService([]);
    const service = createService({}, exercisesService);

    // muscle and equipment are free-text strings in the input schema — invalid values
    // are silently dropped by coercion in the handler rather than causing hard errors.
    const result = await service.executeTool(auth, {
      tool: "searchExerciseCatalog",
      input: {
        query: "bench press",
        muscle: "not_a_real_muscle",
        equipment: "not_a_real_equipment",
      },
    });

    expect(result.ok).toBe(true);
    // Invalid free-text values are dropped; service is still called with safe undefined
    const callArgs = (exercisesService.listExercises as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArgs.primaryMuscle).toBeUndefined();
    expect(callArgs.equipment).toBeUndefined();
  });

  it("searchExerciseCatalog — caps results at CATALOG_SEARCH_LIMIT (10)", async () => {
    const manyExercises = Array.from({ length: 20 }, (_, i) => ({
      id: `a0eebc99-9c0b-4ef8-bb6d-6bb9bd38${String(i).padStart(4, "0")}`,
      name: `Exercise ${i}`,
      primaryMuscles: [],
      equipment: [],
      difficulty: null,
      media: null,
    }));
    const exercisesService = createStubExercisesService(manyExercises);
    const service = createService({}, exercisesService);

    const result = await service.executeTool(auth, {
      tool: "searchExerciseCatalog",
      input: {},
    });

    expect(result.ok).toBe(true);
    expect((result.result as { items: unknown[] }).items).toHaveLength(10);
  });

  it("searchExerciseCatalog — only available to workout domain (not in nutrition allowlist)", () => {
    // This is a catalog-level invariant test: the tool must only be wired to workout capabilities.
    // The tool's listAvailableTools() exposes it, but the capability catalog in intent-catalog.ts
    // only grants it to workout-domain capabilities (adjust_workout, create_workout_plan, etc.).
    // We verify the tool name itself is correct (regression: never "getExerciseCatalog").
    const service = createService();
    const tools = service.listAvailableTools();
    expect(tools).toContain("searchExerciseCatalog");
    // Not named with old prefix
    expect(tools).not.toContain("getExerciseCatalog");
  });

  // ---------------------------------------------------------------------------
  // searchRecipeCatalog
  // ---------------------------------------------------------------------------

  it("searchRecipeCatalog — returns compact recipe items from recipes service", async () => {
    const recipeId = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const recipesService = createStubRecipesService([
      {
        id: recipeId,
        name: "Greek Yogurt Bowl",
        mealTypes: ["breakfast"],
        perServingMacros: {
          caloriesPerServing: 320,
          proteinGramsPerServing: 22,
          carbsGramsPerServing: 38,
          fatGramsPerServing: 7,
        },
        tags: ["high_protein"],
        confidence: "high",
      },
    ]);
    const service = createService({}, undefined, recipesService);

    const result = await service.executeTool(auth, {
      tool: "searchRecipeCatalog",
      input: { mealType: "breakfast" },
    });

    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({
      total: 1,
      items: [
        {
          id: recipeId,
          name: "Greek Yogurt Bowl",
          mealTypes: ["breakfast"],
          estimatedCalories: 320,
          proteinGrams: 22,
          confidence: "high",
        },
      ],
    });
    expect(recipesService.listRecipes).toHaveBeenCalledWith(
      expect.objectContaining({ mealType: "breakfast" }),
    );
  });

  it("searchRecipeCatalog — silently drops invalid mealType enum values", async () => {
    const recipesService = createStubRecipesService([]);
    const service = createService({}, undefined, recipesService);

    const result = await service.executeTool(auth, {
      tool: "searchRecipeCatalog",
      input: { mealType: "second_breakfast" },
    });

    expect(result.ok).toBe(true);
    // Invalid mealType dropped; listRecipes called with undefined mealType
    const callArgs = (recipesService.listRecipes as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArgs.mealType).toBeUndefined();
  });

  it("searchRecipeCatalog — not ownership-scoped (public catalog, no auth required)", async () => {
    const recipesService = createStubRecipesService([]);
    const service = createService({}, undefined, recipesService);

    await service.executeTool(auth, {
      tool: "searchRecipeCatalog",
      input: {},
    });

    // listRecipes should NOT receive auth argument — it's a public catalog
    const callArgs = (recipesService.listRecipes as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs).toHaveLength(1); // only the query object, not auth
  });

  // ---------------------------------------------------------------------------
  // getActivePlanDetail
  // ---------------------------------------------------------------------------

  it("getActivePlanDetail workout — returns bounded plan summary", async () => {
    const planId = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const revId = "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const workoutsService = createStubWorkoutsService(
      { id: planId },
      {
        id: revId,
        payload: {
          title: "Push/Pull/Legs",
          days: [
            { dayName: "Monday", exercises: [{ name: "Squat" }] },
            { dayName: "Wednesday", exercises: [{ name: "Deadlift" }] },
          ],
        },
      },
      [{ id: "s1" }, { id: "s2" }],
    );
    const service = createService({}, undefined, undefined, workoutsService);

    const result = await service.executeTool(auth, {
      tool: "getActivePlanDetail",
      input: { domain: "workout" },
    });

    expect(result.ok).toBe(true);
    const detail = result.result as Record<string, unknown>;
    expect(detail.domain).toBe("workout");
    expect(detail.planId).toBe(planId);
    expect(detail.revisionId).toBe(revId);
    expect(detail.title).toBe("Push/Pull/Legs");
    expect(detail.sessionCount).toBe(2);
  });

  it("getActivePlanDetail nutrition — returns bounded plan summary", async () => {
    const nPlanId = "e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const nRevId = "f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    const nutritionService = createStubNutritionService(
      { id: nPlanId },
      {
        id: nRevId,
        payload: {
          title: "Mediterranean Diet",
          caloriesPerDay: 2100,
          proteinGrams: 150,
          carbsGrams: 250,
          fatGrams: 70,
        },
      },
    );
    const service = createService({}, undefined, undefined, undefined, nutritionService);

    const result = await service.executeTool(auth, {
      tool: "getActivePlanDetail",
      input: { domain: "nutrition" },
    });

    expect(result.ok).toBe(true);
    const detail = result.result as Record<string, unknown>;
    expect(detail.domain).toBe("nutrition");
    expect(detail.planId).toBe(nPlanId);
    expect(detail.revisionId).toBe(nRevId);
    expect(detail.title).toBe("Mediterranean Diet");
    expect(detail.caloriesPerDay).toBe(2100);
  });

  it("getActivePlanDetail — returns nulls gracefully when no active plan exists", async () => {
    const workoutsService = createStubWorkoutsService(null, null, []);
    const service = createService({}, undefined, undefined, workoutsService);

    const result = await service.executeTool(auth, {
      tool: "getActivePlanDetail",
      input: { domain: "workout" },
    });

    expect(result.ok).toBe(true);
    const detail = result.result as Record<string, unknown>;
    expect(detail.planId).toBeNull();
    expect(detail.revisionId).toBeNull();
    expect(detail.title).toBeNull();
    expect(detail.summary).toBeNull();
  });

  it("getActivePlanDetail — rejects invalid domain input", async () => {
    const service = createService();

    const result = await service.executeTool(auth, {
      tool: "getActivePlanDetail",
      input: { domain: "medical" },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /domain/i.test(e))).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // getRecentAdherence
  // ---------------------------------------------------------------------------

  it("getRecentAdherence — returns structured adherence summary", async () => {
    const getUserContextSlice = vi.fn(async () => ({
      purpose: "weekly_review",
      recentWorkoutExecution: {
        plannedCount: 3,
        completedCount: 2,
        skippedCount: 1,
        adherencePercent: 67,
      },
      recentHabitAdherence: {
        scheduled: 21,
        completed: 18,
        skipped: 2,
        missed: 1,
        habits: [],
      },
    }));
    const service = createService({ getUserContextSlice });

    const result = await service.executeTool(auth, {
      tool: "getRecentAdherence",
      input: {},
    });

    expect(result.ok).toBe(true);
    const adherence = result.result as Record<string, unknown>;
    expect(adherence.periodDays).toBe(7);
    expect(adherence.workout).toMatchObject({
      plannedCount: 3,
      completedCount: 2,
      adherencePercent: 67,
    });
    expect(adherence.habits).toMatchObject({
      activeCount: 21,
      adherencePercent: 86, // Math.round(18/21 * 100) = 86
    });
  });

  it("getRecentAdherence — is ownership-scoped (passes auth to context slice)", async () => {
    const getUserContextSlice = vi.fn(async () => ({
      purpose: "weekly_review",
    }));
    const service = createService({ getUserContextSlice });

    await service.executeTool(auth, {
      tool: "getRecentAdherence",
      input: {},
    });

    expect(getUserContextSlice).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({ purpose: "weekly_review" }),
    );
  });

  it("getRecentAdherence — returns null workout/habits when context slice has no data", async () => {
    const getUserContextSlice = vi.fn(async () => ({
      purpose: "weekly_review",
    }));
    const service = createService({ getUserContextSlice });

    const result = await service.executeTool(auth, {
      tool: "getRecentAdherence",
      input: {},
    });

    expect(result.ok).toBe(true);
    const adherence = result.result as Record<string, unknown>;
    expect(adherence.workout).toBeNull();
    expect(adherence.habits).toBeNull();
  });
});
