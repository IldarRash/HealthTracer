import type {
  Recipe,
  RecipeIngredient,
  RecipeMealType,
  RecipeRecommendationLimitedReason,
  UserRecipeRecommendation,
  UserRecipeRecommendationStatus,
} from "@health/types";

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
  recipe: Pick<Recipe, "macroEstimates" | "servings">,
): string {
  const { macroEstimates, servings } = recipe;
  const fiber =
    macroEstimates.fiberGrams != null ? ` · ${macroEstimates.fiberGrams}g fiber` : "";

  return `Estimated per serving (${servings} total): ${macroEstimates.estimatedCalories} cal · ${macroEstimates.proteinGrams}g protein · ${macroEstimates.carbsGrams}g carbs · ${macroEstimates.fatGrams}g fat${fiber}. Values are approximate.`;
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
