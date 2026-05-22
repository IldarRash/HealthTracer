# Phase 4: Workout Plans

## Problem And User Value

Phase 4 proves the first full structured plan loop for the product: a user can receive or adapt a workout plan through chat, approve the proposed change, and then follow the resulting structured plan from the Training tab. The value is trust and continuity: workouts are no longer advice trapped in chat, they become auditable state with revision history, scheduled sessions, and completion feedback.

This phase must stay wellness and fitness oriented. The product can coach consistency, exercise structure, effort notes, and user feedback, but it must not diagnose pain or injuries, prescribe treatment, or present medical certainty.

## Current State Findings

- Product and architecture docs already define Phase 4 as workout plans, immutable workout plan revisions, active plan reads, scheduled sessions, completion tracking, and Training UI.
- Shared contracts in `packages/types` already include workout plan payloads, revisions, active workout responses, session scheduling, completion feedback, and workout proposal intents.
- Drizzle schema in `packages/db` already includes `workout_plans`, `workout_plan_revisions`, and `workout_sessions`, with indexes for user lookup, revision lookup, and planned dates.
- The NestJS workout module already exposes authenticated APIs for `GET /workouts/active`, `GET /workouts/revisions`, `POST /workouts/sessions`, and `PATCH /workouts/sessions/:sessionId/complete`.
- Proposal application already routes accepted `create_workout_plan` and `adapt_workout_plan` proposals through `WorkoutsService`, creating the first revision or appending a new active revision.
- The web Training route already exists and renders the active plan, schedule form, sessions, completion actions, and revision history.
- Expo mobile Training remains a placeholder, despite mobile being the long-term primary user experience.
- Workout schema comments explicitly defer stronger database constraints such as active revision foreign key enforcement, one active plan per user, and unique revision numbers per plan.

## Scope

- Make workout plan state usable from a Training tab: active plan, active revision, training days, exercises, scheduled sessions, completion/skipped state, feedback notes, and revision history.
- Ensure accepted AI workout proposals create auditable immutable revisions and update only the active revision pointer after backend validation.
- Keep pending and rejected proposals as audit records with no Training state mutation.
- Maintain user ownership across all workout reads, session writes, proposal decisions, and revision application paths.
- Use the current web Training tab as the Phase 4 runtime target, while documenting mobile Training as deferred unless the implementation scope is widened.
- Add or harden focused tests around contracts, proposal application, revisions, ownership, session scheduling, completion idempotency, and Training UI state.

## Non-Goals

- Full Expo/mobile Training implementation for this phase unless explicitly pulled into scope.
- Today checklist generation or adherence scoring from workout sessions; Phase 5 should consume the workout state created here.
- Nutrition, recipes, device sync, documents, recovery scoring, wearable integrations, or advanced progress analytics.
- Exercise library management, video demos, full periodization, one-rep max tracking, coach marketplace features, or program analytics.
- AI direct writes to workout tables, unapproved workout mutations, or hidden replacement of the active plan.
- Medical diagnosis, injury triage, treatment plans, medication guidance, or pain-cause certainty.

## Acceptance Criteria

- Authenticated users can read only their own active workout plan, active revision, scheduled sessions, and revision history.
- Users with no workout plan receive an explicit empty state that directs them to approve a workout proposal before Training state appears.
- Accepted `create_workout_plan` proposals create revision 1 when no active plan exists.
- Accepted `adapt_workout_plan` proposals append a new immutable revision and move the active revision pointer without mutating prior revisions.
- Accepted `create_workout_plan` proposals for a user who already has an active plan do not create competing active plans; they append or otherwise create a clearly audited replacement revision.
- Pending, rejected, invalid, or failed workout proposals do not change active plan state.
- Users can schedule a session only from their own active revision.
- Users can mark planned sessions completed or skipped with optional structured feedback, and repeat actions do not create duplicate session rows or conflicting completion timestamps.
- The Training tab renders loading, empty, error, active plan, scheduled session, completion, and revision history states.
- Workout copy and AI proposal validation reject diagnosis/treatment language and remain within wellness and fitness coaching.

## Backend, Data, And API Impacts

- Preserve the stable identity plus revision pattern: `workout_plans` owns status and `active_revision_id`; `workout_plan_revisions` owns immutable payload snapshots; `workout_sessions` references the plan and revision used when scheduled.
- Harden deferred database invariants before production use: active revision should reference a revision for the same plan, active plans should not multiply per user, and revision numbers should be unique per plan.
- Keep all writes behind Nest services and repositories. Controllers parse Zod contracts and delegate; AI/proposal code calls domain services, not repositories.
- Keep proposal `appliedReference` values audit-friendly, currently shaped like `workout_revision:<revisionId>`, and verify they point to created workout revisions.
- Consider whether session scheduling should remain manual from the Training tab or whether initial proposal application should create planned sessions automatically. For MVP Phase 4, manual scheduling keeps the boundary smaller and avoids pre-empting Phase 5 Today generation.
- Consider whether workout payload needs a stricter MVP shape before implementation continues: current payload supports days, focus, exercises, sets, reps, targets, notes, and summary, but not duration, intensity scale, equipment, warmups, or progression rules.

