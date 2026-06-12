import { BadRequestException, NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GENERIC_RECIPE_CATALOG_CATEGORIES } from "./generic-recipe-catalog-categories.js";
import type { ProviderRecipeDraft } from "./recipe-catalog-provider.js";
import type { RecommendationLookupKey } from "./recipes.repository.js";
import { RecipesService } from "./recipes.service.js";

const USDA_MACRO_SOURCE =
  "TheMealDB catalog — macros computed from USDA FoodData Central (estimates, not verified nutrition facts)";

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
    caloriesPerServing: 690,
    proteinGramsPerServing: 48,
    carbsGramsPerServing: 82,
    fatGramsPerServing: 18,
    fiberGramsPerServing: 14,
    mealTypes: ["lunch"],
    tags: ["high-protein"],
    restrictionTags: ["vegan"],
    allergenTags: [],
    prepMinutes: 15,
    cookMinutes: 10,
    source: "Curated catalog",
    provider: null,
    externalId: null,
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

function createProviderDraft(overrides: Partial<ProviderRecipeDraft> = {}): ProviderRecipeDraft {
  return {
    provider: "themealdb",
    externalId: "52772",
    name: "Vegetable curry",
    description: "Vegetable curry from TheMealDB (Vegetarian). Macro values computed from USDA FoodData Central (estimates, not verified nutrition facts).",
    ingredients: [{ name: "Mixed vegetables", quantity: null, unit: null }],
    preparationSteps: ["Simmer vegetables with spices."],
    servings: 1,
    macroEstimates: {
      caloriesPerServing: 320,
      proteinGramsPerServing: 12,
      carbsGramsPerServing: 38,
      fatGramsPerServing: 10,
      fiberGramsPerServing: 6,
    },
    mealTypes: ["lunch", "dinner"],
    tags: ["vegetarian"],
    restrictionTags: ["plant_based"],
    allergenTags: [],
    prepMinutes: null,
    cookMinutes: null,
    source: USDA_MACRO_SOURCE,
    confidence: "low",
    provenance: {
      source: "external_provider",
      providerId: "themealdb",
      externalId: "52772",
    },
    ...overrides,
  };
}

const threadId = "c4000001-0000-4000-8000-000000000001";
const nutritionIncidentProposalId = "d5000001-0000-4000-8000-000000000001";

