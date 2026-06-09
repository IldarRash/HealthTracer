import type {
  GroceryCategory,
  GroceryCategoryGroup,
  GroceryItem,
  GroceryListResponse,
  NutritionPlanPayload,
  NutritionPlanRevision,
} from "@health/types";
import { Injectable } from "@nestjs/common";

/**
 * The 5 canonical grocery categories (aisle buckets) in display order.
 * Maps to the Russian labels shown in the C3 design spec.
 */
const CATEGORY_ORDER: GroceryCategory[] = [
  "protein",
  "vegetables",
  "grains",
  "fruits",
  "pantry",
];

/**
 * Keyword-based category assignments for common ingredients.
 * Keys are lowercased tokens; the first match wins.
 * Unrecognised ingredients fall back to "pantry".
 */
const CATEGORY_KEYWORDS: ReadonlyArray<{ keywords: string[]; category: GroceryCategory }> = [
  {
    // Protein: meats, fish, eggs, dairy protein sources
    keywords: [
      "chicken", "beef", "pork", "turkey", "lamb", "fish", "salmon", "tuna",
      "shrimp", "prawn", "egg", "tofu", "tempeh", "lentil", "bean", "chickpea",
      "cottage cheese", "greek yogurt", "курица", "куриное", "говядин", "свинин",
      "лосос", "тунец", "яйц", "творог", "кефир", "мясо", "рыб", "креветк",
    ],
    category: "protein",
  },
  {
    // Vegetables & greens
    keywords: [
      "spinach", "broccoli", "cauliflower", "carrot", "cucumber", "tomato",
      "pepper", "onion", "garlic", "zucchini", "squash", "kale", "lettuce",
      "celery", "leek", "beet", "eggplant", "asparagus", "green bean",
      "шпинат", "брокколи", "огурец", "помидор", "морковь", "лук", "чеснок",
      "кабачок", "баклажан", "свёкл", "зелень", "петрушк", "укроп", "салат",
      "авокадо", "avocado",
    ],
    category: "vegetables",
  },
  {
    // Grains & cereals
    keywords: [
      "oat", "oatmeal", "quinoa", "rice", "pasta", "bread", "wheat", "barley",
      "millet", "buckwheat", "cornmeal", "flour",
      "овсян", "киноа", "рис", "гречк", "пшен", "макарон", "хлеб", "мука",
      "крупа", "злак",
    ],
    category: "grains",
  },
  {
    // Fruits & berries
    keywords: [
      "apple", "banana", "orange", "berry", "blueberry", "strawberry", "grape",
      "mango", "pineapple", "peach", "pear", "lemon", "lime", "cherry",
      "яблок", "банан", "апельсин", "ягод", "черник", "клубник", "виноград",
      "манго", "ананас", "персик", "груш", "лимон", "вишн",
    ],
    category: "fruits",
  },
];

/**
 * Assign a grocery category to an ingredient name using keyword matching.
 * Falls back to "pantry" when no keyword matches.
 */
export function assignCategory(name: string): GroceryCategory {
  const lower = name.toLowerCase();

  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return category;
    }
  }

  return "pantry";
}

/**
 * Normalise an ingredient name for use as an aggregation key.
 * Strips leading/trailing whitespace and lowercases the string.
 */
function normaliseKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Format a numeric quantity and unit into a human-readable string.
 * Returns an empty string when quantity is absent.
 */
function formatQuantity(quantity: number | null | undefined, unit: string | null | undefined): string {
  if (quantity == null) return "";
  const unitStr = unit ? ` ${unit.trim()}` : "";

  return `${quantity}${unitStr}`;
}

/**
 * Aggregate numeric quantity values for the same ingredient.
 * When both entries have a numeric quantity with the same unit (or no unit),
 * returns the summed value. When units differ, keeps only the first — the API
 * intentionally avoids cross-unit arithmetic (e.g. kg vs pieces).
 */
