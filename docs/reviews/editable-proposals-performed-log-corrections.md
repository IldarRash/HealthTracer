# Correction backlog — editable proposals + performed log

Branch: `feature/editable-proposals-performed-log`. Source: high-effort code review (2026-06-04). Status legend: ☐ open · ☑ done.

> **Status 2026-06-04:** C1–C10 + all verified dead-code/duplicate items **DONE** across correction workflows WF-A (C1/C6/C9), WF-B (C2/C3/C7), WF-C (C4/C5/C10 + dead exports + `_intent` param + ProposalCardShell + recipes-hook), WF-C8 (C8 stub dedup). Full CI green (types 791, api 1053, web 719, ai 96).
> **Only remaining:** `nutrition.repository.ts:274` `incidentDate` UTC-slice left as `TODO(C2)` (pre-existing; timezone unavailable at repo layer) and `inline-proposal-card-generic.tsx` intentionally not migrated to `ProposalCardShell` (justified).

## Correctness (fix before merge)

### C1 — log_workout_activity pinning uses `hadDisplayContract`, not the recompute signal ☐
`apps/api/src/modules/proposals/proposals.service.ts:232`
The workout-plan branches pin on `recomputedTotal !== null` (WF7 fix); the log branch still passes `hadDisplayContract`. When a stored log proposal has a displayContract **without** `isPrimaryTotal` and **no** stored `ratePerHour`, the recompute no-ops yet `hadDisplayContract=true`, so `pinTrustedLogActivityCalorieFields` skips pinning `estimatedCalories` and a client-submitted value (≤20000) is persisted.
**Fix:** make `recomputeLogWorkoutActivityCaloriesFromDisplayContract` return `{ payload, recomputedTotal }` and pin on `recomputedTotal !== null`, symmetric with the plan path.

### C2 — ad-hoc `plannedDate` uses UTC slice, not the user's timezone ☐
`apps/api/src/modules/workouts/workouts.service.ts:275`
`plannedDate = performedAt.slice(0,10)` is the UTC date; Today resolves "today" via `getDateInTimezone(user.timezone)`. Evening logs in negative-UTC offsets land on the wrong day and never appear on Today — breaking the headline "Apply → appears in Today" flow.
**Fix:** resolve `plannedDate` (and the day bucket) in the user's timezone, as the nutrition path does. Note: `nutrition.repository.ts:274` has the same UTC-slice pattern for `incidentDate` — align both.

### C3 — weekly narrative pairs ad_hoc-inflated `completedCount` with planned-only `plannedCount` ☐
`apps/api/src/modules/progress/progress-aggregate.service.ts:311` (+ skip-rate trend ~674, volume trend ~607)
`completedCount` counts ad_hoc; `plannedCount` excludes ad_hoc → "you completed 3 of 1 planned sessions (100%)". The aggregate already computes a correct `plannedCompletedCount` (line 116).
**Fix:** narrative/trends use `plannedCompletedCount` for the "of planned" framing; surface ad_hoc activity in a separate phrase.

## Robustness (plausible / latent)

### C4 — `clampFieldValue` non-editable branch leaks unclamped client value ☐
`packages/types/src/display-contract.ts:247`
Returns `field.value ?? submitted`; for a non-editable field with no stored value it returns the raw client `submitted`, violating its own contract. Latent (callers pre-filter), but a footgun.
**Fix:** non-editable → return `field.value` only (ignore client input entirely), or clamp.

### C5 — `aggregateNutritionIncidentsWeek` can exceed the schema's `max(7)` ☐
`packages/types/src/progress-cross-domain.ts:152`
`daysWithIncidentsLogged` is unclamped; `nutritionPerformedAggregateSchema` caps it at `.max(7)`. A >7-day window (boundary off-by-one / inclusive endpoints) → Zod parse throw → 500.
**Fix:** clamp to 7 in the helper, or assert/derive the window length.

## Cleanup / altitude (clean & simple)