## Frontend Training Tab Impacts

- Web is the current functional Training surface. It should remain the runtime verification target for Phase 4 unless mobile is explicitly added.
- The Training tab should keep reading from `GET /workouts/active` and `GET /workouts/revisions`, then invalidate those queries after scheduling, completion, or accepted workout proposals.
- Empty state should explain that Chat can create a workout proposal and that Training updates only after approval.
- Active plan UI should show title, summary, revision number, source, revision reason, training days, exercise details, and plan notes.
- Session UI should show planned/completed/skipped status, planned date, exercise list, feedback notes, and terminal-state behavior.
- Revision history should be read-only and clearly distinguish the active revision from previous immutable revisions.
- Mobile Training currently displays placeholder copy; implementation planning should either explicitly skip it or assign a separate mobile/frontend task.

## Proposal And Revision Invariants

- Chat is the interaction layer; structured workout state is authoritative.
- AI may propose workout creation or adaptation, but only a user decision can approve the proposal.
- Backend re-validates safety, schema, ownership, and domain rules at decision time before applying.
- Pending, rejected, invalid, and failed proposals must remain auditable and must not mutate workout plans, revisions, or sessions.
- Accepted workout proposals create a new immutable `workout_plan_revisions` row and update the active revision pointer.
- Previous workout revisions must remain readable and unchanged after adaptation.
- Sessions are execution records against the revision used when scheduled; they should not silently shift to a new revision after a later plan adaptation.

## Implementation Plan

1. Confirm Phase 4 scope as web/API first, with Expo Training deferred, or explicitly add mobile implementation as a parallel frontend task.
2. Harden shared workout contracts where needed for the Training UI and AI proposal payloads, keeping the MVP shape narrow and schema-owned.
3. Review and tighten Drizzle constraints/migrations for active plan uniqueness, revision number uniqueness, and active revision integrity.
4. Complete backend workout service coverage for active reads, revision history, session scheduling, completion idempotency, ownership, and accepted proposal application.
5. Complete web Training UI states and query invalidation around active plans, scheduling, completion, revision history, and accepted proposal refresh.
6. Add integration-style proposal tests proving accepted workout proposals create revisions while pending/rejected/invalid proposals are no-ops.
7. Run runtime verification through Chat proposal approval into Training: create or accept a workout proposal, confirm the active revision appears, schedule a session, complete or skip it, and inspect revision history.

## Risks And Open Questions

- Scope creep into a full workout programming system is the largest product risk; keep Phase 4 to active plan, revisions, scheduling, and completion.
- The current database schema has deferred constraints that could allow duplicate active plans or duplicate revision numbers if not hardened.
- Manual scheduling may be less magical than auto-generated sessions, but it avoids prematurely coupling Phase 4 to the Phase 5 Today loop.
- The current AI provider is a stub and can produce starter workout proposals, but production-quality workout generation and adaptation prompts remain future work.
- Completion feedback is currently light. Decide whether fatigue should be exposed in the UI now or left for a later adaptation/progress phase.
- Local runtime verification may be blocked by missing Clerk, Postgres, or seed data configuration.

## Test Strategy

- Shared contract tests for valid/invalid workout payloads, session scheduling input, completion input, and proposal intent-to-payload matching.
- Backend service and repository tests for active plan reads, revision creation, active pointer movement, ownership boundaries, active revision scheduling, completion idempotency, and not-found behavior.
- Proposal lifecycle tests for accepted workout creation/adaptation, rejected no-op behavior, invalid payload failures, unsafe language rejection, and `appliedReference` recording.
- Web unit tests for Training UI state helpers: exercise labels, date validation, session sorting, empty state detection, schedule button enablement, and terminal session behavior.
- Runtime smoke test for the web flow from chat proposal approval to Training tab visibility, session scheduling, and completion.

## Runtime Verification Needs

- A local authenticated user with Clerk token access.
- A local Postgres database with migrations applied and no production data.
- Either a stubbed Chat workout proposal or a seeded pending workout proposal that can be accepted through the normal proposal decision API.
- Web app and API running together with `NEXT_PUBLIC_API_BASE_URL` pointed at the local API.
- Verification evidence should include route/API status, accepted proposal id, created workout revision reference, Training tab active revision, scheduled session, and completion/skipped update.
