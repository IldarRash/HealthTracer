# Nutrition — Week Plan (C2 «Рацион на неделю»)

Gap-analysis feature brief for the 7-day meal-plan grid screen. Part of the
**body-and-nutrition** handoff package. See the cross-links at the bottom.

> Current-state note: the live nutrition surface was **verified live via Chrome MCP
> (2026-06-08, `/nutrition`, dark theme, authenticated PRO)** and cross-checked
> against the code paths below. No current-app screenshot file is saved under
> `screenshots/current/`; cite the live verification, not a file. Only
> `screenshots/design/*` exist.

---

## 1. Intent

Give the user a calm, **read-only** weekly overview of the meal plan their coach
has set: one row per day (Пн–Вс) with the four meal slots and a daily calorie
sum, so they can see the whole week at a glance, understand roughly how many
calories each day carries, and from there jump to the grocery list (C3). It is a
**view of the active nutrition plan revision** — the user never edits it here;
every change to the plan goes through chat (proposal → accept → new revision).

This complements the existing single-plan nutrition view (targets, meal
structure, prefs, adherence, recipes) and the per-meal calorie breakdown (C1).
Where C1 zooms into one day, **C2 zooms out to the whole week**.

---

## 2. Design spec

Reference: the **"Питание · детальные сценарии"** row of the handoff canvas, frame
**"Рацион на неделю"** — a weekly matrix. The per-frame detail is small in the
full board; the authoritative source for the exact grid, copy, and tokens below
is **this doc's design transcription** (the original handoff jsx sources
`design/app/*.jsx` have been removed from the repo — only the rendered design PNGs
survive).

Design canvas: see the full handoff board
![handoff canvas](./screenshots/design/handoff-canvas.png) — the "Рацион на
неделю" frame is the weekly table view (the nutrition detail row is also visible
in the segment crops `./screenshots/design/handoff-seg2.png` and
`./screenshots/design/handoff-seg3.png`). Atoms referenced below (`Card`, chip
pills, `Btn`, `Icon`, tokens `L`/`D`/`M`, `ChangeBanner`, `CoachNotes`) are the
design-kit names from that handoff.

