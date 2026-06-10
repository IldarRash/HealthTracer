# Nutrition C3 — "Закупка на неделю" (weekly grocery list)

Gap-analysis feature brief. Screen **C3** of the body-and-nutrition handoff: a shopping
checklist **derived from the weekly nutrition plan (C2)**, with local "bought" state that does
**not** mutate the plan.

> Design reference: the **"Питание · детальные сценарии"** row of the handoff canvas
> (`./screenshots/design/handoff-canvas.png`) — the grocery / «Закупка» frame. The original
> `nutrition-detail.jsx` / `kit.jsx` / `states.jsx` design sources have been removed from the
> repo, so the verbatim spec below (`GroceryScreen`, `GroceryCheck`, the `GROCERY` array,
> `Card`/`Progress`, the indigo "changes via chat" banner) is the preserved transcription of
> record. Canvas detail is small; the §2 spec is the authoritative design transcription.

![Grocery artboard — within the full handoff canvas](./screenshots/design/handoff-canvas.png)

---

## 1. Intent

Give the user a **ready-to-shop grocery list** assembled automatically from their weekly
ration (C2), grouped by store-aisle categories, so they can tick off items as they buy them.
The list is a **read-only projection of the plan**: checking an item is a private "I bought
this" convenience, not a plan edit. Allergies (e.g. nuts) are honoured in what the list
contains. When the coach changes the diet in chat, the list **rebuilds itself** — the user
never edits dishes here; that always routes back to chat. This reinforces the product
invariant **"coach proposes, person decides; plans change only through chat."**

---

## 2. Design spec

Source: `GroceryScreen` in `nutrition-detail.jsx`. Screen frame:
`AppShell(active='nutrition', contentBg=L.paper)` + `TopBar`.

### Top bar
- `title`: **«Закупка на неделю»**
- `sub`: **«Собрано из рациона · v8»** (version comes from the active nutrition revision)
- right: `soft` button **«Отправить в заметки»** (icon `doc`)

