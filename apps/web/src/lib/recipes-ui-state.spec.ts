import { describe, expect, it } from "vitest";
import type { Recipe, UserRecipeRecommendation } from "@health/types";
import {
  canAcceptRecommendation,
  canCompleteRecommendation,
  canDismissRecommendation,
  canLogRecommendation,
  formatIngredientLine,
  formatMacroEstimateSummary,
  formatMealTypeLabel,
  formatPrepTime,
  formatRecipeProvenanceMeta,
  formatRecipeProviderLabel,
  getLimitedReasonCopy,
  isRecommendationVisible,
  RECIPE_CONFIDENCE_LABELS,
  recommendationStatusLabel,
  recipeConfidenceNotice,
  sortRecommendationsByShownAt,
} from "./recipes-ui-state.js";

const sampleRecipe: Recipe = {
  id: "a1000001-0000-4000-8000-000000000001",
  name: "Greek yogurt bowl",
  description: "A quick breakfast with fruit and seeds.",
  ingredients: [{ name: "Greek yogurt", quantity: 1, unit: "cup" }],
  preparationSteps: ["Combine ingredients in a bowl."],
  servings: 1,
  macroEstimates: {
    estimatedCalories: 320,
    proteinGrams: 24,
    carbsGrams: 30,
    fatGrams: 10,
    fiberGrams: 4,
  },
  mealTypes: ["breakfast"],
  tags: ["high-protein"],
  restrictionTags: ["vegetarian"],
  allergenTags: ["dairy"],
  prepMinutes: 5,
  cookMinutes: null,
  source: "Curated catalog",
  provider: "themealdb",
  externalId: "52772",
  confidence: "medium",
  provenance: {
    source: "external_provider",
    providerId: "themealdb",
    externalId: "52772",
  },
  status: "active",
  createdAt: "2026-05-22T12:00:00.000Z",
  updatedAt: "2026-05-22T12:00:00.000Z",
};

describe("recipes UI state", () => {
  it("formats meal labels, prep time, and macro estimate copy", () => {
    expect(formatMealTypeLabel("dinner")).toBe("Dinner");
    expect(formatPrepTime(sampleRecipe)).toBe("5 min prep");
    expect(formatMacroEstimateSummary(sampleRecipe)).toContain("Estimated per serving");
    expect(formatMacroEstimateSummary(sampleRecipe)).toContain("approximate");
  });

  it("formats provider, provenance, and confidence labels", () => {
    expect(formatRecipeProviderLabel(sampleRecipe)).toContain("themealdb");
    expect(formatRecipeProvenanceMeta(sampleRecipe)).toContain("External provider");
    expect(RECIPE_CONFIDENCE_LABELS.medium).toContain("Medium");
    expect(formatRecipeProvenanceMeta({ provenance: { source: "seed_catalog" } })).toContain(
      "Curated catalog",
    );
  });

  it("shows low-confidence caution copy for recipe estimates", () => {
    expect(recipeConfidenceNotice("high")).toBeNull();
    expect(recipeConfidenceNotice("low")).toContain("low-confidence");
  });

  it("formats ingredient lines with quantity and notes", () => {
    expect(formatIngredientLine({ name: "Spinach" })).toBe("Spinach");
    expect(
      formatIngredientLine({
        name: "Olive oil",
        quantity: 1,
        unit: "tbsp",
        notes: "extra virgin",
      }),
    ).toBe("1 tbsp Olive oil (extra virgin)");
  });

  it("maps limited reasons to user-facing copy without target mutation language", () => {
    expect(getLimitedReasonCopy("no_active_nutrition_plan").title).toContain(
      "No active nutrition plan",
    );
    expect(getLimitedReasonCopy("no_compatible_recipes").description).toContain(
      "matched",
    );
    expect(getLimitedReasonCopy("no_compatible_recipes").description).toContain(
      "separate nutrition proposal",
    );
  });

  it("controls recommendation action availability by status", () => {
    expect(canAcceptRecommendation({ status: "pending" })).toBe(true);
    expect(canDismissRecommendation({ status: "pending" })).toBe(true);
    expect(canCompleteRecommendation({ status: "accepted" })).toBe(true);
    expect(canCompleteRecommendation({ status: "pending" })).toBe(false);
    expect(canAcceptRecommendation({ status: "dismissed" })).toBe(false);
    expect(canDismissRecommendation({ status: "completed" })).toBe(false);
    expect(canCompleteRecommendation({ status: "completed" })).toBe(false);
    expect(recommendationStatusLabel("accepted")).toBe("Saved");
  });

  it("allows logging only for saved or completed recommendations", () => {
    expect(canLogRecommendation({ status: "accepted" })).toBe(true);
    expect(canLogRecommendation({ status: "completed" })).toBe(true);
    expect(canLogRecommendation({ status: "pending" })).toBe(false);
    expect(canLogRecommendation({ status: "dismissed" })).toBe(false);
  });

  it("sorts recommendations by shownAt and filters visible statuses", () => {
    const recommendations = [
      {
        id: "1",
        shownAt: "2026-05-20T12:00:00.000Z",
        status: "pending",
      },
      {
        id: "2",
        shownAt: "2026-05-22T12:00:00.000Z",
        status: "dismissed",
      },
      {
        id: "3",
        shownAt: "2026-05-21T12:00:00.000Z",
        status: "accepted",
      },
    ] as UserRecipeRecommendation[];

    const sorted = sortRecommendationsByShownAt(recommendations);
    expect(sorted.map((entry) => entry.id)).toEqual(["2", "3", "1"]);
    expect(recommendations.filter(isRecommendationVisible)).toHaveLength(2);
  });
});
