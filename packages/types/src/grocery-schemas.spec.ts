/**
 * Zod schema contract tests for C3 grocery list types.
 * Validates groceryItemSchema, groceryCategoryGroupSchema, groceryListResponseSchema.
 */
import { describe, expect, it } from "vitest";
import {
  groceryCategoryGroupSchema,
  groceryCategorySchema,
  groceryItemSchema,
  groceryListResponseSchema,
} from "./index.js";

// ── groceryCategorySchema ────────────────────────────────────────────────────

describe("groceryCategorySchema", () => {
  it("accepts each of the five canonical categories", () => {
    for (const cat of ["protein", "vegetables", "grains", "fruits", "pantry"] as const) {
      expect(groceryCategorySchema.safeParse(cat).success).toBe(true);
    }
  });

  it("rejects an unknown category string", () => {
    expect(groceryCategorySchema.safeParse("dairy").success).toBe(false);
    expect(groceryCategorySchema.safeParse("").success).toBe(false);
  });
});

// ── groceryItemSchema ────────────────────────────────────────────────────────

describe("groceryItemSchema", () => {
  it("accepts a valid item with all fields", () => {
    const result = groceryItemSchema.safeParse({
      name: "Chicken breast",
      quantity: "1.2 кг",
      category: "protein",
      isAllergen: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Chicken breast");
      expect(result.data.quantity).toBe("1.2 кг");
      expect(result.data.category).toBe("protein");
      expect(result.data.isAllergen).toBe(false);
    }
  });

  it("accepts an item with empty quantity string (unknown quantity)", () => {
    const result = groceryItemSchema.safeParse({
      name: "Garlic",
      quantity: "",
      category: "vegetables",
      isAllergen: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts an allergen-flagged item", () => {
    const result = groceryItemSchema.safeParse({
      name: "Peanut butter",
      quantity: "30 г",
      category: "pantry",
      isAllergen: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isAllergen).toBe(true);
    }
  });

  it("rejects an item with an empty name", () => {
    expect(
      groceryItemSchema.safeParse({
        name: "",
        quantity: "100 г",
        category: "protein",
        isAllergen: false,
      }).success,
    ).toBe(false);
  });

  it("rejects an item with name exceeding 160 chars", () => {
    expect(
      groceryItemSchema.safeParse({
        name: "A".repeat(161),
        quantity: "",
        category: "grains",
        isAllergen: false,
      }).success,
    ).toBe(false);
  });

  it("rejects an item with quantity exceeding 80 chars", () => {
    expect(
      groceryItemSchema.safeParse({
        name: "Rice",
        quantity: "Q".repeat(81),
        category: "grains",
        isAllergen: false,
      }).success,
    ).toBe(false);
  });

  it("rejects an item with an unknown category", () => {
    expect(
      groceryItemSchema.safeParse({
        name: "Milk",
        quantity: "1 л",
        category: "dairy",
        isAllergen: false,
      }).success,
    ).toBe(false);
  });

  it("rejects an item with missing required fields", () => {
    expect(groceryItemSchema.safeParse({ name: "Rice" }).success).toBe(false);
    expect(
      groceryItemSchema.safeParse({ name: "Rice", quantity: "100 г", category: "grains" }).success,
    ).toBe(false); // missing isAllergen
  });
});

// ── groceryCategoryGroupSchema ───────────────────────────────────────────────

describe("groceryCategoryGroupSchema", () => {
  it("accepts a valid group with items", () => {
    const result = groceryCategoryGroupSchema.safeParse({
      category: "vegetables",
      items: [
        { name: "Spinach", quantity: "150 г", category: "vegetables", isAllergen: false },
        { name: "Avocado", quantity: "4 шт", category: "vegetables", isAllergen: false },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(2);
    }
  });

  it("accepts a group with an empty items array", () => {
    const result = groceryCategoryGroupSchema.safeParse({
      category: "fruits",
      items: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a group with an unknown category", () => {
    expect(
      groceryCategoryGroupSchema.safeParse({
        category: "beverages",
        items: [],
      }).success,
    ).toBe(false);
  });

  it("rejects a group when an item inside is invalid", () => {
    expect(
      groceryCategoryGroupSchema.safeParse({
        category: "grains",
        items: [{ name: "", quantity: "100 г", category: "grains", isAllergen: false }],
      }).success,
    ).toBe(false);
  });
});

// ── groceryListResponseSchema ────────────────────────────────────────────────

describe("groceryListResponseSchema", () => {
  const validResponse = {
    revisionId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    revisionNumber: 3,
    totalItems: 5,
    categories: [
      {
        category: "protein",
        items: [
          { name: "Chicken", quantity: "300 г", category: "protein", isAllergen: false },
        ],
      },
    ],
    allergies: ["peanut"],
    mealsPerDay: 4,
  };

  it("accepts a well-formed response", () => {
    const result = groceryListResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.revisionNumber).toBe(3);
      expect(result.data.totalItems).toBe(5);
      expect(result.data.mealsPerDay).toBe(4);
      expect(result.data.allergies).toEqual(["peanut"]);
      expect(result.data.categories).toHaveLength(1);
    }
  });

  it("accepts a response with empty categories and allergies", () => {
    const result = groceryListResponseSchema.safeParse({
      ...validResponse,
      totalItems: 0,
      categories: [],
      allergies: [],
      mealsPerDay: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts null revisionId and revisionNumber for the no-plan empty state", () => {
    // emptyResponse() from the backend returns null for both fields when no active plan exists.
    // The schema must accept null so the client parse does not throw and the empty UI state is reachable.
    const result = groceryListResponseSchema.safeParse({
      revisionId: null,
      revisionNumber: null,
      totalItems: 0,
      categories: [],
      allergies: [],
      mealsPerDay: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.revisionId).toBeNull();
      expect(result.data.revisionNumber).toBeNull();
    }
  });

  it("rejects an invalid UUID for revisionId", () => {
    expect(
      groceryListResponseSchema.safeParse({ ...validResponse, revisionId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects a non-positive revisionNumber", () => {
    expect(
      groceryListResponseSchema.safeParse({ ...validResponse, revisionNumber: 0 }).success,
    ).toBe(false);
    expect(
      groceryListResponseSchema.safeParse({ ...validResponse, revisionNumber: -1 }).success,
    ).toBe(false);
  });

  it("rejects a negative totalItems value", () => {
    expect(
      groceryListResponseSchema.safeParse({ ...validResponse, totalItems: -1 }).success,
    ).toBe(false);
  });

  it("rejects a negative mealsPerDay value", () => {
    expect(
      groceryListResponseSchema.safeParse({ ...validResponse, mealsPerDay: -1 }).success,
    ).toBe(false);
  });

  it("rejects when allergies contains an empty string", () => {
    expect(
      groceryListResponseSchema.safeParse({ ...validResponse, allergies: [""] }).success,
    ).toBe(false);
  });

  it("rejects when categories contains an invalid group", () => {
    expect(
      groceryListResponseSchema.safeParse({
        ...validResponse,
        categories: [{ category: "unknown", items: [] }],
      }).success,
    ).toBe(false);
  });

  it("is rejected when required fields are missing", () => {
    const { revisionId: _omit, ...withoutId } = validResponse;
    expect(groceryListResponseSchema.safeParse(withoutId).success).toBe(false);

    const { categories: _omit2, ...withoutCategories } = validResponse;
    expect(groceryListResponseSchema.safeParse(withoutCategories).success).toBe(false);
  });
});
