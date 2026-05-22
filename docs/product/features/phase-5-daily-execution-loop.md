# Phase 5: Daily Execution Loop

## Summary

Phase 5 turns Today from an AI-created checklist record into the daily execution surface for the MVP loop. Authenticated users should be able to open Today, see a structured checklist for a specific date, mark tasks complete or skipped, leave short feedback, and see an adherence score that is calculated from persisted checklist state.

The implementation should keep structured state authoritative. Today items may be proposed by AI and approved through the proposal flow, but day-to-day reads, completion writes, feedback capture, and adherence calculations must live in the Today domain APIs rather than chat history. For this repository pass, the recommended delivery target is API plus web Today surface, matching the existing Phase 2-4 runtime surfaces; Expo Today can stay a placeholder unless the planner explicitly broadens scope to mobile.

## Current State

- Roadmap Phase 5 calls for Today checklists, task completion, adherence scoring, daily progress history, and short feedback capture.
- `daily_checklists` already exists with `user_id`, `date`, `items`, `source`, and timestamps.
- `TodayService.applyTodayChecklistProposal` can create a checklist when an accepted AI proposal has `intent: "create_today_checklist"`.
- Shared contracts currently define a minimal Today payload: date plus checklist items with `label`, `kind`, and `completed`.
- There is no Today controller, read API, completion API, adherence score contract, progress history API, or web/mobile product surface.
- Workout sessions already have planned dates, completion status, feedback, and authenticated APIs. They are the first structured source Today can derive from.
- Nutrition plan revisions exist, but daily nutrition adherence is not yet implemented; Phase 5 should leave a clear integration point instead of inventing nutrition adherence ahead of Phase 6.

## Scope

- Shared Today contracts for checklist records, item identity, item type, completion state, adherence score, day read response, completion/update input, short feedback input, and history response.
- Database changes for stable checklist item IDs, per-item completion state, item source references, optional feedback, adherence score persistence or recalculation metadata, and uniqueness/indexing by user/date.
- Today backend APIs to get or generate a checklist for a date, mark an item complete or skipped idempotently, update short feedback, return the adherence summary, and list recent daily progress history.
- Checklist generation that derives from structured state where available, starting with planned workout sessions for the requested date and approved Today checklist proposals.
- Adherence scoring based on structured checklist item state, with a simple transparent formula for MVP.
- Web Today route and navigation entry showing today's checklist, completion controls, adherence summary, short feedback prompt, empty states, loading/error states, and recent history.
- Focused tests for contracts, generation, ownership, date boundaries, idempotent completion, feedback validation, and adherence calculation.

## Out Of Scope

- Medical diagnosis, treatment recommendations, symptom triage, or medical certainty language.
- Using chat messages as the source of truth for Today items or adherence.
- Silent AI changes to Today state without user approval when a proposal changes the planned checklist.
- Wearable/device sync, HealthKit, Health Connect, recovery scoring, document ingestion, or private health document context.
- Full nutrition adherence tracking before Phase 6 defines the nutrition daily model.
- Advanced analytics, weekly progress reviews, trend detection, coach adaptation recommendations, or complex streak/gamification systems.
- Full Expo/mobile Today implementation unless explicitly added by the planner; current repository flow is API/web first.

## Product Rules

- Today is an execution surface over structured state, not a transcript summary.
- Checklist generation must be deterministic from persisted state for a given user/date, except for explicitly approved AI-created checklist records.
- Completion writes must go through authenticated domain APIs and enforce user ownership.
- Repeated completion or skip actions for the same item should be idempotent.
- Adherence must be explainable from item states and must not depend on AI interpretation.
- Feedback capture should be brief wellness/coaching context, such as energy, difficulty, blockers, or notes. It must avoid diagnosis and treatment workflows.
- If Today items link to workout sessions, completion should not create conflicting state between `daily_checklists` and `workout_sessions`; one source should coordinate the other or the checklist item should reference the workout session as the structured source.

## User Stories

- As an authenticated user, I can open Today and see the tasks for the selected date.
- As an authenticated user, I can see workout-related tasks derived from my structured workout sessions when they exist.
- As an authenticated user, I can mark a Today task complete or skipped without duplicate state changes.
- As an authenticated user, I can quickly record how the day went using short feedback.
- As an authenticated user, I can see an adherence score for the day and understand which items contributed to it.
- As an authenticated user, I can review recent daily progress history.
- As a developer, I can verify that accepted Today proposals create structured checklist state and that pending/rejected proposals do not alter Today.

## Acceptance Criteria

- Authenticated users can fetch only their own Today checklist for a requested ISO date.
- If no checklist exists for the date, the backend can generate a structured checklist from available source state and return a renderable empty state when no tasks exist.
- Generated workout items reference the relevant workout session so completion behavior remains consistent with workout state.
- Today checklist items have stable IDs that clients can use for completion updates.
- Completing or skipping an item updates structured checklist state and is safe to repeat.
- The API supports short daily feedback with bounded free text and optional simple wellness fields such as energy or difficulty.
- Daily adherence is calculated from checklist state using an explicit MVP formula, for example completed required items divided by completable required items, with skipped optional items handled consistently.
- Recent progress history returns date, adherence score, completion counts, and feedback summary metadata without exposing unnecessary private details.
- Today proposal application still validates `create_today_checklist` payloads before writing records.
- Pending and rejected Today proposals do not update checklist state.
- Web Today shows tasks, completion controls, adherence summary, feedback capture, recent history, and clear empty/error/loading states.
- Backend repositories/services/controllers enforce user ownership and date boundaries.
- Focused validation covers shared schemas, Today service behavior, repository persistence, proposal application, and web UI state.

