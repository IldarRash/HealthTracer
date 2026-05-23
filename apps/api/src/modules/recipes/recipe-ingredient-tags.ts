import type { RecipeIngredient } from "@health/types";

const INGREDIENT_ALLERGEN_PATTERNS: Array<{ pattern: RegExp; allergen: string }> = [
  { pattern: /\b(peanut|groundnut|peanut butter)\b/i, allergen: "peanuts" },
  { pattern: /\b(almond|walnut|pecan|cashew|hazelnut|pistachio|macadamia)\b/i, allergen: "tree_nuts" },
  { pattern: /\b(milk|cheese|cream|butter|yogurt|yoghurt|lactose|whey|parmesan|mozzarella|cheddar)\b/i, allergen: "dairy" },
  { pattern: /\b(wheat|flour|bread|pasta|noodle|semolina|bulgur|barley|rye)\b/i, allergen: "gluten" },
  { pattern: /\b(egg|eggs|mayonnaise|mayo)\b/i, allergen: "egg" },
  { pattern: /\b(soy|soya|tofu|tempeh|miso|edamame)\b/i, allergen: "soy" },
  { pattern: /\b(shrimp|prawn|crab|lobster|shellfish|scallop|clam|mussel|oyster)\b/i, allergen: "shellfish" },
  { pattern: /\b(fish|salmon|tuna|cod|anchovy|sardine|trout|haddock|mackerel)\b/i, allergen: "fish" },
  { pattern: /\b(sesame|tahini)\b/i, allergen: "sesame" },
];

const MEAT_PATTERN =
  /\b(chicken|beef|pork|lamb|turkey|bacon|sausage|ham|steak|meat|mince|venison|duck)\b/i;
const FISH_PATTERN =
  /\b(fish|salmon|tuna|cod|anchovy|sardine|trout|haddock|mackerel|shrimp|prawn|crab|lobster)\b/i;
const EGG_PATTERN = /\b(egg|eggs|mayonnaise|mayo)\b/i;
const DAIRY_PATTERN =
  /\b(milk|cheese|cream|butter|yogurt|yoghurt|lactose|whey|parmesan|mozzarella|cheddar)\b/i;

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function uniqueTokens(values: string[]): string[] {
  return [...new Set(values.map(normalizeToken).filter(Boolean))];
}

function ingredientText(ingredients: RecipeIngredient[]): string {
  return ingredients.map((ingredient) => ingredient.name).join(" ");
}

export function inferAllergenTagsFromIngredients(ingredients: RecipeIngredient[]): string[] {
  const text = ingredientText(ingredients);
  const tags: string[] = [];

  for (const { pattern, allergen } of INGREDIENT_ALLERGEN_PATTERNS) {
    if (pattern.test(text)) {
      tags.push(allergen);
    }
  }

  return uniqueTokens(tags);
}

export function inferRestrictionTagsFromIngredients(ingredients: RecipeIngredient[]): string[] {
  const text = ingredientText(ingredients);
  const tags: string[] = [];

  if (MEAT_PATTERN.test(text)) {
    tags.push("contains_meat", "not_vegan", "not_vegetarian");
  }

  if (FISH_PATTERN.test(text)) {
    tags.push("contains_fish", "not_vegan", "not_vegetarian");
  }

  if (EGG_PATTERN.test(text)) {
    tags.push("contains_egg", "not_vegan");
  }

  if (DAIRY_PATTERN.test(text)) {
    tags.push("contains_dairy", "not_vegan");
  }

  if (!MEAT_PATTERN.test(text) && !FISH_PATTERN.test(text) && !EGG_PATTERN.test(text) && !DAIRY_PATTERN.test(text)) {
    tags.push("plant_based");
  }

  return uniqueTokens(tags);
}
