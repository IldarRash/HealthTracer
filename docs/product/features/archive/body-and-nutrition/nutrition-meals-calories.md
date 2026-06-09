# Nutrition C1 — Калории по приёмам пищи (per-meal calorie breakdown)

> Live-verified gap analysis. Compares the design reference (`screenshots/design/handoff-seg2.png`, `handoff-canvas.png` → frame "Калории по приёмам пищи") against the **current running app** (verified live via Chrome MCP, 2026-06-08, `/nutrition`, dark theme, authenticated PRO) and the backend contracts.

## 1. Intent

Give the user a **read-only, per-meal calorie + macro breakdown for the day**: one glance answers "how many calories per meal, how does the day total compare to the plan target, and what's left." It layers a per-meal view onto the existing read-only Nutrition screen. Every figure is framed as **«примерная оценка»** (approximate estimate). The plan itself is never edited here — changes flow only through chat (proposal-only), so a `ChangeBanner` is present and the top bar carries a **«Только просмотр»** (view-only) chip.

This is the C1 frame of the deeper-nutrition handoff (the "Питание · детальные сценарии" row in `handoff-canvas.png`).

## 2. Design spec

Source design refs (the `.jsx` design sources were removed from the repo — these screenshots are the canonical reference):

- `screenshots/design/handoff-canvas.png` — the **"Питание · детальные сценарии"** row ("Калории по приёмам · рацион на неделю · закупка · диетичнее"), leftmost frame **"Калории по приёмам пищи"**.
- `screenshots/design/handoff-seg2.png` — the C1 frame top bar: sub-header **«АКТИВНАЯ ВЕРСИЯ · V8»**, title **«Калории по приёмам»**, right-aligned lock `Chip` **«Только просмотр»**, and below it the indigo banner **«Это просмотр плана. Изменения вносит коуч — расскажите ему в чате, что хотите поменять.»** with an **«Открыть чат»** button (this is the same `ChangeBanner` already live on `/nutrition`).

![C1 — Калории по приёмам (top bar + Только просмотр chip + ChangeBanner)](./screenshots/design/handoff-seg2.png)

### Layout

Top bar (`АКТИВНАЯ ВЕРСИЯ · V8` / `Калории по приёмам` / lock `Chip` «Только просмотр»). Body column, gap ~16:

1. **`ChangeBanner`** — the indigo "this is a view, the coach changes it via chat" banner + «Открыть чат». (Already live verbatim on `/nutrition` in English: "View-only plan. Your coach makes changes — tell them in chat what you want to adjust." + "Open chat".)
2. **`MealCaloriesBreakdown`** — a two-card row (`flex; gap:16; alignItems:flex-start`):
   - **LEFT — dark «Итог за день» instrument** (dark `Card`, fixed `width≈290`, `flexShrink:0`):
     - Card head: `fork` icon (amber) + title **«Итог за день»**.
     - Big **ring** centered (`size≈148`, amber, dark track), where the label = Σ meal kcal (e.g. `2030`) and `pct = round(sum / DAY_TARGET * 100)`.
     - Caption: **«из {DAY_TARGET} ккал · цель плана · осталось {DAY_TARGET − sum}»**.
     - 3 macro-total tiles in a row (Белок / Углев. / Жиры), colored green / blue / indigo; values = Σ p / Σ c / Σ f across meals.
   - **RIGHT — light per-meal list** (light `Card`, `flex:1`):
     - Card head: `today` icon (green) + title **«Калории по приёмам пищи»**, right note **«примерная оценка»**.
     - One row per meal: ~38×38 icon badge · name+time line (bold name + muted time + amber **«новое»** `Chip` if the meal changed in this revision) · dish-example name · a **proportional amber calorie bar** (`width = meal.kcal / maxKcal * 100%`, `maxKcal = max(meal.kcal)`) inline with a **`MacroMini`** (Б/У/Ж with colored squares) · right-aligned large kcal number + uppercase «ккал».
