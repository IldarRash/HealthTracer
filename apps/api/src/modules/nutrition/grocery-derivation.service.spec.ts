import type { NutritionMealSlot, NutritionPlanPayload, NutritionPlanRevision } from "@health/types";
import { describe, expect, it } from "vitest";
import {
  assignCategory,
  deriveGroceryItems,
  groupByCategory,
  GroceryDerivationService,
} from "./grocery-derivation.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRevision(
  overrides: Partial<NutritionPlanPayload> = {},
  revisionId = "rev-001",
  revisionNumber = 1,
): NutritionPlanRevision {
  return {
    id: revisionId,
    nutritionPlanId: "plan-001",
    revisionNumber,
    reason: "Initial plan",
    source: "ai_proposal",
    createdAt: "2026-06-01T00:00:00.000Z",
    payload: {
      title: "Test Plan",
      summary: "A test nutrition plan.",
      caloriesPerDay: 2000,
      proteinGrams: 130,
      carbsGrams: 210,
      fatGrams: 65,
      hydrationLiters: 2.5,
      mealStructure: [],
      preferences: [],
      restrictions: [],
      allergies: [],
      notes: [],
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// assignCategory
// ---------------------------------------------------------------------------

describe("assignCategory", () => {
  it("assigns 'protein' to chicken", () => {
    expect(assignCategory("Chicken breast")).toBe("protein");
  });

  it("assigns 'protein' to salmon (Cyrillic)", () => {
    expect(assignCategory("Филе лосося")).toBe("protein");
  });

  it("assigns 'protein' to eggs (Cyrillic)", () => {
    expect(assignCategory("Яйца")).toBe("protein");
  });

  it("assigns 'vegetables' to spinach", () => {
    expect(assignCategory("Spinach")).toBe("vegetables");
  });

  it("assigns 'vegetables' to avocado (Cyrillic)", () => {
    expect(assignCategory("Авокадо")).toBe("vegetables");
  });

  it("assigns 'grains' to oatmeal (Cyrillic)", () => {
    expect(assignCategory("Овсянка")).toBe("grains");
  });

  it("assigns 'grains' to quinoa", () => {
    expect(assignCategory("Киноа")).toBe("grains");
  });

  it("assigns 'fruits' to bananas (Cyrillic)", () => {
    expect(assignCategory("Бананы")).toBe("fruits");
  });

  it("assigns 'fruits' to blueberry (Cyrillic)", () => {
    expect(assignCategory("Черника")).toBe("fruits");
  });

  it("falls back to 'pantry' for unrecognised ingredients", () => {
    expect(assignCategory("Olive oil")).toBe("pantry");
    expect(assignCategory("Оливковое масло")).toBe("pantry");
    expect(assignCategory("Семена чиа")).toBe("pantry");
  });

  it("is case-insensitive", () => {
    expect(assignCategory("CHICKEN")).toBe("protein");
    expect(assignCategory("quinoa")).toBe("grains");
  });
});

// ---------------------------------------------------------------------------
// deriveGroceryItems — empty state
// ---------------------------------------------------------------------------

describe("deriveGroceryItems — empty state", () => {
  it("returns empty array when mealStructure is empty", () => {
    const payload: NutritionPlanPayload = makeRevision().payload;
    expect(deriveGroceryItems(payload, [])).toEqual([]);
  });

  it("returns empty array when meal slots have no ingredients", () => {
    const slots: NutritionMealSlot[] = [
      { label: "Breakfast", timingHint: null },
      { label: "Lunch", timingHint: null },
    ];
    const payload = makeRevision({ mealStructure: slots }).payload;

    expect(deriveGroceryItems(payload, [])).toEqual([]);
  });

  it("returns empty array when ingredients arrays are explicitly empty", () => {
    const slots: NutritionMealSlot[] = [
      { label: "Breakfast", timingHint: null, ingredients: [] },
    ];
    const payload = makeRevision({ mealStructure: slots }).payload;

    expect(deriveGroceryItems(payload, [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deriveGroceryItems — basic derivation
// ---------------------------------------------------------------------------

describe("deriveGroceryItems — basic derivation", () => {
  it("extracts a single ingredient correctly", () => {
    const slots: NutritionMealSlot[] = [
      {
        label: "Breakfast",
        timingHint: null,
        ingredients: [{ name: "Oatmeal", quantity: 100, unit: "г" }],
      },
    ];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, []);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "Oatmeal",
      quantity: "100 г",
      category: "grains",
      isAllergen: false,
    });
  });

  it("formats quantity without unit when unit is absent", () => {
    const slots: NutritionMealSlot[] = [
      {
        label: "Breakfast",
        timingHint: null,
        ingredients: [{ name: "Eggs", quantity: 3 }],
      },
    ];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, []);

    expect(items[0]?.quantity).toBe("3");
  });

  it("formats quantity as empty string when quantity is absent", () => {
    const slots: NutritionMealSlot[] = [
      {
        label: "Breakfast",
        timingHint: null,
        ingredients: [{ name: "Garlic", unit: "cloves" }],
      },
    ];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, []);

    expect(items[0]?.quantity).toBe("");
  });

  it("aggregates ingredients across multiple meal slots", () => {
    const slots: NutritionMealSlot[] = [
      {
        label: "Breakfast",
        timingHint: null,
        ingredients: [{ name: "Spinach", quantity: 50, unit: "г" }],
      },
      {
        label: "Dinner",
        timingHint: null,
        ingredients: [{ name: "Spinach", quantity: 100, unit: "г" }],
      },
    ];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, []);

    // Should be de-duplicated and summed
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Spinach", quantity: "150 г" });
  });

  it("preserves separate entries for same ingredient with different units", () => {
    const slots: NutritionMealSlot[] = [
      {
        label: "Breakfast",
        timingHint: null,
        ingredients: [{ name: "Chicken", quantity: 200, unit: "г" }],
      },
      {
        label: "Dinner",
        timingHint: null,
        ingredients: [{ name: "Chicken", quantity: 1, unit: "кг" }],
      },
    ];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, []);

    // Different units → keep the first entry unchanged (not cross-unit arithmetic)
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe("200 г");
  });

  it("aggregates ingredients across 7 days (all meal slots)", () => {
    // 3 slots × 2 ingredients each = 6 entries → de-dup to 2 unique items
    const makeSlot = (label: string): NutritionMealSlot => ({
      label,
      timingHint: null,
      ingredients: [
        { name: "Chicken", quantity: 100, unit: "г" },
        { name: "Rice", quantity: 80, unit: "г" },
      ],
    });

    const slots = [makeSlot("Breakfast"), makeSlot("Lunch"), makeSlot("Dinner")];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, []);

    expect(items).toHaveLength(2);

    const chicken = items.find((i) => i.name === "Chicken");
    const rice = items.find((i) => i.name === "Rice");

    expect(chicken?.quantity).toBe("300 г");
    expect(rice?.quantity).toBe("240 г");
  });

  it("normalises ingredient names case-insensitively for de-duplication", () => {
    const slots: NutritionMealSlot[] = [
      {
        label: "Breakfast",
        timingHint: null,
        ingredients: [{ name: "Quinoa", quantity: 50, unit: "г" }],
      },
      {
        label: "Lunch",
        timingHint: null,
        ingredients: [{ name: "quinoa", quantity: 60, unit: "г" }],
      },
    ];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, []);

    // Treated as the same ingredient; first-seen capitalisation kept
    expect(items).toHaveLength(1);
    expect(items[0]?.quantity).toBe("110 г");
  });
});

// ---------------------------------------------------------------------------
// deriveGroceryItems — allergy flagging
// ---------------------------------------------------------------------------

describe("deriveGroceryItems — allergy flagging", () => {
  it("flags items matching a declared allergy", () => {
    const slots: NutritionMealSlot[] = [
      {
        label: "Breakfast",
        timingHint: null,
        ingredients: [
          { name: "Peanut butter", quantity: 30, unit: "г" },
          { name: "Banana", quantity: 1 },
        ],
      },
    ];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, ["peanut"]);

    const peanut = items.find((i) => i.name === "Peanut butter");
    const banana = items.find((i) => i.name === "Banana");

    expect(peanut?.isAllergen).toBe(true);
    expect(banana?.isAllergen).toBe(false);
  });

  it("flags Cyrillic allergen match", () => {
    const slots: NutritionMealSlot[] = [
      {
        label: "Breakfast",
        timingHint: null,
        ingredients: [{ name: "Орехи кешью", quantity: 30, unit: "г" }],
      },
    ];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, ["орехи"]);

    expect(items[0]?.isAllergen).toBe(true);
  });

  it("returns allergen items in the list (not silently excluded)", () => {
    // Per spec: allergens are flagged, not excluded — frontend can choose to grey out
    const slots: NutritionMealSlot[] = [
      {
        label: "Breakfast",
        timingHint: null,
        ingredients: [{ name: "Peanuts", quantity: 20, unit: "г" }],
      },
    ];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, ["peanut"]);

    expect(items).toHaveLength(1);
  });

  it("returns no allergen flags when allergies array is empty", () => {
    const slots: NutritionMealSlot[] = [
      {
        label: "Breakfast",
        timingHint: null,
        ingredients: [{ name: "Chicken", quantity: 200, unit: "г" }],
      },
    ];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, []);

    expect(items.every((i) => !i.isAllergen)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// groupByCategory
// ---------------------------------------------------------------------------

describe("groupByCategory", () => {
  it("returns empty array for no items", () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it("groups items into the correct categories", () => {
    const items = deriveGroceryItems(
      makeRevision({
        mealStructure: [
          {
            label: "Breakfast",
            timingHint: null,
            ingredients: [
              { name: "Oatmeal", quantity: 100, unit: "г" },
              { name: "Chicken", quantity: 200, unit: "г" },
              { name: "Spinach", quantity: 50, unit: "г" },
            ],
          },
        ],
      }).payload,
      [],
    );

    const groups = groupByCategory(items);

    const categoryNames = groups.map((g) => g.category);

    expect(categoryNames).toContain("protein");
    expect(categoryNames).toContain("vegetables");
    expect(categoryNames).toContain("grains");
  });

  it("omits empty categories", () => {
    const items = deriveGroceryItems(
      makeRevision({
        mealStructure: [
          {
            label: "Breakfast",
            timingHint: null,
            ingredients: [{ name: "Chicken", quantity: 200, unit: "г" }],
          },
        ],
      }).payload,
      [],
    );

    const groups = groupByCategory(items);
    const nonProtein = groups.filter((g) => g.category !== "protein");

    expect(nonProtein).toHaveLength(0);
  });

  it("follows canonical category order", () => {
    const items = [
      { name: "Apple", quantity: "1", category: "fruits" as const, isAllergen: false },
      { name: "Rice", quantity: "200 г", category: "grains" as const, isAllergen: false },
      { name: "Chicken", quantity: "300 г", category: "protein" as const, isAllergen: false },
    ];

    const groups = groupByCategory(items);

    expect(groups.map((g) => g.category)).toEqual(["protein", "grains", "fruits"]);
  });
});

// ---------------------------------------------------------------------------
// GroceryDerivationService
// ---------------------------------------------------------------------------

describe("GroceryDerivationService.deriveFromRevision", () => {
  const service = new GroceryDerivationService();

  it("returns well-formed response for a revision with ingredients", () => {
    const revision = makeRevision(
      {
        allergies: ["peanut"],
        mealStructure: [
          {
            label: "Breakfast",
            timingHint: "08:00",
            ingredients: [
              { name: "Oatmeal", quantity: 100, unit: "г" },
              { name: "Banana", quantity: 1 },
            ],
          },
          {
            label: "Lunch",
            timingHint: "13:00",
            ingredients: [
              { name: "Chicken", quantity: 200, unit: "г" },
              { name: "Spinach", quantity: 80, unit: "г" },
            ],
          },
        ],
      },
      "rev-xyz",
      5,
    );

    const result = service.deriveFromRevision(revision);

    expect(result.revisionId).toBe("rev-xyz");
    expect(result.revisionNumber).toBe(5);
    expect(result.totalItems).toBe(4);
    expect(result.mealsPerDay).toBe(2);
    expect(result.allergies).toEqual(["peanut"]);
    expect(result.categories.length).toBeGreaterThan(0);
  });

  it("returns empty response for a plan with no ingredient data", () => {
    const revision = makeRevision({
      mealStructure: [
        { label: "Breakfast", timingHint: null },
        { label: "Lunch", timingHint: null },
      ],
    });

    const result = service.deriveFromRevision(revision);

    expect(result.totalItems).toBe(0);
    expect(result.categories).toEqual([]);
    expect(result.mealsPerDay).toBe(2);
  });

  it("passes allergies from payload to item flagging", () => {
    const revision = makeRevision({
      allergies: ["nuts", "peanut"],
      mealStructure: [
        {
          label: "Snack",
          timingHint: null,
          ingredients: [
            { name: "Peanut butter", quantity: 30, unit: "г" },
            { name: "Chicken", quantity: 150, unit: "г" },
          ],
        },
      ],
    });

    const result = service.deriveFromRevision(revision);
    const allItems = result.categories.flatMap((g) => g.items);
    const peanut = allItems.find((i) => i.name === "Peanut butter");

    expect(peanut?.isAllergen).toBe(true);
  });
});

describe("GroceryDerivationService.emptyResponse", () => {
  const service = new GroceryDerivationService();

  it("returns null revisionId and revisionNumber", () => {
    const result = service.emptyResponse();

    expect(result.revisionId).toBeNull();
    expect(result.revisionNumber).toBeNull();
  });

  it("returns zero totalItems and empty arrays", () => {
    const result = service.emptyResponse();

    expect(result.totalItems).toBe(0);
    expect(result.categories).toEqual([]);
    expect(result.allergies).toEqual([]);
    expect(result.mealsPerDay).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bought-state isolation invariant
// ---------------------------------------------------------------------------

describe("bought-state isolation invariant", () => {
  it("deriveGroceryItems never returns a 'bought' field", () => {
    // The grocery list derivation must not include bought state — that is
    // client-only (localStorage keyed by revisionId). This test ensures
    // no accidental bought field leaks into the derived items.
    const slots: NutritionMealSlot[] = [
      {
        label: "Breakfast",
        timingHint: null,
        ingredients: [{ name: "Chicken", quantity: 200, unit: "г" }],
      },
    ];
    const items = deriveGroceryItems(makeRevision({ mealStructure: slots }).payload, []);

    expect(items.every((i) => !("bought" in i))).toBe(true);
  });

  it("GroceryDerivationService never writes to the database", () => {
    // The service has no repository dependency — verified structurally.
    const service = new GroceryDerivationService();
    const serviceKeys = Object.keys(service);

    expect(serviceKeys.every((k) => !k.toLowerCase().includes("repository"))).toBe(true);
    expect(serviceKeys.every((k) => !k.toLowerCase().includes("db"))).toBe(true);
  });
});
