import { afterEach, describe, expect, it } from "vitest";
import { SeededOnlyRecipeCatalogProvider, resolveRecipeCatalogProviderMode } from "./recipe-catalog.config.js";
import { SEEDED_ONLY_PROVIDER, THEMEALDB_PROVIDER } from "./recipe-catalog-provider.js";

describe("recipe catalog provider configuration", () => {
  const original = process.env.RECIPE_CATALOG_PROVIDER;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.RECIPE_CATALOG_PROVIDER;
    } else {
      process.env.RECIPE_CATALOG_PROVIDER = original;
    }
  });

  it("defaults to themealdb when unset", () => {
    delete process.env.RECIPE_CATALOG_PROVIDER;

    expect(resolveRecipeCatalogProviderMode()).toBe("themealdb");
  });

  it("supports seeded-only mode through environment configuration", () => {
    process.env.RECIPE_CATALOG_PROVIDER = "seeded_only";

    expect(resolveRecipeCatalogProviderMode()).toBe("seeded_only");
  });
});

describe("SeededOnlyRecipeCatalogProvider", () => {
  it("uses its own distinct providerName instead of the TheMealDB label", () => {
    const provider = new SeededOnlyRecipeCatalogProvider();

    expect(provider.providerName).toBe(SEEDED_ONLY_PROVIDER);
    expect(provider.providerName).not.toBe(THEMEALDB_PROVIDER);
  });

  it("returns an empty catalog", async () => {
    const provider = new SeededOnlyRecipeCatalogProvider();

    const drafts = await provider.fetchByGenericCategories(["breakfast"]);

    expect(drafts).toEqual([]);
  });
});
