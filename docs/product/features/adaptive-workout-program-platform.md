# Adaptive Workout Program Platform

## Problem Statement

The product already enforces proposal-gated plan mutation and read-only Training/Nutrition secondary views. It also has a starter exercise catalog, catalog-backed workout proposal resolution, Today workout materialization, and basic per-exercise execution logging. The remaining gap is turning those foundations into a complete adaptive workout platform:

- A broader catalog taxonomy that covers strength, athletic performance, vertical jump, yoga, mobility, conditioning, and general wellness.
- Catalog metadata surfaced consistently in Training and Today, including instructions, safety notes, equipment, difficulty, muscles, and future-ready media references.
- A complete read-only view of the active workout program structure in the secondary Training surface.
- A Today execution flow that turns the active session into actionable exercise cards with completion, adjustment, and feedback signals.

Without these, workout coaching remains hard to adapt consistently, difficult to audit, and weakly connected between plan structure and daily execution.

## Current Codebase Baseline

- `packages/db/src/schema/exercises.ts` and `packages/db/drizzle/0014_exercise_catalog.sql` already define an `exercises` catalog with names, aliases, muscles, equipment, movement patterns, difficulty, instructions, safety notes, source, validation status, status, user ownership, and dedupe keys.
- `packages/db/drizzle/seeds/exercises.sql` seeds a local starter catalog, but coverage is strength-biased and should be expanded before this feature is considered complete.
- `packages/types/src/exercises.ts` and `packages/types/src/workouts.ts` already define catalog and structured workout plan/session contracts. New AI workout proposals can require structured plan entries with `exerciseId` or `pendingExerciseRef`.
- `apps/api/src/modules/exercises` exposes authenticated catalog list/get/create APIs and supports proposal-time `findOrCreateExercise`.
- `apps/api/src/modules/workouts` already applies accepted workout proposals as revisions, validates catalog access, materializes Today sessions from active plan weekdays, and updates structured session exercise execution state.
- `apps/api/src/modules/today` already includes workout detail in the day response and treats workout execution as daily state, not plan mutation.
- `apps/web/src/components/training/training-workspace.tsx` renders the active plan and revision history read-only, but currently shows compact exercise labels rather than full catalog/instruction details.
- `apps/web/src/components/today/today-workspace.tsx` renders a Today workout panel with start, complete, skip, and adjusted actions, but currently lacks richer instruction/safety/catalog metadata and bounded workout-specific feedback beyond status-only exercise updates.

## Goals

- Expand the structured exercise catalog and contracts for strength, athletic performance, vertical jump, yoga, mobility, conditioning, and general wellness.
- Ensure new active workout plans reference catalog exercises through typed contracts while preserving historical readability through snapshots.
- Render a full read-only active program structure in the Training secondary view, including richer prescription and catalog metadata.
- Materialize today's workout into execution-ready cards on Today with instructions, optional media references/fallbacks, prescription, rest guidance, completion, adjustment, and bounded feedback capture.
- Preserve mutation boundaries: workout plan changes happen through chat proposals and revision-safe apply flow only.

## Non-Goals

- Manual editing of active workout plans directly in Training or Today.
- Auto-adaptive plan mutation based on execution feedback without explicit proposal approval.
- Clinical diagnosis, injury treatment protocols, or medical rehab guidance.
- Full mobile parity in the same slice unless explicitly expanded.
- Building a standalone exercise-content CMS beyond fields required for catalog quality and safety metadata.

## User Stories

- As a user, I can view my full active workout program in Training as a read-only weekly structure.
- As a user, I can open Today and see my current workout materialized into clear exercise cards with what to do now.
- As a user, each exercise card shows instructions, optional media, equipment, target muscles, difficulty, and safety notes.
- As a user, I can log completion and lightweight feedback for today's session.
- As a user, I can trust that plan-level changes still require chat proposals and approved revisions.
- As a coach system, I can use structured execution feedback to trigger future proposal suggestions without auto-mutating plans.

## Accepted UX Behavior