### Screen frame
- `AppShell(active='nutrition', contentBg=L.paper)` + `TopBar`.
- `TopBar`: `sub="Активная версия · v8"`, `title="Рацион на неделю"`.
- Content padding `20px 34px`, column, `gap: 16`.
- First element below the bar: `ChangeBanner` ("Это просмотр плана. Изменения
  вносит коуч…").

### Header chips (TopBar `right`)
Two chips, `gap: 10`:
1. `Chip tone="green"` — verbatim: **`≈ {avg} ккал / день в среднем`**, where
   `avg = round(Σ day kcal / 7)`.
2. `Chip tone="neutral"` with `Icon name="lock"` — verbatim: **`Только просмотр`**.

### The table (a single `Card pad={0}` with `overflow: hidden`)
CSS grid, **exact** column template (header and every row share it):

```
gridTemplateColumns: '128px repeat(4, 1fr) 92px'
```

- **Header row** (`background: L.panel`, bottom border `L.line`):
  `День` | `Завтрак` | `Обед` | `Перекус` | `Ужин` | `Σ ккал`.
  Day/Σ are plain uppercase eyebrow labels (`11.5px / 700 / ls 0.6 / uppercase`,
  color `L.mut2`); the four meal columns prefix an `Icon` + uppercase label:
  Завтрак→`sun`, Обед→`fork`, Перекус→`drop`, Ужин→`moon`. `Σ ккал` is
  right-aligned.
- **7 day rows** from the `WEEK` array. Row bottom border `L.line` (none on last).
  - **Day cell** (`128px`): a `34×34` rounded badge showing the weekday short
    code (`Пн`…`Вс`, `13px / 800`) + the date string; the badge is `L.panel2` /
    `L.ink` normally, and **green** (`background: M.green`, text `#04130c`) for
    today. Beside it: date (`13px / 600 L.ink`) and, for today only, a small
    `сегодня` label in `M.green`.
  - **Four meal cells** (`1fr` each): a single line of meal text,
    `13px color: L.ink2, lineHeight: 1.35` — mapped from `w.b, w.l, w.s, w.dn`.
  - **Σ kcal cell** (`92px`, right-aligned): `15px / 700` tabular-nums; color
    `M.green` for today, else `L.ink`.
- **Today-row highlight rule:** the entire row gets
  `background: rgba(25,195,125,0.06)` when `w.today` is truthy; today is the day
  whose calendar date equals the user's local "today".

### Exact `WEEK` item shape (the data contract this screen renders)

```js
{ d: 'Пн', date: '2 июн', kcal: 2040,
  b: 'Овсянка + яйца',   // breakfast / Завтрак
  l: 'Индейка, гречка',  // lunch / Обед
  s: 'Творог, ягоды',    // snack / Перекус
  dn: 'Треска, овощи',   // dinner / Ужин
  today?: true }
```

Seven such items, one per weekday Пн→Вс. `today` is set on exactly one row.
(Note the design `WEEK` marks Чт as today to match its mock date.)

### Below the table — info line + CTA (`display: flex, gap: 16`)
- **Allergy / corridor info line** (`flex: 1`, white card, `Icon name="info"`).
  Verbatim copy:
  > **\*** Орехи — только без арахиса (аллергия учтена). Калории за день держатся
  > в коридоре ±10% от цели — это норма.

  (The leading `*` ties to the `*` markers in meal cells, e.g. `Орех-микс*`.)
- **CTA** `Btn kind="soft" icon="fork"` — verbatim **`Собрать список покупок`** →
  navigates to **C3 grocery screen** (`nutrition-grocery-list.md`).

### CoachNotes (bottom)
`CoachNotes` atom, verbatim copy:
> В субботу заложен чуть больший день — это осознанно, под активные выходные. В
> воскресенье — легче и больше овощей для восстановления.

All numbers on this screen are **примерная оценка** (approximate estimates), per
the handoff's global nutrition rule.

---

## 3. Current state

There is **no weekly grid view today** — verified live via Chrome MCP
(2026-06-08, `/nutrition`, dark theme, authenticated PRO). The nutrition surface
is a single read-only screen.

- **Live current screen (verified):** a view-only banner, the active-plan card
  ("Balanced daily nutrition base", **v2**), a "Why this version" (RevisionFacts)
  block, **DAILY targets only** (e.g. 2200 kcal / 140 p / 220 c / 70 f), a Meal
  structure card showing a single **"Breakfast"** slot **label**, today adherence
  ("Nothing logged yet"), a "Meal ideas" recipe grid, and "Plan version history"
  (v2 active, v1). **ABSENT: any 7-day / weekly grid, any day chips, any "Собрать
  список покупок" CTA.** There is no week view anywhere in the app — the only
  7-bar weekly element in the product is Longevity's "Plan completion by day"
  adherence strip (adherence, not a meal plan).
- **Web code:** `apps/web/app/nutrition/page.tsx` → `NutritionWorkspace`
  (`apps/web/src/components/nutrition/nutrition-workspace.tsx`) is the only
  nutrition page. In its done state it renders, in order: `ChangeBanner`,
  `ActiveNutritionHeader`, `DailyExecCard`, `RevisionFacts`, a two-column
  `NutrientGoals` + `MealStructure` (slot **labels** only —
  `breakfast`/`lunch`/… as names, no day axis), `PrefsCard`, `CoachNotes`,
  `AdherencePanel` (today), `RecipeIdeas`, `RevisionHistoryDark`. **No 7-day
  matrix, no Σ-kcal-per-day column, no "today" row highlight, no "Собрать список
  покупок" CTA.**
- **API module:** `apps/api/src/modules/nutrition/*` exposes the active plan +
  revisions + today adherence (`getActiveNutritionPlan`, `listNutritionRevisions`,
  `getTodayNutritionAdherence` are the web client calls). **No weekly-plan
  endpoint.**
- **Schema:** `packages/db/src/schema/nutrition.ts` — `nutrition_plans`,
  `nutrition_plan_revisions` (payload `jsonb`), `nutrition_adherence`,
  `food_photo_analyses`, `nutrition_incidents`. The week plan, if added, would
  live inside the **revision `payload` jsonb** (no new table strictly required).
- **Plan payload contract:** `packages/types/src/index.ts`
  `nutritionPlanPayloadSchema` (lines 455–468). It has `title`, `summary`,
  `caloriesPerDay`, macro grams, `hydrationLiters`, `mealStructure`
  (`nutritionMealSlotSchema` = `{ label, timingHint }`, **slot names only, max
  8**), `preferences`, `restrictions`, `allergies`, `notes`. **There is no 7-day
  calendar, no per-day meals, and no per-day kcal anywhere in the payload.**

So the data the C2 grid needs (per-day × 4 meals × kcal) **does not exist** in
any current contract; it must be added (see §4/§5).

---

## 4. Gap

### Design differences (visual / layout)

| Aspect | Current (`nutrition-workspace.tsx`) | Design (C2 `WeekPlanScreen`) |
| --- | --- | --- |
| Layout | Stacked cards, single plan view | One `Card pad={0}` table, grid `128px repeat(4,1fr) 92px` |
| Day axis | None | 7 day rows Пн–Вс with date + day badge |
| Meal display | Slot labels (`MealStructure`) | Four meal **cells per day** (Завтрак/Обед/Перекус/Ужин) |
| Per-day kcal | None | `Σ ккал` column, right-aligned, tabular-nums |
| Today emphasis | Adherence panel only | Green row highlight + green day badge + `сегодня` + green Σ |
| Header chips | Active-plan / `vN` chips | `≈ N ккал/день в среднем` + `Только просмотр` (lock) |
| Allergy / corridor note | Inside `PrefsCard` (chips) | Dedicated info line "* орехи… ±10% — норма" |
| Grocery CTA | None | `soft` button `Собрать список покупок` → C3 |
| Coach note copy | Generic notes join | Specific weekly-rhythm note (Сб heavier / Вс lighter) |

### Feature differences (Have / Need)

| Capability | Have | Need |
| --- | --- | --- |
| 7-day plan structure | ❌ none — payload has slot **names** only | ✅ per-day × `{breakfast,lunch,snack,dinner,kcal}` for 7 weekdays |
| Per-day calorie sum | ❌ only a single `caloriesPerDay` target | ✅ a kcal value per day row + computed weekly average |
| "Today" mapping | ⚠️ only in adherence (date match) | ✅ map local date → weekday row, highlight it |
| Read endpoint for week grid | ❌ | ✅ serve weekly structure (from active revision payload) |
| Web grid component | ❌ | ✅ new read-only matrix component (net-new layout) |
| Grocery derivation source | ❌ no week data to derive from | ✅ week plan becomes the source the grocery list (C3) is built from |

> **Reuse note (verified):** the existing nutrition surface builds its "cards" as
> **inline-styled section `<div>`s** plus `Icon`/`IconBadge`, `MediaCard`,
> `CoachNotes`, `ChangeBanner`, `RevisionFacts`, `RevisionHistoryDark` (from
> `apps/web/src/components/ui/*`). There is a shared `Card` primitive in
> `card.tsx` and chip-style pills are written inline (there is **no shared `Chip`
> component** the workspace uses). So the C2 grid is **net-new layout** over the
> existing card/section pattern; "reuse `Card`/`Chip`" means follow that pattern
> (inline pills + section card) and the shared `Icon`/`MediaCard`/`CoachNotes`
> atoms — not import a non-existent `Chip`.

**KEY gap:** no 7-day plan structure exists. The nutrition plan payload carries
meal **slot names** (`mealStructure: NutritionMealSlot[]`) and a single daily
calorie target — **not** a weekly matrix. A weekly structure
(`7 days × {breakfast, lunch, snack, dinner, kcal}`) must be **added to the plan
revision payload** (or derived deterministically from slots + recipes), then
surfaced via a read endpoint and rendered as the C2 grid.

**C3 depends on this.** The grocery list (C3) is built **from this week plan** —
its "Собрать список покупок" CTA lives on C2 and feeds C3. With no weekly matrix
in the payload today, C3 has no source data; C2's data shape (and whether meals
carry structured ingredient/recipe references vs free text) **gates C3's
feasibility** (see Open Question 3). C2 is the prerequisite slice.

