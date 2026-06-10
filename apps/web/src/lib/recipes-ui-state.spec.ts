import { describe, expect, it } from "vitest";
import type { Recipe, UserRecipeRecommendation } from "@health/types";
import {
  buildRecipeTagChips,
  canAcceptRecommendation,
  canCompleteRecommendation,
  canDismissRecommendation,
  canLogRecommendation,
  formatIngredientLine,
  formatMacroEstimateSummary,
  formatMealTypeLabel,
  formatPrepTime,
  formatRecipeProvenanceHuman,
  formatServingsNote,
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
  perServingMacros: {
    caloriesPerServing: 320,
    proteinGramsPerServing: 24,
    carbsGramsPerServing: 30,
    fatGramsPerServing: 10,
    fiberGramsPerServing: 4,
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
    // per-serving copy
    expect(formatMacroEstimateSummary(sampleRecipe)).toContain("kcal");
    expect(formatMacroEstimateSummary(sampleRecipe)).toContain("per serving");
    expect(formatMacroEstimateSummary(sampleRecipe)).toContain("approximate");
    // single-serving: no "Makes N servings" suffix
    expect(formatMacroEstimateSummary(sampleRecipe)).not.toContain("Makes");
    // multi-serving recipe shows the servings note
    expect(
      formatMacroEstimateSummary({ ...sampleRecipe, servings: 4 }),
    ).toContain("Makes 4 servings");
    // no misleading "(N total)" phrasing
    expect(formatMacroEstimateSummary(sampleRecipe)).not.toContain("total");
  });

  it("returns null servings note for single-serving recipes", () => {
    expect(formatServingsNote(1)).toBeNull();
    expect(formatServingsNote(2)).toBe("Makes 2 servings");
  });

  it("formats human provenance without ID leakage", () => {
    expect(
      formatRecipeProvenanceHuman({ source: "external_provider", providerId: "themealdb", externalId: "52772" }),
    ).toBe("Community recipe (approximate nutrition)");
    expect(
      formatRecipeProvenanceHuman({ source: "seed_catalog" }),
    ).toBe("Curated starter recipe");
    expect(
      formatRecipeProvenanceHuman({ source: "curated" }),
    ).toBe("Curated starter recipe");
    expect(RECIPE_CONFIDENCE_LABELS.medium).toContain("Medium");
  });

  it("shows low-confidence caution copy for recipe estimates", () => {
    expect(recipeConfidenceNotice("high")).toBeNull();
    expect(recipeConfidenceNotice("low")).toContain("low-confidence");
  });

  it("buildRecipeTagChips deduplicates restriction/allergen overlap and drops noise tags", () => {
    const chips = buildRecipeTagChips({
      tags: ["high_protein", "quick"],
      restrictionTags: ["contains_dairy", "not_vegan"],
      allergenTags: ["dairy"],
    });

    const keys = chips.map((c) => c.key);
    // contains_dairy dropped (allergen "dairy" already present); not_vegan dropped (noise)
    expect(keys).not.toContain("restriction-contains_dairy");
    expect(keys).not.toContain("restriction-not_vegan");
    // allergen chip present
    expect(keys).toContain("allergen-dairy");
    // content tags present
    expect(keys).toContain("tag-high_protein");
    expect(keys).toContain("tag-quick");
  });

  it("buildRecipeTagChips keeps contains_meat (no allergen counterpart)", () => {
    const chips = buildRecipeTagChips({
      tags: [],
      restrictionTags: ["contains_meat", "not_vegan"],
      allergenTags: [],
    });

    const keys = chips.map((c) => c.key);
    expect(keys).toContain("restriction-contains_meat");
    expect(keys).not.toContain("restriction-not_vegan");
  });

  it("buildRecipeTagChips assigns correct tones", () => {
    const chips = buildRecipeTagChips({
      tags: ["high_protein"],
      restrictionTags: [],
      allergenTags: ["peanuts"],
    });

    expect(chips.find((c) => c.key === "tag-high_protein")?.tone).toBe("green");
    expect(chips.find((c) => c.key === "allergen-peanuts")?.tone).toBe("red");
  });

  it("buildRecipeTagChips title-cases unknown tags", () => {
    const chips = buildRecipeTagChips({
      tags: ["some_unknown_tag"],
      restrictionTags: [],
      allergenTags: [],
    });

    expect(chips[0]?.fallbackLabel).toBe("Some Unknown Tag");
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
