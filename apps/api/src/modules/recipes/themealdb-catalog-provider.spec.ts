import { describe, expect, it, vi } from "vitest";
import {
  buildTheMealDbCategoryFilterUrl,
  THEMEALDB_REQUEST_TIMEOUT_MS,
  TheMealDbCatalogProvider,
} from "./themealdb-catalog-provider.js";

describe("TheMealDbCatalogProvider privacy-safe queries", () => {
  it("builds category filter URLs from generic catalog terms only", () => {
    const url = buildTheMealDbCategoryFilterUrl("Vegetarian");

    expect(url).toBe("https://www.themealdb.com/api/json/v1/1/filter.php?c=Vegetarian");
    expect(url).not.toMatch(/user|email|allerg|restriction|goal|profile|health/i);
  });

  it("passes an abort signal to provider fetches", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);

      return new Response(JSON.stringify({ meals: null }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      const provider = new TheMealDbCatalogProvider();

      await expect(provider.fetchByGenericCategories(["Vegetarian"])).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/filter.php?c=Vegetarian"),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(THEMEALDB_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
