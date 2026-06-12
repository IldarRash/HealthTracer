# Real Data for Exercises, Recipes & Nutrition (knowledge base + user authoring)

> Status: in progress (branch `feature/real-catalog-data`). Source plan: approved 2026-06-09.
> Scope: full feature, phased — catalog import first, then user authoring + per-plan edit flows.

## 1. Intent

Give the app **real reference data** for its two knowledge bases and let users extend them:

- **Exercises** — replace the ~60-row hardcoded seed with a large, real catalog (free-exercise-db, ~870 movements, Public Domain) including demo media. Users can already add their own exercise (`POST /exercises`); the *prescription* model (sets / reps / isometric duration / target weight / rest) already exists in `workoutPlanExerciseSchema`, so this is purely a catalog-sourcing gap.
- **Recipes** — replace **fabricated macros** (every TheMealDB recipe currently gets a uniform `550 kcal / 25P / 45C / 20F`) with **real КБЖУ computed from USDA FoodData Central** (public domain). Grow the catalog to a few hundred recipes. Let users **author their own recipes**, and when a recipe is pulled into a nutrition plan, let them **edit grams → recompute calories/КБЖУ live**.

Macros are explicitly **estimates** (confidence band stored + surfaced), consistent with the wellness / non-diagnostic product invariant.

## 2. Data sources & licensing

| Domain | Source | License | Use |
|---|---|---|---|
| Exercises | yuhonas/free-exercise-db | Unlicense (Public Domain) | Vendored JSON → build-time seed into `exercises` (`source: free_exercise_db`) |
| Recipe macros | USDA FoodData Central (Foundation + SR Legacy) | Public Domain | Vendored pruned per-100g lookup → `computeRecipeMacros` engine |
| Recipe content | TheMealDB (existing) | Attributed | Recipe text/ingredients/images; macros now USDA-computed, not fabricated |

## 3. Phases

- **Phase 0** — archive `body-and-nutrition/` briefs → `archive/`; add this brief.
- **Phase 1** — vendor free-exercise-db; rewrite `generate-exercises-seed.mjs` to map records to our enums (muscles/equipment/level/patterns/modalities/media); regenerate + seed; mapper tests.
- **Phase 2** — vendored USDA lookup + pure `computeRecipeMacros(ingredients, servings)` engine (free-text unit→grams parser, name→USDA match, confidence banding); wire into `themealdb-recipe.mapper.ts` (delete `APPROXIMATE_PROVIDER_MACRO_ESTIMATES`); backfill script; widen catalog.
- **Phase 3** — `createRecipeInputSchema`; `recipes.userId` + migration + per-user dedupe; `RecipesService.createRecipe` (auto-computes macros if omitted); `POST/PATCH/DELETE /recipes`; web add-recipe form. Mirrors the existing user-exercise pattern.
- **Phase 4** — "add recipe to plan" pre-fills an editable meal slot; editing grams rescales kcal/КБЖУ via the Phase 2 engine; changes flow through the existing proposal → nutrition plan revision lifecycle.

## 4. Current state (before this work)

- `exercises`: 60 rows, all `system_seed`, mostly no media.
- `recipes`: 17 rows (5 seed + 12 TheMealDB with identical fabricated macros).
- No user-create-recipe endpoint; recipe catalog macros not editable per plan.

## 5. Reused (not rebuilt)

- `workoutPlanExerciseSchema` (full prescription model) — `packages/types/src/workouts.ts`.
- `POST /exercises` + `findOrCreateExercise` dedupe — `apps/api/src/modules/exercises/`.
- `upsertProviderRecipes` `onConflictDoUpdate` (overwrites stale macros) — `recipes.repository.ts`.
- `nutritionMealSlotSchema` editable per-meal macros + proposal→revision lifecycle.

## 6. Verification

- `select count(*) from exercises;` → hundreds, media refs populated.
- `select source, count(*) from recipes group by 1;` + sample macros → non-uniform, plausible (no uniform 550/25/45/20).
- Module tests (`apps/api` recipes/exercises, `packages/types`, macro-engine package), then `lint`/`typecheck`/`build`.
- App-runner: author a custom recipe, add to plan, edit grams, confirm kcal/КБЖУ rescale + new nutrition plan revision.

## 7. Deferred follow-ups

- Make the workout planner **select catalog exercises** instead of inventing via `pendingExerciseRef` (catalog is now rich enough).
- Full USDA branded-foods coverage (only common foods vendored to keep the repo lean).
