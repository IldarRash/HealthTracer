import { recipes, userRecipeRecommendations } from "@health/db";
import {
  recipeConfidenceBandSchema,
  recipeIngredientSchema,
  recipeMacroEstimatesSchema,
  recipeMealTypeSchema,
  recipeProvenanceSchema,
  type Recipe,
  type RecipeConfidenceBand,
  type RecipeProvenance,
  type UserRecipeRecommendation,
} from "@health/types";
import { InternalServerErrorException } from "@nestjs/common";

type RecipeRow = typeof recipes.$inferSelect;
type UserRecipeRecommendationRow = typeof userRecipeRecommendations.$inferSelect;

function resolveRecipeConfidence(row: RecipeRow): RecipeConfidenceBand {
  if (row.confidence) {
    return recipeConfidenceBandSchema.parse(row.confidence);
  }

  return row.provider ? "low" : "medium";
}

function resolveRecipeProvenance(row: RecipeRow): RecipeProvenance {
  if (row.provenance) {
    return recipeProvenanceSchema.parse(row.provenance);
  }

  if (row.provider) {
    return {
      source: "external_provider",
      providerId: row.provider,
      externalId: row.externalId ?? undefined,
    };
  }

  return {
    source: row.source.includes("seed") || row.source.includes("Curated") ? "seed_catalog" : "curated",
  };
}

export function toRecipe(row: RecipeRow): Recipe {
  const ingredients = row.ingredients.map((item) => recipeIngredientSchema.parse(item));
  const mealTypes = row.mealTypes.map((mealType) => recipeMealTypeSchema.parse(mealType));
  const macroEstimates = recipeMacroEstimatesSchema.parse({
    estimatedCalories: row.estimatedCalories,
    proteinGrams: row.proteinGrams,
    carbsGrams: row.carbsGrams,
    fatGrams: row.fatGrams,
    fiberGrams: row.fiberGrams,
  });

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ingredients,
    preparationSteps: row.preparationSteps,
    servings: row.servings,
    macroEstimates,
    mealTypes,
    tags: row.tags,
    restrictionTags: row.restrictionTags,
    allergenTags: row.allergenTags,
    prepMinutes: row.prepMinutes,
    cookMinutes: row.cookMinutes,
    source: row.source,
    provider: row.provider,
    externalId: row.externalId,
    confidence: resolveRecipeConfidence(row),
    provenance: resolveRecipeProvenance(row),
    status: row.status as Recipe["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toUserRecipeRecommendation(
  row: UserRecipeRecommendationRow,
  recipe?: Recipe,
): UserRecipeRecommendation {
  if (!row.shownAt) {
    throw new InternalServerErrorException("Recommendation is missing shownAt.");
  }

  return {
    id: row.id,
    userId: row.userId,
    recipeId: row.recipeId,
    recipe,
    relatedNutritionPlanRevisionId: row.relatedNutritionPlanRevisionId,
    reason: row.reason,
    fitSummary: row.fitSummary,
    status: row.status as UserRecipeRecommendation["status"],
    shownAt: row.shownAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
