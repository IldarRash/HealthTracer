# Adaptive Workout Program Platform

## Problem Statement

The product already enforces proposal-gated plan mutation and read-only Training/Nutrition secondary views, but the workout platform is still missing three connected capabilities needed for robust daily coaching:

- A DB-backed exercise catalog with broad modality coverage and quality/safety metadata.
- A complete read-only view of the active workout program structure in the secondary Training surface.
- A Today execution flow that materializes the active session with actionable exercise cards, completion logging, and feedback signals.

Without these, workout coaching remains hard to adapt consistently, difficult to audit, and weakly connected between plan structure and daily execution.

## Goals

- Introduce a structured exercise catalog for strength, athletic performance, vertical jump, yoga, mobility, and general wellness.
- Ensure active workout plans reference catalog exercises through typed contracts.
- Render a full read-only active program structure in the Training secondary view.
- Materialize today's workout into execution-ready cards on Today with instructions/media, prescription, rest guidance, completion, and feedback capture.
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
  - Read-only by design; calls-to-action route users to Chat for plan changes.
- **Today workout execution**
  - Materializes the current day's session from active plan revision + exercise catalog metadata.
  - Exercise cards show prescription (sets/reps/time/load where relevant), rest guidance, instructions/media, and completion status.
  - Users can mark exercise/session completion and submit bounded feedback (effort, pain/discomfort flags, difficulty, notes).
- **Feedback loop**
  - Feedback updates execution logs and coaching context summaries.
  - Any suggested plan changes from feedback are surfaced as chat proposals, not automatic edits.
- **Safety UX**
  - Safety notes appear on relevant exercises.
  - Copy remains wellness/coaching oriented and avoids diagnosis/treatment framing.

## Data And Contracts

- Add catalog entity/contracts (names illustrative):
  - `ExerciseCatalogItem`: `id`, `slug`, `name`, `modality`, `equipment[]`, `primaryMuscles[]`, `secondaryMuscles[]`, `difficulty`, `instructions`, `mediaRefs[]`, `safetyNotes[]`, `source`, `status`.
- Plan contracts should reference `exerciseCatalogId` rather than only free-form exercise names for catalog-backed items.
- Maintain `WorkoutPlan` + immutable `WorkoutPlanRevision` pattern for all plan structure changes.
- Execution contracts:
  - `WorkoutSession`/execution log stores completion and bounded feedback events.
  - Today execution writes are execution-state events, not plan revisions.
- Source/status must support curation lifecycle (for example: draft, reviewed, active, deprecated) with provenance.

## First Epic Implementation Slices

1. **Types and schema foundation**
   - Define catalog schemas and enums in shared contracts.
   - Add validation for modality, difficulty, safety notes, and media references.
2. **Backend catalog and workout APIs**
   - Create DB schema/migrations for exercise catalog and plan linkage fields.
   - Add repository/service APIs for catalog reads and Training/Today materialization.
   - Add execution logging endpoints for exercise/session completion and bounded feedback.
3. **Frontend Training and Today surfaces**
   - Build read-only active program rendering in Training.
   - Build Today workout card stack with instruction/media/prescription/rest/completion/feedback UI.
   - Add clear links to Chat for any plan changes.
4. **Tests**
   - Contract tests for catalog schemas and payload validation.
   - Backend tests for materialization logic and revision-safe boundaries.
   - Frontend tests for Training read-only behavior and Today execution state transitions.

## Acceptance Criteria

1. Exercise catalog exists in structured DB state with required metadata fields and typed validation.
2. Active workout plan payloads can reference catalog exercises through typed IDs.
3. Training secondary view renders full active plan structure and remains read-only for plan edits.
4. Today renders current workout from active plan + catalog metadata with instruction/media/prescription/rest details.
5. Users can record completion and bounded workout feedback on Today.
6. Today execution writes do not mutate workout plan revisions directly.
7. Plan-level workout changes continue through chat proposals and create new `WorkoutPlanRevision` rows only after approval.
8. Safety notes are visible for exercises where defined and avoid diagnosis/treatment language.

## Risks And Assumptions

- Catalog quality depends on consistent exercise taxonomy and curation ownership.
- Media hosting/licensing constraints may delay full media coverage for all exercises.
- Existing workout payloads may need migration to catalog-linked structures.
- Too much complexity in Today cards can hurt completion; scope should favor fast execution UX first.
- Assumes current proposal engine is reused for adaptive changes triggered from execution feedback.

## Subagent Implementation Order

1. **Backend Implementer**
   - Catalog schema, linkage contracts, materialization services, execution write boundaries.
2. **Frontend Implementer**
   - Training read-only program view and Today execution card flow.
3. **Design System Agent** (conditional)
   - Reusable exercise card primitives, accessibility, and media/fallback patterns if shared components are extracted.
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