- **Training secondary view**
  - Shows active workout plan revision, week/day/session hierarchy, and planned exercise structure.
  - Shows exercise catalog metadata where available: instructions, equipment, muscles, difficulty, movement pattern/modality, and safety notes.
  - Read-only by design; calls-to-action route users to Chat for plan changes.
- **Today workout execution**
  - Materializes the current day's session from active plan revision + exercise catalog metadata.
  - Exercise cards show prescription (sets/reps/time/load where relevant), rest guidance, instructions/media, and completion status.
  - Users can mark exercise completion, skip, adjusted status, and submit bounded feedback (effort, discomfort flag, difficulty, notes, actual reps/load where useful).
- **Feedback loop**
  - Feedback updates execution logs and coaching context summaries.
  - Any suggested plan changes from feedback are surfaced as chat proposals, not automatic edits.
- **Safety UX**
  - Safety notes appear on relevant exercises.
  - Copy remains wellness/coaching oriented and avoids diagnosis/treatment framing.

## Data And Contracts

- Extend the existing `Exercise` entity/contracts rather than adding a parallel catalog model.
  - Existing fields: `id`, `name`, `normalizedName`, `aliases`, `primaryMuscles[]`, `secondaryMuscles[]`, `equipment[]`, `movementPatterns[]`, `difficulty`, `instructions[]`, `safetyNotes[]`, `source`, `validationStatus`, `status`, `userId`, `dedupeKey`.
  - Needed extension: modality/taxonomy coverage beyond current strength-oriented enums and optional media references/fallback metadata if UI will show media in this slice.
- New plan contracts should continue using structured entries with `exerciseId` or `pendingExerciseRef`, not only free-form exercise names.
- Maintain `WorkoutPlan` + immutable `WorkoutPlanRevision` pattern for all plan structure changes.
- Execution contracts:
  - `WorkoutSession` stores materialized exercise prescriptions and execution state.
  - Exercise execution should support completion status plus bounded actuals/notes already present in `UpdateWorkoutSessionExerciseInput`.
  - Session/day feedback should capture bounded effort/difficulty/discomfort signals without clinical framing.
  - Today execution writes are execution-state events, not plan revisions.
- Source/status/validation status must support curation lifecycle with provenance. Avoid creating an admin CMS in this feature.

## Phased Implementation Slices

1. **Types and schema foundation**
   - Extend existing exercise enums/taxonomy to cover mobility, yoga, plyometrics/vertical jump, conditioning, and wellness movement.
   - Add optional media reference contracts only if the frontend slice will render media or media placeholders.
   - Tighten proposal validation so new workout proposals require structured catalog-backed exercises.
2. **Catalog coverage and backend materialization**
   - Expand seed catalog enough to support common MVP workout styles across the target modalities.
   - Add any missing repository/service joins or enrichment helpers so Training and Today can render catalog metadata for `exerciseId` entries.
   - Preserve historical snapshots for old revisions and graceful fallbacks for legacy/free-form entries.
3. **Today execution enhancements**
   - Enrich Today workout detail payload/cards with instructions, safety notes, muscles, equipment, difficulty, rest, and bounded execution inputs.
   - Ensure workout execution writes only update `workout_sessions`/Today state and never create plan revisions.
4. **Training read-only program view**
   - Expand Training plan rendering from compact labels to a complete weekly structure with prescription, catalog metadata, revision context, and session history.
   - Keep all plan-change CTAs routed to Chat.
5. **Tests**
   - Contract tests for catalog taxonomy, structured plan payloads, media metadata if added, and bounded execution feedback.
   - Backend tests for catalog enrichment, proposal resolution, Today materialization, ownership checks, and revision-safe boundaries.
   - Frontend tests for Training read-only behavior, metadata rendering, Today execution transitions, and chat-link behavior.

## Acceptance Criteria

