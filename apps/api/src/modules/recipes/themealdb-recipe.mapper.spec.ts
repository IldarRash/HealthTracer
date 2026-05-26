import { describe, expect, it } from "vitest";
import {
  APPROXIMATE_MACRO_SOURCE,
  APPROXIMATE_PROVIDER_MACRO_ESTIMATES,
  mapTheMealDbMealToProviderDraft,
  parseTheMealDbIngredients,
  parseTheMealDbPreparationSteps,
} from "./themealdb-recipe.mapper.js";

describe("TheMealDB recipe mapper", () => {
  it("maps provider meals into the local recipe shape with approximate macros", () => {
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
    expect(draft.macroEstimates).toEqual(APPROXIMATE_PROVIDER_MACRO_ESTIMATES);
    expect(draft.source).toBe(APPROXIMATE_MACRO_SOURCE);
    expect(draft.confidence).toBe("low");
    expect(draft.provenance).toMatchObject({
      source: "external_provider",
      providerId: "themealdb",
      externalId: "52772",
    });
    expect(draft.description).toContain("approximate estimates");
    expect(draft.ingredients).toEqual([
      { name: "soy sauce", unit: "3/4 cup", quantity: null },
      { name: "water", unit: "1/2 cup", quantity: null },
      { name: "chicken", unit: "2 breasts", quantity: null },
    ]);
    expect(draft.allergenTags).toContain("soy");
    expect(draft.restrictionTags).toContain("contains_meat");
    expect(draft.mealTypes).toEqual(["lunch", "dinner"]);
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
