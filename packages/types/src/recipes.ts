import { z } from "zod";
import {
  logNutritionIncidentProposalPayloadSchema,
  nutritionConfidenceBandSchema,
} from "./nutrition-incidents.js";

export const recipeConfidenceBandSchema = nutritionConfidenceBandSchema;

export type RecipeConfidenceBand = z.infer<typeof recipeConfidenceBandSchema>;

export const recipeProvenanceLabelSchema = z.enum([
  "seed_catalog",
  "external_provider",
  "curated",
]);

export type RecipeProvenanceLabel = z.infer<typeof recipeProvenanceLabelSchema>;

export const recipeProvenanceSchema = z
  .object({
    source: recipeProvenanceLabelSchema,
    providerId: z.string().min(1).max(80).optional(),
    externalId: z.string().min(1).max(80).optional(),
  })
  .strict();

export type RecipeProvenance = z.infer<typeof recipeProvenanceSchema>;

export const RECIPE_STALE_NUTRITION_REVISION_ERROR =
  "proposedChanges.relatedNutritionPlanRevisionId: Related nutrition plan revision is no longer active.";

export const RECIPE_MISSING_NUTRITION_REVISION_ERROR =
  "proposedChanges.relatedNutritionPlanRevisionId: Related nutrition plan revision was not found for this user.";

export function getRecipeRecommendationRevisionErrors(
  relatedNutritionPlanRevisionId: string | null | undefined,
  options: {
    activeRevisionId: string | null;
    revisionOwned: boolean;
  },
): string[] {
  const errors: string[] = [];

  if (!relatedNutritionPlanRevisionId) {
    return errors;
  }

  if (!options.revisionOwned) {
    errors.push(RECIPE_MISSING_NUTRITION_REVISION_ERROR);
    return errors;
  }

  if (
    !options.activeRevisionId ||
    relatedNutritionPlanRevisionId !== options.activeRevisionId
  ) {
    errors.push(RECIPE_STALE_NUTRITION_REVISION_ERROR);
  }

  return errors;
}

export const createRecipeNutritionIncidentProposalInputSchema = z
  .object({
    threadId: z.string().uuid().optional(),
    proposedChanges: logNutritionIncidentProposalPayloadSchema.optional(),
  })
  .strict();

export type CreateRecipeNutritionIncidentProposalInput = z.infer<
  typeof createRecipeNutritionIncidentProposalInputSchema
>;
