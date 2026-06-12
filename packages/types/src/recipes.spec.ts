import { describe, expect, it } from "vitest";
import {
  createRecipeNutritionIncidentProposalInputSchema,
  getRecipeRecommendationRevisionErrors,
  recipeConfidenceBandSchema,
  recipeProvenanceSchema,
  RECIPE_MISSING_NUTRITION_REVISION_ERROR,
  RECIPE_STALE_NUTRITION_REVISION_ERROR,
} from "./recipes.js";
import {
  buildRecipeDedupeKeyFromName,
  createRecipeInputSchema,
  normalizeRecipeName,
  recipeRecommendationProposalPayloadSchema,
  updateRecipeInputSchema,
} from "./index.js";

describe("recipe recommendation revision validation", () => {
  const revisionId = "ad000002-0000-4000-8000-000000000001";
  const activeRevisionId = "ad000003-0000-4000-8000-000000000001";

  it("accepts active revision references", () => {
    expect(
      getRecipeRecommendationRevisionErrors(revisionId, {
        activeRevisionId: revisionId,
        revisionOwned: true,
      }),
    ).toEqual([]);
  });

  it("flags stale revision references", () => {
    expect(
      getRecipeRecommendationRevisionErrors(revisionId, {
        activeRevisionId,
        revisionOwned: true,
      }),
    ).toEqual([RECIPE_STALE_NUTRITION_REVISION_ERROR]);
  });

  it("flags missing revision ownership", () => {
    expect(
      getRecipeRecommendationRevisionErrors(revisionId, {
        activeRevisionId,
        revisionOwned: false,
      }),
    ).toEqual([RECIPE_MISSING_NUTRITION_REVISION_ERROR]);
  });

  it("ignores null revision references", () => {
    expect(
      getRecipeRecommendationRevisionErrors(null, {
        activeRevisionId,
        revisionOwned: false,
      }),
    ).toEqual([]);
  });

  it("prioritizes missing ownership over stale revision checks", () => {
    expect(
      getRecipeRecommendationRevisionErrors(revisionId, {
        activeRevisionId,
        revisionOwned: false,
      }),
    ).toEqual([RECIPE_MISSING_NUTRITION_REVISION_ERROR]);
  });

  it("flags owned revision references when no active revision context exists", () => {
    expect(
      getRecipeRecommendationRevisionErrors(revisionId, {
        activeRevisionId: null,
        revisionOwned: true,
      }),
    ).toEqual([RECIPE_STALE_NUTRITION_REVISION_ERROR]);
  });
});

describe("recipe confidence and provenance contracts", () => {
  const recipeId = "a1000001-0000-4000-8000-000000000001";

  it("parses confidence bands and strict provenance metadata", () => {
    expect(recipeConfidenceBandSchema.parse("low")).toBe("low");
    expect(recipeConfidenceBandSchema.safeParse("uncertain").success).toBe(false);

    expect(
      recipeProvenanceSchema.parse({
        source: "external_provider",
        providerId: "themealdb",
        externalId: "52772",
      }),
    ).toMatchObject({
      source: "external_provider",
      providerId: "themealdb",
    });

    expect(
      recipeProvenanceSchema.safeParse({
        source: "seed_catalog",
        healthProfile: "private",
      }).success,
    ).toBe(false);
  });

  it("parses recipe nutrition incident proposal creation input", () => {
    expect(
      createRecipeNutritionIncidentProposalInputSchema.parse({
        threadId: "c4000001-0000-4000-8000-000000000001",
      }).threadId,
    ).toBe("c4000001-0000-4000-8000-000000000001");

    expect(createRecipeNutritionIncidentProposalInputSchema.parse({})).toEqual({});
  });

  it("parses recommend_recipes proposal payloads with optional revision linkage", () => {
    expect(
      recipeRecommendationProposalPayloadSchema.parse({
        relatedNutritionPlanRevisionId: "ad000002-0000-4000-8000-000000000001",
        recommendations: [
          {
            recipeId,
            reason: "Fits your lunch preferences.",
            fitSummary: "Estimated macros align with your active plan.",
          },
        ],
      }).recommendations,
    ).toHaveLength(1);

    expect(
      recipeRecommendationProposalPayloadSchema.safeParse({
        recommendations: [],
      }).success,
    ).toBe(false);
  });
});