3. **`CoachNotes`** about portion-estimate error (verbatim below).

### `MacroMini`

Renders three baseline-aligned items — `['Б', p, green]`, `['У', c, blue]`, `['Ж', f, indigo]` — each a small colored square + tabular-nums value + a `«{Б|У|Ж} · г»` micro-label. **No such atom exists in the app today** (see §3); macros are only rendered inline in `AdherencePanel` / recipe detail.

### Exact data shapes (design stubs)

```js
// DAY_MEALS item: { t, time, ic, name, kcal, p, c, f, changed? }
const DAY_MEALS = [
  { t: 'Завтрак',           time: '7:30',  ic: 'sun',  name: 'Овсянка, ягоды, 2 яйца',   kcal: 480, p: 32, c: 58, f: 14 },
  { t: 'Перекус',           time: '11:00', ic: 'drop', name: 'Греческий йогурт + банан', kcal: 210, p: 12, c: 26, f: 6 },
  { t: 'Обед',              time: '14:00', ic: 'fork', name: 'Курица, киноа, салат',     kcal: 620, p: 44, c: 62, f: 20 },
  { t: 'Перед тренировкой', time: '17:00', ic: 'bolt', name: 'Банан + овсянка',         kcal: 180, p: 6,  c: 32, f: 3, changed: true },
  { t: 'Ужин',              time: '20:00', ic: 'moon', name: 'Лосось, овощи на пару',   kcal: 540, p: 38, c: 30, f: 24 },
];
const DAY_TARGET = 2100;
// → sum = 2030 kcal, pct = 97%, remaining = 70; Σ p=132, Σ c=208, Σ f=67.
```

`changed: true` (the "Перед тренировкой" meal) → renders the amber **«новое»** `Chip`. This mirrors the `new` badge already used in the live `MealStructure` section.

### Verbatim Russian copy (must preserve)

- View-only chip: **«Только просмотр»**
- Right card header note: **«примерная оценка»**
- Daily-total caption: **«из 2100 ккал · цель плана · осталось 70»**
- ChangeBanner: **«Это просмотр плана. Изменения вносит коуч — расскажите ему в чате, что хотите поменять.»** + **«Открыть чат»**
- `CoachNotes` (portion-estimate error): **«Цифры — ориентир: вес порций оценивается по фото и описанию. Если калорий мало к вечеру, это нормально — день ещё не закончен. Точные граммы можно поправить в «Сегодня».»**

## 3. Current state (verified live via Chrome MCP, 2026-06-08, `/nutrition`)

The read-only Nutrition plan view is live and well-structured, but it has **no per-meal calorie/macro breakdown, no day ring, and no proportional kcal bar**.

What is on the live page (dark theme, authenticated PRO):

- `NutritionWorkspace`, read-only. Breadcrumb "Today / Nutrition", H1 "Nutrition", subtitle "Read-only view of your active nutrition plan, meal structure, and today's logged follow-through."
- Indigo **`ChangeBanner`** "View-only plan. Your coach makes changes — tell them in chat what you want to adjust." + "Open chat" — this is the same banner the design carries (in Russian).
- **Active plan** card: "Active plan" + "v2" chips, "Balanced daily nutrition base", "A moderate starting point focused on consistency."
- "Logging happens on Today" card + "Go to Today".
- **"Why this version"** (`RevisionFacts`): note, UPDATED May 25 2026, SOURCE Coach proposal, VERSION v2.
- **Daily targets** card — the **only** macro view: Calories 2200 kcal · Protein 140 g · Carbs 220 g · Fat 70 g, labeled "plan goal". These are **daily aggregates only**.
- **Meal structure** card: just a single **"Breakfast"** slot label (sun icon). **No per-meal calories or macros, no day ring, no proportional kcal bar.**
- **Adherence**: "Nothing logged yet" empty state.
- **"Meal ideas for your plan"**: 4 recipe `MediaCard`s each "≈ 550 kcal · 25 g protein" (lunch/dinner tags) with "approx. nutrient estimate" — these are **recipe-level** estimates, **not** plan per-meal data.
- **"Plan version history"** (`RevisionHistoryDark`), collapsible: v2 active, v1.

