import { afterEach, describe, expect, it } from "vitest";
import { resolveRecipeCatalogProviderMode } from "./recipe-catalog.config.js";

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
