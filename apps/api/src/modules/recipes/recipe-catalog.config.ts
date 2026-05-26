import { Injectable } from "@nestjs/common";
import {
  THEMEALDB_PROVIDER,
  type ProviderRecipeDraft,
  type RecipeCatalogProvider,
} from "./recipe-catalog-provider.js";

@Injectable()
export class SeededOnlyRecipeCatalogProvider implements RecipeCatalogProvider {
  readonly providerName = THEMEALDB_PROVIDER;

  async fetchByGenericCategories(): Promise<ProviderRecipeDraft[]> {
    return [];
  }
}

export type RecipeCatalogProviderMode = "themealdb" | "seeded_only";

export function resolveRecipeCatalogProviderMode(): RecipeCatalogProviderMode {
  const raw = process.env.RECIPE_CATALOG_PROVIDER?.trim().toLowerCase();

  if (raw === "seeded_only" || raw === "none" || raw === "disabled" || raw === "off") {
    return "seeded_only";
  }

  return "themealdb";
}