**Absent on the live page:** per-meal kcal/macro breakdown, the dark «Итог за день» ring, a per-meal `MacroMini`, the proportional kcal bar.

### Code paths

- **Frontend:** `apps/web/app/nutrition/page.tsx` → `apps/web/src/components/nutrition/nutrition-workspace.tsx` (`NutritionWorkspace`). Sections rendered: `ChangeBanner`, `ActiveNutritionHeader`, `DailyExecCard`, `RevisionFacts`, `NutrientGoals` (daily targets only — no per-meal numbers), `MealStructure` (slot label + timing hint only, plus a `new` badge), `PrefsCard`, `CoachNotes`, `AdherencePanel`, `RecipeIdeas`/recipe detail, `RevisionHistoryDark`. No «Итог за день» dark ring, no per-meal kcal/macro list, no `MacroMini`.
- **Reusable primitives present** (`apps/web/src/components/ui/*`): `DsRing` (`dark-charts.tsx`) for the day ring; `ProgressBar` (`progress-bar.tsx`) for the proportional kcal bar; `Card` (`card.tsx`); `ChangeBanner` + `CoachNotes` (`dark-primitives.tsx`); `MediaCard` (`media-card.tsx`); `Icon` (`icon.tsx`) + `IconBadge` (`icon-badge.tsx`). **Absent: a reusable `MacroMini` tile** — macros render only inline in `AdherencePanel`/recipe detail. `Chip` and `CardHead` are not standalone `ui/*` exports today; they appear inline in the dark sections.
- **Backend / contracts — the data GAP:**
  - `packages/types/src/index.ts` — `nutritionMealSlotSchema = { label, timingHint }` (lines 448–451). **No per-slot kcal/macros, no dish name, no clock time, no `changed` flag.** `nutritionPlanPayloadSchema` (lines 455–468) carries only **day-level** `caloriesPerDay / proteinGrams / carbsGrams / fatGrams / hydrationLiters` + `mealStructure: NutritionMealSlot[]`.
  - `packages/db/src/schema/nutrition.ts` — `nutrition_plans`, `nutrition_plan_revisions { revisionNumber, reason, source, payload jsonb }`. The per-slot data must ride inside the existing `payload` JSONB (no new table needed); `nutritionIncidents.estimatedCalories/estimatedMacros` are **logged-eating incidents**, not the planned meal breakdown.
  - `apps/api/src/modules/nutrition/*` — serves the active plan + revisions + today's adherence; there is no "today's meals with calories" read model.

## 4. Gap

### Design diff (visual)

| Aspect | Design (C1) | Current app (live 2026-06-08) |
| --- | --- | --- |
| Daily total | Dark «Итог за день» card with ~148px amber ring (kcal sum vs `DAY_TARGET`) + «осталось N» | Absent. "Daily targets" card shows targets only (2200/140/220/70), no ring, no consumed/remaining |
| Per-meal list | Light card, one row per meal: icon · name · time · dish · proportional amber kcal bar · `MacroMini` · big kcal | Absent. "Meal structure" shows a single "Breakfast" slot label only |
| Macro breakdown | `MacroMini` (Б/У/Ж per meal) + per-day Б/У/Ж total tiles | Day-level macro targets only; per-meal macros absent |
| «новое» badge | On the changed meal row | The `new` badge exists in `MealStructure` but is not driven from per-meal data |
| Header note | «примерная оценка» on the list card | n/a (no per-meal card); recipe ideas carry "approx. nutrient estimate" instead |
| Top bar | «АКТИВНАЯ ВЕРСИЯ · V8» + «Калории по приёмам» + «Только просмотр» chip | Single Nutrition screen, no per-meal sub-view/route; equivalent read-only framing via `ChangeBanner` |