## Initial Implementation Plan

1. Expand `packages/types` Today schemas to include checklist item IDs, item status, item kind, source references, feedback input, adherence summary, daily checklist response, and history response.
2. Update `packages/db` Today schema and migration to support stable item state, optional feedback, adherence score fields if persisted, and a unique user/date constraint or service-level conflict handling.
3. Add Today mapper/service/repository/controller methods for get-or-generate by date, mark item status, save feedback, calculate adherence, and list recent history.
4. Integrate workout sessions as the first derived Today source by creating checklist items for sessions planned on the requested date and reconciling completion with workout session status.
5. Preserve existing accepted-proposal application for `create_today_checklist`, but validate richer payloads and define how approved proposal items merge with or replace generated checklist state.
6. Add web API helpers, query keys, and a Today route/workspace with checklist controls, adherence summary, feedback prompt, recent history, and empty states.
7. Add contract tests, Today service/repository tests, proposal apply tests for Today behavior, and web UI state tests.
8. Run narrow API/web validation and smoke test the Today flow with a user that has at least one planned workout session and one approved Today checklist proposal.

## Planner Refinement

Deliver the phase as a small vertical API plus web slice. Mobile should remain a placeholder unless Phase 5 scope is explicitly expanded, because the current implemented product surfaces are API and web.

### Vertical Slices

1. Contracts and persistence: define the Today response/update/history contracts first, then adjust `daily_checklists` so item identity, item source, completion state, feedback, and user/date lookup are stable.
2. Today API core: add authenticated endpoints for day read/get-or-generate, item status update, feedback update, and recent history, with service-level ownership and ISO date validation.
3. Workout-derived tasks: derive checklist items from `workout_sessions.planned_date`, reconcile Today item completion with workout session status, and prevent conflicting completion state.
4. Proposal compatibility: keep accepted `create_today_checklist` proposals supported, validate the richer payload, and define deterministic merge behavior with generated source items.
5. Web execution surface: add a Today navigation entry and route that renders tasks, status controls, adherence summary, short feedback, recent history, and loading/error/empty states.
6. Verification loop: add focused tests, run narrow validations, review source-of-truth boundaries, then smoke test the running API/web flow.

### Role-Specific Tasks

- Backend Implementer: owns shared Today contracts, Drizzle schema/migration, Today controller/service/repository/mapper, workout-session source integration, proposal application compatibility, and backend tests colocated with the touched modules.
- Frontend Implementer: owns web API helpers/query keys, Today route and workspace, navigation entry, checklist controls, feedback form, adherence/history rendering, and UI state helpers/tests following existing web patterns.
- Test Writer: expands targeted coverage after implementation for contract parsing, date and ownership behavior, idempotent completion/skip, feedback validation, adherence calculation, proposal no-op behavior for pending/rejected proposals, and web UI state.
- Implementation Reviewer: checks source-of-truth boundaries, user ownership, proposal safety, workout completion reconciliation, timezone/date handling, privacy of short feedback, and whether tests cover the riskiest paths.
- App Runner: starts the local stack and verifies Today read/generate, workout-derived task display, complete/skip, feedback save, adherence score, and recent history in the running web app.

### Default Subagent List

Use Backend Implementer, Frontend Implementer, Test Writer, Implementation Reviewer, and App Runner.

Skip Visual Designer, Design System Agent, and UI Polish Implementer for the first pass because this phase can use existing web components and visual patterns. Reconsider them only if the approved scope expands into a broader Today redesign or shared execution-loop primitives.

## Sequencing Notes

- Implement contracts and database shape before UI so frontend state is not built around the current minimal `items` payload.
- Establish the item source model before connecting workout sessions to avoid double completion or contradictory state.
- Deliver a basic adherence formula first; richer weighting and weekly trend summaries belong in Phase 10.
- Keep nutrition item support generic until Phase 6 defines daily nutrition adherence. A hydration or habit item can exist as a checklist item, but nutrition-plan-derived adherence should wait for the nutrition domain model.
- If mobile becomes required for this phase, build the web/API flow first and then let a Frontend Implementer mirror the stable contracts in Expo.

## Risks

- Today can become a second plan system. Keep it as daily execution state derived from plans/tasks, not a duplicate authoring surface.
- Merging AI-approved checklist proposals with deterministic generation can create duplicates or surprising changes. The implementation needs clear merge rules.
- Checklist completion and workout session completion can drift if both write separate states. Source references and service coordination are required.
- Date boundaries depend on the user's timezone; use the authenticated user's timezone where available instead of server-local dates.
- Free-text feedback can contain sensitive health details. Store only bounded feedback, do not log it, and keep AI use constrained to approved coaching context.
- Adherence scoring can become judgmental or medicalized. Keep copy neutral and coaching-oriented.
- Local runtime verification may be blocked without migrated Postgres and Clerk development credentials.

## Recommended Subagents

- Backend Implementer: Today contracts, Drizzle migration, NestJS controller/service/repository, workout-session integration, and backend tests.
- Frontend Implementer: web Today route, API helpers, query states, completion controls, adherence summary, feedback capture, and navigation.
- Test Writer: focused contract, service, repository, proposal, API, and web UI state tests.
- Implementation Reviewer: ownership, source-of-truth boundaries, proposal safety, date/timezone handling, and test coverage review.
- App Runner: local stack startup and smoke verification for Today read/generate, completion, feedback, adherence, and history.

Skip Visual Designer, Design System Agent, and UI Polish Implementer for the first pass unless the planner wants a broader Today visual redesign beyond existing web UI patterns.
