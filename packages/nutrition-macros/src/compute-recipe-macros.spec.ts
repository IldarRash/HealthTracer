import { describe, expect, it } from "vitest";
import {
  computeRecipeMacros,
  lookupNutrients,
  parseIngredientGrams,
} from "./compute-recipe-macros.js";

// ---------------------------------------------------------------------------
// parseIngredientGrams
// ---------------------------------------------------------------------------

describe("parseIngredientGrams", () => {
  it("parses grams unit directly", () => {
    const { grams, matched } = parseIngredientGrams("flour", "200g", null);
    expect(grams).toBe(200);
    expect(matched).toBe(true);
  });

  it("parses kg unit", () => {
    const { grams, matched } = parseIngredientGrams("chicken", "0.5 kg", null);
    expect(grams).toBeCloseTo(500, 0);
    expect(matched).toBe(true);
  });

  it("parses cup unit (free text combined)", () => {
    const { grams, matched } = parseIngredientGrams("flour", "1 cup", null);
    // 1 cup flour = 240ml × 0.55 density ≈ 132g
    expect(grams).toBeCloseTo(132, 0);
    expect(matched).toBe(true);
  });

  it("parses fractional cup '3/4 cup'", () => {
    const { grams, matched } = parseIngredientGrams("water", "3/4 cup", null);
    // 3/4 × 240 = 180g (water density ≈ 1)
    expect(grams).toBeCloseTo(180, 0);
    expect(matched).toBe(true);
  });

  it("parses '1/2 cup' soy sauce", () => {
    const { grams } = parseIngredientGrams("soy sauce", "1/2 cup", null);
    // 0.5 × 240 = 120g (no density override for soy sauce → water default)
    expect(grams).toBeCloseTo(120, 0);
  });

  it("parses tablespoon unit", () => {
    const { grams, matched } = parseIngredientGrams("olive oil", "2 tbsp", null);
    // 2 × 15ml × 0.91 density ≈ 27.3g
    expect(grams).toBeCloseTo(27.3, 0);
    expect(matched).toBe(true);
  });

  it("parses teaspoon unit", () => {
    const { grams, matched } = parseIngredientGrams("salt", "1 tsp", null);
    expect(grams).toBeCloseTo(5, 0);
    expect(matched).toBe(true);
  });

  it("parses oz unit", () => {
    const { grams, matched } = parseIngredientGrams("cheese", "4 oz", null);
    expect(grams).toBeCloseTo(113.4, 0);
    expect(matched).toBe(true);
  });

  it("parses lb unit", () => {
    const { grams, matched } = parseIngredientGrams("beef", "1/2 lb", null);
    expect(grams).toBeCloseTo(226.8, 0);
    expect(matched).toBe(true);
  });

  it("parses unicode fraction ½ cup", () => {
    const { grams, matched } = parseIngredientGrams("water", "½ cup", null);
    expect(grams).toBeCloseTo(120, 0);
    expect(matched).toBe(true);
  });

  it("parses mixed number '1 ½ cups'", () => {
    const { grams, matched } = parseIngredientGrams("water", "1 ½ cups", null);
    expect(grams).toBeCloseTo(360, 0);
    expect(matched).toBe(true);
  });

  it("handles bare count (unit='2') as generic 100g portions", () => {
    const { grams, matched } = parseIngredientGrams("egg", "2", null);
    expect(grams).toBe(200);
    expect(matched).toBe(false);
  });

  it("handles '2 breasts' as count × portion size", () => {
    const { grams, matched } = parseIngredientGrams("chicken", "2 breasts", null);
    expect(grams).toBe(340); // 2 × 170g
    expect(matched).toBe(true);
  });

  it("handles quantity=2 with no unit as generic portion", () => {
    const { grams, matched } = parseIngredientGrams("egg", null, 2);
    expect(grams).toBe(200);
    expect(matched).toBe(false);
  });

  it("returns 0 unmatched for null/null", () => {
    const { grams, matched } = parseIngredientGrams("mystery", null, null);
    expect(grams).toBe(0);
    expect(matched).toBe(false);
  });

  it("handles ml unit", () => {
    const { grams, matched } = parseIngredientGrams("water", "250 ml", null);
    expect(grams).toBe(250);
    expect(matched).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// lookupNutrients
// ---------------------------------------------------------------------------

describe("lookupNutrients", () => {
  it("finds exact match", () => {
    const n = lookupNutrients("chicken breast");
    expect(n).not.toBeNull();
    expect(n?.kcal).toBe(165);
    expect(n?.protein).toBe(31);
  });

  it("resolves alias: scallion → green onion → spring onion", () => {
    const n = lookupNutrients("scallion");
    expect(n).not.toBeNull();
  });

  it("resolves alias: aubergine → eggplant", () => {
    const n = lookupNutrients("aubergine");
    expect(n).not.toBeNull();
    expect(n?.kcal).toBe(25);
  });

  it("resolves alias: courgette → zucchini", () => {
    const n = lookupNutrients("courgette");
    expect(n).not.toBeNull();
    expect(n?.kcal).toBe(17);
  });

  it("resolves alias: minced beef → ground beef", () => {
    const n = lookupNutrients("minced beef");
    expect(n).not.toBeNull();
    expect(n?.kcal).toBe(254);
  });

  it("normalizes descriptor words: 'boneless skinless chicken breast' → chicken breast", () => {
    const n = lookupNutrients("boneless skinless chicken breast");
    expect(n).not.toBeNull();
  });

  it("returns null for unknown ingredient", () => {
    const n = lookupNutrients("xylophone flakes");
    expect(n).toBeNull();
  });

  it("finds token overlap match: 'fresh ground black pepper' → black pepper", () => {
    const n = lookupNutrients("fresh ground black pepper");
    expect(n).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeRecipeMacros
// ---------------------------------------------------------------------------

describe("computeRecipeMacros", () => {
  it("computes non-zero, non-uniform macros for a simple recipe", () => {
    const ingredients = [
      { name: "chicken breast", unit: "200g", quantity: null },
      { name: "olive oil", unit: "2 tbsp", quantity: null },
      { name: "garlic", unit: "2 cloves", quantity: null },
    ];
    const result = computeRecipeMacros(ingredients, 1);

    // Should not be all zeros
    expect(result.estimatedCalories).toBeGreaterThan(0);
    // Should not be the old fake constants (550 cal, 25p, 45c, 20f)
    expect(result.estimatedCalories).not.toBe(550);
    expect(result.proteinGrams).not.toBe(25);
    expect(result.carbsGrams).not.toBe(45);
    expect(result.fatGrams).not.toBe(20);

    // Chicken breast + oil should have notable protein and fat
    expect(result.proteinGrams).toBeGreaterThan(10);
    expect(result.fatGrams).toBeGreaterThan(3);
  });

  it("divides macros correctly by servings", () => {
    const ingredients = [
      { name: "pasta", unit: "400g", quantity: null },
      { name: "ground beef", unit: "300g", quantity: null },
      { name: "tomato sauce", unit: "200g", quantity: null },
    ];
    const result1 = computeRecipeMacros(ingredients, 1);
    const result4 = computeRecipeMacros(ingredients, 4);

    // Per-serving values for 4 servings should be roughly 1/4 of single-serving
    expect(result4.estimatedCalories).toBeLessThan(result1.estimatedCalories);
    expect(result4.proteinGrams).toBeLessThan(result1.proteinGrams);
  });

  it("returns low confidence when all ingredients are unknown", () => {
    const result = computeRecipeMacros(
      [
        { name: "quantum foam extract", unit: "3 tbsp", quantity: null },
        { name: "hypercaloric paste", unit: "100g", quantity: null },
      ],
      1,
    );
    expect(result.confidence).toBe("low");
  });

  it("returns high confidence when most ingredient grams are well-matched", () => {
    // Very precise g measurements → high unit match + known foods
    const result = computeRecipeMacros(
      [
        { name: "chicken breast", unit: "200g", quantity: null },
        { name: "broccoli", unit: "150g", quantity: null },
        { name: "olive oil", unit: "15g", quantity: null },
        { name: "soy sauce", unit: "20g", quantity: null },
      ],
      1,
    );
    expect(result.confidence).toBe("high");
  });

  it("handles servings=0 gracefully (clamps to 1)", () => {
    const ingredients = [{ name: "chicken breast", unit: "200g", quantity: null }];
    const result0 = computeRecipeMacros(ingredients, 0);
    const result1 = computeRecipeMacros(ingredients, 1);
    expect(result0.estimatedCalories).toBe(result1.estimatedCalories);
  });

  it("includes fiber in results", () => {
    const result = computeRecipeMacros(
      [{ name: "lentils", unit: "200g", quantity: null }],
      1,
    );
    expect(result.fiberGrams).not.toBeNull();
    expect((result.fiberGrams ?? 0)).toBeGreaterThan(0);
  });

  it("produces different macros for distinct TheMealDB-style recipes", () => {
    // Teriyaki chicken recipe (chicken + soy sauce + water)
    const teriyakiResult = computeRecipeMacros(
      [
        { name: "soy sauce", unit: "3/4 cup", quantity: null },
        { name: "water", unit: "1/2 cup", quantity: null },
        { name: "chicken", unit: "2 breasts", quantity: null },
      ],
      2,
    );

    // Pasta bolognese (pasta + ground beef + tomato)
    const boloResult = computeRecipeMacros(
      [
        { name: "pasta", unit: "300g", quantity: null },
        { name: "ground beef", unit: "250g", quantity: null },
        { name: "tomato sauce", unit: "200g", quantity: null },
        { name: "onion", unit: "1 medium", quantity: null },
      ],
      3,
    );

    // Veggie stir-fry
    const stirFryResult = computeRecipeMacros(
      [
        { name: "broccoli", unit: "200g", quantity: null },
        { name: "bell pepper", unit: "150g", quantity: null },
        { name: "carrot", unit: "100g", quantity: null },
        { name: "sesame oil", unit: "2 tbsp", quantity: null },
        { name: "soy sauce", unit: "3 tbsp", quantity: null },
      ],
      2,
    );

    // All three should have different calorie counts (not identical fake value)
    const cals = [
      teriyakiResult.estimatedCalories,
      boloResult.estimatedCalories,
      stirFryResult.estimatedCalories,
    ];
    const uniqueCals = new Set(cals);
    expect(uniqueCals.size).toBeGreaterThanOrEqual(2);

    // Pasta bolognese should be higher calorie than veggie stir-fry (per serving)
    expect(boloResult.estimatedCalories).toBeGreaterThan(stirFryResult.estimatedCalories);
  });

  it("handles empty ingredients list without throwing", () => {
    const result = computeRecipeMacros([], 2);
    expect(result.estimatedCalories).toBeGreaterThanOrEqual(1); // clamped to 1
    expect(result.confidence).toBe("low");
  });
});
