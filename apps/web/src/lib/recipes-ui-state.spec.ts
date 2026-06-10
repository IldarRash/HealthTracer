import { describe, expect, it } from "vitest";
import type { Recipe, UserRecipeRecommendation } from "@health/types";
import {
  canAcceptRecommendation,
  canCompleteRecommendation,
  canDismissRecommendation,
  canLogRecommendation,
  formatIngredientLine,
  formatMacroConfidenceHint,
  formatMacroEstimateSummary,
  formatMealTypeLabel,
  formatPrepTime,
  formatRecipeProvenanceMeta,
  formatRecipeProviderLabel,
  getLimitedReasonCopy,
  isRecommendationVisible,
  isUserOwnedRecipe,
  RECIPE_CONFIDENCE_LABELS,
  recommendationStatusLabel,
  recipeConfidenceNotice,
  rescaleMacros,
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

  describe("isUserOwnedRecipe", () => {
    it("returns true when source is user_created", () => {
      expect(isUserOwnedRecipe({ source: "user_created" })).toBe(true);
    });

    it("returns false for catalog and provider sources", () => {
      expect(isUserOwnedRecipe({ source: "Curated catalog" })).toBe(false);
      expect(isUserOwnedRecipe({ source: "external_provider" })).toBe(false);
      expect(isUserOwnedRecipe({ source: "seed_catalog" })).toBe(false);
    });
  });

  describe("rescaleMacros", () => {
    const baseMacros = {
      estimatedCalories: 400,
      proteinGrams: 30,
      carbsGrams: 50,
      fatGrams: 10,
      fiberGrams: 5,
    };

    it("doubles all macros when target is 2x base servings", () => {
      const result = rescaleMacros(baseMacros, 1, 2);
      expect(result.estimatedCalories).toBe(800);
      expect(result.proteinGrams).toBe(60);
      expect(result.carbsGrams).toBe(100);
      expect(result.fatGrams).toBe(20);
      expect(result.fiberGrams).toBe(10);
    });

    it("halves macros when target is 0.5x base servings", () => {
      const result = rescaleMacros(baseMacros, 2, 1);
      expect(result.estimatedCalories).toBe(200);
      expect(result.proteinGrams).toBe(15);
    });

    it("returns base macros unchanged when servings are equal", () => {
      const result = rescaleMacros(baseMacros, 4, 4);
      expect(result.estimatedCalories).toBe(400);
    });

    it("propagates null fiberGrams without crashing", () => {
      const noFiber = { ...baseMacros, fiberGrams: null };
      const result = rescaleMacros(noFiber, 1, 2);
      expect(result.fiberGrams).toBeNull();
    });

    it("returns base unchanged for zero or negative serving counts", () => {
      const result = rescaleMacros(baseMacros, 0, 2);
      expect(result.estimatedCalories).toBe(400);
      const result2 = rescaleMacros(baseMacros, 1, 0);
      expect(result2.estimatedCalories).toBe(400);
    });

    it("always returns at least 1 calorie per serving", () => {
      const tiny = { ...baseMacros, estimatedCalories: 1 };
      const result = rescaleMacros(tiny, 100, 1);
      expect(result.estimatedCalories).toBeGreaterThanOrEqual(1);
    });

    it("per-serving baseline (baseServings=1) scales linearly with target servings", () => {
      // Regression: the draft defaults portionServings=1 and calls rescaleMacros(perServing, 1, n).
      // At target=1 (default), logged calories must equal exactly one serving.
      const perServing = { estimatedCalories: 600, proteinGrams: 50, carbsGrams: 70, fatGrams: 15, fiberGrams: 8 };
      expect(rescaleMacros(perServing, 1, 1).estimatedCalories).toBe(600);
      expect(rescaleMacros(perServing, 1, 2).estimatedCalories).toBe(1200);
      expect(rescaleMacros(perServing, 1, 3).estimatedCalories).toBe(1800);
      expect(rescaleMacros(perServing, 1, 0.5).estimatedCalories).toBe(300);
      // Protein/carbs/fat also scale linearly
      expect(rescaleMacros(perServing, 1, 2).proteinGrams).toBe(100);
      expect(rescaleMacros(perServing, 1, 2).carbsGrams).toBe(140);
      expect(rescaleMacros(perServing, 1, 2).fatGrams).toBe(30);
    });
  });

  describe("formatMacroConfidenceHint", () => {
    it("returns non-empty hints for all confidence levels", () => {
      expect(formatMacroConfidenceHint("high").length).toBeGreaterThan(0);
      expect(formatMacroConfidenceHint("medium").length).toBeGreaterThan(0);
      expect(formatMacroConfidenceHint("low").length).toBeGreaterThan(0);
    });

    it("low confidence copy contains edit/review language", () => {
      const hint = formatMacroConfidenceHint("low");
      expect(hint.toLowerCase()).toMatch(/edit|review|adjust/);
    });

    it("no confidence hint implies verified nutrition facts", () => {
      for (const level of ["high", "medium", "low"] as const) {
        expect(formatMacroConfidenceHint(level)).not.toMatch(/verified.*fact/i);
      }
    });
  });
});