---

## 5. Work needed

### Data / contracts (`packages/types`, `packages/db`)
- Extend `nutritionPlanPayloadSchema` with an **optional weekly plan** field,
  e.g. `weekPlan: nutritionWeekPlanSchema.nullable().default(null)`:
  - `nutritionWeekDaySchema = { weekday: enum(Пн…Вс / mon…sun), breakfast: string, lunch: string, snack: string, dinner: string, estimatedCalories: number.int.nonnegative }`.
  - `nutritionWeekPlanSchema = { days: array(nutritionWeekDaySchema).length(7) }`
    (or `.max(7)` with explicit weekday keys; reuse the existing
    `WorkoutWeekday`-style weekday enum if one exists, otherwise add a nutrition
    weekday enum).
- Keep it in the **revision `payload` jsonb** (`nutrition_plan_revisions`); **no
  new table or migration required** unless the weekly data is normalized later.
- Add validation: per-day kcal nonnegative, 7 distinct weekdays, calories
  framed as estimates (no medical/diagnostic language) — extend the existing
  `validateNutritionPlanPayload` errors block.
- Decide the **derive-vs-author** policy (see Open Questions): either the weekly
  matrix is authored by the coach LLM into the payload, or derived from
  `mealStructure` + assigned recipes. The brief assumes **stored in payload** as
  the simplest authoritative path.

