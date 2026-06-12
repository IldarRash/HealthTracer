# Editable Proposals + Performed Log

Status: **Implemented** (web + backend). Remaining follow-ups: mobile UI, and
migrating the nutrition-incident card onto the universal display contract. See
[Follow-ups](#follow-ups).

Linked from [`../feature-roadmap.md`](../feature-roadmap.md) ("Current Direction").

## Intent

Extend the coaching loop with two capabilities while preserving the product
invariants (chat proposes, the user decides, structured state stays
authoritative, plan changes are revision-safe):

1. **Editable proposal cards** — let a proposal render as an interactive card the
   user can tweak (e.g. drag a duration slider) and see a live-recomputed derived
   total, without the AI ever emitting a free-form formula and without trusting
   any client-submitted total on accept.
2. **Plan vs performed separation** — keep what was *planned* (authoritative
   recurring plans) distinct from what was actually *performed* (ad-hoc activity
   and food eaten), so logging a one-off never mutates or "supersedes" a plan.

## Implemented behavior

### Universal editable display contract

- `displayContract` is an **optional, non-authoritative render hint** on a
  proposal payload, defined by `displayContractSchema` in
  [`packages/types/src/display-contract.ts`](../../../packages/types/src/display-contract.ts).
  It carries fields (`number` / `slider` / `text` / `readonly`) with per-field
  `min`/`max`/`step`/`editable` bounds and a list of `derived` computations.
- **No formulas.** Derived values use a **closed `op` enum** —
  `multiply | sum | subtract | rate_per_hour` — evaluated in declaration order by
  the pure helper `computeDerivedValues`. At most one derived entry may set
  `isPrimaryTotal`. The schema validates key uniqueness, input references, and
  bounds.
- The frontend recomputes derived values live for UX; the value is **advisory
  only**.

### Accept-time backend recompute (safety-critical)

- On accept, the backend **always recomputes** the trusted total from the
  **stored** contract structure and a **stored, trusted rate** — never from the
  client. `recomputeWorkoutProposalCaloriesFromDisplayContract`
  ([`packages/types/src/workouts.ts`](../../../packages/types/src/workouts.ts))
  feeds the stored rate into the `rate_per_hour` input, overlays only the
  client's **editable** field values (extracted via `extractEditableFieldValues`,
  each clamped to its stored `min`/`max` by `clampFieldValue`), rounds, and
  bounds the result to `[0, 20000]`. `calorieEstimateProvenance` is hardcoded to
  `workout_llm`.
- The accept seam is `ProposalsService.decideProposal`
  ([`apps/api/src/modules/proposals/proposals.service.ts`](../../../apps/api/src/modules/proposals/proposals.service.ts)).
  It runs the recompute for `create_workout_plan`, `adapt_workout_plan`,
  `adapt_workout_plan_from_progress` (nested `.plan`), and `log_workout_activity`.
  When the recompute is a no-op (no stored contract, no `isPrimaryTotal`, or no
  resolvable rate input) it **hard-pins** the stored calorie fields via
  `pinTrustedCalorieFields` so a client cannot smuggle an inflated burn or
  fabricated provenance. The client total is always discarded.
- The `displayContract` and rate are **stripped before any revision is
  persisted** (`stripWorkoutPlanProposalExtras`); they never live on a revision.

### Plan vs performed separation

- **Ad-hoc workout logging** — the `log_workout_activity` LOG intent creates an
  `ad_hoc` row in `workout_sessions` with **nullable** `workoutPlanId` /
  `workoutPlanRevisionId`, an `activityType` (free text, e.g. "volleyball"), and
  an `estimatedCalories` value. It **never** creates a plan revision. NULLs are
  distinct in the `(userId, workoutPlanId, workoutPlanRevisionId, plannedDate)`
  unique index, so multiple ad-hoc rows can land on the same day
  ([`packages/db/src/schema/workouts.ts`](../../../packages/db/src/schema/workouts.ts)).
  Ad-hoc sessions appear on Today as **non-required** checklist items (they don't
  penalize adherence) and count toward completed/active days but not the planned
  denominator (`aggregateWorkoutSessions` in
  [`apps/api/src/modules/progress/progress-aggregate.service.ts`](../../../apps/api/src/modules/progress/progress-aggregate.service.ts)).
- **Nutrition incidents → performed** — confirmed incidents (created only through
  an accepted `log_nutrition_incident` proposal) feed two read views, separate
  from plan adherence and never mutating nutrition plan targets:
  - **Today.eaten** — per-date totals built by `buildEatenBlock`
    ([`apps/api/src/modules/nutrition/nutrition.service.ts`](../../../apps/api/src/modules/nutrition/nutrition.service.ts));
    `null` means no incidents logged (not zero calories).
  - **Weekly performed aggregate** — `NutritionPerformedAggregate` produced by
    `aggregateNutritionIncidentsWeek`
    ([`packages/types/src/progress-cross-domain.ts`](../../../packages/types/src/progress-cross-domain.ts)),
    attached as `performed` on `NutritionProgressAggregate`.

## Invariants

- The display contract is **render metadata only** — advisory on the client,
  recomputed and clamped server-side, and stripped before persistence.
- The trusted rate and contract **structure** always come from the **stored**
  proposal (workout-LLM source); only **editable field values** may come from the
  client, and each is clamped to its stored bounds. Only the workout domain LLM
  may set a workout calorie estimate.
- Derived computation is a **closed op enum** — no free-form formulas ever reach
  the backend.
- LOG (revision-free) intents (`log_workout_activity`, `log_nutrition_incident`)
  record performed activity and **never** create a plan revision or mutate plan
  targets.
- Performed data (ad-hoc sessions, eaten totals) is kept distinct from plan
  adherence in every aggregate.

## Follow-ups

- **Mobile UI** for the editable contract cards and the performed log (web + API
  are implemented; Expo is deferred — see
  [`../mobile-parity.md`](../mobile-parity.md)).
- **Nutrition-incident card onto the universal contract** — the nutrition
  incident card is not yet expressed through `displayContract`; that migration is
  blocked on the contract supporting **repeatable item groups** (a meal has N
  editable line items). Until then it uses a bespoke card.
