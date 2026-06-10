import type { RecipeIngredient, RecipeMacroEstimates } from "@health/types";
import usdaFoodsRaw from "../data/usda-foods.json" with { type: "json" };

// ---------------------------------------------------------------------------
// USDA lookup types
// ---------------------------------------------------------------------------

interface UsdaNutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

interface UsdaFoodsFile {
  foods: Record<string, UsdaNutrients>;
  aliases: Record<string, string>;
}

const usdaData = usdaFoodsRaw as UsdaFoodsFile;

// ---------------------------------------------------------------------------
// Unit → grams conversion tables
// ---------------------------------------------------------------------------

/** Volume / weight units → approximate grams.  Key is normalized unit token. */
const UNIT_TO_GRAMS: Record<string, number> = {
  // Weight
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  mg: 0.001,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
  // Volume (water-density default; overridden via density table)
  ml: 1,
  milliliter: 1,
  milliliters: 1,
  millilitre: 1,
  millilitres: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  litre: 1000,
  litres: 1000,
  cup: 240,
  cups: 240,
  tbsp: 15,
  tablespoon: 15,
  tablespoons: 15,
  tbs: 15,
  tsp: 5,
  teaspoon: 5,
  teaspoons: 5,
  // Counts / portions
  clove: 5, // garlic clove ≈ 5g
  cloves: 5,
  slice: 25,
  slices: 25,
  can: 400,
  cans: 400,
  bunch: 60,
  head: 500, // head of garlic / cabbage — rough
  stalk: 40,
  stalks: 40,
  sprig: 2,
  sprigs: 2,
  leaf: 1,
  leaves: 1,
  stick: 113, // stick of butter
  packet: 30,
  sachet: 7,
  bag: 150,
  fillet: 170,
  fillets: 170,
  breast: 170,
  breasts: 170,
  thigh: 110,
  thighs: 110,
  drumstick: 90,
  drumsticks: 90,
  wing: 90,
  wings: 90,
  large: 100,
  medium: 75,
  small: 50,
  whole: 100,
};

/**
 * Ingredient-name overrides for volume→grams density conversions.
 * Key: normalized ingredient name fragment → grams per ml (or per cup/tbsp/tsp as appropriate).
 * Applied after unit lookup; multiplied against the normal volume factor.
 */
const DENSITY_OVERRIDE: Record<string, number> = {
  "olive oil": 0.91,
  "vegetable oil": 0.92,
  "canola oil": 0.92,
  "coconut oil": 0.9,
  "sesame oil": 0.92,
  "sunflower oil": 0.92,
  oil: 0.92,
  butter: 0.91, // per ml
  ghee: 0.9,
  flour: 0.55, // cups of flour ≈ 120g → 0.5 g/ml
  honey: 1.42,
  "maple syrup": 1.32,
  sugar: 0.85,
  milk: 1.03,
  "heavy cream": 0.99,
  "sour cream": 1.0,
  "cream cheese": 1.0,
};

// ---------------------------------------------------------------------------
// Fraction / number parsing
// ---------------------------------------------------------------------------

/** Parses a numeric string including simple fractions like "1/2", "3/4". */
function parseFraction(token: string): number | null {
  // Unicode vulgar fractions
  const vulgarMap: Record<string, number> = {
    "½": 0.5,
    "¼": 0.25,
    "¾": 0.75,
    "⅓": 1 / 3,
    "⅔": 2 / 3,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
  };

  if (vulgarMap[token] !== undefined) {
    return vulgarMap[token] ?? null;
  }

  // Ascii fraction "3/4"
  const fractionMatch = /^(\d+)\s*\/\s*(\d+)$/.exec(token);

  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    return denominator === 0 ? null : numerator / denominator;
  }

  const n = Number(token);
  return isNaN(n) ? null : n;
}

