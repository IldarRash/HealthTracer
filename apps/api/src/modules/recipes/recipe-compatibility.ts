export interface RecipeCompatibilityMetadata {
  allergenTags: string[];
  restrictionTags: string[];
}

export interface HardFilterContext {
  restrictions: string[];
  allergies: string[];
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeTokens(values: string[]): string[] {
  return [...new Set(values.map(normalizeToken).filter(Boolean))];
}

const KNOWN_ALLERGEN_TOKENS = new Set([
  "dairy",
  "lactose",
  "gluten",
  "wheat",
  "peanuts",
  "tree_nuts",
  "fish",
  "egg",
  "soy",
  "shellfish",
  "sesame",
]);

const RESTRICTION_CONFLICTS: Record<string, string[]> = {
  dairy_free: ["dairy", "contains_dairy", "lactose"],
  lactose_free: ["dairy", "contains_dairy", "lactose"],
  gluten_free: ["gluten", "contains_gluten", "wheat"],
  vegan: [
    "contains_dairy",
    "contains_fish",
    "contains_meat",
    "contains_egg",
    "dairy",
    "fish",
    "egg",
    "meat",
    "not_vegan",
  ],
  vegetarian: ["contains_meat", "contains_fish", "meat", "fish", "not_vegetarian"],
  nut_free: ["tree_nuts", "peanuts", "contains_tree_nuts", "contains_peanuts"],
  peanut_free: ["peanuts", "contains_peanuts"],
};

function recipeTags(recipe: RecipeCompatibilityMetadata): string[] {
  return normalizeTokens([...recipe.allergenTags, ...recipe.restrictionTags]);
}

export function isSupportedHardProfileConstraint(constraint: string): boolean {
  const normalized = normalizeToken(constraint);

  return (
    normalized in RESTRICTION_CONFLICTS || KNOWN_ALLERGEN_TOKENS.has(normalized)
  );
}

function supportedProfileHardConstraints(profileConstraints: string[]): string[] {
  return profileConstraints.filter(isSupportedHardProfileConstraint);
}

export function collectHardFilters(
  nutritionRestrictions: string[],
  nutritionAllergies: string[],
  profileConstraints: string[],
): HardFilterContext {
  const supportedProfileConstraints = supportedProfileHardConstraints(profileConstraints);

  return {
    restrictions: normalizeTokens([
      ...nutritionRestrictions,
      ...nutritionAllergies,
      ...supportedProfileConstraints,
    ]),
    allergies: normalizeTokens([
      ...nutritionAllergies,
      ...supportedProfileConstraints,
    ]),
  };
}

export function isRecipeCompatibleWithHardFilters(
  recipe: RecipeCompatibilityMetadata,
  filters: HardFilterContext,
): boolean {
  const tags = recipeTags(recipe);

  for (const allergy of filters.allergies) {
    if (tags.some((tag) => tag === allergy || tag.includes(allergy))) {
      return false;
    }
  }

  for (const restriction of filters.restrictions) {
    const conflicts = RESTRICTION_CONFLICTS[restriction] ?? [restriction.replace(/_free$/, "")];

    if (
      conflicts.some((conflict) =>
        tags.some(
          (tag) => tag === conflict || tag.includes(conflict),
        ),
      )
    ) {
      return false;
    }
  }

  return true;
}

export interface MacroFitInput {
  caloriesPerServing: number;
  proteinGramsPerServing: number;
}

export interface MacroFitTargets {
  caloriesPerDay: number | null;
  proteinGrams: number | null;
}

export function scoreRecipeMacroFit(
  recipe: MacroFitInput,
  targets: MacroFitTargets,
): number {
  let score = 0;

  if (targets.caloriesPerDay) {
    const perMealTarget = targets.caloriesPerDay / 3;
    const calorieDelta = Math.abs(recipe.caloriesPerServing - perMealTarget);
    const calorieRatio = calorieDelta / Math.max(perMealTarget, 1);
    score += Math.max(0, 100 - calorieRatio * 100);
  } else {
    score += 40;
  }

  if (targets.proteinGrams) {
    const perMealProtein = targets.proteinGrams / 3;
    const proteinDelta = Math.abs(recipe.proteinGramsPerServing - perMealProtein);
    score += Math.max(0, 50 - proteinDelta * 2);
  } else {
    score += 20;
  }

  return score;
}

export function buildRuleBasedFitSummary(
  recipe: MacroFitInput & { mealTypes: string[] },
  targets: MacroFitTargets,
): string {
  const mealLabel = recipe.mealTypes[0]?.replace(/_/g, " ") ?? "meal";
  const calorieText = targets.caloriesPerDay
    ? `Estimated per-serving macros are a reasonable fit for your current daily targets across ${mealLabel}.`
    : `This ${mealLabel} option offers balanced per-serving estimated macros for general wellness consistency.`;

  return `${calorieText} Macro values are estimates, not guaranteed nutrition facts.`;
}
