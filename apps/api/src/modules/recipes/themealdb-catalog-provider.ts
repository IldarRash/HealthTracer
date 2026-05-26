import { Injectable, Logger } from "@nestjs/common";
import { GENERIC_RECIPE_CATALOG_CATEGORIES } from "./generic-recipe-catalog-categories.js";
import {
  THEMEALDB_PROVIDER,
  type ProviderRecipeDraft,
  type RecipeCatalogProvider,
} from "./recipe-catalog-provider.js";
import {
  mapTheMealDbMealToProviderDraft,
  type TheMealDbMeal,
} from "./themealdb-recipe.mapper.js";

const THEMEALDB_API_BASE = "https://www.themealdb.com/api/json/v1/1";
const MAX_CATEGORIES_PER_FETCH = 3;
const MAX_MEALS_PER_CATEGORY = 4;
export const THEMEALDB_REQUEST_TIMEOUT_MS = 5_000;

interface TheMealDbFilterResponse {
  meals: Array<{ idMeal: string; strMeal: string }> | null;
}

interface TheMealDbLookupResponse {
  meals: TheMealDbMeal[] | null;
}

@Injectable()
export class TheMealDbCatalogProvider implements RecipeCatalogProvider {
  readonly providerName = THEMEALDB_PROVIDER;
  private readonly logger = new Logger(TheMealDbCatalogProvider.name);

  async fetchByGenericCategories(
    categories: readonly string[] = GENERIC_RECIPE_CATALOG_CATEGORIES,
  ): Promise<ProviderRecipeDraft[]> {
    const selectedCategories = categories.slice(0, MAX_CATEGORIES_PER_FETCH);
    const drafts: ProviderRecipeDraft[] = [];
    const seenExternalIds = new Set<string>();

    for (const category of selectedCategories) {
      const mealIds = await this.fetchMealIdsForCategory(category);

      for (const mealId of mealIds.slice(0, MAX_MEALS_PER_CATEGORY)) {
        if (seenExternalIds.has(mealId)) {
          continue;
        }

        const meal = await this.lookupMeal(mealId);

        if (!meal) {
          continue;
        }

        const draft = mapTheMealDbMealToProviderDraft(meal);

        if (!draft) {
          continue;
        }

        seenExternalIds.add(mealId);
        drafts.push(draft);
      }
    }

    return drafts;
  }

  private async fetchMealIdsForCategory(category: string): Promise<string[]> {
    const url = `${THEMEALDB_API_BASE}/filter.php?c=${encodeURIComponent(category)}`;
    const response = await this.fetchJson<TheMealDbFilterResponse>(url);

    return (response.meals ?? []).map((meal) => meal.idMeal).filter(Boolean);
  }

  private async lookupMeal(mealId: string): Promise<TheMealDbMeal | null> {
    const url = `${THEMEALDB_API_BASE}/lookup.php?i=${encodeURIComponent(mealId)}`;
    const response = await this.fetchJson<TheMealDbLookupResponse>(url);

    return response.meals?.[0] ?? null;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), THEMEALDB_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`TheMealDB request failed with status ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.warn(
        `TheMealDB catalog fetch failed for ${this.sanitizeUrlForLogs(url)}`,
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private sanitizeUrlForLogs(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      return "themealdb-request";
    }
  }
}

export function buildTheMealDbCategoryFilterUrl(category: string): string {
  return `${THEMEALDB_API_BASE}/filter.php?c=${encodeURIComponent(category)}`;
}