/**
 * Splits a leading numeric token from a string like "1 cup", "3/4 cup", "1/2 lb".
 * Returns [quantity, remainder] or [null, original].
 *
 * Order of attempts (most-specific first to avoid greedy digit matches eating "3/4"):
 *   1. Mixed number with vulgar fraction: "1 ½ cups"
 *   2. Plain slash fraction: "3/4 cup", "1/2 lb"
 *   3. Decimal or integer + optional vulgar suffix: "1.5 cups", "2 cups"
 *   4. Leading vulgar fraction alone: "½ cup"
 */
function parseLeadingQuantity(text: string): [number | null, string] {
  const trimmed = text.trim();

  // 1. Mixed number + vulgar fraction: "1 ½ cups" or "1½ cups"
  const mixedRe = /^(\d+)\s+([½¼¾⅓⅔⅛⅜⅝⅞])\s*(.*)/;
  const mixedMatch = mixedRe.exec(trimmed);

  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const frac = parseFraction(mixedMatch[2] ?? "") ?? 0;
    return [whole + frac, (mixedMatch[3] ?? "").trim()];
  }

  // 2. Plain slash fraction: "3/4 cup", "1/2 lb"
  const fracRe = /^(\d+)\s*\/\s*(\d+)\s+(.*)/;
  const fracMatch = fracRe.exec(trimmed);

  if (fracMatch) {
    const num = Number(fracMatch[1]);
    const den = Number(fracMatch[2]);

    if (den !== 0) {
      return [num / den, (fracMatch[3] ?? "").trim()];
    }
  }

  // 3. Decimal / integer: "1.5 cups", "200g", "2 tbsp"
  const numRe = /^(\d+(?:[.,]\d+)?)\s*(.*)/;
  const numMatch = numRe.exec(trimmed);

  if (numMatch) {
    const qty = Number((numMatch[1] ?? "").replace(",", "."));
    return [qty, (numMatch[2] ?? "").trim()];
  }

  // 4. Leading unicode vulgar fraction: "½ cup"
  const vulgarRe = /^([½¼¾⅓⅔⅛⅜⅝⅞])\s*(.*)/;
  const vulgarMatch = vulgarRe.exec(trimmed);

  if (vulgarMatch) {
    const qty = parseFraction(vulgarMatch[1] ?? "");
    return qty !== null ? [qty, (vulgarMatch[2] ?? "").trim()] : [null, trimmed];
  }

  return [null, trimmed];
}

// ---------------------------------------------------------------------------
// Unit parsing
// ---------------------------------------------------------------------------

/** Returns grams-per-unit given the unit token and optional ingredient name. */
function unitToGrams(unitToken: string, ingredientName: string): number | null {
  const norm = unitToken.toLowerCase().trim();
  const base = UNIT_TO_GRAMS[norm];

  if (base === undefined) {
    return null;
  }

  // Apply density override for volume units
  const isVolume = [
    "ml", "milliliter", "milliliters", "millilitre", "millilitres",
    "l", "liter", "liters", "litre", "litres",
    "cup", "cups", "tbsp", "tablespoon", "tablespoons", "tbs",
    "tsp", "teaspoon", "teaspoons",
  ].includes(norm);

  if (isVolume) {
    const normName = ingredientName.toLowerCase();
    for (const [key, density] of Object.entries(DENSITY_OVERRIDE)) {
      if (normName.includes(key)) {
        return base * density;
      }
    }
  }

  return base;
}

/**
 * Parse a TheMealDB measure string (which may contain both quantity AND unit)
 * plus an optional explicit quantity field into a total grams value.
 *
 * Examples handled:
 *   unit="3/4 cup", quantity=null  → 180g
 *   unit="200g",    quantity=null  → 200g
 *   unit="2 tbsp",  quantity=null  → 30g
 *   unit="1/2 lb",  quantity=null  → 226.8g
 *   unit="3",       quantity=null  → bare count → 3 * 100g = 300g (generic portion)
 *   unit="cup",     quantity=0.5   → 120g
 *   unit=null,      quantity=2     → 2 * 100g (generic portion)
 */
