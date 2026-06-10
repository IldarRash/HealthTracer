/**
 * recompute-recipe-macros.mjs
 *
 * Backfill script: recomputes macro estimates for all TheMealDB-sourced recipe
 * rows using the @health/nutrition-macros engine (USDA FoodData Central data).
 *
 * Idempotent — safe to run multiple times; each run updates the computed values
 * with whatever the current engine produces.
 *
 * Usage:
 *   pnpm --filter @health/db db:recompute-recipe-macros
 *   # or directly:
 *   node packages/db/scripts/recompute-recipe-macros.mjs
 *
 * Requires DATABASE_URL in environment (or .env in packages/db/).
 */

/* global process, console */

import "dotenv/config";
import postgres from "postgres";
import { computeRecipeMacros } from "@health/nutrition-macros";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Set it in your environment or packages/db/.env");
}

// TheMealDB ingredient amounts are for the whole dish (typically a family-sized
// main) and the API exposes no serving count. Mirror the runtime mapper's
// assumption (THEMEALDB_ASSUMED_SERVINGS) so per-serving macros are realistic.
const THEMEALDB_ASSUMED_SERVINGS = 4;

const sql = postgres(databaseUrl);

try {
  // Fetch all TheMealDB provider recipe rows
  const rows = await sql`
    SELECT id, ingredients, servings, source, confidence
    FROM recipes
    WHERE
      provider = 'themealdb'
      OR source ILIKE '%approximate%'
  `;

  if (rows.length === 0) {
    console.log("No TheMealDB recipe rows found — nothing to recompute.");
    process.exit(0);
  }

  console.log(`Recomputing macros for ${rows.length} recipe(s)...`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    let ingredients;

    try {
      ingredients = typeof row.ingredients === "string"
        ? JSON.parse(row.ingredients)
        : row.ingredients;
    } catch {
      console.warn(`  Row ${row.id}: failed to parse ingredients JSON — skipping.`);
      skipped++;
      continue;
    }

    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      console.warn(`  Row ${row.id}: no ingredients — skipping.`);
      skipped++;
      continue;
    }

    const servings = THEMEALDB_ASSUMED_SERVINGS;
    const computed = computeRecipeMacros(ingredients, servings);

    await sql`
      UPDATE recipes
      SET
        servings            = ${servings},
        estimated_calories = ${computed.estimatedCalories},
        protein_grams       = ${computed.proteinGrams},
        carbs_grams         = ${computed.carbsGrams},
        fat_grams           = ${computed.fatGrams},
        fiber_grams         = ${computed.fiberGrams ?? null},
        confidence          = ${computed.confidence},
        source              = 'TheMealDB catalog — macros computed from USDA FoodData Central (estimates, not verified nutrition facts)',
        updated_at          = NOW()
      WHERE id = ${row.id}
    `;

    updated++;
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}.`);
} finally {
  await sql.end({ timeout: 5 });
}
