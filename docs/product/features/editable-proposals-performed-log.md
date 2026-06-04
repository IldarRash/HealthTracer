# Feature Brief: Editable Proposals + Performed Log

- **Type:** Feature (cross-cutting: shared contracts, AI pipeline, proposals, workouts, nutrition, Today, progress, web).
- **Surfaces:** Chat proposal cards (web), Today nutrition + checklist, Longevity/weekly review aggregates, Training history.
- **Branch:** `feature/editable-proposals-performed-log`.
- **Status:** Implemented on branch (backend + web). Mobile UI deferred.

## Problem

Two gaps in the coaching loop:

1. **Proposals were not editable.** A proposal carried fixed numbers (e.g. a session
   calorie estimate). The user could only accept or reject — they could not adjust an
   obviously-off value (e.g. "I played volleyball for 90 minutes, not 60") and have the
   derived totals update before accepting.
2. **There was no place for performed one-off activity.** A one-off activity the user
   reports ("played volleyball 90 min") had nowhere to go: forcing it into a workout
   plan revision would corrupt the recurring plan, and there was no separation between
   what was **planned** and what was actually **performed**.

This feature adds a universal, declarative **display-contract** so any proposal can be
rendered as an interactive editable card with live-recomputed derived values, plus a
**performed log** model: ad-hoc workout sessions for one-off activities and a nutrition
performed aggregate built from confirmed incidents.

## The display-contract contract

A `displayContract` is an optional, **non-authoritative render hint** carried on a
proposal payload that tells the frontend how to render an editable card. It carries no
free-form formulas — every derived value uses a closed `op` enum.

Source of truth: `packages/types/src/display-contract.ts`
(`displayContractSchema`, `displayFieldSchema`, `displayDerivedSchema`,
`computeDerivedValues`, `clampFieldValue`).

Shape (`version: 1`):

- `fields[]` (1–12): each `{ key, label, kind, unit?, value?, textValue?, min?, max?,
  step?, editable (default true) }`. `kind` is one of `number | slider | text |
  readonly`.
- `derived[]` (0–6): each `{ target, label, unit?, op, inputs[1–4], isPrimaryTotal }`.
  `op` is the closed enum `multiply | sum | subtract | rate_per_hour`. At most one entry
  may set `isPrimaryTotal`. Inputs are evaluated in declaration order and may reference
  prior fields or already-computed derived targets.

`rate_per_hour` computes `inputs[0] * (inputs[1] / 60)` — i.e. `kcal/hour × minutes /
60`.

### Volleyball example

The workout domain LLM emits, for a 60-min volleyball session at 400 kcal/h
(prompt source: `packages/ai-behavior/config/domains/workout.yml`):

```json
{
  "version": 1,
  "title": "Volleyball session",
  "fields": [
    { "key": "caloriePerHourRate", "label": "Burn rate", "kind": "readonly", "unit": "kcal/hour", "value": 400, "editable": false },
    { "key": "durationMinutes", "label": "Duration", "kind": "slider", "unit": "min", "value": 60, "min": 5, "max": 300, "step": 5 }
  ],
  "derived": [
    { "target": "totalCalories", "label": "Estimated calories", "unit": "kcal", "op": "rate_per_hour", "inputs": ["caloriePerHourRate", "durationMinutes"], "isPrimaryTotal": true }
  ]
}
```

The user drags the duration slider to 90; the card shows ~600 kcal live. The web card
lives in `apps/web/src/components/proposals/editable-proposal-contract.tsx` /
`contract-proposal-card.tsx`, with UI state helpers in
`apps/web/src/lib/display-contract-ui-state.ts`.

## Backend recompute / trusted-rate safety floor

The display contract is render metadata only and **never** the source of accepted
numbers. On accept the backend recomputes the primary total from **stored** data:

- The `caloriePerHourRate` (workout plan payload) / `ratePerHour`
  (log_workout_activity) is the **trusted** kcal/hour rate. It is sourced exclusively
  from the workout domain LLM's `domain_answer.workoutCaloriePerHourRate`
  (`packages/types/src/domain-llm-step.ts`), stamped onto proposals by
  `ActionResolverService` (`scrubAndStampWorkoutCalorieEstimate`). The decision-maker and
  non-workout domains can never set it; any value they inject is scrubbed.