export function parseIngredientGrams(
  ingredientName: string,
  unit: string | null | undefined,
  quantity: number | null | undefined,
): { grams: number; matched: boolean } {
  const name = ingredientName.trim();

  // If both null/empty → unknown
  if (!unit && (quantity === null || quantity === undefined)) {
    return { grams: 0, matched: false };
  }

  // If unit contains free-text like "1 cup" or "200g", parse it
  if (unit) {
    const unitTrimmed = unit.trim();

    // Try leading quantity from the unit string
    const [parsedQty, remainder] = parseLeadingQuantity(unitTrimmed);
    const effectiveQty = parsedQty !== null ? parsedQty : (quantity ?? 1);

    // If the remainder is non-empty, treat it as the unit token
    if (remainder) {
      const gPerUnit = unitToGrams(remainder, name);

      if (gPerUnit !== null) {
        return { grams: effectiveQty * gPerUnit, matched: true };
      }

      // Remainder might be descriptive ("breasts", "fillets", "medium cloves")
      // Try first token of remainder
      const firstToken = remainder.split(/\s+/)[0] ?? "";
      const gPerFirst = unitToGrams(firstToken, name);

      if (gPerFirst !== null) {
        return { grams: effectiveQty * gPerFirst, matched: true };
      }

      // Remainder is unparseable — use a generic 100g portion per count
      return { grams: effectiveQty * 100, matched: false };
    }

    // No remainder: parsedQty was a bare number (e.g. unit="3")
    if (parsedQty !== null) {
      // Bare number → generic 100g per item
      return { grams: parsedQty * 100, matched: false };
    }

    // No parseable quantity at all in unit string
    if (quantity !== null && quantity !== undefined) {
      // Fall through to quantity-only path
    } else {
      return { grams: 0, matched: false };
    }
  }

  // quantity only (no useful unit text)
  if (quantity !== null && quantity !== undefined) {
    return { grams: quantity * 100, matched: false };
  }

  return { grams: 0, matched: false };
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

/** Strip parentheticals, extra descriptors, singularize trivially. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // remove parentheticals
    .replace(/\b(fresh|dried|frozen|canned|cooked|raw|chopped|diced|sliced|minced|ground|grated|shredded|boneless|skinless|whole|large|medium|small|baby|organic|extra|virgin)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve alias chain (max depth 3 to prevent cycles). */
function resolveAlias(key: string, aliases: Record<string, string>): string {
  let resolved = key;

  for (let depth = 0; depth < 3; depth++) {
    const next = aliases[resolved];

    if (!next || next === resolved) {
      break;
    }

    resolved = next;
  }

  return resolved;
}

/**
 * Look up an ingredient name in the USDA table.
 * Tries: exact → alias → normalized exact → normalized alias → token-overlap best match.
 */
export function lookupNutrients(rawName: string): UsdaNutrients | null {
  const { foods, aliases } = usdaData;

  // 1. Exact match
  if (foods[rawName]) {
    return foods[rawName] ?? null;
  }

  // 2. Alias exact
  const aliased = resolveAlias(rawName, aliases);

  if (aliased !== rawName && foods[aliased]) {
    return foods[aliased] ?? null;
  }

  // 3. Normalized exact
  const norm = normalizeName(rawName);

  if (foods[norm]) {
    return foods[norm] ?? null;
  }

  // 4. Normalized alias
  const normAliased = resolveAlias(norm, aliases);

  if (normAliased !== norm && foods[normAliased]) {
    return foods[normAliased] ?? null;
  }

  // 5. Token overlap: find food key whose tokens best overlap with ingredient tokens.
  // Use only tokens of length > 3 to avoid spurious matches on short words like "oil"
  // matching "xylophone foil" or "flakes" matching unrelated foods.
  const nameTokens = new Set(norm.split(/\s+/).filter((t) => t.length > 3));

  if (nameTokens.size === 0) {
    return null;
  }

  let bestKey = "";
  let bestScore = 0;

  for (const foodKey of Object.keys(foods)) {
    const keyTokens = foodKey.split(/\s+/).filter((t) => t.length > 3);

    if (keyTokens.length === 0) {
      continue;
    }

    const overlap = keyTokens.filter((t) => nameTokens.has(t)).length;

    if (overlap === 0) {
      continue;
    }

    // Require at least one token to be present in BOTH the ingredient name AND the food key.
    // Jaccard-like score: intersection / union
    const union = new Set([...nameTokens, ...keyTokens]).size;
    const score = overlap / union;

    if (score > bestScore) {
      bestScore = score;
      bestKey = foodKey;
    }
  }

  // Require a reasonably strong token match (≥40% Jaccard) AND at least 1 shared token
  // that is meaningful (length > 3) to avoid spurious low-token matches.
  if (bestScore >= 0.4 && bestKey) {
    return foods[bestKey] ?? null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface RecipeMacroResult extends RecipeMacroEstimates {
  confidence: "high" | "medium" | "low";
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compute macro estimates for a recipe from its ingredients and serving count.
 *
 * This is a PURE, deterministic function — no network, no Date, no random.
 * All values are estimates based on USDA FoodData Central per-100g reference
 * data; they are NOT verified nutrition facts.
 */
export function computeRecipeMacros(
  ingredients: RecipeIngredient[],
  servings: number,
): RecipeMacroResult {
  const effectiveServings = Math.max(1, servings);

  let totalKcal = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let totalFiber = 0;
  let totalEstimatedGrams = 0;
  let matchedGrams = 0;

  for (const ingredient of ingredients) {
    const { grams, matched: unitMatched } = parseIngredientGrams(
      ingredient.name,
      ingredient.unit,
      ingredient.quantity,
    );

    if (grams <= 0) {
      continue;
    }

    totalEstimatedGrams += grams;

    const nutrients = lookupNutrients(ingredient.name);

    if (!nutrients) {
      // Ingredient unknown — counted in denominator but not matched
      continue;
    }

    // Contributed macros (per 100g × grams used)
    const factor = grams / 100;
    totalKcal += nutrients.kcal * factor;
    totalProtein += nutrients.protein * factor;
    totalCarbs += nutrients.carbs * factor;
    totalFat += nutrients.fat * factor;
    totalFiber += nutrients.fiber * factor;

    if (unitMatched) {
      matchedGrams += grams;
    } else {
      // Name was found even if unit was a bare count — credit partial match
      matchedGrams += grams * 0.5;
    }
  }

  // Per-serving
  const kcalPerServing = Math.max(1, Math.round(totalKcal / effectiveServings));
  const proteinPerServing = Math.round(totalProtein / effectiveServings);
  const carbsPerServing = Math.round(totalCarbs / effectiveServings);
  const fatPerServing = Math.round(totalFat / effectiveServings);
  const fiberPerServing = Math.round(totalFiber / effectiveServings);

  // Confidence: fraction of estimated grams that were matched
  const matchRatio =
    totalEstimatedGrams > 0 ? matchedGrams / totalEstimatedGrams : 0;
  let confidence: "high" | "medium" | "low" =
    matchRatio >= 0.8 ? "high" : matchRatio >= 0.5 ? "medium" : "low";

  // Plausibility guard: a well-matched recipe can still produce implausible
  // per-serving values when a free-text measure is misparsed (e.g. a bare count
  // treated as 100g each). Such outliers must never claim high/medium confidence —
  // they are downgraded to "low" so the UI surfaces them as rough, editable
  // estimates. This only ever lowers confidence, never raises it.
  const isImplausiblePerServing =
    kcalPerServing > 1200 ||
    proteinPerServing > 120 ||
    carbsPerServing > 200 ||
    fatPerServing > 120;

  if (isImplausiblePerServing) {
    confidence = "low";
  }

  return {
    estimatedCalories: kcalPerServing,
    proteinGrams: proteinPerServing,
    carbsGrams: carbsPerServing,
    fatGrams: fatPerServing,
    fiberGrams: fiberPerServing,
    confidence,
  };
}