### Backend (`apps/api/src/modules/nutrition`)
- Add a **read** path returning the weekly structure from the active revision
  (either fold it into `getActiveNutritionPlan` so the web client already has it,
  or add a dedicated `GET /nutrition/week` endpoint reading
  `activeRevision.payload.weekPlan`). Ownership-scoped, read-only.
- Compute the **weekly average kcal** server-side or let the client compute it
  from the days (design computes client-side; either is fine — pick one).
- **No write/edit endpoint for the grid** — all changes remain proposal-driven
  through the AI pipeline.

### Frontend (`apps/web`)
- New read-only component (e.g. `NutritionWeekPlan`) rendering the table with the
  exact grid `128px repeat(4,1fr) 92px`. Follow the existing nutrition pattern:
  an inline-styled section card (or the shared `Card` from `ui/card.tsx`) with
  inline chip-style pills (no shared `Chip` exists), reusing the shared `Icon`,
  `IconBadge`, `CoachNotes`, `ChangeBanner`, and theme tokens. The matrix layout
  itself is net-new.
- Decide placement: a section within the existing nutrition workspace **or** a
  dedicated route. Add `ChangeBanner`, the two header chips, the allergy/corridor
  info line, the `Собрать список покупок` CTA (→ grocery route), and `CoachNotes`.
- **Today detection by date:** map `formatLocalIsoDate(new Date())` →
  weekday and highlight that row (green badge, `сегодня`, green Σ, row tint).
- Implement loading / error / empty states (reuse `LoadingScreen layout="plan"`,
  `SectionError`/`ErrorState`); empty = no active plan or no `weekPlan` on the
  revision → show a "coach hasn't set a weekly plan yet, ask in chat" hint.
- Keep copy verbatim Russian as in §2.

### AI-pipeline (`apps/api/src/modules/ai`, `packages/ai`, behavior config)
- The nutrition domain LLM / decision-maker must be able to emit the `weekPlan`
  field inside a **nutrition plan proposal**; accepting it creates a **new
  revision** (never in-place edit). No new capability widening beyond the existing
  nutrition plan proposal — extend the payload it already produces.