function createService({
  recipesRepository = {},
  nutritionRepository = {},
  profilesRepository = {},
  usersService = {},
  proposalsRepository = {},
  proposalValidationService = {},
  recipeCatalogProvider = {},
}: {
  recipesRepository?: Record<string, unknown>;
  nutritionRepository?: Record<string, unknown>;
  profilesRepository?: Record<string, unknown>;
  usersService?: Record<string, unknown>;
  proposalsRepository?: Record<string, unknown>;
  proposalValidationService?: Record<string, unknown>;
  recipeCatalogProvider?: Record<string, unknown>;
} = {}) {
  const service = new RecipesService(
    {
      listActiveRecipes: async () => [],
      findActiveRecipeById: async () => null,
      findActiveRecipesByIds: async () => [],
      countActiveProviderRecipes: async () => 1,
      listActiveCuratedRecipeNames: async () => [],
      listRecommendationsByUserId: async () => [],
      findRecommendationById: async () => null,
      createRecommendations: async () => [],
      findOpenRecommendationsByKeys: async () => [],
      upsertProviderRecipes: async () => [],
      updateRecommendationStatus: async () => null,
      findUserRecipeByDedupeKey: async () => null,
      findOwnedRecipeById: async () => null,
      createUserRecipe: async () => null,
      updateUserRecipe: async () => null,
      softDeleteUserRecipe: async () => null,
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
    {
      findThreadById: async () => null,
      createThreadForUser: async () => ({
        id: threadId,
        userId: user.id,
        title: "Recipe food log",
        createdAt: new Date("2026-05-22T12:00:00.000Z"),
        updatedAt: new Date("2026-05-22T12:00:00.000Z"),
      }),
      createPendingProposal: async (
        proposalUserId: string,
        proposalThreadId: string,
        _sourceMessageId: string | null,
        proposal: { intent: string; proposedChanges: unknown },
        validationStatus: string,
        validationErrors: string[],
      ) => ({
        id: nutritionIncidentProposalId,
        userId: proposalUserId,
        threadId: proposalThreadId,
        sourceMessageId: null,
        intent: proposal.intent,
        targetDomain: "nutrition",
        title: "Log Lentil power bowl",
        reason: "Review estimate",
        evidenceRefs: null,
        proposedChanges: proposal.proposedChanges,
        status: "pending",
        validationStatus,
        validationErrors,
        userDecisionAt: null,
        appliedReference: null,
        createdAt: new Date("2026-05-26T18:00:00.000Z"),
        updatedAt: new Date("2026-05-26T18:00:00.000Z"),
      }),
      ...proposalsRepository,
    } as never,
    {
      validateRawProposal: () => ({ valid: true, errors: [] }),
      validateNutritionIncidentImageRefOwnership: async () => [],
      validateNutritionIncidentRecipeRecommendationContext: async () => [],
      ...proposalValidationService,
    } as never,
    {
      providerName: "themealdb",
      fetchByGenericCategories: async () => [],
      ...recipeCatalogProvider,
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

  it("reuses existing open recommendations instead of creating duplicates on regenerate", async () => {
    const existingRecommendation = createRecommendationRow({
      reason: "Previously generated recommendation.",
      fitSummary: "Existing fit summary.",
    });
    let createRecommendationsCalled = false;
    const service = createService({
      recipesRepository: {
        listActiveRecipes: async () => [createRecipeRow()],
        findOpenRecommendationsByKeys: async (_userId: string, keys: RecommendationLookupKey[]) => {
          expect(keys).toEqual([
            {
              recipeId: compatibleRecipeId,
              relatedNutritionPlanRevisionId: nutritionRevisionId,
            },
          ]);

          return [existingRecommendation];
        },
        createRecommendations: async () => {
          createRecommendationsCalled = true;
          return [];
        },
      },
    });

    const result = await service.generateCurrentRecommendations(auth);

    expect(createRecommendationsCalled).toBe(false);
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.id).toBe(recommendationId);
    expect(result.recommendations[0]?.recipeId).toBe(compatibleRecipeId);
    expect(result.recommendations[0]?.reason).toBe("Previously generated recommendation.");
    expect(result.relatedNutritionPlanRevisionId).toBe(nutritionRevisionId);
    expect(result.limitedReason).toBeNull();
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

  it("validates proposal recipes against referenced revision filters, not the active revision", async () => {
    let createRecommendationsCalled = false;
    const referencedRevisionPayload = {
      ...activeNutritionPayload,
      allergies: ["peanuts"],
    };
    const activeRevisionPayload = {
      ...activeNutritionPayload,
      allergies: [],
    };
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
      nutritionRepository: {
        findActiveRevisionByPlanId: async () => ({
          id: nutritionRevisionId,
          nutritionPlanId,
          revisionNumber: 2,
          reason: "Updated plan",
          source: "ai_proposal",
          payload: activeRevisionPayload,
          createdAt: new Date("2026-05-22T13:00:00.000Z"),
        }),
        findRevisionOwnedByUser: async () => ({
          id: nutritionRevisionId,
          nutritionPlanId,
          revisionNumber: 1,
          reason: "Initial plan",
          source: "ai_proposal",
          payload: referencedRevisionPayload,
          createdAt: new Date("2026-05-22T12:00:00.000Z"),
        }),
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

  it("reuses existing open recommendations instead of creating duplicates on proposal apply", async () => {
    const existingRecommendation = createRecommendationRow({
      reason: "Previously applied recommendation.",
      fitSummary: "Existing fit summary.",
    });
    let createRecommendationsCalled = false;
    const service = createService({
      recipesRepository: {
        findActiveRecipesByIds: async () => [createRecipeRow()],
        findOpenRecommendationsByKeys: async (_userId: string, keys: RecommendationLookupKey[]) => {
          expect(keys).toEqual([
            {
              recipeId: compatibleRecipeId,
              relatedNutritionPlanRevisionId: nutritionRevisionId,
            },
          ]);

          return [existingRecommendation];
        },
        createRecommendations: async () => {
          createRecommendationsCalled = true;
          return [];
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

    expect(createRecommendationsCalled).toBe(false);
    expect(reference).toBe(`recipe_recommendation:${recommendationId}`);
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

  it("returns no_active_nutrition_plan without calling the external catalog provider", async () => {
    let providerCalled = false;
    const service = createService({
      nutritionRepository: {
        findActivePlanByUserId: async () => null,
      },
      recipeCatalogProvider: {
        fetchByGenericCategories: async () => {
          providerCalled = true;
          return [];
        },
      },
    });

    const result = await service.generateCurrentRecommendations(auth);

    expect(result.limitedReason).toBe("no_active_nutrition_plan");
    expect(result.recommendations).toEqual([]);
    expect(providerCalled).toBe(false);
  });

  it("returns no_compatible_recipes when catalog and provider data are all filtered out", async () => {
    const incompatibleRecipe = createRecipeRow({
      id: incompatibleRecipeId,
      name: "Peanut tempeh bowl",
      allergenTags: ["peanuts"],
    });
    let upsertCalled = false;
    const service = createService({
      recipesRepository: {
        listActiveRecipes: async () => [incompatibleRecipe],
        upsertProviderRecipes: async () => {
          upsertCalled = true;
          return [];
        },
      },
      recipeCatalogProvider: {
        fetchByGenericCategories: async () => [
          createProviderDraft({
            externalId: "99999",
            name: "Peanut stew",
            ingredients: [{ name: "Peanut butter", quantity: null, unit: null }],
            allergenTags: ["peanuts"],
          }),
        ],
      },
    });

    const result = await service.generateCurrentRecommendations(auth);

    expect(result.limitedReason).toBe("no_compatible_recipes");
    expect(result.recommendations).toEqual([]);
    expect(upsertCalled).toBe(true);
  });

  it("upserts provider catalog drafts before scoring compatible recommendations", async () => {
    const providerRecipeId = "c4000001-0000-4000-8000-000000000001";
    const providerDraft = createProviderDraft();
    const providerRecipeRow = createRecipeRow({
      id: providerRecipeId,
      name: providerDraft.name,
      description: providerDraft.description,
      ingredients: providerDraft.ingredients,
      preparationSteps: providerDraft.preparationSteps,
      caloriesPerServing: providerDraft.macroEstimates.caloriesPerServing,
      proteinGramsPerServing: providerDraft.macroEstimates.proteinGramsPerServing,
      carbsGramsPerServing: providerDraft.macroEstimates.carbsGramsPerServing,
      fatGramsPerServing: providerDraft.macroEstimates.fatGramsPerServing,
      fiberGramsPerServing: providerDraft.macroEstimates.fiberGramsPerServing,
      mealTypes: providerDraft.mealTypes,
      tags: providerDraft.tags,
      restrictionTags: providerDraft.restrictionTags,
      allergenTags: providerDraft.allergenTags,
      source: providerDraft.source,
      provider: providerDraft.provider,
      externalId: providerDraft.externalId,
    });
    let fetchedCategories: readonly string[] | undefined;
    let upsertInputs: ProviderRecipeDraft[] | undefined;
    const service = createService({
      recipesRepository: {
        listActiveRecipes: async () => [providerRecipeRow],
        upsertProviderRecipes: async (inputs: ProviderRecipeDraft[]) => {
          upsertInputs = inputs;
          return [providerRecipeRow];
        },
        createRecommendations: async (inputs: unknown[]) =>
          inputs.map((input, index) =>
            createRecommendationRow({
              ...(input as Record<string, unknown>),
              recipeId: providerRecipeId,
              id: `b200000${index + 1}-0000-4000-8000-000000000001`,
            }),
          ),
      },
      recipeCatalogProvider: {
        fetchByGenericCategories: async (categories: readonly string[]) => {
          fetchedCategories = categories;
          return [providerDraft];
        },
      },
    });

    const result = await service.generateCurrentRecommendations(auth);

    expect(fetchedCategories).toEqual(GENERIC_RECIPE_CATALOG_CATEGORIES);
    expect(upsertInputs).toEqual([providerDraft]);
    expect(result.limitedReason).toBeNull();
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.recipeId).toBe(providerRecipeId);
    expect(result.recommendations[0]?.recipe?.source).toBe(USDA_MACRO_SOURCE);
    expect(result.recommendations[0]?.recipe?.confidence).toBe("low");
    expect(result.recommendations[0]?.recipe?.provenance).toMatchObject({
      source: "external_provider",
      providerId: "themealdb",
    });
  });

  it("uses only generic catalog categories for provider fetch and never user health data", async () => {
    const captured: { categories?: readonly string[] } = {};
    const service = createService({
      recipesRepository: {
        listActiveRecipes: async () => [createRecipeRow()],
        createRecommendations: async (inputs: unknown[]) =>
          inputs.map((input) => createRecommendationRow(input as Record<string, unknown>)),
      },
      profilesRepository: {
        findByUserId: async () => ({
          id: "c3000001-0000-4000-8000-000000000001",
          userId: user.id,
          constraints: ["peanuts", "vegan"],
        }),
      },
      recipeCatalogProvider: {
        fetchByGenericCategories: async (categories: readonly string[]) => {
          captured.categories = categories;
          return [];
        },
      },
    });

    await service.generateCurrentRecommendations(auth);

    expect(captured.categories).toEqual(GENERIC_RECIPE_CATALOG_CATEGORIES);
    // User health data (constraints, email, calorie goals) must never leak into
    // provider category fetch calls.  "Vegan" is a legitimate TheMealDB catalog
    // category; the check is scoped to the user's specific constraint value "peanuts".
    const categoriesJson = JSON.stringify(captured.categories);
    expect(categoriesJson).not.toMatch(/peanut|user|email|2100|150|allerg/i);
  });

  it("falls back to the seeded catalog when the external provider fails", async () => {
    const service = createService({
      recipesRepository: {
        listActiveRecipes: async () => [createRecipeRow()],
        createRecommendations: async (inputs: unknown[]) =>
          inputs.map((input) => createRecommendationRow(input as Record<string, unknown>)),
      },
      recipeCatalogProvider: {
        fetchByGenericCategories: async () => {
          throw new Error("provider unavailable");
        },
      },
    });

    const result = await service.generateCurrentRecommendations(auth);

    expect(result.limitedReason).toBeNull();
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]?.recipeId).toBe(compatibleRecipeId);
  });

  it("rejects recipe proposals tied to a stale nutrition revision", async () => {
    const staleRevisionId = "ad000003-0000-4000-8000-000000000001";
    const service = createService({
      recipesRepository: {
        findActiveRecipesByIds: async () => [createRecipeRow()],
      },
      nutritionRepository: {
        findActivePlanByUserId: async () => ({
          id: nutritionPlanId,
          activeRevisionId: nutritionRevisionId,
        }),
        findRevisionOwnedByUser: async (_userId: string, revisionId: string) =>
          revisionId === staleRevisionId
            ? {
                id: staleRevisionId,
                nutritionPlanId,
                revisionNumber: 1,
                reason: "Old plan",
                source: "ai_proposal",
                payload: activeNutritionPayload,
                createdAt: new Date("2026-05-20T12:00:00.000Z"),
              }
            : null,
      },
    });

    await expect(
      service.applyRecipeRecommendationProposal(
        user.id,
        {
          relatedNutritionPlanRevisionId: staleRevisionId,
          recommendations: [
            {
              recipeId: compatibleRecipeId,
              reason: "Fits your plan.",
              fitSummary: "Estimated macros fit.",
            },
          ],
        },
        "Review these recipe ideas.",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("packs chat recipe recommendation proposals from generated recommendations", async () => {
    const service = createService({
      recipesRepository: {
        listActiveRecipes: async () => [createRecipeRow()],
        createRecommendations: async (inputs: unknown[]) =>
          inputs.map((input) => createRecommendationRow(input as Record<string, unknown>)),
      },
    });

    const proposal = await service.packChatRecipeRecommendationProposal(auth);

    expect(proposal?.intent).toBe("recommend_recipes");
    expect(proposal?.proposedChanges).toMatchObject({
      relatedNutritionPlanRevisionId: nutritionRevisionId,
      recommendations: [
        expect.objectContaining({
          recipeId: compatibleRecipeId,
        }),
      ],
    });
  });

  it("returns null chat recipe proposals when no active nutrition plan exists", async () => {
    const service = createService({
      nutritionRepository: {
        findActivePlanByUserId: async () => null,
      },
    });

    await expect(service.packChatRecipeRecommendationProposal(auth)).resolves.toBeNull();
  });

  it("creates pending nutrition incident proposals from saved recipe recommendations", async () => {
    let createCalled = false;
    const service = createService({
      recipesRepository: {
        findRecommendationById: async () => ({
          recommendation: createRecommendationRow({ status: "accepted" }),
          recipe: createRecipeRow(),
        }),
      },
      proposalsRepository: {
        createPendingProposal: async (
          proposalUserId: string,
          proposalThreadId: string,
          _sourceMessageId: string | null,
          proposal: { intent: string; proposedChanges: unknown },
          validationStatus: string,
          validationErrors: string[],
        ) => {
          createCalled = true;
          return {
            id: nutritionIncidentProposalId,
            userId: proposalUserId,
            threadId: proposalThreadId,
            sourceMessageId: null,
            intent: proposal.intent,
            targetDomain: "nutrition",
            title: "Log Lentil power bowl",
            reason: "Review estimate",
            evidenceRefs: null,
            proposedChanges: proposal.proposedChanges,
            status: "pending",
            validationStatus,
            validationErrors,
            userDecisionAt: null,
            appliedReference: null,
            createdAt: new Date("2026-05-26T18:00:00.000Z"),
            updatedAt: new Date("2026-05-26T18:00:00.000Z"),
          };
        },
      },
    });

    const proposal = await service.createNutritionIncidentProposalFromRecommendation(
      auth,
      recommendationId,
    );

    expect(createCalled).toBe(true);
    expect(proposal.status).toBe("pending");
    expect(proposal.intent).toBe("log_nutrition_incident");
    expect(proposal.proposedChanges).toMatchObject({
      provenance: {
        source: "recipe_recommendation",
        providerId: recommendationId,
      },
      estimatedCalories: 690,
      items: [expect.objectContaining({ name: "Lentil power bowl" })],
    });
    expect(proposal.appliedReference).toBeNull();
  });

  it("does not write nutrition incidents when creating recipe log proposals", async () => {
    let incidentWriteCalled = false;
    const service = createService({
      recipesRepository: {
        findRecommendationById: async () => ({
          recommendation: createRecommendationRow({ status: "completed" }),
          recipe: createRecipeRow(),
        }),
      },
      nutritionRepository: {
        createIncident: async () => {
          incidentWriteCalled = true;
          throw new Error("createIncident should not run before accept");
        },
      },
    });

    await service.createNutritionIncidentProposalFromRecommendation(auth, recommendationId);

    expect(incidentWriteCalled).toBe(false);
  });

  it("rejects nutrition incident proposals from pending recommendations", async () => {
    const service = createService({
      recipesRepository: {
        findRecommendationById: async () => ({
          recommendation: createRecommendationRow({ status: "pending" }),
          recipe: createRecipeRow(),
        }),
      },
    });

    await expect(
      service.createNutritionIncidentProposalFromRecommendation(auth, recommendationId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects invalid recipe recommendation status transitions", async () => {
    const service = createService({
      recipesRepository: {
        findRecommendationById: async () => ({
          recommendation: createRecommendationRow({ status: "dismissed" }),
          recipe: createRecipeRow(),
        }),
      },
    });

    await expect(
      service.updateCurrentRecommendationStatus(auth, recommendationId, {
        status: "accepted",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates owned recommendation status through allowed transitions", async () => {
    let updatedStatus: string | undefined;
    const service = createService({
      recipesRepository: {
        findRecommendationById: async () => ({
          recommendation: createRecommendationRow({ status: "pending" }),
          recipe: createRecipeRow(),
        }),
        updateRecommendationStatus: async (
          _userId: string,
          _recommendationId: string,
          status: string,
        ) => {
          updatedStatus = status;
          return createRecommendationRow({ status });
        },
      },
    });

    const result = await service.updateCurrentRecommendationStatus(auth, recommendationId, {
      status: "accepted",
    });

    expect(updatedStatus).toBe("accepted");
    expect(result.status).toBe("accepted");
  });

  it("rejects recipe proposals when the referenced revision is owned but no active plan exists", async () => {
    const ownedRevisionId = "ad000002-0000-4000-8000-000000000001";
    const service = createService({
      recipesRepository: {
        findActiveRecipesByIds: async () => [createRecipeRow()],
      },
      nutritionRepository: {
        findActivePlanByUserId: async () => null,
        findRevisionOwnedByUser: async (_userId: string, revisionId: string) =>
          revisionId === ownedRevisionId
            ? {
                id: ownedRevisionId,
                nutritionPlanId,
                revisionNumber: 1,
                reason: "Old plan",
                source: "ai_proposal",
                payload: activeNutritionPayload,
                createdAt: new Date("2026-05-20T12:00:00.000Z"),
              }
            : null,
      },
    });

    await expect(
      service.applyRecipeRecommendationProposal(
        user.id,
        {
          relatedNutritionPlanRevisionId: ownedRevisionId,
          recommendations: [
            {
              recipeId: compatibleRecipeId,
              reason: "Fits your plan.",
              fitSummary: "Estimated macros fit.",
            },
          ],
        },
        "Review these recipe ideas.",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects recipe proposals when the referenced revision is not owned", async () => {
    const missingRevisionId = "ad000004-0000-4000-8000-000000000001";
    const service = createService({
      recipesRepository: {
        findActiveRecipesByIds: async () => [createRecipeRow()],
      },
      nutritionRepository: {
        findRevisionOwnedByUser: async () => null,
      },
    });

    await expect(
      service.applyRecipeRecommendationProposal(
        user.id,
        {
          relatedNutritionPlanRevisionId: missingRevisionId,
          recommendations: [
            {
              recipeId: compatibleRecipeId,
              reason: "Fits your plan.",
              fitSummary: "Estimated macros fit.",
            },
          ],
        },
        "Review these recipe ideas.",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("marks low-confidence recipe log proposals invalid until accept-time userEdits", async () => {
    const service = createService({
      recipesRepository: {
        findRecommendationById: async () => ({
          recommendation: createRecommendationRow({ status: "accepted" }),
          recipe: createRecipeRow({ confidence: "low" }),
        }),
      },
      proposalValidationService: {
        validateRawProposal: () => ({
          valid: false,
          errors: [
            "proposedChanges: nutrition_incident: low-confidence estimates require userEdits before acceptance.",
          ],
        }),
      },
    });

    const proposal = await service.createNutritionIncidentProposalFromRecommendation(
      auth,
      recommendationId,
    );

    expect(proposal.validationStatus).toBe("invalid");
    expect((proposal.proposedChanges as { confidence?: string }).confidence).toBe("low");
    expect(
      (proposal.proposedChanges as { userEdits?: unknown }).userEdits,
    ).toBeUndefined();
  });

  it("accepts edited payload overrides when provenance matches the recommendation", async () => {
    const service = createService({
      recipesRepository: {
        findRecommendationById: async () => ({
          recommendation: createRecommendationRow({ status: "accepted" }),
          recipe: createRecipeRow(),
        }),
      },
    });

    const proposal = await service.createNutritionIncidentProposalFromRecommendation(
      auth,
      recommendationId,
      {
        proposedChanges: {
          incidentDateTime: "2026-05-26T19:00:00.000Z",
          items: [{ name: "Edited bowl", quantity: "2 servings", calories: 800 }],
          estimatedCalories: 800,
          estimatedMacros: { proteinGrams: 40, carbsGrams: 90, fatGrams: 20 },
          confidence: "medium",
          provenance: {
            source: "recipe_recommendation",
            providerId: recommendationId,
          },
          imageRefs: [],
        },
      },
    );

    expect((proposal.proposedChanges as { items: Array<{ name: string }> }).items[0]?.name).toBe(
      "Edited bowl",
    );
  });

  it("rejects proposedChanges overrides with mismatched recommendation provenance", async () => {
    const service = createService({
      recipesRepository: {
        findRecommendationById: async () => ({
          recommendation: createRecommendationRow({ status: "accepted" }),
          recipe: createRecipeRow(),
        }),
      },
    });

    await expect(
      service.createNutritionIncidentProposalFromRecommendation(auth, recommendationId, {
        proposedChanges: {
          incidentDateTime: "2026-05-26T19:00:00.000Z",
          items: [{ name: "Edited bowl", calories: 800 }],
          estimatedCalories: 800,
          estimatedMacros: { proteinGrams: 40, carbsGrams: 90, fatGrams: 20 },
          confidence: "medium",
          provenance: {
            source: "recipe_recommendation",
            providerId: "other-recommendation-id",
          },
          imageRefs: [],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects nutrition incident proposals from dismissed recommendations", async () => {
    const service = createService({
      recipesRepository: {
        findRecommendationById: async () => ({
          recommendation: createRecommendationRow({ status: "dismissed" }),
          recipe: createRecipeRow(),
        }),
      },
    });

    await expect(
      service.createNutritionIncidentProposalFromRecommendation(auth, recommendationId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not create nutrition incident proposals for recommendations owned by another user", async () => {
    let findUserId: string | undefined;
    let createCalled = false;
    const service = createService({
      recipesRepository: {
        findRecommendationById: async (userId: string) => {
          findUserId = userId;
          return null;
        },
      },
      proposalsRepository: {
        createPendingProposal: async () => {
          createCalled = true;
          throw new Error("createPendingProposal should not run");
        },
      },
    });

    await expect(
      service.createNutritionIncidentProposalFromRecommendation(auth, recommendationId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(findUserId).toBe(user.id);
    expect(createCalled).toBe(false);
  });

  describe("listRecipes browse hydration", () => {
    it("triggers provider hydration when catalog has zero active provider recipes", async () => {
      let providerFetchCalled = false;
      let upsertCalled = false;
      const providerDraft = createProviderDraft();
      const service = createService({
        recipesRepository: {
          countActiveProviderRecipes: async () => 0,
          listActiveRecipes: async () => [createRecipeRow()],
          upsertProviderRecipes: async () => {
            upsertCalled = true;
            return [];
          },
        },
        recipeCatalogProvider: {
          fetchByGenericCategories: async () => {
            providerFetchCalled = true;
            return [providerDraft];
          },
        },
      });

      const result = await service.listRecipes({});

      expect(providerFetchCalled).toBe(true);
      expect(upsertCalled).toBe(true);
      expect(result.recipes).toHaveLength(1);
    });

    it("skips provider hydration when catalog already has active provider recipes", async () => {
      let providerFetchCalled = false;
      const service = createService({
        recipesRepository: {
          countActiveProviderRecipes: async () => 5,
          listActiveRecipes: async () => [createRecipeRow()],
        },
        recipeCatalogProvider: {
          fetchByGenericCategories: async () => {
            providerFetchCalled = true;
            return [];
          },
        },
      });

      const result = await service.listRecipes({});

      expect(providerFetchCalled).toBe(false);
      expect(result.recipes).toHaveLength(1);
    });

    it("logs a warning and degrades to the seeded list when the provider fails during browse", async () => {
      const warnMessages: string[] = [];
      const service = createService({
        recipesRepository: {
          countActiveProviderRecipes: async () => 0,
          listActiveRecipes: async () => [createRecipeRow()],
          upsertProviderRecipes: async () => [],
        },
        recipeCatalogProvider: {
          providerName: "themealdb",
          fetchByGenericCategories: async () => {
            throw new Error("provider network error");
          },
        },
      });

      // Capture the NestJS logger warn output
      const originalWarn = (service as unknown as { logger: { warn: (msg: string) => void } }).logger.warn.bind(
        (service as unknown as { logger: { warn: (msg: string) => void } }).logger,
      );
      (service as unknown as { logger: { warn: (msg: string) => void } }).logger.warn = (msg: string) => {
        warnMessages.push(msg);
        originalWarn(msg);
      };

      const result = await service.listRecipes({});

      expect(result.recipes).toHaveLength(1);
      expect(warnMessages.some((m) => m.includes("themealdb"))).toBe(true);
      expect(warnMessages.some((m) => m.includes("provider network error"))).toBe(true);
    });

    it("deduplicates concurrent browse requests to a single provider import", async () => {
      let fetchCallCount = 0;
      const service = createService({
        recipesRepository: {
          countActiveProviderRecipes: async () => 0,
          listActiveRecipes: async () => [createRecipeRow()],
          upsertProviderRecipes: async () => [],
        },
        recipeCatalogProvider: {
          fetchByGenericCategories: async () => {
            fetchCallCount++;
            return [];
          },
        },
      });

      // Fire two concurrent browse requests
      await Promise.all([service.listRecipes({}), service.listRecipes({})]);

      expect(fetchCallCount).toBe(1);
    });

    describe("empty-result cooldown", () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("skips provider re-fetch on second sequential browse within the cooldown window after an empty hydration", async () => {
        let fetchCallCount = 0;
        const service = createService({
          recipesRepository: {
            countActiveProviderRecipes: async () => 0,
            listActiveRecipes: async () => [createRecipeRow()],
            upsertProviderRecipes: async () => [],
          },
          recipeCatalogProvider: {
            fetchByGenericCategories: async () => {
              fetchCallCount++;
              // Returns empty — triggers cooldown recording
              return [];
            },
          },
        });

        // First browse: provider called, returns empty, cooldown set
        await service.listRecipes({});
        expect(fetchCallCount).toBe(1);

        // Advance time by 2 minutes — still within the 5-minute cooldown
        vi.advanceTimersByTime(2 * 60 * 1000);

        // Second sequential browse: count is still 0 but cooldown active, provider must NOT be called
        await service.listRecipes({});
        expect(fetchCallCount).toBe(1);
      });

      it("skips provider re-fetch on second sequential browse within the cooldown window after a failed hydration", async () => {
        let fetchCallCount = 0;
        const service = createService({
          recipesRepository: {
            countActiveProviderRecipes: async () => 0,
            listActiveRecipes: async () => [createRecipeRow()],
            upsertProviderRecipes: async () => [],
          },
          recipeCatalogProvider: {
            providerName: "themealdb",
            fetchByGenericCategories: async () => {
              fetchCallCount++;
              throw new Error("provider down");
            },
          },
        });

        // First browse: provider throws, cooldown set, browse still returns seeded recipes
        await service.listRecipes({});
        expect(fetchCallCount).toBe(1);

        // Still within cooldown
        vi.advanceTimersByTime(60 * 1000);

        // Second browse: cooldown active — provider not called again
        await service.listRecipes({});
        expect(fetchCallCount).toBe(1);
      });

      it("retries provider fetch after the cooldown window expires", async () => {
        let fetchCallCount = 0;
        const service = createService({
          recipesRepository: {
            countActiveProviderRecipes: async () => 0,
            listActiveRecipes: async () => [createRecipeRow()],
            upsertProviderRecipes: async () => [],
          },
          recipeCatalogProvider: {
            fetchByGenericCategories: async () => {
              fetchCallCount++;
              return [];
            },
          },
        });

        // First browse — empty fetch, cooldown set
        await service.listRecipes({});
        expect(fetchCallCount).toBe(1);

        // Advance past the 5-minute cooldown
        vi.advanceTimersByTime(5 * 60 * 1000 + 1);

        // Third browse after expiry — provider is called again
        await service.listRecipes({});
        expect(fetchCallCount).toBe(2);
      });
    });
  });

  it("generates recommendations with no duplicate canonical names", async () => {
    // Two recipes that normalise to the same canonical key (repeated letter collapse)
    const curatedRow = createRecipeRow({
      id: compatibleRecipeId,
      name: "Fettuccine Alfredo",
      provider: null,
    });
    const providerRow = createRecipeRow({
      id: incompatibleRecipeId,
      name: "Fettucine alfredo",
      provider: "themealdb",
    });
    let createInputs: unknown[] = [];
    const service = createService({
      recipesRepository: {
        listActiveRecipes: async () => [providerRow, curatedRow],
        createRecommendations: async (inputs: unknown[]) => {
          createInputs = inputs;
          return inputs.map((input, index) =>
            createRecommendationRow({
              ...(input as Record<string, unknown>),
              id: `b200000${index + 1}-0000-4000-8000-000000000001`,
            }),
          );
        },
      },
    });

    const result = await service.generateCurrentRecommendations(auth);

    // Only one of the two duplicate-canonical recipes should appear
    expect(result.recommendations).toHaveLength(1);
    // Curated (no provider) must win
    expect(createInputs[0]).toMatchObject({ recipeId: compatibleRecipeId });
  });

  it("incident payload logs 1 serving with per-serving macro values", async () => {
    const recipe = createRecipeRow({
      caloriesPerServing: 690,
      proteinGramsPerServing: 48,
      carbsGramsPerServing: 82,
      fatGramsPerServing: 18,
      fiberGramsPerServing: 14,
    });
    const service = createService({
      recipesRepository: {
        findRecommendationById: async () => ({
          recommendation: createRecommendationRow({ status: "accepted" }),
          recipe,
        }),
      },
    });

    const proposal = await service.createNutritionIncidentProposalFromRecommendation(
      auth,
      recommendationId,
    );

    const changes = proposal.proposedChanges as {
      estimatedCalories: number;
      items: Array<{ quantity: string; calories: number }>;
      estimatedMacros: { proteinGrams: number; carbsGrams: number; fatGrams: number };
    };

    // Calories match per-serving value (not total, not doubled)
    expect(changes.estimatedCalories).toBe(690);
    expect(changes.items).toHaveLength(1);
    expect(changes.items[0]?.quantity).toBe("1 serving");
    expect(changes.items[0]?.calories).toBe(690);
    expect(changes.estimatedMacros.proteinGrams).toBe(48);
    expect(changes.estimatedMacros.carbsGrams).toBe(82);
    expect(changes.estimatedMacros.fatGrams).toBe(18);
  });
});

describe("RecipesService — user-authored recipes", () => {
  const newRecipeInput = {
    name: "Lentil power bowl",
    description: "A balanced bowl.",
    ingredients: [{ name: "Lentils", quantity: 1, unit: "cup" }],
    preparationSteps: ["Cook lentils.", "Add vegetables."],
    servings: 2,
    mealTypes: ["lunch" as const],
    tags: ["high-protein"],
    restrictionTags: ["vegan"],
    allergenTags: [],
  };

  function createUserRecipeRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "a2000001-0000-4000-8000-000000000001",
      name: "Lentil power bowl",
      description: "A balanced bowl.",
      ingredients: [{ name: "Lentils", quantity: 1, unit: "cup" }],
      preparationSteps: ["Cook lentils.", "Add vegetables."],
      servings: 2,
      caloriesPerServing: 180,
      proteinGramsPerServing: 13,
      carbsGramsPerServing: 29,
      fatGramsPerServing: 1,
      fiberGramsPerServing: 7,
      mealTypes: ["lunch"],
      tags: ["high-protein"],
      restrictionTags: ["vegan"],
      allergenTags: [],
      prepMinutes: null,
      cookMinutes: null,
      source: "user_created",
      provider: null,
      externalId: null,
      confidence: "medium",
      provenance: null,
      status: "active",
      userId: user.id,
      dedupeKey: "lentil power bowl",
      createdAt: new Date("2026-06-09T10:00:00.000Z"),
      updatedAt: new Date("2026-06-09T10:00:00.000Z"),
      ...overrides,
    };
  }

  it("computes macros automatically when macroEstimates are omitted", async () => {
    let createInput: unknown;
    const service = createService({
      recipesRepository: {
        createUserRecipe: async (input: unknown) => {
          createInput = input;
          return createUserRecipeRow();
        },
      },
    });

    const result = await service.createRecipe(auth, newRecipeInput);

    expect(result.name).toBe("Lentil power bowl");
    expect((createInput as { confidence: string }).confidence).toMatch(/^(high|medium|low)$/);
    // macros were computed, not provided
    expect((createInput as { macroEstimates: { caloriesPerServing: number } }).macroEstimates.caloriesPerServing).toBeGreaterThan(0);
  });

  it("uses provided macroEstimates and marks confidence high", async () => {
    let createInput: unknown;
    const service = createService({
      recipesRepository: {
        createUserRecipe: async (input: unknown) => {
          createInput = input;
          return createUserRecipeRow({ caloriesPerServing: 500, confidence: "high" });
        },
      },
    });

    await service.createRecipe(auth, {
      ...newRecipeInput,
      macroEstimates: {
        caloriesPerServing: 500,
        proteinGramsPerServing: 30,
        carbsGramsPerServing: 60,
        fatGramsPerServing: 10,
      },
    });

    expect((createInput as { confidence: string }).confidence).toBe("high");
    expect((createInput as { macroEstimates: { caloriesPerServing: number } }).macroEstimates.caloriesPerServing).toBe(500);
  });

  it("returns the existing recipe on dedupe collision without creating a duplicate", async () => {
    const existingRow = createUserRecipeRow();
    let createCalled = false;
    const service = createService({
      recipesRepository: {
        findUserRecipeByDedupeKey: async () => existingRow,
        createUserRecipe: async () => {
          createCalled = true;
          return createUserRecipeRow();
        },
      },
    });

    const result = await service.createRecipe(auth, newRecipeInput);

    expect(createCalled).toBe(false);
    expect(result.id).toBe(existingRow.id);
  });

  it("recomputes macros on update when ingredients change without explicit macroEstimates", async () => {
    const existingRow = createUserRecipeRow();
    let updatedInput: unknown;
    const service = createService({
      recipesRepository: {
        findOwnedRecipeById: async () => existingRow,
        updateUserRecipe: async (_recipeId: string, _userId: string, input: unknown) => {
          updatedInput = input;
          return createUserRecipeRow();
        },
      },
    });

    await service.updateRecipe(auth, existingRow.id, {
      ingredients: [{ name: "Chicken breast", quantity: 200, unit: "g" }],
    });

    // Macros were recomputed because ingredients changed without macroEstimates provided
    expect((updatedInput as { macroEstimates?: { caloriesPerServing: number } }).macroEstimates?.caloriesPerServing).toBeGreaterThan(0);
  });

  it("does not recompute macros on update when neither ingredients nor servings change", async () => {
    const existingRow = createUserRecipeRow();
    let updatedInput: unknown;
    const service = createService({
      recipesRepository: {
        findOwnedRecipeById: async () => existingRow,
        updateUserRecipe: async (_recipeId: string, _userId: string, input: unknown) => {
          updatedInput = input;
          return createUserRecipeRow({ name: "Updated Bowl" });
        },
      },
    });

    await service.updateRecipe(auth, existingRow.id, { name: "Updated Bowl" });

    expect((updatedInput as { macroEstimates?: unknown }).macroEstimates).toBeUndefined();
  });

  it("uses provided macroEstimates on update and marks confidence high", async () => {
    const existingRow = createUserRecipeRow();
    let updatedInput: unknown;
    const service = createService({
      recipesRepository: {
        findOwnedRecipeById: async () => existingRow,
        updateUserRecipe: async (_recipeId: string, _userId: string, input: unknown) => {
          updatedInput = input;
          return createUserRecipeRow({ caloriesPerServing: 700, confidence: "high" });
        },
      },
    });

    await service.updateRecipe(auth, existingRow.id, {
      macroEstimates: {
        caloriesPerServing: 700,
        proteinGramsPerServing: 50,
        carbsGramsPerServing: 80,
        fatGramsPerServing: 15,
      },
    });

    expect((updatedInput as { confidence: string }).confidence).toBe("high");
    expect((updatedInput as { macroEstimates: { caloriesPerServing: number } }).macroEstimates.caloriesPerServing).toBe(700);
  });

  it("throws NotFoundException on update when recipe does not belong to the user", async () => {
    const service = createService({
      recipesRepository: {
        findOwnedRecipeById: async () => null,
      },
    });

    await expect(
      service.updateRecipe(auth, "a2000001-0000-4000-8000-000000000001", { name: "Bad update" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFoundException on delete when recipe does not belong to the user", async () => {
    const service = createService({
      recipesRepository: {
        findOwnedRecipeById: async () => null,
      },
    });

    await expect(
      service.deleteRecipe(auth, "a2000001-0000-4000-8000-000000000001"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("soft-deletes an owned recipe", async () => {
    const existingRow = createUserRecipeRow();
    let softDeletedId: string | undefined;
    const service = createService({
      recipesRepository: {
        findOwnedRecipeById: async () => existingRow,
        softDeleteUserRecipe: async (recipeId: string) => {
          softDeletedId = recipeId;
          return createUserRecipeRow({ status: "archived" });
        },
      },
    });

    await service.deleteRecipe(auth, existingRow.id);

    expect(softDeletedId).toBe(existingRow.id);
  });

  it("listRecipes passes userId so user recipes are included in results", async () => {
    let capturedUserId: string | null | undefined;
    const userRecipeRow = createUserRecipeRow();
    const service = createService({
      recipesRepository: {
        listActiveRecipes: async (_filters: unknown, userId: string | null | undefined) => {
          capturedUserId = userId;
          return [createRecipeRow(), userRecipeRow];
        },
      },
    });

    const result = await service.listRecipes({}, auth);

    expect(capturedUserId).toBe(user.id);
    expect(result.recipes).toHaveLength(2);
  });

  it("listRecipes without auth returns only system/provider recipes (no userId passed)", async () => {
    let capturedUserId: string | null | undefined;
    const service = createService({
      recipesRepository: {
        listActiveRecipes: async (_filters: unknown, userId: string | null | undefined) => {
          capturedUserId = userId;
          return [createRecipeRow()];
        },
      },
    });

    const result = await service.listRecipes({});

    expect(capturedUserId).toBeNull();
    expect(result.recipes).toHaveLength(1);
  });

  describe("computeMacros", () => {
    it("returns macro estimates for a single well-known ingredient", () => {
      const service = createService();
      const result = service.computeMacros({
        ingredients: [{ name: "chicken breast", quantity: 2, unit: "fillet" }],
        servings: 1,
      });

      expect(result.caloriesPerServing).toBeGreaterThan(0);
      expect(result.proteinGramsPerServing).toBeGreaterThanOrEqual(0);
      expect(result.carbsGramsPerServing).toBeGreaterThanOrEqual(0);
      expect(result.fatGramsPerServing).toBeGreaterThanOrEqual(0);
      expect(["high", "medium", "low"]).toContain(result.confidence);
    });

    it("returns low confidence when ingredients are completely unknown", () => {
      const service = createService();
      const result = service.computeMacros({
        ingredients: [{ name: "zx99fantasyfood", quantity: 1, unit: null }],
        servings: 1,
      });

      expect(result.confidence).toBe("low");
      expect(result.caloriesPerServing).toBeGreaterThan(0);
    });

    it("scales results by servings count", () => {
      const service = createService();
      const oneServing = service.computeMacros({
        ingredients: [{ name: "lentils", quantity: 1, unit: "cup" }],
        servings: 1,
      });
      const twoServings = service.computeMacros({
        ingredients: [{ name: "lentils", quantity: 1, unit: "cup" }],
        servings: 2,
      });

      expect(twoServings.caloriesPerServing).toBeLessThan(oneServing.caloriesPerServing + 5);
      expect(twoServings.caloriesPerServing).toBeGreaterThanOrEqual(
        Math.floor(oneServing.caloriesPerServing / 2) - 5,
      );
    });

    it("is pure and synchronous — no repository calls needed", () => {
      const service = createService({
        recipesRepository: {
          listActiveRecipes: async () => { throw new Error("should not be called"); },
        },
      });

      expect(() =>
        service.computeMacros({
          ingredients: [{ name: "oats", quantity: 0.5, unit: "cup" }],
          servings: 1,
        }),
      ).not.toThrow();
    });
  });
});
