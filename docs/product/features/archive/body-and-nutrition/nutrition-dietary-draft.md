# Nutrition C4 — "Сделать план диетичнее" (make-the-plan-lighter coach proposal)

> Gap-analysis feature brief. Screen **C4** of the deeper-nutrition handoff block. Unlike C1–C3
> (read-only views), **C4 is a typed coach proposal / draft** — a before/after compare with a list
> of food swaps and a decision row. It is the **lightest of the four** deeper-nutrition screens: it
> **reuses the existing typed-proposal + revision + version-bump lifecycle** rather than introducing
> new persistence, new intent, or a new apply branch. The net-new work is a **structured `swaps[]`
> payload addition + a protein-floor validation + a before/after compare card** — everything else is
> already live.
>
> **Current state verified live via Chrome MCP (2026-06-08, authenticated PRO, `/chat` + `/nutrition`).**

---

## 1. Intent

The user asks the coach for a "lighter" / more dietary version of the active nutrition plan. The
coach returns a **draft proposal** (not yet applied): a short intro, a BEFORE/AFTER calorie compare
(`Сейчас · v8 = 2100 ккал` → `Облегчённый · v9 (черновик) = 1750 ккал`, `−350 ккал`), a **SWAPS
list** (each row: old food struck-through → new food bold + `−N ккал`), and a **decision row** with
`Изменить` / `Не сейчас` / `Применить v9`. Pressing **«Применить v9»** accepts the proposal, which
— exactly like any other accepted nutrition proposal — **creates a new nutrition plan revision** and
bumps the plan version (v8 → v9). The product principle holds: **coach proposes, the human decides;
plan changes happen only through the proposal cycle.**

This brief is the only nutrition screen that **does not add new domain tables** — it leans on
`ai_proposals` (`intent: adjust_nutrition_plan`, `target_domain: nutrition`) and
`nutrition_plan_revisions`. The gap is in the **payload shape** (no structured food-swap data) and
the **rendering** (no before/after + swap-list card), not in the accept/revision lifecycle.

Both halves of that lifecycle are **observable in the running app today**:

- **Inline typed-proposal accept/outcome UI exists** — on `/chat` (light theme) a typed proposal
  card already renders in-stream (observed: a "Log meal from photo" card with a green `APPLIED`
  badge, a `NUTRITION` tag, a description, a left green accent border, and an outcome bar — "Nutrition
  incident logged. Your nutrition plan targets are unchanged. View nutrition →"). The
  inline-proposal accept → outcome pattern a C4 compare card would slot into is **already live and
  reusable**.
- **Revision / version-bump lifecycle is visible** — on `/nutrition` (dark theme) the read-only plan
  shows "Active plan v2", a "Why this version" (RevisionFacts) block, and "Plan version history"
  (v2 active, v1). The v8 → v9 bump C4 needs is the **same mechanism already rendered here**.
- **Absent today:** any before/after compare card, any swap-`DiffRow` list, and any
  "make plan lighter / диетичнее" proposal type or CTA — these are the net-new pieces.

---

## 2. Design spec

Reference artboard ("сделать план диетичнее"):

![Make-the-plan-lighter artboard](./screenshots/design/handoff-canvas.png)

Source JSX: `docs/design_handoff_body_and_nutrition/design/app/nutrition-detail.jsx` → `DietaryScreen`
(+ `SWAPS` data). Proposal pattern: `docs/design_handoff_body_and_nutrition/design/app/proposal.jsx`
(`ProposalCard`, `DiffRow`, `domainMeta`, states `proposed | edit | accepted | rejected`). Atoms:
`docs/design_handoff_body_and_nutrition/design/app/kit.jsx` (`Card` with `accent`, `Btn` kinds
`accept | ghost | quiet`, `Chip`, `Eyebrow`).

### Layout (top → bottom)

- **TopBar** — `sub: "Предложение коуча"`, `title: "Сделать план диетичнее"`, right-side amber chip:
  `черновик · не применён` (icon `spark`). No `ChangeBanner` (this screen is itself the change).
- **Coach intro** — `Card` with `Avatar who="coach"` + body copy (verbatim):
  > Вы попросили вариант «полегче». Я не урезаю белок и не делаю план голодным — снижаю калории
  > за счёт замен с теми же вкусами. Так уходит ≈350 ккал в день, а сытость и белок остаются.
- **Before / After compare** — two `Card`s with a green-circle `arrow` between:
  - Left, "Сейчас · v8": `2100` (big number) · `ккал / день`. Macro chips:
    `Chip green "Белок 130 г"`, `Chip neutral "Углеводы 210 г"`.
  - Right, `accent={M.green}`, "Облегчённый · v9 (черновик)": `1750` (green big number) ·
    `ккал / день` + `Chip green "−350 ккал"`. Macro chips: `Chip green "Белок 130 г"`
    (**protein unchanged**), `Chip amber "Углеводы 150 г"` (carbs cut).
  - `1750` is computed as `DAY_TARGET (2100) − 350`; `−350` is `SWAPS.reduce((a,s)=>a+s.save,0)`.
- **Swaps card** — `CardHead icon="spark" color={M.green} title="Замены, которые делают план легче"`,
  right meta `"{n} замен · −{saved} ккал"`. Each row: icon badge · `from` (struck-through, `L.mut2`)
  · `arrow` · `to` (bold, `L.ink`) · `Chip green "−{save} ккал"`.
- **Decision row** — `Card` with `info` icon + copy (verbatim) and three buttons:
  > Это черновик версии v9. Применяется он, как и все изменения, через коуча — вы решаете, оставить ли.
  - `Btn kind="ghost" "Изменить"` · `Btn kind="quiet" "Не сейчас"` · `Btn kind="accept" icon="check" "Применить v9"`.
  - Maps to proposal states: **Применить v9 → accept**, **Не сейчас → reject**, **Изменить → edit**
    (the `state="edit"` variant of `ProposalCard`, which lets the user adjust before applying).

### Exact data shapes (from the design)

`SWAPS` array element:

```ts
{ from: string; to: string; save: number; ic: IconName }
// e.g. { from: 'Белый рис · 150 г', to: 'Цветная капуста-рис · 150 г', save: 160, ic: 'fork' }
```

`dietaryDraft` client state (handoff README §State Management):

```ts
{ fromKcal: 2100, toKcal: 1750, swaps: [{ from, to, save }], version: 'v9', applied: boolean }
```

`ProposalCard` accepted-footer copy (the post-apply state): `Принято · план обновлён · v9` with an
`Отменить` link; rejected: `Отклонено · план без изменений` with a `Вернуть` link.

---

## 3. Current state (code paths)

> Current state is **verified live via Chrome MCP (2026-06-08, authenticated PRO)** on `/chat` and
> `/nutrition`, cross-referenced with the code paths below. No current-app screenshots were saved;
> cite the live verification, not a captured image.

**The typed-proposal + revision + version-bump machinery already exists, renders in the running app,
and must be reused — do not build a parallel path.**

| Capability | Where it lives | Status |
| --- | --- | --- |
| Proposal intent catalog (`adjust_nutrition_plan`, nutrition domain, capability allowlist) | `packages/types/src/intent-catalog.ts` (`NUTRITION_PROPOSAL_INTENTS`, `AGENT_INTENT_CATALOG`) | **Exists** |
| Proposal table (`intent`, `targetDomain`, `proposedChanges`, `status`, `validationStatus`, `appliedReference`) | `packages/db/src/schema/proposals.ts` (`aiProposals`, enums incl. `adjust_nutrition_plan` / `nutrition`) | **Exists** |
| Accept / reject / supersede lifecycle | `apps/api/src/modules/proposals/proposals.service.ts` (`decideProposal`), `proposals.controller.ts` | **Exists** |
| Apply accepted nutrition proposal | `apps/api/src/modules/proposals/proposal-apply.service.ts` — `case "create_nutrition_plan" \| "adjust_nutrition_plan"` → `NutritionService.applyNutritionPlanProposal(...)` | **Exists** |
| New revision on accept (version bump) | `apps/api/src/modules/nutrition/nutrition.repository.ts` `appendRevision` / `createPlanWithRevision` (auto-increments `revisionNumber`, sets `activeRevisionId`) via `nutrition.service.ts` `applyNutritionPlanProposal` | **Exists** — this **is** the v8 → v9 bump; visible as "Active plan v2" + "Plan version history" on `/nutrition` |
| Nutrition payload + adjust contract | `packages/types/src/index.ts` `nutritionPlanPayloadSchema`; `adjustNutritionPlanFromProgressChangesSchema` (wraps the full `plan` + `sourceSummaryId` + `sourceTrendObservationIds`) | **Exists** |
| Proposal validation (schema/ownership/safety) | `apps/api/src/modules/proposals/proposal-validation.service.ts` | **Exists** |
| Inline typed-proposal router + cards | `apps/web/src/components/proposals/inline-proposal-card.tsx` → typed cards (`WellbeingCheckinProposalCard`, `NutritionIncidentProposalCard`, `RecommendRecipesProposalCard`, `ContractProposalCard`, `GenericInlineProposalCard`); hosted by `chat-workspace.tsx` | **Exists** — live `APPLIED`-badge + outcome-bar pattern observed on `/chat` |
| Editable display contract (live-recompute card hint) | `packages/types/src/display-contract.ts` (`displayContractSchema`, …); `ContractProposalCard` already uses it for contract-type proposals | **Exists** (generic; not wired for swaps) |
| Nutrition domain config | `packages/ai-behavior/config/domains/nutrition.yml` (`intents: adjust_nutrition_plan → mapsToCapabilityId: adjust_nutrition`) | **Exists** |

**What does NOT exist (confirmed absent live + in code):**

- A structured **food-swap payload**. `adjust_nutrition_plan` is validated by
  `adjustNutritionPlanFromProgressChangesSchema`, which wraps the **full replacement
  `nutritionPlanPayloadSchema`** (top-level macros `caloriesPerDay` / `proteinGrams` /
  `carbsGrams` / `fatGrams` + a `mealStructure[]` of `{ label, timingHint }` slots) plus progress
  provenance. There is **no per-item old-food → new-food pairing, no per-swap kcal saved (`save`),
  and no before/after diff or "lighter/heavier" variant** — today the intent only carries the full
  new plan. It can change the headline numbers but cannot describe *which foods were swapped*.
- A **before/after compare render** (v8 vs v9 calories + macro chips) and a **swap-`DiffRow` list**
  in the inline proposal card. The router in `inline-proposal-card.tsx` has no nutrition-compare
  branch; a C4 card would be **net-new UI that follows the existing typed-card pattern**.
- Any **"make plan lighter / диетичнее" CTA or proposal type** anywhere in `/chat` or `/nutrition`
  (verified absent live).
- A dedicated **nutrition route surface** for the draft (today it would only appear as an inline
  chat proposal card).

---

## 4. Gap

### Design differences (live, 2026-06-08)

| Aspect | Design (C4) | Current render (verified live) |
| --- | --- | --- |
| Surface | Full-screen `DietaryScreen` (TopBar "Предложение коуча" + amber "черновик" chip) | No such surface; nutrition proposals would only appear as an inline `/chat` card (the typed-card pattern with `APPLIED` badge + outcome bar is live, but no compare card exists) |
| Before/After | Two big-number cards (v8 `2100` → v9 `1750`) + `−350 ккал` chip + macro chips | Not rendered (no nutrition-compare branch in `inline-proposal-card.tsx`) |
| Swap list | Rows: struck-through `from` → bold `to` + `−N ккал` chip, with header `"{n} замен · −{saved} ккал"` | Not rendered (no swap `DiffRow` component) |
| Protein-preserved cue | Explicit "Белок 130 г" green chip on both sides | Not surfaced |
| Decision row | `Изменить` / `Не сейчас` / `Применить v9` (with version label) | Generic accept/discuss controls on the existing inline card; no version-labelled "Применить v9" |
| Accepted state | `Принято · план обновлён · v9` + `Отменить` | Generic `APPLIED` badge + outcome bar exists; no `план обновлён · v9` revision-labelled footer |

### Feature differences (Have / Need)

| Capability | Have | Need |
| --- | --- | --- |
| Proposal accept/reject/supersede | ✅ `decideProposal` | Reuse as-is |
| Accept → new nutrition revision (version bump) | ✅ `applyNutritionPlanProposal` → `appendRevision` | Reuse as-is — v9 = next `revisionNumber` |
| Headline macro change via `adjust_nutrition_plan` | ✅ `nutritionPlanPayloadSchema` | Reuse |
| **Structured food-swap data** (`[{ from, to, save }]`) | ❌ | **Add** — see decision below |
| **Per-swap kcal saved + computed before/after totals** | ❌ | **Add** (validate `Σ save ≈ fromKcal − toKcal`) |
| Before/after + swap-list rendering | ❌ | **Add** (component, optionally via `displayContract`) |
| Surface beyond inline chat card | ❌ | **Decide** (inline card vs nutrition route) |

**KEY GAP & decision — extend `adjust_nutrition_plan`, do NOT add a new intent.** The existing
`adjust_nutrition_plan` already maps to the nutrition apply path and the revision bump; its only gap
is that `adjustNutritionPlanFromProgressChangesSchema` has no place for swap rows or a before-value.

- **(Recommended) Extend the adjust payload with optional swap metadata.** Add an optional
  `swaps: [{ from, to, save, icon? }]` array (plus an optional `fromCaloriesPerDay` for the before
  number) to `adjustNutritionPlanFromProgressChangesSchema` (alongside the existing `plan` /
  `sourceSummaryId` / `sourceTrendObservationIds`). The accept path, revision bump, proposal
  validation, and apply service stay **unchanged**; the swap list is descriptive rendering metadata
  that rides inside the persisted revision `payload`. Add the **"protein not cut" safety
  validation** here (see below). **Lowest blast radius: no new enum value, no new apply branch, no
  new router/YAML wiring — this is what makes C4 the lightest screen.**
- **(Rejected) New intent `lighten_nutrition_plan`.** Would duplicate the nutrition apply/revision
  wiring and add a `proposalIntentEnum` value, a `proposal-apply.service.ts` case, an
  `intent-catalog.ts` entry, and a `nutrition.yml` intent — more surface for the same outcome.
  Not warranted: the protein-floor rule fits cleanly as a conditional on the extended adjust path.

---

## 5. Work needed

**Backend** (the only contract change)
- Extend `adjustNutritionPlanFromProgressChangesSchema` in `packages/types/src/index.ts` with an
  optional `swaps: z.array(z.object({ from, to, save: z.number().int().nonnegative(), icon? }))` and
  an optional `fromCaloriesPerDay` (before-value). Keep both optional so existing adjust proposals
  stay valid. No new intent, no enum change.
- Add a domain-validation rule (in the nutrition domain checks / `proposal-validation.service.ts`
  path): if `swaps` is present, `Σ swap.save` must be consistent with
  `fromCaloriesPerDay − plan.caloriesPerDay` (within tolerance), **and `plan.proteinGrams` must not
  drop below the active plan / goal protein floor when calories are lowered** — reject otherwise
  (the C4 safety floor; see §7).
- **Reuse without change:** `decideProposal`, the `adjust_nutrition_plan` case in
  `proposal-apply.service.ts`, and `NutritionService.applyNutritionPlanProposal` →
  `nutrition.repository.ts` `appendRevision` / `createPlanWithRevision` (the v8 → v9 bump). The swap
  array rides inside the persisted revision `payload` (`nutrition_plan_revisions.payload` is `jsonb`).

**Frontend** (`apps/web`) — net-new UI on the existing pattern
- Add a nutrition before/after **compare card** + swap-`DiffRow` list + decision row, wired as a new
  branch in the `inline-proposal-card.tsx` router (e.g. when `adjust_nutrition_plan` carries
  `swaps`), reusing the live inline-card shell (left accent border, domain tag, `APPLIED` badge,
  outcome bar) the other typed cards already use. Render `swaps` + before/after from
  `proposedChanges`.
- "Применить v9" → existing accept mutation; on success show the revision-labelled accepted footer
  (`план обновлён · v9`) using the same version data already shown on `/nutrition`. "Не сейчас" →
  reject. "Изменить" → edit-before-apply (the `ContractProposalCard` / display-contract pattern is a
  candidate for live-recomputing totals as swaps change).
- Loading / error / empty / accepted / rejected states (frontend-style rule).

**AI pipeline**
- `adjust_nutrition_plan` already routes to the nutrition domain LLM. Ensure the decision-maker can
  emit the `swaps` array in `proposedChanges`; keep calorie estimates flagged approximate. The
  nutrition domain prompt already says "Do not provide medical diet prescriptions" — extend its
  guidance to "preserve protein when lowering calories." No new router/intent wiring if extending.

**Data**
- No new tables. Swap metadata lives in `nutrition_plan_revisions.payload` (jsonb) — the accepted v9
  revision is the persisted record of what changed.

**Surface location** — two viable entry points: (a) inline chat proposal card (default, lowest
effort, matches "changes happen through the coach/chat"), or (b) a dedicated nutrition route showing
the draft as a full screen matching `DietaryScreen`. Recommend (a) for MVP, (b) as a polish follow-up
since C1–C3 already establish nutrition sub-routes.

---

## 6. Acceptance criteria

- Coach can produce a `adjust_nutrition_plan` (lighten) proposal carrying a `swaps` array and
  before/after calorie totals; it persists as a **pending** `ai_proposals` row, `target_domain =
  nutrition`, not applied.
- The proposal renders the before/after compare (v8 → v9 kcal + macro chips) and the swap list
  (struck-through `from` → bold `to` + `−N ккал`), matching `DietaryScreen`.
- **Accept ("Применить v9") creates a NEW nutrition plan revision** (`appendRevision`, next
  `revisionNumber`) — never an in-place edit of the active revision; the accepted footer shows
  `план обновлён · v9`.
- **Reject ("Не сейчас") leaves the active plan unchanged** (status `rejected`, no revision written).
- **"Изменить" → edit state**, then applying creates the revision from the edited payload.
- **Protein is not cut while lowering calories** — a payload that reduces protein alongside calories
  is rejected with a validation error (not silently applied).
- Payload is **Zod-validated before apply** (`nutritionPlanPayloadSchema` + swap rule); invalid
  payloads (negative `save`, missing fields, inconsistent totals) are rejected.
- Tests cover: valid lighten proposal, invalid payload, unsafe/protein-cut intent rejected, and
  accepted-proposal **revision creation** (per testing rules for AI + nutrition revisions).

## 7. Invariants & safety

- **Proposal-only:** the coach proposes; the user accepts/edits/rejects. No direct DB mutation from
  the AI layer; plan changes are proposal-gated.
- **Accepted nutrition change = new revision** (`appendRevision`), never overwrite the active
  revision in place (workout/nutrition revision invariant).
- **Validate the payload with Zod before apply** (`proposal-validation.service.ts` + the apply-time
  `nutritionPlanPayloadSchema.parse` in `NutritionService`).
- **Wellness, not medical:** no diagnosis/treatment/dosing language; keep calorie/macro figures
  clearly approximate. The "lighten" path must read as coaching, not a prescribed "diet."
- **Unsafe intents rejected:** protein-cut-while-lowering-calories, starvation-level targets, or
  eating-disorder-adjacent framing are rejected by domain validation / safety checks.
- This screen adds **no attachment/document machinery** — it is plan-proposal only.

## 8. Open questions

1. **Extend `adjust_nutrition_plan` vs new `lighten_nutrition_plan` intent?** Resolved in this brief:
   **extend** (optional `swaps[]` on `adjustNutritionPlanFromProgressChangesSchema`, no new enum or
   apply branch). Open only if a future "lighten" needs a genuinely distinct lifecycle.
2. **Does the swap list need ingredient identity** (stable food IDs) so the **grocery list (C3) can
   be rebuilt** from the accepted v9 — or are `from`/`to` free-text display strings only? Free-text
   is enough to render C4; grocery-rebuild integration needs structured ingredient refs.
3. **Surface location** — inline chat proposal card (recommended MVP) vs a dedicated nutrition route
   matching `DietaryScreen` (polish follow-up).
4. **Macro-target source of truth** — does v9 store explicit recomputed macros, or are the displayed
   `Углеводы 150 г` / `Белок 130 г` derived (and should the editable `displayContract` recompute
   them live when the user edits swaps)?

---

## Related

- [Overview](./00-overview.md)
- [Nutrition — meals & calories (C1)](./nutrition-meals-calories.md)
- [Nutrition — week plan (C2)](./nutrition-week-plan.md)
- [Nutrition — grocery list (C3)](./nutrition-grocery-list.md)
- [Design system & backend foundations](./design-system-and-backend-foundations.md)
