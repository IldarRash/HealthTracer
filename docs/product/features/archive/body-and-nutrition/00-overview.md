# Overview — Body Analysis + Deeper Nutrition (gap analysis)

This folder is a **gap analysis** of the design handoff (board screenshots in
[`screenshots/design/`](./screenshots/design/)) against the current Health Tracer implementation. It
captures both the **design differences** and the **feature differences** for two new product blocks,
as a buildable spec list. **No code was changed.**

- **Deliverable type:** documentation (per-screen feature/gap briefs). Implementation is out of scope.
- **Design evidence:** the handoff board in [`screenshots/design/`](./screenshots/design/)
  (`handoff-canvas.png` + `handoff-seg1..3.png`). The original `design/app/*.jsx` prototype sources
  were deleted from the repo, so these PNGs + these briefs are the design record.
- **Current-state verification:** each screen was **verified live via Chrome MCP on 2026-06-08**
  against the running app (web :3001) in an **authenticated PRO session** — `/chat`, `/nutrition`,
  `/profile`, and `/longevity` (reuse evidence). The per-screen briefs cite that live verification and
  the confirmed code paths. *(This MCP build doesn't expose a retrievable save path for screenshots, so
  current-app PNGs are not committed; the live observations are recorded in each brief instead. The
  legacy [`screenshots/current/sign-in-page.png`](./screenshots/current/) is the Clerk gate from the
  prior, pre-auth attempt.)*

---

## The two blocks

### 1. Body analysis by photo
The user asks the coach (in chat) to assess their physique; the coach requests **3 photos**
(front/side/back) via a `PhotoGuide`, "analyzes" them, and returns an inline **BodyAnalysisCard** with an
**approximate** estimate (fat %, muscle tone, strong/weak muscle groups). The user can **save** the
result, which creates a new **"Анализ тела"** section in Profile: body-composition rings (fat/muscle/water),
weight/BMI, an 8-week fat% trend, and a colored front/back **muscle map**.

- [body-analysis-chat-flow.md](./body-analysis-chat-flow.md) — the chat scenario + save proposal.
- [body-analysis-profile-section.md](./body-analysis-profile-section.md) — the saved Profile section.

### 2. Deeper nutrition
Four screens layered on the existing read-only Nutrition view:
- [nutrition-meals-calories.md](./nutrition-meals-calories.md) — **C1** per-meal calories (day ring + meal list).
- [nutrition-week-plan.md](./nutrition-week-plan.md) — **C2** 7-day plan grid.
- [nutrition-grocery-list.md](./nutrition-grocery-list.md) — **C3** grocery checklist derived from C2.
- [nutrition-dietary-draft.md](./nutrition-dietary-draft.md) — **C4** "make plan lighter" coach proposal (before/after + swaps).

Shared prerequisites (atoms, schema, proposal/payload extensions, safety floors):
- [design-system-and-backend-foundations.md](./design-system-and-backend-foundations.md).

---

## Shared product principles (carried from the handoff)

- **Coach proposes — the user decides.** Plans change only through chat. The nutrition screens
  (C1–C3) are **read-only**; any "change a meal/plan" routes to chat. C4 is a typed proposal.
- **Wellness, not a medical service.** No diagnosis / treatment / dosing language. Body analysis is
  always framed as "примерная визуальная оценка по фото, не замер состава тела и не диагноз", with the
  disclaimer on every such card.
- **Image privacy.** Only the **numbers** reach the profile — not the photos.
- **Revisions, never overwrite.** Accepted nutrition changes create a new revision; validate every AI
  output with Zod before apply. Attachments stay image-only/context-only and never create/parse
  `health_documents`.

Spot-checked against `.claude/rules/ai-orchestrator.md`, `.claude/rules/security.md`, and
`docs/architecture/llm-pipeline.md`.

---

## Cross-cutting gap summary

