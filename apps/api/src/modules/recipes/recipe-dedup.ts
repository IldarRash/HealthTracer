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

type MinimalRecipe = Pick<Recipe, "name" | "provider"> & Partial<Pick<Recipe, "source">>;

/**
 * Deduplicates recipes by canonical name, preferring curated/seed rows (provider === null)
 * over provider rows, then stable order within each preference tier.
 *
 * User-authored recipes (`source === "user_created"`) are exempt: the user must always
 * see their own recipe even when a catalog recipe shares the same canonical name.
 */
export function dedupeRecipesByCanonicalName<T extends MinimalRecipe>(
  recipes: T[],
  opts: DedupeRecipesOptions = {},
): T[] {
  const seenByKey = new Map<string, { index: number; recipe: T }>();
  const out: T[] = [];

  for (const recipe of recipes) {
    if (recipe.source === "user_created") {
      out.push(recipe);
      continue;
    }

    const key = normalizeRecipeNameKey(recipe.name);
    const existing = seenByKey.get(key);

    if (!existing) {
      seenByKey.set(key, { index: out.length, recipe });
      out.push(recipe);
      continue;
    }

    // Prefer curated (no provider) over provider rows.
    const existingIsCurated = existing.recipe.provider == null;
    const incomingIsCurated = recipe.provider == null;

    if (incomingIsCurated && !existingIsCurated) {
      out[existing.index] = recipe;
      existing.recipe = recipe;
    }
    // Otherwise keep the first-seen (stable order within same tier).
  }

  return opts.limit !== undefined ? out.slice(0, opts.limit) : out;
}
