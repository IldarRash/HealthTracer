/**
 * build-usda-lookup.mjs
 *
 * Documents how packages/nutrition-macros/data/usda-foods.json was produced.
 *
 * The lookup is a curated subset of USDA FoodData Central reference values
 * (SR Legacy / FNDDS abbreviations) for common cooking ingredients.
 *
 * USDA FoodData Central: https://fdc.nal.usda.gov/
 * SR Legacy data download: https://fdc.nal.usda.gov/download-datasets.html
 *   → "Support Data for All Branded Foods" and "SR Legacy" archives contain
 *     nutrients per 100g for thousands of ingredients.
 *
 * For the curated file checked into this repo:
 *   - Values were hand-verified against USDA FDC SR Legacy records for ~280
 *     common cooking ingredients (proteins, grains, dairy, oils, vegetables,
 *     fruits, legumes, nuts, condiments, spices, eggs, liquids).
 *   - All values are PER 100G of edible portion (raw where applicable, or
 *     closest commonly-used form — e.g. cooked rice, cooked pasta, canned tuna).
 *   - Fields: kcal (energy), protein (g), carbs (g), fat (g), fiber (g).
 *   - Common cooking aliases are included (scallion→green onion,
 *     aubergine→eggplant, courgette→zucchini, minced beef→ground beef, etc.)
 *   - Spices/herbs have very small per-recipe contributions so rounding errors
 *     are acceptable at typical usage quantities.
 *
 * To regenerate from USDA bulk download (optional — requires the FDC data files):
 *
 *   1. Download "SR Legacy" from https://fdc.nal.usda.gov/download-datasets.html
 *   2. Unzip to ./usda-sr-legacy/ (contains food.csv, nutrient.csv, food_nutrient.csv)
 *   3. Run this script:
 *        node packages/nutrition-macros/scripts/build-usda-lookup.mjs
 *
 * The script below is a STUB — it prints instructions.  The curated JSON file
 * checked into the repo is the authoritative source for runtime use and does not
 * need to be regenerated unless ingredient coverage is expanded significantly.
 */

/* global process, console */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const srLegacyDir = join(scriptDir, "../usda-sr-legacy");

if (!existsSync(srLegacyDir)) {
  console.log(`
USDA SR Legacy data not found at: ${srLegacyDir}

To rebuild from raw USDA data:
  1. Download "SR Legacy" dataset from:
     https://fdc.nal.usda.gov/download-datasets.html
  2. Unzip into: ${srLegacyDir}
     (should contain food.csv, nutrient.csv, food_nutrient.csv)
  3. Run this script again.

The curated usda-foods.json checked into the repo was hand-verified against
USDA FDC SR Legacy values and covers ~280 common cooking ingredients. For
typical recipe macro computation, the curated file is sufficient.

Provenance: USDA FoodData Central — https://fdc.nal.usda.gov/
`);
  process.exit(0);
}

// Full rebuild from USDA SR Legacy CSV files would go here.
// Required nutrient IDs from SR Legacy:
//   1008 → Energy (kcal)
//   1003 → Protein (g)
//   1005 → Carbohydrates (g)
//   1004 → Total Fat (g)
//   1079 → Dietary Fiber (g)

console.log("USDA SR Legacy data found. Full CSV-based rebuild not yet implemented.");
console.log("Edit packages/nutrition-macros/data/usda-foods.json directly to add entries.");
process.exit(0);