- Calorie figures the LLM sets are **estimates** and must respect allergies /
  restrictions from the plan; safety floors unchanged (no diagnosis/treatment).

---

## 6. Acceptance criteria

1. With an active nutrition plan revision that carries a `weekPlan`, the screen
   renders a 7-row table (Пн–Вс) using grid `128px repeat(4,1fr) 92px`, with
   columns День / Завтрак / Обед / Перекус / Ужин / Σ ккал.
2. Each row shows the day badge + date, the four meal cells (`b/l/s/dn`), and the
   per-day kcal sum (tabular-nums).
3. The row whose date is the user's local today is highlighted
   (`rgba(25,195,125,0.06)`), with a green day badge, `сегодня` label, and green
   Σ value.
4. The header shows a green `≈ N ккал / день в среднем` chip (avg over the 7
   days) and a neutral `Только просмотр` lock chip.
5. Below the table: the allergy/corridor info line (verbatim) and a
   `Собрать список покупок` button that navigates to the grocery screen (C3).
6. The screen is fully **read-only** — there is no inline edit affordance; any
   "change a meal/plan" path routes the user to chat (ChangeBanner present).
7. Loading, error, and empty states are handled; empty (no `weekPlan`) shows a
   "ask your coach in chat" hint rather than an error.
8. Accepting a coach proposal that includes a new `weekPlan` produces a **new
   nutrition revision**; the grid reflects the active revision only.

---

## 7. Invariants & safety

- **Read-only / proposal-only:** this view never mutates plan state. Plan changes
  happen exclusively via chat → typed proposal → backend validation → **new
  revision** (`nutrition_plan_revisions`), never an in-place edit. (Product
  invariant: "Workout and nutrition changes create new revisions.")
- **Wellness, not medical:** meal/calorie copy stays non-diagnostic; no
  diagnosis, treatment, or dosing language.
- **Calories are estimates:** every kcal figure (per-day and average) is framed
  as approximate; the corridor note "±10% — норма" must remain so users don't read
  the numbers as precise prescriptions.
- **Allergies respected:** the weekly plan and its grocery derivation must honor
  the plan's `allergies` (e.g. "орехи без арахиса — аллергия учтена"); the LLM
  may not propose meals violating recorded allergies/restrictions.
- **Ownership-scoped reads:** the week-plan read path is user-scoped like all
  nutrition reads.

---

## 8. Open questions

1. **Authored vs derived:** Is `weekPlan` authored directly by the coach LLM into
   the revision payload, or derived deterministically from `mealStructure` +
   assigned recipes? (Brief assumes **authored/stored in payload**.) If derived,
   where does per-day kcal come from?
2. **"Today" mapping:** The grid is a fixed Пн–Вс week. Does "today" map purely by
   weekday (so the same 7 meals repeat every week), or is the week anchored to
   real dates (Пн = this week's Monday)? The design shows real date strings
   (`2 июн`…`8 июн`) — confirm whether dates are stored or computed from the
   current week.
3. **Grocery derivation:** How exactly does the C3 grocery list derive from this
   week plan — by parsing the free-text meal cells, or from structured
   ingredient/recipe references behind each meal? Free-text cells (current design
   shape) make a reliable shopping list hard; a structured recipe reference per
   meal may be needed.
4. **Placement:** Is C2 a new section inside the existing nutrition workspace, or
   a separate route? (Affects navigation and the `Собрать список покупок` flow.)
5. **Average source:** computed client-side (as the design does) or returned by
   the API?

---

## Related briefs

- [Overview](./00-overview.md)
- [Nutrition — meals & calories (C1)](./nutrition-meals-calories.md)
- [Nutrition — grocery list (C3)](./nutrition-grocery-list.md)
- [Nutrition — dietary draft (C4)](./nutrition-dietary-draft.md)
- [Design system & backend foundations](./design-system-and-backend-foundations.md)
