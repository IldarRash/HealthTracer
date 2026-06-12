import { describe, expect, it } from "vitest";
import { dedupeRecipesByCanonicalName, normalizeRecipeNameKey } from "./recipe-dedup.js";

describe("normalizeRecipeNameKey", () => {
  it("lowercases the name", () => {
    expect(normalizeRecipeNameKey("CHICKEN RICE")).toBe("chickenrice");
  });

  it("strips diacritics (NFKD)", () => {
    expect(normalizeRecipeNameKey("Café au lait")).toBe("cafeaulait");
    // "brûlée" → "brulee" after diacritic strip, then "ee" collapses → "brule"
    expect(normalizeRecipeNameKey("Crème brûlée")).toBe("cremebrule");
  });

  it("removes non-letter characters", () => {
    expect(normalizeRecipeNameKey("chicken & rice (easy)")).toBe("chickenriceasy");
    expect(normalizeRecipeNameKey("tomato-basil sauce")).toBe("tomatobasilsauce");
  });

  it("collapses repeated adjacent letters — Fettuccine vs Fettucine", () => {
    const key1 = normalizeRecipeNameKey("Fettuccine Alfredo");
    const key2 = normalizeRecipeNameKey("Fettucine alfredo");
    expect(key1).toBe(key2);
  });

  it("collapses double letters in any position", () => {
    expect(normalizeRecipeNameKey("grilled")).toBe("griled");
    expect(normalizeRecipeNameKey("mozzarella")).toBe("mozarela");
  });

  it("produces a consistent key for the same name regardless of spacing", () => {
    expect(normalizeRecipeNameKey("Chicken Rice")).toBe(normalizeRecipeNameKey("Chicken  Rice"));
  });
});

describe("dedupeRecipesByCanonicalName", () => {
  function makeRecipe(name: string, provider: string | null = null) {
    return { name, provider };
  }

  it("keeps all recipes with distinct canonical names", () => {
    const recipes = [
      makeRecipe("Greek Yogurt Bowl"),
      makeRecipe("Salmon Rice"),
      makeRecipe("Tofu Stir Fry"),
    ];
    const result = dedupeRecipesByCanonicalName(recipes);
    expect(result).toHaveLength(3);
  });

  it("deduplicates Fettuccine vs Fettucine case", () => {
    const recipes = [
      makeRecipe("Fettucine alfredo", "themealdb"),
      makeRecipe("Fettuccine Alfredo"),
    ];
    const result = dedupeRecipesByCanonicalName(recipes);
    expect(result).toHaveLength(1);
  });

  it("prefers curated (no provider) over provider rows", () => {
    const curated = makeRecipe("Fettuccine Alfredo", null);
    const provider = makeRecipe("Fettucine alfredo", "themealdb");
    const result = dedupeRecipesByCanonicalName([provider, curated]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(curated);
  });

  it("prefers curated even when provider appears first", () => {
    const provider = makeRecipe("Chicken Curry", "themealdb");
    const curated = makeRecipe("Chicken Curry", null);
    const result = dedupeRecipesByCanonicalName([provider, curated]);
    expect(result[0]).toBe(curated);
  });

  it("keeps the first-seen when all candidates are from the same tier (provider)", () => {
    const first = makeRecipe("Pasta Bolognese", "themealdb");
    const second = makeRecipe("Pasta Bolognese", "otherprovider");
    const result = dedupeRecipesByCanonicalName([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(first);
  });

  it("applies the limit after deduplication", () => {
    const recipes = [
      makeRecipe("Salad A"),
      makeRecipe("Salad B"),
      makeRecipe("Salad C"),
    ];
    const result = dedupeRecipesByCanonicalName(recipes, { limit: 2 });
    expect(result).toHaveLength(2);
  });

  it("handles diacritics in names", () => {
    // Both normalize to same key ("cremebrule") after repeated-letter collapse
    const recipes = [
      makeRecipe("Crème Brûlée", "themealdb"),
      makeRecipe("Creme Brulee"),
    ];
    const result = dedupeRecipesByCanonicalName(recipes);
    expect(result).toHaveLength(1);
    // Curated (no provider) wins
    expect(result[0]?.provider).toBeNull();
  });

  it("handles an empty list", () => {
    expect(dedupeRecipesByCanonicalName([])).toEqual([]);
  });
});
