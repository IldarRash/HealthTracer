import { describe, expect, it } from "vitest";
import {
  createRecipeNutritionIncidentProposalInputSchema,
  getRecipeRecommendationRevisionErrors,
  recipeConfidenceBandSchema,
  recipeProvenanceSchema,
  RECIPE_MISSING_NUTRITION_REVISION_ERROR,
  RECIPE_STALE_NUTRITION_REVISION_ERROR,
} from "./recipes.js";
import { recipeRecommendationProposalPayloadSchema } from "./index.js";

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
