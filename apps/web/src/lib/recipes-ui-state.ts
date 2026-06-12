import type {
  Recipe,
  RecipeConfidenceBand,
  RecipeIngredient,
  RecipeMealType,
  RecipeRecommendationLimitedReason,
  UserRecipeRecommendation,
  UserRecipeRecommendationStatus,
} from "@health/types";

export const RECIPE_CONFIDENCE_LABELS: Record<RecipeConfidenceBand, string> = {
  high: "High confidence estimate",
  medium: "Medium confidence estimate",
  low: "Low confidence estimate",
};

/**
 * Human-readable provenance line — no ID leakage.
 * "Curated starter recipe" for seed/curated; "Community recipe (approximate nutrition)" for external.
 */
export function formatRecipeProvenanceHuman(provenance: Pick<Recipe, "provenance">["provenance"]): string {
  if (provenance.source === "seed_catalog" || provenance.source === "curated") {
    return "Curated starter recipe";
  }
  return "Community recipe (approximate nutrition)";
}

export function recipeConfidenceNotice(confidence: RecipeConfidenceBand): string | null {
  if (confidence === "low") {
    return "This recipe uses a low-confidence nutrition estimate. Review and edit items before logging as a food entry.";
  }

  return null;
}

// ── Tag noise lists ────────────────────────────────────────────────

/** Machine-only noise tags that should never be shown to users. */
const NOISE_RESTRICTION_TAGS = new Set(["not_vegan", "not_vegetarian"]);

/**
 * Restriction tags that duplicate an allergen — if the allergen is already in allergenTags,
 * the restriction tag is redundant (e.g. "contains_dairy" + allergen "dairy" → ONE chip).
 */
const RESTRICTION_TO_ALLERGEN: Record<string, string> = {
  contains_dairy: "dairy",
  contains_gluten: "gluten",
  contains_soy: "soy",
  contains_egg: "egg",
  contains_fish: "fish",
  contains_shellfish: "shellfish",
  contains_meat: "", // no 1:1 allergen counterpart — keep it
  contains_peanuts: "peanuts",
  contains_tree_nuts: "tree_nuts",
  contains_sesame: "sesame",
};

export type RecipeTagChip = {
  key: string;
  /** i18n key under the Recipes namespace, e.g. "tags.high_protein" */
  i18nKey: string;
  /** Fallback label when i18n key is not found (title-cased). */
  fallbackLabel: string;
  /** Semantic tone used to pick a badge variant */
  tone?: "neutral" | "amber" | "red" | "green";
};

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const TAG_TONE: Record<string, RecipeTagChip["tone"]> = {
  high_protein: "green",
  plant_based: "green",
  quick: "green",
  balanced: "neutral",
  omega_3: "green",
  vegan: "green",
  vegetarian: "green",
  contains_dairy: "amber",
  contains_gluten: "amber",
  contains_soy: "amber",
  contains_egg: "amber",
  contains_fish: "amber",
  contains_meat: "amber",
  contains_shellfish: "amber",
  contains_peanuts: "red",
  contains_tree_nuts: "red",
  contains_sesame: "red",
};

/**
 * Builds deduplicated, human-visible tag chips for a recipe card.
 *
 * Rules:
 * - Drop noise-only restriction tags ("not_vegan", "not_vegetarian").
 * - Drop a `contains_X` restriction tag when the matching allergen is already in allergenTags.
 * - Show allergen tags (always visible — safety-critical).
 * - Show meaningful content tags (tags[]).
 * - Unknown tags get a title-cased fallback label.
 */
export function buildRecipeTagChips(
  recipe: Pick<Recipe, "tags" | "restrictionTags" | "allergenTags">,
): RecipeTagChip[] {
  const chips: RecipeTagChip[] = [];
  const allergenSet = new Set(recipe.allergenTags);

  // 1. Content tags (tags[])
  for (const tag of recipe.tags) {
    chips.push({
      key: `tag-${tag}`,
      i18nKey: `tags.${tag}`,
      fallbackLabel: titleCase(tag),
      tone: TAG_TONE[tag] ?? "neutral",
    });
  }

  // 2. Restriction tags — drop noise, drop duplicates that allergenTags already cover
  for (const tag of recipe.restrictionTags) {
    if (NOISE_RESTRICTION_TAGS.has(tag)) {
      continue;
    }

    const allergenCounterpart = RESTRICTION_TO_ALLERGEN[tag];
    if (allergenCounterpart !== undefined && allergenCounterpart !== "" && allergenSet.has(allergenCounterpart)) {
      // The allergen chip already conveys this; skip the restriction duplicate.
      continue;
    }

    chips.push({
      key: `restriction-${tag}`,
      i18nKey: `tags.${tag}`,
      fallbackLabel: titleCase(tag),
      tone: TAG_TONE[tag] ?? "amber",
    });
  }

  // 3. Allergen tags — always shown (safety)
  for (const tag of recipe.allergenTags) {
    chips.push({
      key: `allergen-${tag}`,
      i18nKey: `allergens.${tag}`,
      fallbackLabel: titleCase(tag),
      tone: "red",
    });
  }

  return chips;
}

export function canLogRecommendation(
  recommendation: Pick<UserRecipeRecommendation, "status">,
): boolean {
  return recommendation.status === "accepted" || recommendation.status === "completed";
}

export function formatMealTypeLabel(mealType: RecipeMealType): string {
  switch (mealType) {
    case "breakfast":
      return "Breakfast";
    case "lunch":
      return "Lunch";
    case "dinner":
      return "Dinner";
    case "snack":
      return "Snack";
  }
}