### Feature diff (Have / Need)

| Capability | Have | Need |
| --- | --- | --- |
| Per-meal kcal | No | Per-meal planned `kcal` |
| Per-meal macros (Б/У/Ж) | No | Per-meal `proteinGrams/carbsGrams/fatGrams` |
| Per-meal dish name | No (slot has `label`+`timingHint` only) | A dish-example name per meal (design `m.name`) |
| Per-meal time | Partial (`timingHint` is free text, not a clock time) | A display time per meal (design `m.time` = `7:30`) |
| Per-meal "changed/new" flag | Partial (`new` badge in UI, not data-driven) | A populated `changed` per slot (revision diff) |
| Daily total + remaining | No (no Σ/consumed concept on plan) | Σ kcal across meals + target + remaining |
| Read model for this view | No | A read model feeding C1 |

**KEY backend payload gap:** the nutrition plan payload stores only **meal SLOT NAMES** (`{ label, timingHint }`). There is **no per-meal kcal/macro data**, **no dish name / clock time**, and **no "today's meals with calories"** concept in `nutritionPlanPayloadSchema`. C1 cannot be built on the current contract without extending the meal-slot shape (or deriving a per-day breakdown).

## 5. Work needed

### Data / contracts (`packages/types`, `packages/db`)
- Extend `nutritionMealSlotSchema` with **nullable** per-slot fields: `estimatedCalories`, `proteinGrams`, `carbsGrams`, `fatGrams`, a display `timeOfDay` (clock string), and a `dishExample`/`name`. Keep them nullable so existing day-level-only plans still validate and partial authoring degrades gracefully.
- Decide whether the planner enforces Σ(slot kcal) ≈ `caloriesPerDay` within a tolerance (e.g. ±10%, matching the C2 "±10% коридор" framing) or treats the day target independently; add a focused Zod / `validateNutritionPlanPayload` test either way.
- No new DB table required — per-slot data rides inside the existing `nutrition_plan_revisions.payload` JSONB, which preserves the **revision** invariant automatically (every change is a new revision; nothing overwritten in place).

### Backend (`apps/api/src/modules/nutrition`)
- Add a **read model / endpoint** for C1 returning, for the active revision: ordered meals (`label`, time, dish name, kcal, p/c/f, `changed`), day-level `caloriesPerDay`/macro targets, and the computed sum + remaining. Compute sum/remaining server-side (or in a shared `packages/types` helper) so web and a future mobile screen agree.
- Compute the per-meal `changed` flag by diffing the active revision's slots against the previous revision (the same idea the `new` badge expresses) rather than persisting a transient flag.
- Keep it strictly **read-only** — no mutation endpoint; plan edits stay proposal-only via chat.

### Frontend (`apps/web/src/components/nutrition`)
- Add a `MealCaloriesBreakdown` section + a small `MacroMini` atom + the proportional amber bar. **Reuse `DsRing` for the day ring, `ProgressBar` for the proportional kcal bar, and `Card`/`ChangeBanner`/`CoachNotes`/`Icon`/`IconBadge`** — do not introduce parallel primitives. (`Chip`/`CardHead` are inline today; extract or reuse the existing inline pattern rather than adding a competing component.)
- Surface decision: a sub-view/tab within `NutritionWorkspace` or a dedicated route (see Open Questions). Either way carry the «Только просмотр» framing + `ChangeBanner` and full async states (loading/error/empty), consistent with the live screen.
- Wire via TanStack Query against the new read model; render the «примерная оценка» note and the verbatim `CoachNotes` copy. Follow the project i18n keys (the live screen is English-labeled; the handoff copy is Russian — keep the meaning above).

