import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { RecipesService } from "./recipes.service.js";

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
  createdAt: new Date("2026-05-22T12:00:00.000Z"),
  updatedAt: new Date("2026-05-22T12:00:00.000Z"),
};

const nutritionPlanId = "ad000001-0000-4000-8000-000000000001";
const nutritionRevisionId = "ad000002-0000-4000-8000-000000000001";
const compatibleRecipeId = "a1000001-0000-4000-8000-000000000001";
const incompatibleRecipeId = "a1000002-0000-4000-8000-000000000001";
const recommendationId = "b2000001-0000-4000-8000-000000000001";

const activeNutritionPayload = {
  title: "Balanced vegan plan",
  summary: "A consistent nutrition baseline.",
  caloriesPerDay: 2100,
  proteinGrams: 150,
  carbsGrams: 230,
  fatGrams: 70,
  hydrationLiters: 2.7,
  mealStructure: [{ label: "Breakfast", timingHint: "Morning" }],
  preferences: ["Simple prep"],
  restrictions: ["vegan"],
  allergies: ["peanuts"],
  notes: ["Keep targets stable."],
};

function createRecipeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: compatibleRecipeId,
    name: "Lentil power bowl",
    description: "A balanced bowl with lentils and vegetables.",
    ingredients: [{ name: "Lentils", quantity: 1, unit: "cup" }],
    preparationSteps: ["Combine ingredients in a bowl."],
    servings: 1,
    estimatedCalories: 690,
    proteinGrams: 48,
    carbsGrams: 82,
    fatGrams: 18,
    fiberGrams: 14,
    mealTypes: ["lunch"],
    tags: ["high-protein"],
    restrictionTags: ["vegan"],
    allergenTags: [],
    prepMinutes: 15,
    cookMinutes: 10,
    source: "Curated catalog",
    status: "active",
    createdAt: new Date("2026-05-22T12:00:00.000Z"),
    updatedAt: new Date("2026-05-22T12:00:00.000Z"),
    ...overrides,
  };
}

function createRecommendationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: recommendationId,
    userId: user.id,
    recipeId: compatibleRecipeId,
    relatedNutritionPlanRevisionId: nutritionRevisionId,
    reason: "Fits your active plan.",
    fitSummary: "Estimated macros are a reasonable fit.",
    status: "pending",
    shownAt: new Date("2026-05-22T12:30:00.000Z"),
    decidedAt: null,
    completedAt: null,
    createdAt: new Date("2026-05-22T12:30:00.000Z"),
    updatedAt: new Date("2026-05-22T12:30:00.000Z"),
    ...overrides,
  };
}

function createService({
  recipesRepository = {},
  nutritionRepository = {},
  profilesRepository = {},
  usersService = {},
}: {
  recipesRepository?: Record<string, unknown>;
  nutritionRepository?: Record<string, unknown>;
  profilesRepository?: Record<string, unknown>;
  usersService?: Record<string, unknown>;
} = {}) {
  const service = new RecipesService(
    {
      listActiveRecipes: async () => [],
      findActiveRecipeById: async () => null,
      findActiveRecipesByIds: async () => [],
      listRecommendationsByUserId: async () => [],
      findRecommendationById: async () => null,
      createRecommendations: async () => [],
      updateRecommendationStatus: async () => null,
      ...recipesRepository,
    } as never,
    {
      findActivePlanByUserId: async () => ({
        id: nutritionPlanId,
        activeRevisionId: nutritionRevisionId,
      }),
      findActiveRevisionByPlanId: async () => ({
        id: nutritionRevisionId,
        nutritionPlanId,
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai_proposal",
        payload: activeNutritionPayload,
        createdAt: new Date("2026-05-22T12:00:00.000Z"),
      }),
      findRevisionOwnedByUser: async () => ({
        id: nutritionRevisionId,
        nutritionPlanId,
        revisionNumber: 1,
        reason: "Initial plan",
        source: "ai_proposal",
        payload: activeNutritionPayload,
        createdAt: new Date("2026-05-22T12:00:00.000Z"),
      }),
      ...nutritionRepository,
    } as never,
    {
      findByUserId: async () => ({
        id: "c3000001-0000-4000-8000-000000000001",
        userId: user.id,
        constraints: [],
      }),
      ...profilesRepository,
    } as never,
    {
      resolveFromAuth: async () => user,
      ...usersService,
    } as never,
  );

  return service;
}

