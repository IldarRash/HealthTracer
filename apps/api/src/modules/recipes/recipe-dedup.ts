import type { Recipe } from "@health/types";

/**
 * Normalizes a recipe name to a canonical dedup key:
 * lowercase → NFKD strip diacritics → remove non-letters → collapse repeated adjacent letters.
 *
 * Examples:
 *   "Fettuccine Alfredo" → "fetucineafredo"
 *   "Fettucine alfredo"  → "fetucineafredo"   (same key)
 *   "Café au lait"       → "cafeaulait"
 */
export function normalizeRecipeNameKey(name: string): string {
  return (
    name
      .toLowerCase()
      // NFKD normalization + strip combining diacritics (U+0300–U+036F)
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      // keep only letters (no digits, spaces, punctuation)
      .replace(/[^a-z]/g, "")
      // collapse repeated adjacent identical characters
      .replace(/(.)\1+/g, "$1")
  );
}

export interface DedupeRecipesOptions {
  /** Max results to return (applied after dedup). Defaults to no limit. */
  limit?: number;
}

type MinimalRecipe = Pick<Recipe, "name" | "provider">;

/**
 * Deduplicates recipes by canonical name, preferring curated/seed rows (provider === null)
 * over provider rows, then stable order within each preference tier.
 */
export function dedupeRecipesByCanonicalName<T extends MinimalRecipe>(
  recipes: T[],
  opts: DedupeRecipesOptions = {},
): T[] {
  const seen = new Map<string, T>();

  for (const recipe of recipes) {
    const key = normalizeRecipeNameKey(recipe.name);
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, recipe);
      continue;
    }

    // Prefer curated (no provider) over provider rows.
    const existingIsCurated = existing.provider == null;
    const incomingIsCurated = recipe.provider == null;

    if (incomingIsCurated && !existingIsCurated) {
      seen.set(key, recipe);
    }
    // Otherwise keep the first-seen (stable order within same tier).
  }

  const result = [...seen.values()];
  return opts.limit !== undefined ? result.slice(0, opts.limit) : result;
}