function mergeQuantities(
  existing: { rawQuantity: number | null; unit: string | null | undefined },
  incoming: { rawQuantity: number | null; unit: string | null | undefined },
): { rawQuantity: number | null; unit: string | null | undefined } {
  const sameUnit = normaliseKey(existing.unit ?? "") === normaliseKey(incoming.unit ?? "");

  if (existing.rawQuantity != null && incoming.rawQuantity != null && sameUnit) {
    return { rawQuantity: existing.rawQuantity + incoming.rawQuantity, unit: existing.unit };
  }

  // Units differ or one is null — keep existing entry unchanged.
  return existing;
}

type AggregationEntry = {
  name: string;
  rawQuantity: number | null;
  unit: string | null | undefined;
  category: GroceryCategory;
  isAllergen: boolean;
};

/**
 * Pure derivation logic: aggregate all ingredients from mealStructure slots
 * into a de-duplicated, quantity-summed, categorised grocery list.
 *
 * Does NOT read from the database — takes the parsed payload directly.
 */
export function deriveGroceryItems(
  payload: NutritionPlanPayload,
  allergies: string[],
): GroceryItem[] {
  const allergyKeywords = allergies.map((a) => a.toLowerCase());
  const aggregated = new Map<string, AggregationEntry>();

  for (const slot of payload.mealStructure) {
    if (!slot.ingredients) continue;

    for (const ingredient of slot.ingredients) {
      const key = normaliseKey(ingredient.name);
      const category = assignCategory(ingredient.name);
      const isAllergen = allergyKeywords.some((kw) => key.includes(kw));

      const existing = aggregated.get(key);

      if (existing) {
        const merged = mergeQuantities(
          { rawQuantity: existing.rawQuantity, unit: existing.unit },
          { rawQuantity: ingredient.quantity ?? null, unit: ingredient.unit },
        );
        aggregated.set(key, { ...existing, ...merged });
      } else {
        aggregated.set(key, {
          name: ingredient.name.trim(),
          rawQuantity: ingredient.quantity ?? null,
          unit: ingredient.unit ?? null,
          category,
          isAllergen,
        });
      }
    }
  }

  return Array.from(aggregated.values()).map(
    (entry): GroceryItem => ({
      name: entry.name,
      quantity: formatQuantity(entry.rawQuantity, entry.unit),
      category: entry.category,
      isAllergen: entry.isAllergen,
    }),
  );
}

/**
 * Group a flat list of grocery items into category buckets in canonical order.
 * Empty categories are omitted from the result.
 */
export function groupByCategory(items: GroceryItem[]): GroceryCategoryGroup[] {
  const map = new Map<GroceryCategory, GroceryItem[]>();

  for (const item of items) {
    const bucket = map.get(item.category) ?? [];
    bucket.push(item);
    map.set(item.category, bucket);
  }

  return CATEGORY_ORDER.filter((cat) => map.has(cat)).map((cat) => ({
    category: cat,
    items: map.get(cat)!,
  }));
}

@Injectable()
export class GroceryDerivationService {
  /**
   * Derive a grocery list from the active nutrition plan revision.
   * Returns a well-formed response even when the plan has no ingredient data.
   * Never writes to the database.
   */
  deriveFromRevision(revision: NutritionPlanRevision): GroceryListResponse {
    const payload = revision.payload;
    const allergies = payload.allergies ?? [];

    const items = deriveGroceryItems(payload, allergies);
    const categories = groupByCategory(items);

    return {
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      totalItems: items.length,
      categories,
      allergies,
      mealsPerDay: payload.mealStructure.length,
    };
  }

  /** Returns a well-formed empty response when no active plan/revision exists. */
  emptyResponse(): GroceryListResponse {
    return {
      revisionId: null,
      revisionNumber: null,
      totalItems: 0,
      categories: [],
      allergies: [],
      mealsPerDay: 0,
    };
  }
}