describe("RecipesService", () => {
  it("does not update a recipe recommendation owned by another user", async () => {
    let findUserId: string | undefined;
    let updateCalled = false;
    const service = createService({
      recipesRepository: {
        findRecommendationById: async (userId: string) => {
          findUserId = userId;
          return null;
        },
        updateRecommendationStatus: async () => {
          updateCalled = true;
          return createRecommendationRow({ status: "accepted" });
        },
      },
    });

    await expect(
      service.updateCurrentRecommendationStatus(auth, recommendationId, {
        status: "accepted",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findUserId).toBe(user.id);
    expect(updateCalled).toBe(false);
  });

  it("generates recommendations only after hard restriction and allergy filters", async () => {
    const compatibleRecipe = createRecipeRow();
    const incompatibleRecipe = createRecipeRow({
      id: incompatibleRecipeId,
      name: "Peanut yogurt bowl",
      restrictionTags: ["contains_dairy"],
      allergenTags: ["peanuts"],
    });
    const createdInputs: unknown[] = [];
    let nutritionRevisionMutated = false;
    const service = createService({
      recipesRepository: {
        listActiveRecipes: async () => [incompatibleRecipe, compatibleRecipe],
        createRecommendations: async (inputs: unknown[]) => {
          createdInputs.push(...inputs);
          return inputs.map((input, index) =>
            createRecommendationRow({
              ...(input as Record<string, unknown>),
              id: `b200000${index + 1}-0000-4000-8000-000000000001`,
            }),
          );
        },
      },
      nutritionRepository: {
        appendRevision: async () => {
          nutritionRevisionMutated = true;
        },
        createPlanWithRevision: async () => {
          nutritionRevisionMutated = true;
        },
      },
      profilesRepository: {
        findByUserId: async () => ({
          id: "c3000001-0000-4000-8000-000000000001",
          userId: user.id,
          constraints: ["dairy_free"],
        }),
      },
    });

    const result = await service.generateCurrentRecommendations(auth);

    expect(result.limitedReason).toBeNull();
    expect(result.relatedNutritionPlanRevisionId).toBe(nutritionRevisionId);
    expect(result.recommendations.map((recommendation) => recommendation.recipeId)).toEqual([
      compatibleRecipeId,
    ]);
    expect(createdInputs).toEqual([
      expect.objectContaining({
        userId: user.id,
        recipeId: compatibleRecipeId,
        relatedNutritionPlanRevisionId: nutritionRevisionId,
      }),
    ]);
    expect(nutritionRevisionMutated).toBe(false);
  });

  it("applies accepted recipe proposals as pending recommendations without nutrition revision changes", async () => {
    const originalPayload = structuredClone(activeNutritionPayload);
    const createdInputs: unknown[] = [];
    let nutritionRevisionMutated = false;
    const service = createService({
      recipesRepository: {
        findActiveRecipesByIds: async () => [createRecipeRow()],
        createRecommendations: async (inputs: unknown[]) => {
          createdInputs.push(...inputs);
          return inputs.map((input) => createRecommendationRow(input as Record<string, unknown>));
        },
      },
      nutritionRepository: {
        findActiveRevisionByPlanId: async () => ({
          id: nutritionRevisionId,
          nutritionPlanId,
          revisionNumber: 1,
          reason: "Initial plan",
          source: "ai_proposal",
          payload: activeNutritionPayload,
          createdAt: new Date("2026-05-22T12:00:00.000Z"),
        }),
        appendRevision: async () => {
          nutritionRevisionMutated = true;
        },
        createPlanWithRevision: async () => {
          nutritionRevisionMutated = true;
        },
      },
    });

    const reference = await service.applyRecipeRecommendationProposal(
      user.id,
      {
        relatedNutritionPlanRevisionId: nutritionRevisionId,
        recommendations: [
          {
            recipeId: compatibleRecipeId,
            reason: "Fits your current lunch preferences.",
            fitSummary: "Estimated macros are a reasonable fit for your plan.",
          },
        ],
      },
      "Review these recipe ideas.",
    );

    expect(reference).toBe(`recipe_recommendation:${recommendationId}`);
    expect(createdInputs).toEqual([
      {
        userId: user.id,
        recipeId: compatibleRecipeId,
        relatedNutritionPlanRevisionId: nutritionRevisionId,
        reason: "Fits your current lunch preferences.",
        fitSummary: "Estimated macros are a reasonable fit for your plan.",
        status: "pending",
      },
    ]);
    expect(activeNutritionPayload).toEqual(originalPayload);
    expect(nutritionRevisionMutated).toBe(false);
  });

  it("rejects incompatible recipes from accepted recipe proposal payloads", async () => {
    let createRecommendationsCalled = false;
    const service = createService({
      recipesRepository: {
        findActiveRecipesByIds: async () => [
          createRecipeRow({
            id: incompatibleRecipeId,
            name: "Peanut tempeh bowl",
            allergenTags: ["peanuts"],
          }),
        ],
        createRecommendations: async () => {
          createRecommendationsCalled = true;
          return [];
        },
      },
    });

    await expect(
      service.applyRecipeRecommendationProposal(
        user.id,
        {
          relatedNutritionPlanRevisionId: nutritionRevisionId,
          recommendations: [
            {
              recipeId: incompatibleRecipeId,
              reason: "High protein option.",
              fitSummary: "Estimated macros fit your plan.",
            },
          ],
        },
        "Review these recipe ideas.",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(createRecommendationsCalled).toBe(false);
  });
});