describe("createRecipeInputSchema", () => {
  const validInput = {
    name: "Lentil power bowl",
    description: "A balanced bowl with lentils and vegetables.",
    ingredients: [{ name: "Lentils", quantity: 1, unit: "cup" }],
    preparationSteps: ["Cook lentils.", "Add vegetables."],
    servings: 2,
    mealTypes: ["lunch"],
    tags: ["high-protein"],
    restrictionTags: ["vegan"],
    allergenTags: [],
  };

  it("accepts a valid recipe without macroEstimates", () => {
    const result = createRecipeInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    expect(result.data?.macroEstimates).toBeUndefined();
  });

  it("accepts a valid recipe with explicit macroEstimates", () => {
    const result = createRecipeInputSchema.safeParse({
      ...validInput,
      macroEstimates: {
        caloriesPerServing: 500,
        proteinGramsPerServing: 30,
        carbsGramsPerServing: 60,
        fatGramsPerServing: 10,
        fiberGramsPerServing: 8,
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.macroEstimates?.caloriesPerServing).toBe(500);
  });

  it("rejects empty name", () => {
    expect(createRecipeInputSchema.safeParse({ ...validInput, name: "" }).success).toBe(false);
  });

  it("rejects empty ingredients array", () => {
    expect(createRecipeInputSchema.safeParse({ ...validInput, ingredients: [] }).success).toBe(
      false,
    );
  });

  it("rejects ingredients array exceeding max of 50", () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => ({ name: `Ingredient ${i + 1}` }));
    expect(createRecipeInputSchema.safeParse({ ...validInput, ingredients: tooMany }).success).toBe(
      false,
    );
  });

  it("rejects servings of 0", () => {
    expect(createRecipeInputSchema.safeParse({ ...validInput, servings: 0 }).success).toBe(false);
  });

  it("rejects servings exceeding 20", () => {
    expect(createRecipeInputSchema.safeParse({ ...validInput, servings: 21 }).success).toBe(false);
  });

  it("rejects empty mealTypes", () => {
    expect(createRecipeInputSchema.safeParse({ ...validInput, mealTypes: [] }).success).toBe(false);
  });
});

describe("updateRecipeInputSchema", () => {
  it("accepts a partial update with only name", () => {
    const result = updateRecipeInputSchema.safeParse({ name: "Updated Bowl" });
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Updated Bowl");
  });

  it("accepts an empty object (no-op update)", () => {
    expect(updateRecipeInputSchema.safeParse({}).success).toBe(true);
  });

  it("accepts partial macroEstimates override", () => {
    const result = updateRecipeInputSchema.safeParse({
      macroEstimates: {
        caloriesPerServing: 600,
        proteinGramsPerServing: 40,
        carbsGramsPerServing: 70,
        fatGramsPerServing: 12,
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.macroEstimates?.caloriesPerServing).toBe(600);
  });

  it("rejects servings of 0 when provided", () => {
    expect(updateRecipeInputSchema.safeParse({ servings: 0 }).success).toBe(false);
  });
});

describe("normalizeRecipeName / buildRecipeDedupeKeyFromName", () => {
  it("normalizes names to lowercase with no special chars", () => {
    expect(normalizeRecipeName("Chicken & Rice Bowl!")).toBe("chicken rice bowl");
  });

  it("collapses repeated spaces", () => {
    expect(normalizeRecipeName("  lentil   bowl  ")).toBe("lentil bowl");
  });

  it("buildRecipeDedupeKeyFromName returns normalized name", () => {
    expect(buildRecipeDedupeKeyFromName({ name: "Lentil Power Bowl" })).toBe("lentil power bowl");
  });

  it("same logical recipe names produce the same key", () => {
    expect(buildRecipeDedupeKeyFromName({ name: "Chicken Salad" })).toBe(
      buildRecipeDedupeKeyFromName({ name: "chicken salad" }),
    );
  });
});