### C6 — per-intent hardcoded recompute/pin; "universal" contract recompute is workout-only ☐
`apps/api/src/modules/proposals/proposals.service.ts:110` + `packages/types/src/workouts.ts`
3 branches × near-duplicate extract/recompute/pin helpers, field-name coupled (`caloriePerHourRate`/`estimatedSessionCalorieBurn` vs `ratePerHour`/`estimatedCalories`). The display contract is generic in shape but the recompute is hardwired per intent — log path needed a near-verbatim clone. **This is the root cause of C1.**
**Fix:** one contract-driven recompute keyed off `rate_per_hour inputs[0]` + `isPrimaryTotal`, parameterised by a small per-intent descriptor `{ rateField, totalField, provenanceField }`.

### C7 — macro extraction duplicated 3× ☐
`nutrition.service.ts:269`, `progress-cross-domain-data.service.ts:76`, vs typed `nutritionIncidentMacrosSchema`. Add a shared `readIncidentMacros(row)` in `packages/types`.

### C8 — stub `log_workout_activity` literal + displayContract duplicated verbatim ☐
`packages/ai/src/stub-provider.ts:~230` and `~641`. Extract `buildStubLogActivityProposal(normalized)`.

### C9 — rate×min/60 calorie formula duplicated ~4× ☐
`computeDerivedValues` (rate_per_hour), `recomputeLogWorkoutActivityCaloriesFromDisplayContract`, `applyLogWorkoutActivityProposal`, `getLogWorkoutActivityDomainErrors`. Single `deriveActivityCalories()`; apply should trust the already-pinned value.

### C10 — `getProposalIntentLabel` missing `log_workout_activity` case ☐
`apps/web/src/lib/proposal-ui-state.ts:23` → null label (masked by contract-card routing). Add the label.

---

# Deep dead/duplicate-code review (verified, 2026-06-04)

25 candidates raised, all survived adversarial verification (zero-reference / true-equivalence checks). Ordered by impact. Cross-links to C1–C10 above where they overlap.

## Dead code

- ☑ [done WF-A] `apps/api/.../proposals.service.ts:209` — redundant `hadDisplayContract` boolean (encodes "contract existed" not "fresh total produced") → **this is the C1 security gap**. Fix via the recompute-shape change (see Duplicate C6 merge below; do it once). Risk: med.
- ☐ `packages/types/src/progress-cross-domain.ts:189` — unreachable `: null` branch in `aggregateNutritionIncidentsWeek` (divisor ≥1 past the empty early-return). Replace with `Math.round(totalCalories / daysWithIncidentsLogged)`. Risk: low. (C5 `max(7)` clamp stays a separate item.)
- ☐ `packages/types/src/display-contract.ts:247` — `clampFieldValue` non-editable branch returns `field.value ?? submitted` (leaks client input) → **C4**. Change to `field.value ?? 0`; update `display-contract.spec.ts:268-271`. Risk: med (test pins current fallback).
- ☐ `apps/web/src/lib/api.ts:996` — `getNutritionAdherenceForDate()` zero callers. Delete. Risk: low.
- ☐ `apps/web/src/lib/api.ts:373` — `getProposal()` zero web callers (backend method is unrelated). Delete. Risk: low.
- ☐ `apps/web/src/lib/chat-attachment-ui-state.ts:409` — `summarizeAttachmentOutcomesForMessage()` unreferenced. Delete. Risk: low.
- ☐ `apps/web/src/lib/progress-ui-state.ts:96` — `trendDataSufficiencyBadgeTone()` orphan. Delete. Risk: low.
- ☐ `packages/types/src/intent-catalog.ts:37-38` — redundant barrel re-exports (consumers reach via index.ts). Delete. Risk: low.
- ☐ `packages/types/src/index.ts:2112` — unused `displayDerivedOpSchema` re-export + `type DisplayDerivedOp` (internal only). Delete. Risk: low.
- ☐ `apps/api/.../workouts.service.ts:296` — `_intent` param of `applyWorkoutPlanProposal` never read. Drop + update call sites/tests. Risk: low (multi-site).
- ☐ `apps/api/.../workouts.service.ts:254` — `_reason` param of `applyLogWorkoutActivityProposal` never read. **Recommended: KEEP** for dispatcher symmetry with a comment (removal = 7-site churn for little gain).

