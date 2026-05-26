import type {
  RecipeConfidenceBand,
  RecipeIngredient,
  RecipeMacroEstimates,
  RecipeMealType,
  RecipeProvenance,
} from "@health/types";

export const THEMEALDB_PROVIDER = "themealdb" as const;

export type RecipeCatalogProviderName = typeof THEMEALDB_PROVIDER;

export interface ProviderRecipeDraft {
  provider: RecipeCatalogProviderName;
  externalId: string;
  name: string;
  description: string;
  ingredients: RecipeIngredient[];
  preparationSteps: string[];
  servings: number;
  macroEstimates: RecipeMacroEstimates;
  mealTypes: RecipeMealType[];
  tags: string[];
  restrictionTags: string[];
  allergenTags: string[];
  prepMinutes: number | null;
  cookMinutes: number | null;
  source: string;
  confidence: RecipeConfidenceBand;
  provenance: RecipeProvenance;
}

export interface RecipeCatalogProvider {
  readonly providerName: RecipeCatalogProviderName;
  fetchByGenericCategories(
    categories: readonly string[],
  ): Promise<ProviderRecipeDraft[]>;
}