1. Exercise catalog exists in structured DB state with required metadata fields and typed validation.
2. Catalog taxonomy supports the scoped modalities: strength, athletic performance, vertical jump/plyometrics, yoga, mobility, conditioning, and general wellness.
3. New active workout plan payloads reference catalog exercises through typed IDs or proposal-time pending exercise definitions that resolve to typed IDs.
4. Training secondary view renders full active plan structure and remains read-only for plan edits.
5. Training displays catalog-backed exercise metadata where available and gracefully handles legacy/snapshot-only entries.
6. Today renders current workout from active plan + catalog metadata with instruction/media or media fallback/prescription/rest details.
7. Users can record exercise completion, skipped/adjusted status, bounded actuals/notes where supported, and workout/day feedback on Today.
8. Today execution writes do not mutate workout plan revisions directly.
9. Plan-level workout changes continue through chat proposals and create new `WorkoutPlanRevision` rows only after approval.
10. Safety notes are visible for exercises where defined and avoid diagnosis/treatment language.

## Risks And Assumptions

- Catalog quality depends on consistent exercise taxonomy and curation ownership.
- Media hosting/licensing constraints may delay full media coverage for all exercises.
- Existing workout payloads include legacy/free-form and snapshot-only structures; implementation should support read fallbacks rather than migrating old revisions unless a migration is explicitly scoped.
- Too much complexity in Today cards can hurt completion; scope should favor fast execution UX first.
- Assumes current proposal engine is reused for adaptive changes triggered from execution feedback.
- `docs/product/mvp-scope.md` and `docs/product/mvp-slices.md` are referenced by the workflow but are not present in the current docs tree; use `docs/product/feature-roadmap.md` and architecture docs as the current product baseline unless those docs are restored.
- If Drizzle migrations are added under `packages/db/drizzle`, Railway deployment verification requires a manual migration step after deploy/push per `AGENTS.md`.

## Likely Affected Modules

- `packages/types/src/exercises.ts`
- `packages/types/src/workouts.ts`
- `packages/types/src/today.ts`
- `packages/db/src/schema/exercises.ts`
- `packages/db/src/schema/workouts.ts`
- `packages/db/drizzle/*`
- `packages/db/drizzle/seeds/exercises.sql`
- `apps/api/src/modules/exercises/*`
- `apps/api/src/modules/workouts/*`
- `apps/api/src/modules/today/*`
- `apps/api/src/modules/proposals/proposal-apply.service.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/training-ui-state.ts`
- `apps/web/src/components/training/training-workspace.tsx`
- `apps/web/src/components/today/today-workspace.tsx`
- Related tests in `packages/types`, `apps/api/src/modules/workouts`, `apps/api/src/modules/exercises`, `apps/api/src/modules/today`, and `apps/web/src/components/{training,today}`

## Subagent Implementation Order

1. **Backend Implementer**
   - Contract/schema extensions, catalog seed coverage, enrichment/materialization services, execution write boundaries, and backend tests where co-located.
2. **Frontend Implementer**
   - Training read-only metadata view and Today execution card flow.
3. **Design System Agent**
   - Reusable exercise card primitives, accessibility states, and media/fallback patterns because the same metadata appears in Training and Today.
4. **Test Writer**
   - Contract, backend, and UI-state tests for materialization, logging, and revision safety.
5. **Implementation Reviewer**
   - Architecture, invariants, safety language, and test coverage review.
6. **App Runner**
   - End-to-end runtime verification for Training + Today workout journeys.

Skip by default unless visual scope expands: Visual Designer, UI Polish Implementer.

## Verification Plan

- Run shared-contract tests for new exercise catalog and plan linkage schemas.
- Run backend tests for:
  - catalog read and filtering,
  - plan materialization into Training/Today payloads,
  - execution logging writes,
  - no direct plan mutation from Today actions.
- Run frontend tests for:
  - Training read-only rendering of active plan hierarchy,
  - Today exercise card rendering, completion toggles, feedback capture,
  - chat-link behavior for change requests.
- Run migration + typecheck validations for affected packages/apps.
- App Runner verifies:
  - active program visible in Training,
  - same program materialized on Today,
  - completion/feedback captured,
  - plan mutation requires proposal and revision.