### AI pipeline (`apps/api/src/modules/ai`, `packages/ai-behavior`)
- If per-meal kcal are **authored** by the LLM, the nutrition domain LLM → decision-maker proposal must populate the new slot fields, validated by `nutritionPlanPayloadSchema`. Pipeline invariant: only the **workout** domain LLM may set a workout calorie estimate — nutrition kcal authoring lives in the nutrition domain + decision-maker, output stays proposal-only. (Read `docs/architecture/llm-pipeline.md` before touching the AI modules.)
- If per-meal kcal are **derived** (distributed from the day target / matched recipe estimates), no new LLM authoring is needed and the read model computes them. See Open Questions.

## 6. Acceptance criteria

- Given an active nutrition plan with per-meal estimates, C1 shows a dark «Итог за день» card with an amber `DsRing` (kcal sum vs target) + «осталось N» and per-day Б/У/Ж totals.
- The right card lists each meal with icon, name, time, dish, a proportional amber `ProgressBar` (`width ∝ kcal/max`), a `MacroMini` Б/У/Ж, and a kcal number.
- A meal changed in the active revision shows the amber «новое» badge.
- The «примерная оценка» note and the portion-estimate `CoachNotes` copy are present.
- The screen is read-only: «Только просмотр» framing + `ChangeBanner`; no edit affordance.
- Loading, error, and empty (no per-meal estimates / no active plan) states render.
- `nutritionPlanPayloadSchema` accepts both legacy (no per-slot estimates) and new (with estimates) payloads; tests cover valid, invalid, and the Σ-vs-target rule.
- The contract/read model has unit tests; the read endpoint never mutates plan state.

## 7. Invariants & safety

- **Read-only / proposal-only:** plan changes happen only via chat proposals validated by backend services. This screen renders state; it never mutates the plan.
- **Never overwrite in place:** any accepted change to per-meal data creates a **new `nutrition_plan_revisions` row** — the active revision is never edited in place.
- **AI output validated by Zod before apply:** any LLM-authored per-meal fields pass `nutritionPlanPayloadSchema` before the backend can apply the proposal.
- **Wellness, not medical:** no diagnosis/treatment/dosing language; calorie/macro figures are coaching estimates.
- **«примерная оценка» framing:** every number is an estimate; the header note + `CoachNotes` (portion error ±, "day not over") must stay so users don't read figures as precise measurements.
- **No new health-document path:** this feature touches only nutrition plan data; it must not create or parse `health_documents` and must not introduce attachment/recognition machinery.

## 8. Open questions

- **Authored vs derived:** are per-meal kcal/macros authored by the nutrition domain LLM as part of the plan proposal, or derived (split from the day target / pulled from matched recipe estimates)? This decides whether AI-pipeline work (§5) is needed or only a read-model computation.
- **Planned vs logged:** C1 shows **planned** per-meal numbers from the active revision. Should the ring optionally reflect **today's logged** consumption (from `nutritionAdherence` / `nutritionIncidents.estimatedCalories`) as consumed-vs-planned, or stay purely the plan? The design label shows the plan `sum`, suggesting planned-only for v1.
- **Sum-vs-target tolerance:** enforce Σ(slot kcal) ≈ `caloriesPerDay` within a tolerance, or allow divergence (target is a guide)? The C2 handoff uses ±10%.
- **Time field source:** add a discrete `timeOfDay` clock string to the slot, or parse it from the free-text `timingHint`? A dedicated field is cleaner for display.
- **Surface:** dedicated route vs in-page section/tab within `NutritionWorkspace`?

---

### Related briefs
- [Overview](./00-overview.md)
- [Nutrition — рацион на неделю (week plan)](./nutrition-week-plan.md)
- [Nutrition — закупка на неделю (grocery list)](./nutrition-grocery-list.md)
- [Nutrition — сделать план диетичнее (dietary draft)](./nutrition-dietary-draft.md)
- [Design system & backend foundations](./design-system-and-backend-foundations.md)
