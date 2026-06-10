import type { RecipeIngredient, RecipeMealType } from "@health/types";
import { computeRecipeMacros } from "@health/nutrition-macros";
import {
  inferAllergenTagsFromIngredients,
  inferRestrictionTagsFromIngredients,
} from "./recipe-ingredient-tags.js";
import {
  THEMEALDB_PROVIDER,
  type ProviderRecipeDraft,
} from "./recipe-catalog-provider.js";

// TheMealDB does not expose a serving count, and its ingredient amounts are for
// the whole dish (typically a family-sized main). Assume 4 servings so the
// USDA-computed macros are realistic per-serving values, not whole-dish totals.
export const THEMEALDB_ASSUMED_SERVINGS = 4;

const CATEGORY_MEAL_TYPE: Record<string, RecipeMealType> = {
  breakfast: "breakfast",
  dessert: "snack",
  starter: "snack",
  side: "snack",
};

export interface TheMealDbMeal {
  idMeal: string;
  strMeal: string;
  strCategory: string | null;
  strArea: string | null;
  strInstructions: string | null;
  [key: string]: string | null | undefined;
}

export function parseTheMealDbIngredients(meal: TheMealDbMeal): RecipeIngredient[] {
  const ingredients: RecipeIngredient[] = [];

  for (let index = 1; index <= 20; index += 1) {
    const name = meal[`strIngredient${index}`]?.trim();
    const measure = meal[`strMeasure${index}`]?.trim();

    if (!name) {
      continue;
    }

    ingredients.push({
      name: name.slice(0, 160),
      unit: measure ? measure.slice(0, 40) : null,
      quantity: null,
    });
  }

  return ingredients.length > 0 ? ingredients : [{ name: "See preparation instructions" }];
}

export function parseTheMealDbPreparationSteps(instructions: string | null): string[] {
  if (!instructions?.trim()) {
    return ["Follow the linked recipe instructions."];
  }

  const lines = instructions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    return lines.slice(0, 30).map((line) => line.slice(0, 1000));
  }

  const sentences = instructions
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length >= 2) {
    return sentences.slice(0, 30).map((sentence) => sentence.slice(0, 1000));
  }

  return [instructions.slice(0, 1000)];
}

export function mapTheMealDbCategoryToMealTypes(category: string | null): RecipeMealType[] {
  const normalized = category?.trim().toLowerCase() ?? "";
  const mapped = CATEGORY_MEAL_TYPE[normalized];

  if (mapped) {
    return [mapped];
  }

  if (normalized === "breakfast") {
    return ["breakfast"];
  }

  return ["lunch", "dinner"];
}

export function mapTheMealDbMealToProviderDraft(meal: TheMealDbMeal): ProviderRecipeDraft | null {
  if (!meal.idMeal?.trim() || !meal.strMeal?.trim()) {
    return null;
  }

  const ingredients = parseTheMealDbIngredients(meal);
  const category = meal.strCategory?.trim() ?? "General";
  const area = meal.strArea?.trim();
  const tags = [category.toLowerCase().replace(/\s+/g, "_")];

  if (area) {
    tags.push(area.toLowerCase().replace(/\s+/g, "_"));
  }

  const allergenTags = inferAllergenTagsFromIngredients(ingredients);
  const restrictionTags = inferRestrictionTagsFromIngredients(ingredients);

  const servings = THEMEALDB_ASSUMED_SERVINGS;
  const computed = computeRecipeMacros(ingredients, servings);
  const { confidence, ...macroEstimates } = computed;

  return {
    provider: THEMEALDB_PROVIDER,
    externalId: meal.idMeal,
    name: meal.strMeal.slice(0, 160),
    description:
      `${meal.strMeal} from TheMealDB (${category}). Macro values computed from USDA FoodData Central (estimates, not verified nutrition facts).`.slice(
        0,
        2000,
      ),
    ingredients,
    preparationSteps: parseTheMealDbPreparationSteps(meal.strInstructions),
    servings,
    macroEstimates,
    mealTypes: mapTheMealDbCategoryToMealTypes(meal.strCategory),
    tags,
    restrictionTags,
    allergenTags,
    prepMinutes: null,
    cookMinutes: null,
    source:
      "TheMealDB catalog — macros computed from USDA FoodData Central (estimates, not verified nutrition facts)",
    confidence,
    provenance: {
      source: "external_provider",
      providerId: THEMEALDB_PROVIDER,
      externalId: meal.idMeal,
    },
  };
}
