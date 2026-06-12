import { describe, expect, it } from "vitest";
import {
  mapTheMealDbMealToProviderDraft,
  parseTheMealDbIngredients,
  parseTheMealDbPreparationSteps,
} from "./themealdb-recipe.mapper.js";

describe("TheMealDB recipe mapper", () => {
  it("maps provider meals into the local recipe shape with USDA-computed macros", () => {
    const draft = mapTheMealDbMealToProviderDraft({
      idMeal: "52772",
      strMeal: "Teriyaki Chicken Casserole",
      strCategory: "Chicken",
      strArea: "Japanese",
      strInstructions: "Preheat oven.\r\nCombine ingredients.\r\nBake until done.",
      strIngredient1: " soy sauce",
      strMeasure1: "3/4 cup",
      strIngredient2: "water",
      strMeasure2: "1/2 cup",
      strIngredient3: "chicken",
      strMeasure3: "2 breasts",
    });

    if (!draft) {
      throw new Error("Expected TheMealDB mapper to return a recipe draft.");
    }

    expect(draft.provider).toBe("themealdb");
    expect(draft.externalId).toBe("52772");
    expect(draft.name).toBe("Teriyaki Chicken Casserole");

    // Macros must be COMPUTED from ingredients — not the old fake constant
    expect(draft.macroEstimates.caloriesPerServing).not.toBe(550);
    expect(draft.macroEstimates.proteinGramsPerServing).not.toBe(25);
    expect(draft.macroEstimates.carbsGramsPerServing).not.toBe(45);
    expect(draft.macroEstimates.fatGramsPerServing).not.toBe(20);

    // Chicken + soy sauce → must have meaningful protein and calories
    expect(draft.macroEstimates.caloriesPerServing).toBeGreaterThan(0);
    expect(draft.macroEstimates.proteinGramsPerServing).toBeGreaterThan(0);

    // Confidence is set from computed result (not hardcoded "low")
    expect(["high", "medium", "low"]).toContain(draft.confidence);

    expect(draft.provenance).toMatchObject({
      source: "external_provider",
      providerId: "themealdb",
      externalId: "52772",
    });
    expect(draft.description).toContain("USDA FoodData Central");
    expect(draft.source).toContain("USDA FoodData Central");
    expect(draft.ingredients).toEqual([
      { name: "soy sauce", unit: "3/4 cup", quantity: null },
      { name: "water", unit: "1/2 cup", quantity: null },
      { name: "chicken", unit: "2 breasts", quantity: null },
    ]);
    expect(draft.allergenTags).toContain("soy");
    expect(draft.restrictionTags).toContain("contains_meat");
    expect(draft.mealTypes).toEqual(["lunch", "dinner"]);
  });

  it("produces non-uniform macros across different recipes", () => {
    const chickenDraft = mapTheMealDbMealToProviderDraft({
      idMeal: "1",
      strMeal: "Grilled Chicken",
      strCategory: "Chicken",
      strArea: "American",
      strInstructions: "Grill the chicken.",
      strIngredient1: "chicken breast",
      strMeasure1: "300g",
      strIngredient2: "olive oil",
      strMeasure2: "2 tbsp",
    });

    const pastaDraft = mapTheMealDbMealToProviderDraft({
      idMeal: "2",
      strMeal: "Pasta Bolognese",
      strCategory: "Pasta",
      strArea: "Italian",
      strInstructions: "Cook pasta. Add sauce.",
      strIngredient1: "pasta",
      strMeasure1: "200g",
      strIngredient2: "ground beef",
      strMeasure2: "150g",
      strIngredient3: "tomato sauce",
      strMeasure3: "200g",
    });

    expect(chickenDraft).not.toBeNull();
    expect(pastaDraft).not.toBeNull();

    if (!chickenDraft || !pastaDraft) {
      throw new Error("Expected both drafts to be non-null.");
    }

    // Calorie counts must differ (chicken-only vs pasta + meat)
    expect(chickenDraft.macroEstimates.caloriesPerServing).not.toBe(
      pastaDraft.macroEstimates.caloriesPerServing,
    );

    // Chicken recipe should have higher protein relative to carbs
    expect(chickenDraft.macroEstimates.proteinGramsPerServing).toBeGreaterThan(
      chickenDraft.macroEstimates.carbsGramsPerServing,
    );

    // Pasta recipe should have notable carbs
    expect(pastaDraft.macroEstimates.carbsGramsPerServing).toBeGreaterThan(0);
  });

  it("parses ingredients and preparation steps from sparse provider payloads", () => {
    expect(parseTheMealDbIngredients({
      idMeal: "1",
      strMeal: "Fallback",
      strCategory: null,
      strArea: null,
      strInstructions: null,
    })).toEqual([
      { name: "See preparation instructions" },
    ]);
    expect(parseTheMealDbPreparationSteps(null)).toEqual([
      "Follow the linked recipe instructions.",
    ]);
    expect(parseTheMealDbPreparationSteps("Mix. Bake. Serve.")).toEqual([
      "Mix.",
      "Bake.",
      "Serve.",
    ]);
  });

  it("returns null for malformed provider meals missing required identifiers", () => {
    expect(
      mapTheMealDbMealToProviderDraft({
        idMeal: "",
        strMeal: "Broken meal",
        strCategory: null,
        strArea: null,
        strInstructions: null,
      }),
    ).toBeNull();

    expect(
      mapTheMealDbMealToProviderDraft({
        idMeal: "52772",
        strMeal: "",
        strCategory: null,
        strArea: null,
        strInstructions: null,
      }),
    ).toBeNull();
  });
});