export function formatPrepTime(recipe: Pick<Recipe, "prepMinutes" | "cookMinutes">): string | null {
  const parts: string[] = [];

  if (recipe.prepMinutes != null && recipe.prepMinutes > 0) {
    parts.push(`${recipe.prepMinutes} min prep`);
  }

  if (recipe.cookMinutes != null && recipe.cookMinutes > 0) {
    parts.push(`${recipe.cookMinutes} min cook`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function formatMacroEstimateSummary(
  recipe: Pick<Recipe, "perServingMacros" | "servings">,
): string {
  const { perServingMacros, servings } = recipe;
  const fiber =
    perServingMacros.fiberGramsPerServing != null ? ` · ${perServingMacros.fiberGramsPerServing}g fiber` : "";

  const perServingLine = `≈${perServingMacros.caloriesPerServing} kcal · ${perServingMacros.proteinGramsPerServing}g protein · ${perServingMacros.carbsGramsPerServing}g carbs · ${perServingMacros.fatGramsPerServing}g fat${fiber} per serving`;
  const servingsNote = servings > 1 ? ` · Makes ${servings} servings` : "";

  return `${perServingLine}${servingsNote}. Values are approximate.`;
}

export function formatServingsNote(servings: number): string | null {
  return servings > 1 ? `Makes ${servings} servings` : null;
}

export function formatIngredientLine(ingredient: RecipeIngredient): string {
  const quantity =
    ingredient.quantity != null
      ? `${ingredient.quantity}${ingredient.unit ? ` ${ingredient.unit}` : ""}`
      : null;
  const parts = [quantity, ingredient.name].filter(Boolean);

  if (ingredient.notes) {
    parts.push(`(${ingredient.notes})`);
  }

  return parts.join(" ");
}

export function recommendationStatusLabel(
  status: UserRecipeRecommendationStatus,
): string {
  switch (status) {
    case "pending":
      return "Suggested";
    case "accepted":
      return "Saved";
    case "dismissed":
      return "Dismissed";
    case "completed":
      return "Completed";
  }
}

export function recommendationStatusBadgeClass(
  status: UserRecipeRecommendationStatus,
): string {
  switch (status) {
    case "pending":
      return "badge badge-pending";
    case "accepted":
      return "badge badge-valid";
    case "dismissed":
      return "badge badge-neutral";
    case "completed":
      return "badge badge-session-completed";
  }
}

export function getLimitedReasonCopy(
  reason: RecipeRecommendationLimitedReason,
): { title: string; description: string } {
  switch (reason) {
    case "no_active_nutrition_plan":
      return {
        title: "No active nutrition plan",
        description:
          "Plan-fit recommendations need an active nutrition revision. You can still browse the catalog below, or accept a nutrition proposal in Chat first.",
      };
    case "no_compatible_recipes":
      return {
        title: "No compatible recipes found",
        description:
          "Nothing in the catalog matched your current restrictions and macro targets. Try browsing all recipes or adjust restrictions through a separate nutrition proposal.",
      };
  }
}

export function canAcceptRecommendation(
  recommendation: Pick<UserRecipeRecommendation, "status">,
): boolean {
  return recommendation.status === "pending";
}

export function canDismissRecommendation(
  recommendation: Pick<UserRecipeRecommendation, "status">,
): boolean {
  return recommendation.status === "pending";
}

export function canCompleteRecommendation(
  recommendation: Pick<UserRecipeRecommendation, "status">,
): boolean {
  return recommendation.status === "accepted";
}

export function sortRecommendationsByShownAt(
  recommendations: readonly UserRecipeRecommendation[],
): UserRecipeRecommendation[] {
  return [...recommendations].sort(
    (left, right) => new Date(right.shownAt).getTime() - new Date(left.shownAt).getTime(),
  );
}

export function isRecommendationVisible(
  recommendation: Pick<UserRecipeRecommendation, "status">,
): boolean {
  return recommendation.status === "pending" || recommendation.status === "accepted";
}

/**
 * Returns true when the recipe was authored by the current user.
 * User-authored recipes have `source === "user_created"` in the backend DB row,
 * which surfaces on the `Recipe` type's `source` field.
 */
export function isUserOwnedRecipe(recipe: Pick<Recipe, "source">): boolean {
  return recipe.source === "user_created";
}

/** Macro totals for a draft food-log item, scaled from per-serving values. */
export interface ScalableMacros {
  estimatedCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams?: number | null;
}

/**
 * Proportionally rescale macro estimates from `baseServings` to `targetServings`.
 * This is a pure, deterministic client-side estimate — not a verified nutrition fact.
 * Returns rounded integer values.
 */
export function rescaleMacros(
  base: ScalableMacros,
  baseServings: number,
  targetServings: number,
): ScalableMacros {
  if (baseServings <= 0 || targetServings <= 0) {
    return base;
  }

  const factor = targetServings / baseServings;

  return {
    estimatedCalories: Math.max(1, Math.round(base.estimatedCalories * factor)),
    proteinGrams: Math.round(base.proteinGrams * factor),
    carbsGrams: Math.round(base.carbsGrams * factor),
    fatGrams: Math.round(base.fatGrams * factor),
    fiberGrams:
      base.fiberGrams != null ? Math.round(base.fiberGrams * factor) : base.fiberGrams,
  };
}

/**
 * Format a confidence band as a user-facing hint for macro estimates in the log draft.
 */
export function formatMacroConfidenceHint(confidence: RecipeConfidenceBand): string {
  switch (confidence) {
    case "high":
      return "Macro values are reasonable estimates from USDA data. Edit as needed.";
    case "medium":
      return "These are rough estimates. Review and adjust before logging.";
    case "low":
      return "Low-confidence estimate — ingredient quantities may be imprecise. Edit before logging.";
  }
}