| Screen / area | Frontend gap | Backend / data gap | Reuse |
|---|---|---|---|
| Body chat flow | `PhotoGuide`, `PhotoStripMsg`/`PhotoThumb`, inline `BodyAnalysisCard`, 3-angle (front/side/back) structure, `chatBodyFlow` state | new `save_body_analysis` proposal intent (+ domain placement) | composer already supports multiple files + camera; inline-proposal path; multimodal image read |
| Body profile section | `BodyComposition` (3 rings + weight/BMI + 8-wk trend), `MuscleMap`/`BodyFigure` SVG, provenance banner | **new** body-composition schema + migration + read API (fat/muscle/water %, muscle-map tones, trend, history) | `DsRing`, `DsTrendStrip` (override its adherence-threshold bar colors for fat%), `CoachNotes` |
| C1 meals calories | dark "Итог за день" ring + per-meal list + `MacroMini` + proportional kcal bar | per-meal kcal/macros in plan payload (none today — slot labels only) | `DsRing`, `ProgressBar`, `Card`, `ChangeBanner`, `CoachNotes` |
| C2 week plan | 7×6 grid, today-row highlight, header chips, "Собрать список покупок" CTA | **7-day matrix** in plan payload (none today) | `Card` (Chip/CardHead are inline, not components) |
| C3 grocery | summary card + 3-col category grid + `GroceryCheck` rows | grocery **derivation** from C2 ingredients (blocked on C2 ingredient data) + "bought" state store | `ProgressBar`, `CheckCircle` |
| C4 dietary draft | before/after compare card + swap `DiffRow` list + decision row | structured `swaps[]` on `adjust_nutrition_plan`; protein-not-cut validation | **full** proposal accept + revision version-bump lifecycle + `proposals/*` inline-card shell |
| Foundations | `Stat`, `MacroMini`, `BodyFigure`, `GroceryCheck`, `BodyAnalysisCard`, (confirm `MiniBars`) | body schema + nutrition payload extensions; proposal catalog additions | existing L/D/M tokens, 244px shell, proposal/revision machinery |

**Biggest net-new items:** (1) body-composition persistence + `save_body_analysis` proposal +
`BodyFigure`/`MuscleMap` SVG, and (2) extending the nutrition plan payload with per-meal, weekly, and
ingredient-level data (the grocery list and per-meal calories both depend on it). C4 is the lightest —
it largely reuses the existing proposal/revision lifecycle.

---

## Open questions rolled up from the briefs

- **Body weight/BMI source** — self-reported (per the design's `Вес*` asterisk) vs. `device-metrics`?
- **Body domain placement** — new `body` domain vs. attach to `health`/`workout` for the save proposal?
- **Per-meal & weekly data** — authored by the nutrition LLM into the plan proposal, or derived?
- **Grocery ingredients** — meal cells are free text today; C3 needs structured ingredient + quantity
  data (likely recipe references linked into the active revision).
- **C4 intent** — *decided:* extend `adjust_nutrition_plan` with optional `swaps[]` + a protein-floor
  validation (no new intent/enum/apply-branch). See [nutrition-dietary-draft.md](./nutrition-dietary-draft.md).
- **Surfaces/routing** — do C1–C4 live as secondary nutrition routes, inline chat cards, or both?

---

## How current state was verified (2026-06-08)

The stack runs locally (API :3000, web :3001 — on Windows launch each app directly via
`corepack pnpm --dir apps/api dev` / `--dir apps/web dev`, not `turbo dev`). The prior attempt was
blocked by the Clerk sign-in gate; this pass used **Chrome MCP driving the developer's already
signed-in Chrome session**, so every authenticated route loaded without a redirect. Each screen
(`/chat`, `/nutrition`, `/profile`, `/longevity`) was navigated and observed live, and the
observations were written into the per-screen briefs.

To re-verify later (or to commit PNGs, which this MCP build can't persist): sign into the running web
app in Chrome, then drive the logged-in tab via Chrome MCP — or fall back to a Playwright storage-state
capture (`--save-storage`/`--load-storage`) and drop PNGs into
[`screenshots/current/`](./screenshots/current/).