### Summary card (`Card pad={18}`)
A single horizontal strip:
- Green icon badge (`fork`, `M.greenDim` background).
- Title **«Список под план на 7 дней»** (16/700).
- Subtitle (13, `L.mut`), allergy-aware:
  **«{total} позиций · 5 приёмов в день · аллергия на орехи учтена»**
  (the "5 приёмов" count and "аллергия на … учтена" clause are derived from the plan; the
  nut-allergy wording is illustrative — render the user's real allergies).
- Counter, right-aligned: big number **`{got}`**`/{total}` over the uppercase label
  **«КУПЛЕНО»**, where `got` = items with `got/bought === true`, `total` = all items.
- `Progress` bar, width 120, `value={Math.round((got/total)*100)}`, `color={M.green}`, `h={8}`.

### Category grid (`display: grid; gridTemplateColumns: repeat(3,1fr); gap: 16`)
One `Card pad={18}` per category. Each card:
- Header row: small icon badge (`${color}22` bg) · category name (13.5/700) · item count
  (12, `L.mut2`) right-aligned.
- Item rows (`padding: '10px 2px'`, bottom border between rows):
  `GroceryCheck` (square checkbox) · item name (flex) · quantity (12.5/600, tabular-nums).
  - **Bought item**: checkbox filled green + check glyph; name `text-decoration: line-through`
    + `L.mut2`; quantity dimmed to `L.mut2`.
  - **Unbought item**: empty checkbox (`2px solid L.line2`); name `L.ink`; quantity `L.mut`.

### Exact `GROCERY` shape
```
GROCERY: Array<{
  cat: string,          // category label (RU)
  ic: string,           // Icon name
  color: string,        // M.* accent for the badge
  items: Array<{
    n: string,          // item name
    q: string,          // human quantity, e.g. '1.2 кг', '20 шт', '600 г'
    got?: boolean       // bought flag (design-static; becomes user state)
  }>
}>
```
The five design categories (verbatim labels, icons, accents):
| `cat` | `ic` | `color` |
|---|---|---|
| Белок | `fork` | `M.green` |
| Овощи и зелень | `heart` | `M.blue` |
| Крупы и злаки | `today` | `M.amber` |
| Фрукты и ягоды | `drop` | `M.red` |
| Бакалея и прочее | `spark` | `M.indigo` |

Example items (illustrative, not exhaustive): `Куриное филе · 1.2 кг (got)`,
`Филе лосося · 600 г`, `Яйца · 20 шт (got)`, `Шпинат · 2 пучка (got)`, `Авокадо · 4 шт`,
`Киноа · 500 г`, `Овсянка · 1 кг (got)`, `Бананы · 7 шт`, `Черника · 300 г`,
`Оливковое масло · 0.5 л (got)`, `Семена чиа · 200 г`.

### `GroceryCheck` component (`{ on }`)
20×20, radius 6. `on` → no border, `M.green` fill, centred `checkSm` glyph (stroke `#04130c`).
`off` → transparent fill, `2px solid L.line2` border, no glyph. **Toggling `on` is the only
interaction**: it flips the item's bought flag → strikethrough/dim on the row → recompute
`got` → update the summary counter `{got}/{total}` and the `Progress` value.

### Indigo "changes via chat" banner (bottom)
`background: rgba(123,123,255,0.08)`, `border: 1px solid rgba(123,123,255,0.28)`, `spark`
icon stroked `#5b5bd6`. Verbatim copy:
> **«Список пересобирается автоматически, когда коуч меняет рацион в чате. Менять блюда —
> тоже через чат.»**

Trailing `soft` button **«Поменять блюдо»** (icon `chat`) → opens chat. Plus the top-bar
**«Отправить в заметки»** (icon `doc`) action.

---

## 3. Current state

**Verified live via Chrome MCP (2026-06-08, `/nutrition`, dark theme, authenticated PRO).**
The live nutrition page is read-only and renders, top to bottom: a **view-only banner**; the
active plan header (**"Balanced daily nutrition base", v2**) with RevisionFacts; **DAILY targets
only** (no weekly view); a **Meal structure** card showing a single "Breakfast" slot label; a
**today-adherence empty state**; a **"Meal ideas"** recipe grid (4 cards ≈550 kcal / 25 g
protein, with the note *"Saving or logging a recipe in Today does not change plan targets"*);
and **Plan version history**.

**Absent in the running app:** any grocery list, any shopping/ingredient aggregation, any
checkable "bought" rows, any 3-column category grid. **Nothing in the app produces a grocery
list today** — neither a C2 weekly matrix nor structured ingredients exist to derive one from.

| Area | Path | Status |
|---|---|---|
| Web nutrition surface | `apps/web/app/nutrition/page.tsx` → `NutritionWorkspace` (`apps/web/src/components/nutrition/nutrition-workspace.tsx`) | **No grocery feature.** Single read-only screen (view-only banner, active-plan header + RevisionFacts, daily targets, meal-structure labels, adherence empty state, "Meal ideas" recipe grid, version history). **No C2 weekly grid and no C3 grocery list.** |
| API nutrition module | `apps/api/src/modules/nutrition/*` | Plans/revisions/adherence only (`nutrition.service.ts`, `nutrition.repository.ts`, `nutrition.controller.ts`). No grocery/shopping-list endpoint, no ingredient aggregation. |
| DB schema | `packages/db/src/schema/nutrition.ts` | Nutrition plans/revisions/adherence + food-photo/incident tables only. **No grocery / shopping-list table; no per-item bought state.** (Verified: zero `grocer*` references anywhere in `apps/` or `packages/`.) |
| Plan payload contract | `packages/types/src/index.ts` `nutritionPlanPayloadSchema` (line 455) | Day-level macros (`caloriesPerDay`/`proteinGrams`/…) + `mealStructure: [{label, timingHint}]` only. **No per-day meals, no ingredients, no quantities.** `nutritionMealSlotSchema` (line 448) = `{label, timingHint}`. |
| Recipes (only ingredient source today) | `packages/db/src/schema/recipes.ts`, `recipeIngredientSchema` (`packages/types/src/index.ts:776`) | `recipes.ingredients: [{name, quantity?, unit?, notes?}]` + `allergenTags` exist, but recipes are a **standalone reference catalog** (seeded via `pnpm db:seed:recipes`, surfaced as "Meal ideas") **not linked into the active plan revision**. |
| UI primitives | `apps/web/src/components/ui/*` | `ProgressBar` (`progress-bar.tsx`) and `CheckCircle` (`check-circle.tsx`) exist; `Card` lives in `dark-primitives.tsx`. **The square grocery checkbox row (`GroceryCheck`) does not exist** — `CheckCircle` is round; the design checkbox is a 6-radius square (net-new). |

---

## 4. Gap

### Design diff (design C3 vs live `/nutrition`)

| Aspect | Design (C3) | Live app (Chrome MCP, 2026-06-08) |
|---|---|---|
| Summary card | «Список под план на 7 дней» + N positions + allergy note + bought M/N + `Progress` | absent — page shows daily-target cards instead |
| Category grid | 3-col grid, 5 category cards with item rows | absent |
| Checkbox | square `GroceryCheck` (radius 6), green fill + check | absent — only the round `CheckCircle` primitive exists |
| Strikethrough on bought | name `line-through` + dimmed | absent |
| Indigo "rebuilds via chat" banner | present, with «Поменять блюдо» | absent — page has the read-only "view-only" banner, different copy/intent |
| "Отправить в заметки" action | top-bar `soft` button | absent |
| Top-bar version sub | «Собрано из рациона · v8» | live header reads the active revision (e.g. **v2**) but for the daily plan, not a grocery projection |
| Weekly horizon | 7-day list | live page shows **daily targets only**; no weekly horizon anywhere |

### Feature diff (have / need)

| Capability | Have (verified live) | Need |
|---|---|---|
| Ingredient-level plan data | ✗ — `mealStructure` is `{label, timingHint}` labels only | Plan/week data must expose ingredients + quantities to aggregate from |
| Per-day weekly ration (C2) | ✗ — single-day daily targets only | C3 derives from a 7-day plan — **depends on C2** existing with real day×meal data |
| Grocery list derivation | ✗ — no derivation code (zero `grocer*` refs) | Aggregate plan ingredients → categorised, de-duplicated, quantity-summed list |
| Categorisation (Белок/Овощи…) | ✗ | Map each ingredient to one of the 5 aisle categories |
| Allergy filtering | partial — `payload.allergies` + recipe `allergenTags` exist, unused for grocery | Exclude/flag allergen items so the list is allergy-aware |
| "Bought" state store | ✗ — no store of any kind | Persist per-item bought flag (client-only or a small synced table) |
| Rebuild on plan revision | ✗ | When a new active revision lands, list regenerates; bought state reconciled |

**Key gap (double dependency):** there is **no mechanism to derive a grocery list** because the
plan payload carries **no ingredients/quantities and no per-day meals**, and there is **no place
to store "bought" state**. C3 is therefore blocked on **both** (a) C2's weekly day×meal matrix
*and* (b) ingredient-level data feeding it. Until C2 carries ingredient-level week data, the
grocery list has no source.

---

## 5. Work needed

### Dependency (blocking)
C3 is a projection of **C2 (weekly ration)**. The active nutrition plan must first carry
**per-day, per-meal ingredient data with quantities** (see `./nutrition-week-plan.md`). Today
`nutritionPlanPayloadSchema.mealStructure` is only `{label, timingHint}`; ingredients live
only on standalone `recipes`. Decide as part of C2 whether the week plan references recipe IDs
(reuse `recipes.ingredients`) or embeds ingredient lines directly. **Until that exists, the
grocery list has no source.**

### Data
- **Source of ingredients:** prefer reusing `recipeIngredientSchema` (`{name, quantity?, unit?}`)
  so quantity aggregation is consistent. Add a `groceryCategory` mapping (the 5 aisle buckets)
  — either an ingredient→category lookup table or a tag on ingredients.
- **Bought state — decision required (see Open questions):**
  - *Option A (recommended for MVP): client-only.* Persist bought flags in
    `localStorage`/IndexedDB keyed by `{userId, nutritionRevisionId, itemKey}`. No DB, no
    migration, no privacy surface. Resets cleanly when the revision changes.
  - *Option B: synced.* A small `nutrition_grocery_checks` table
    (`userId, nutritionPlanRevisionId, itemKey, bought, updatedAt`) behind a thin
    repository/service, for cross-device sync. Requires a Drizzle migration in `packages/db`.

### Backend (apps/api — only if Option B, plus the derivation endpoint)
- Add a derivation service that, given the active revision, aggregates ingredients →
  de-duplicates by normalised name → sums quantities (unit-aware) → assigns categories →
  applies allergy filtering using `payload.allergies` / recipe `allergenTags`. Pure, unit-tested.
- New read endpoint (e.g. `GET /nutrition/grocery-list`) returning the categorised `GROCERY`
  shape + `total`. Validate output with a new Zod contract in `packages/types`.
- Option B only: `bought` read/write endpoints (ownership-scoped) + repository.
- **No plan mutation path** — the grocery feature never writes to `nutrition_plan_revisions`.

### AI-pipeline
- **No new AI surface.** The list is deterministic derivation from existing plan data. Plan
  changes remain proposal-only through the existing chat pipeline; "Поменять блюдо" / "Менять
  блюда — через чат" simply deep-links to chat. Do not add a grocery proposal/action type.

### Frontend (apps/web)
- New `GroceryScreen` component under `apps/web/src/components/nutrition/` (or a sub-view of
  `NutritionWorkspace`, reached from `apps/web/app/nutrition/page.tsx`), wired with TanStack
  Query for the derived list.
- Add a **square `GroceryCheck`** primitive (radius 6, green-fill + check on) under
  `apps/web/src/components/ui/` — distinct from the existing round `CheckCircle`
  (`check-circle.tsx`). **Reuse `ProgressBar`** (`progress-bar.tsx`) for the summary bar and
  `Card` (`dark-primitives.tsx`) for the cards.
- Local toggle handler recomputes `got/total` and the progress value; persists via the chosen
  store (A or B). Strikethrough/dim on bought rows.
- Summary card, 3-col category grid, indigo rebuild banner with «Поменять блюдо» → `/chat`,
  top-bar «Отправить в заметки».
- Standard async states (loading / error / empty — e.g. "no plan yet → open chat", "plan has
  no ingredients yet").
- Entry point: the C2 «Собрать список покупок» button (`WeekPlanScreen` in design) routes here.

---

## 6. Acceptance criteria

1. From an active plan with ingredient-level week data, the user sees a categorised grocery
   list grouped into the 5 aisle categories, each item showing name + quantity.
2. The summary card shows «Список под план на 7 дней», the position count, an allergy-aware
   subtitle, the bought counter `{got}/{total}`, and a matching `Progress` bar.
3. Checking/unchecking an item flips its bought state: row strikethrough/dim toggles and the
   counter + progress update immediately — **and the active plan revision is unchanged**
   (verifiable: no new `nutrition_plan_revisions` row, no plan API write).
4. The list **excludes/flags allergen items** per the user's allergies (e.g. no peanuts when
   nut allergy is on record).
5. The indigo banner renders the verbatim copy and «Поменять блюдо» opens chat; «Отправить в
   заметки» is present.
6. When the coach accepts a diet change (new active revision), the list **rebuilds** from the
   new revision; bought state reconciles per the chosen store's rules.
7. Loading / error / empty states render; with no plan, the screen points to chat.

---

## 7. Invariants & safety

- **"Bought" toggles are personal UI/checklist state, not a plan change — keep the two
  distinct.** Ticking an item is the user recording "I bought this"; it is **not** coach-authored
  plan data, so it bypasses the proposal/revision flow entirely. It writes only to the bought
  store (client-only or `nutrition_grocery_checks`), **never** to `nutrition_plan_revisions`, and
  never goes through the chat/proposal pipeline. (Plan/diet changes still do — see next bullet.)
- **Plan / meal changes are proposal-only via chat.** No edit affordance on this screen;
  "Поменять блюдо" / "Менять блюда — через чат" deep-link to the chat pipeline. No grocery
  proposal/action type is introduced.
- **Workout & nutrition changes create revisions** — the list is a read-only projection of the
  current revision; it must not bypass the revision mechanism.
- **Wellness, not medical.** No diagnosis/treatment/dosing language; the list is shopping
  convenience, not nutritional prescription.
- **Allergy-aware.** Allergen items are excluded/flagged using `payload.allergies` /
  `allergenTags`; the allergy clause in the subtitle reflects the user's real record.
- **Privacy / least data.** Prefer client-only bought state to avoid a new health-data store;
  if synced, ownership-scope every read/write and keep it minimal.

---

## 8. Open questions

1. **Where do ingredients + quantities come from?** C3 needs ingredient-level week data that
   does not exist on the plan today. Does C2 reference recipe IDs (reuse `recipes.ingredients`)
   or embed ingredient lines on the revision? This blocks C3.
2. **Bought state: client-only or synced?** Option A (localStorage, no DB) vs Option B (small
   synced table). Cross-device need vs added storage/privacy surface.
3. **How does the list rebuild on plan revision?** On a new active revision, fully regenerate.
   What happens to bought ticks — wiped (simplest, items/quantities may differ) or reconciled
   by item identity? Define `itemKey` (normalised name? name+unit?) accordingly.
4. **Category mapping authority.** Static ingredient→aisle lookup, a tag on ingredients, or
   coach/AI-assigned? Determines maintenance cost and accuracy.
5. **Quantity aggregation across units.** How to sum mixed units (kg vs g, "шт" vs weight) for
   the same ingredient — normalise, or list separately?
6. **"Отправить в заметки" target.** Where do notes live (a notes feature, export, share
   sheet)? Out of scope until defined.

---

## See also

- [Overview — body & nutrition](./00-overview.md)
- [C2 — weekly ration plan](./nutrition-week-plan.md) *(grocery list depends on this)*
- [C1 — per-meal calories](./nutrition-meals-calories.md)
- [C4 — "make it lighter" dietary draft](./nutrition-dietary-draft.md)
- [Design system & backend foundations](./design-system-and-backend-foundations.md)