- `recomputeWorkoutProposalCaloriesFromDisplayContract`
  (`packages/types/src/workouts.ts`) recomputes using the **STORED** contract structure
  and **STORED** trusted rate, applying only the client's **editable** field values
  (each clamped to the stored field's own `min`/`max` via `clampFieldValue`). The rate
  input field is always overwritten with the trusted stored rate. The result is
  `Math.round` and clamped to `[0, 20000]`, and `calorieEstimateProvenance` is hardcoded
  to `workout_llm`. The client-submitted total is always discarded.
- This recompute seam runs at accept time in `ProposalsService.decideProposal`
  (`apps/api/src/modules/proposals/proposals.service.ts`), branching per intent:
  `create_workout_plan` / `adapt_workout_plan` (flat), `adapt_workout_plan_from_progress`
  (nested `.plan`), and `log_workout_activity`
  (`recomputeLogWorkoutActivityCaloriesFromDisplayContract`).
- The `displayContract` and `caloriePerHourRate` are **dropped** before a plan revision
  is written (`stripWorkoutPlanProposalExtras`) — they never persist on revisions.

## Performed-log architecture

The model separates **plan** (authoritative recurring intent) from **performed** (what
actually happened).

### Ad-hoc workout sessions

`log_workout_activity` is a **LOG (revision-free) intent**: it logs a one-off activity
and **never** creates a workout plan revision.

- Payload: `logWorkoutActivityProposalPayloadSchema` (`packages/types/src/workouts.ts`)
  — `{ activityType, title, durationMinutes, intensity?, performedAt, estimatedCalories?,
  ratePerHour?, displayContract? }`. Invariant: `estimatedCalories` **or** `ratePerHour`
  must be present; the backend always prefers the trusted `ratePerHour` and treats
  `estimatedCalories` as an advisory fallback.
- Apply path: `WorkoutsService.applyLogWorkoutActivityProposal`
  (`apps/api/src/modules/workouts/workouts.service.ts`) recomputes
  `round(ratePerHour × durationMinutes / 60)` (clamped `[0, 20000]`) and calls
  `WorkoutsRepository.insertAdHocSession`. It **never** calls `appendRevision` /
  `createPlanWithRevision`.
- Storage: a `workout_sessions` row with `source = 'ad_hoc'`, nullable
  `workout_plan_id` / `workout_plan_revision_id`, free-text `activity_type`, and
  `estimated_calories` (migration `packages/db/drizzle/0032_wealthy_mordo.sql`).
- Today: ad-hoc sessions appear on the checklist but are `required: false`
  (`createWorkoutChecklistItem`, `filterWorkoutSessionsForChecklist` in
  `apps/api/src/modules/today/today-items.ts`) so they don't penalize adherence.
- Weekly: ad-hoc completed sessions count toward `completedCount`/`activeDays` but **not**
  `plannedCount` or the adherence denominator (`aggregateWorkoutSessions`,
  `adHocCompletedCount`, in `apps/api/src/modules/progress/progress-aggregate.service.ts`).

### Nutrition performed (eaten + weekly aggregate)

Confirmed `nutrition_incidents` feed two views, separate from plan adherence:

- **Today.eaten**: `NutritionService.getNutritionDetail` aggregates incidents for the
  date into the `eaten` block `{ calories, proteinGrams, carbsGrams, fatGrams,
  incidentCount }` (`todayNutritionDetailSchema` in `packages/types/src/index.ts`;
  `buildEatenBlock` in `apps/api/src/modules/nutrition/nutrition.service.ts`). `null`
  means no incidents logged (not zero calories). Rendered by
  `apps/web/src/components/today/today-nutrition-card.tsx`.
- **Weekly performed aggregate**: `aggregateNutritionIncidentsWeek`
  (`packages/types/src/progress-cross-domain.ts`) produces
  `NutritionPerformedAggregate` (`daysWithIncidentsLogged`, `incidentCount`,
  `totalCalories`, macros, `averageDailyCalories`), attached as `performed` on
  `NutritionProgressAggregate` by
  `apps/api/src/modules/progress/progress-cross-domain-data.service.ts`.

Nutrition incidents still never mutate nutrition plan targets or revisions.

## Acceptance criteria

- A proposal carrying a `displayContract` renders as an editable card; editing an
  editable field live-recomputes the `isPrimaryTotal` derived value via
  `computeDerivedValues`.
- On accept, the persisted calorie total is recomputed from the **stored** contract and
  **stored** trusted rate, ignoring the client total and clamping each editable field to
  its stored bounds; provenance is `workout_llm`.
- The display contract and trusted rate never persist on a plan revision.
- `log_workout_activity` creates an `ad_hoc` `workout_sessions` row and never a plan
  revision; the trusted-rate scrub leaves both calorie fields unset (fail-closed) when no
  trusted value is available, so the payload `.refine()` rejects it.
- Ad-hoc sessions are non-required on Today and excluded from the adherence denominator.
- A logged nutrition incident appears in `Today.eaten` for its date and in the weekly
  `performed` aggregate.
- `workoutCaloriePerHourRate` is rejected by `domainAnswerSchema` for any domain other
  than `workout`.

## Deliberately deferred

- **Mobile UI** for editable contract cards and the performed log (`apps/mobile`).
- **Migrating the nutrition-incident card to the display contract.** The nutrition
  incident card (`apps/web/src/components/proposals/nutrition-incident-proposal-card.tsx`)
  keeps its bespoke editor for now; it migrates to the universal contract once the
  contract supports **repeatable item groups** (multiple line items, not just a flat
  field list).