## Duplicate code

- ☑ **C6 (consolidated)** [done WF-A] `proposals.service.ts:438/495/595` — log calorie helpers clone plan-path twins. (1) `extractEditableFieldValues(contract)` → `packages/types/display-contract.ts`; (2) generalize `recomputeCaloriesFromDisplayContract(effective, stored, values, { rateField, totalField, provenanceField? })` in `packages/types/workouts.ts` returning canonical `{ changes, recomputedTotal }` — **closes C1** by wiring the log pin on `recomputedTotal !== null`; (3) `pinTrustedCalorieFields(...)` in apps/api replacing both pin fns. **Do NOT** fold in the action-resolver scrub/stamp trio (different algorithm). Risk: med — preserve optional `provenanceField ?? "workout_llm"` + `isFinite` guard.
- ☑ **C9-clamp** [done WF-A] `[0,20000]` clamp duplicated at workouts.ts:993, proposals.service.ts:546, workouts.service.ts:271/272. Add `WORKOUT_CALORIE_MAX` + `clampWorkoutCalories()` to `packages/types/workouts.ts`; reference in the `>20000` guards + `.max(20000)` schemas. Risk: low.
- ☑ **C9-formula** [done WF-A] `round(rate*minutes/60)` inlined at 5 sites (workouts.ts:537/550, workouts.service.ts:271, stub-provider.ts:236/647). Add `deriveActivityCalories(rate, minutes, { clampMax? })` to `packages/types`. **Do NOT** route the two displayContract recompute helpers through it. Risk: low.
- ☑ **C8** [done WF-C8] `packages/ai/src/stub-provider.ts:232/243` — log_workout_activity proposal literal duplicated across `generateCoachResponse` & `generateDomainStep`. Extract `buildStubLogWorkoutActivityProposal(normalized)` into `stub-workout-plan.ts`; callers keep their own envelope. Risk: low.
- ☐ `apps/web/.../nutrition-incident-proposal-card.tsx:119` — 4 proposal cards repeat ~90 lines of confirmation chrome. Extract `ProposalCardShell` with slots for the real divergences (accept-label/disabled, success copy, pending body). Risk: med — largest LOC win.
- ☐ `apps/web/.../recommend-recipes-proposal-card.tsx:180` — re-implements decision/modify mutations instead of `useInlineProposalActions`. Migrate to the hook, OMIT `getAcceptPayload` (don't pass `() => null`). Risk: low. Do after ProposalCardShell.
- ☑ **C7 (expanded)** [done WF-B] `nutrition.service.ts:255` `buildEatenBlock` duplicates `aggregateNutritionIncidentsWeek`; macro `?? 0` extraction triplicated. Add `sumNutritionIncidentMacros()` + `toNutritionIncidentSnapshot(row)` to `packages/types/nutrition-incidents.ts`. Risk: low.
- ☑ **C2-relevant** [done WF-B] `nutrition.service.ts:283` — local `getDateInTimezone()` is a verbatim clone of canonical `getTodayIsoDateInTimezone` (`packages/types/habits.ts`, used by ~13 services). Delete, import canonical. **Use this canonical helper when fixing C2.** Risk: low.
- ☑ **C2-relevant** [done WF-B; workout fixed via timezone, nutrition.repository left as TODO(C2)] `workouts.service.ts:275` + `nutrition.repository.ts:274` — raw `.slice(0,10)` ISO-date derivation (the C2 UTC-date bug). Add `isoDateOnly(value)` to `packages/types/dates.ts`; use at these 2 sites only. (Note: the real C2 fix must derive the date in the user's **timezone**, not just centralize the slice.) Risk: low.

## Suggested execution order (one refactor pass, then verify)
1. C6 recompute consolidation (also closes C1) → 2. clamp + formula helpers (C9) → 3. nutrition macro/snapshot + canonical timezone helper (C7, C2 groundwork) → 4. C2 timezone fix + C3 narrative → 5. dead-export deletions (cheap, isolated) → 6. web ProposalCardShell + recipes hook migration → 7. C4, C5, C10. Re-run per-package typecheck/lint/test after each.
