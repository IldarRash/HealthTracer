# Foundations — shared design-system & backend work for Body Analysis + Deeper Nutrition

Cross-cutting prerequisites shared by every screen brief in this folder. Build these once; the
six screen features consume them. This is a **gap brief, not an implementation** — it names what
must be added and what to reuse.

> Source of the design contract: the handoff board screenshots in `screenshots/design/`
> (`handoff-canvas.png` + `handoff-seg1..3.png`). The original `design/app/*.jsx` prototype sources
> have been deleted from the repo, so these PNGs + the per-screen briefs are the design record.
> **Current state was verified live via Chrome MCP on 2026-06-08** against the running app
> (authenticated PRO session: `/chat`, `/nutrition`, `/profile`, `/longevity`) — the per-screen briefs
> cite that verification, and code paths below were confirmed against source.

---

## 1. Design system (frontend)

The light/dark "two-world" token system **already exists** — do not re-introduce it. The handoff's
`L`/`D`/`M` tokens map onto the existing theme:

- Tokens: `packages/ui/src/tokens.ts`; CSS variables + per-route `[data-theme="light"|"dark"]` in
  `apps/web/app/styles.css`. Dark "instrument" cards float on a warm-light page (`L.paper`).
- App shell (244px sidebar + TopBar) exists: `apps/web/src/components/app-sidebar.tsx`,
  `apps/web/src/components/app-layout-client*`.

### Atoms — present vs. missing

> Shared web primitives live in **`apps/web/src/components/ui/*`** (not `packages/ui`, which holds only
> design tokens: `tokens.ts`, `colors.ts`). Verified against the directory on 2026-06-08.

| Atom (handoff name) | Status | Where / note |
|---|---|---|
| `Card`, `Badge`, `Btn`/Button, `Icon`/`IconBadge` | ✅ present | `apps/web/src/components/ui/{card,badge,button,icon,icon-badge}.tsx` |
| `Chip`, `CardHead`, `Eyebrow` | ⚠️ inline | no shared `Chip`/`CardHead` component — rendered as inline styled spans/divs in workspaces; extract if reused |
| `Ring` (donut) | ✅ present | `DsRing` (`apps/web/src/components/ui/dark-charts.tsx`) — backs composition rings + day-calorie ring (no separate `Ring`) |
| `ProgressBar`, `CheckCircle` | ✅ present | `apps/web/src/components/ui/{progress-bar,check-circle}.tsx` — back grocery progress + (round) checks |
| `CoachNotes`, `ChangeBanner`, `RevisionFacts` | ✅ present | `apps/web/src/components/ui/dark-primitives.tsx` — reused on every read-only nutrition screen + profile section |
| `MiniBars` (8-week spark bars) | ⚠️ close | `DsTrendStrip` (`dark-charts.tsx`) is near-equivalent **but colors bars by an adherence threshold (green≥70 / amber / red)** — wrong semantics for a single-series fat% trend; needs a color override or a thin `MiniBars` |
| `Stat` (big number + unit + label + sub) | ❌ missing | needed for weight/BMI in BodyComposition + nutrition totals |
| `MacroMini` (Б/У/Ж dots + values) | ❌ missing | per-meal macro row (C1); macros today are inline-only in AdherencePanel/RecipeDetail |
| `BodyFigure` / `MuscleMap` SVG | ❌ missing | front/back silhouette + per-group ellipses colored by `ST` tone; driven by a `MUSCLES` map |
| `PhotoGuide`, `PhotoStripMsg`, `PhotoThumb` | ❌ missing | body-analysis chat flow (3-angle intake + thumbnail strip) |
| `BodyAnalysisCard` | ❌ missing | shared by chat result **and** profile section |
| `GroceryCheck` (square checkbox row) | ❌ missing | only a round `CheckCircle` exists today |
| Before/after compare + swap `DiffRow` list | ❌ missing | net-new; the typed inline-proposal cards live in `apps/web/src/components/proposals/*` (router `inline-proposal-card.tsx` + `proposal-card-shell.tsx`), reuse that shell |

### Shared token reference (from the design handoff; live tokens in `packages/ui/src/tokens.ts`)

- **L (light interface):** `bg #ffffff`, `paper #f1efe9`, `panel #f6f5f1`, `line #e6e3db`,
  `ink #181712`, `mut #6c685e`.
- **D (dark instruments):** `bg #0b0d0e`, `panel #131618`, `elev #20262a`, `ink #f3f5f6`,
  `mut #9aa0a5`.
- **M (semantic, shared):** `green #19c37d` (good/protein/accept), `amber #f5a524`
  (caution/calories/fat%), `red #f0506a` (lagging/alert), `blue #3a8dff` (carbs/water),
  `indigo #7b7bff` (fats/"changes-via-chat" banner).
- **Muscle-map tones (`ST`):** strong→green, mid→amber, weak→red (fill `…0.30`, stroke solid).
- **Accept button:** green fill, text `#04130c` (dark green, **not** white).

---

## 2. Backend foundations

### A. Body analysis — net-new (heaviest item)

There is **no** body domain, no body-composition storage, and no save-from-chat→profile path today
(domains are `nutrition`/`health`/`workout`/`medical`; `user_profiles` + `device-metrics` hold none
of this). Needed:

- **Schema + migration** (`packages/db/src/schema/*`, `packages/db/drizzle`): a body-analysis record
  holding `date`, `source:'chat'`, `fatPct{min,max}`, `muscleTone`, `weight?` (self-reported flag),
  `strongGroups[]`, `weakGroups[]`, `muscleMap:{ [group]: 'strong'|'mid'|'weak' }`, an 8-week fat%
  trend, and `history[]`. **Numbers only — never the photos.**
- **Read API** (new module, e.g. `apps/api/src/modules/body` or under `profiles`): ownership-scoped
  read feeding the profile "Анализ тела" section.
- **Typed save proposal**: a new intent (e.g. `save_body_analysis`) added to the proposal catalog
  (`packages/db/src/schema/proposals.ts` / `chat-action-proposals.ts`) with Zod validation; on accept
  it writes the body-analysis record. Decide its **domain placement** (new `body` domain vs. attach to
  `health`/`workout`) — see open questions. Writes happen only via the accepted proposal, never silently.

### B. Deeper nutrition — extend existing plan payload (reuse the revision machinery)

Nutrition plans/revisions/version-bump and the proposal accept lifecycle **already exist** — reuse
them; do not add a parallel path:

- `packages/db/src/schema/nutrition.ts` (`nutritionPlans`, `nutritionPlanRevisions.payload` jsonb,
  `revisionNumber` auto-increments in `appendRevision`), `apps/api/src/modules/nutrition/*`,
  `apps/api/src/modules/proposals/*` (`decideProposal`, `ProposalApplyService`,
  `applyNutritionPlanProposal`), and the `adjust_nutrition_plan` intent.
- Current payload (`nutritionPlanPayloadSchema` in `packages/types/src/index.ts`) carries day-level
  macros + `mealStructure: [{label, timingHint}]` only. Extend it (all inside the revision `payload`
  jsonb — **no in-place edits**, every change is a new revision):
  - **Per-meal kcal+macros+time+dish** (C1).
  - **Weekly 7-day matrix** `7 × {breakfast,lunch,snack,dinner,kcal}` (C2).
  - **Ingredient-level data** (name + quantity, allergy-aware) so the grocery list (C3) can be
    **derived** — `recipeIngredientSchema` exists on standalone `recipes` but is not linked into the
    active plan revision; this link is the blocker for C3.
  - **Swap metadata** on `adjust_nutrition_plan`: optional `swaps: [{from, to, save}]` for C4's
    before/after — preferred over a new intent.
- **Grocery "bought" state** (C3): client-only (localStorage keyed by active revision) for MVP, or an
  optional small synced table `nutrition_grocery_checks`. Toggling bought must **never** write to a
  plan revision.

### C. AI pipeline notes

- The multimodal domain LLMs read attached images directly; the chat composer already supports
  `multiple` files + camera capture (`chat-composer-attachment-input.tsx`,
  `MAX_CHAT_COMPOSER_ATTACHMENTS`) — the body flow adds front/side/back **structure**, not a new
  ingestion path.
- New nutrition swap/weekly/per-meal fields are authored by the nutrition domain LLM into a proposal
  and validated by `getNutritionPlanDomainErrors` before apply.
- Per-domain YAML (`packages/ai-behavior/config/domains/*.yml`) can only **narrow** the capability
  catalog — any new capability must be added to the code-level catalog first.

---

## 3. Safety floors (preserve in CODE, not config)

These apply to every brief here and must not be relaxed:

- **Wellness, not medical.** No diagnosis / treatment / dosing language anywhere. Body analysis is
  always "примерная визуальная оценка по фото, не замер состава тела и не диагноз" — the disclaimer is
  rendered on **every** body card.
- **Image privacy.** "в профиль попадут лишь цифры, не снимки" — only numbers persist; photos are not
  stored in the profile.
- **No `health_documents` from attachments.** The chat-attachment path stays image-only / context-only;
  it must not create or parse a `health_document` row (regression-tested). Context budgets keep
  `allowDocuments=false`.
- **Coach proposes, user decides.** All plan/profile changes are **proposal-only**; the nutrition
  views (C1–C3) are strictly read-only and route edits to chat. C4 is a proposal.
- **Revisions, never overwrite.** Accepted nutrition changes create a **new revision**; reject leaves
  the plan unchanged. Validate every AI output with Zod before any domain service applies it.

---

## 4. Dependency graph between briefs

```
foundations (this file)
  ├─ atoms: BodyFigure, Stat, MacroMini, PhotoGuide, GroceryCheck, BodyAnalysisCard
  ├─ body schema + save_body_analysis proposal
  └─ nutrition payload extensions (per-meal, weekly, ingredients, swaps)

body-analysis-chat-flow ───writes──▶ body-analysis-profile-section   (need: body schema + save proposal)
nutrition-meals-calories (C1)        (need: per-meal kcal/macros)
nutrition-week-plan (C2) ──feeds──▶ nutrition-grocery-list (C3)      (C3 blocked on C2 ingredient data)
nutrition-dietary-draft (C4)         (reuse: adjust_nutrition_plan + revision version-bump)
```

Suggested build order: **foundations → C1 → C2 → C3 → C4**, and **body-flow → body-profile** in
parallel with the nutrition track.

---

## Related
- [Overview](./00-overview.md)
- Body: [chat flow](./body-analysis-chat-flow.md) · [profile section](./body-analysis-profile-section.md)
- Nutrition: [meals C1](./nutrition-meals-calories.md) · [week C2](./nutrition-week-plan.md) · [grocery C3](./nutrition-grocery-list.md) · [dietary draft C4](./nutrition-dietary-draft.md)
