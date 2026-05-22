# Phase 6: Nutrition Plans

## Summary

Phase 6 makes Nutrition a real structured-state product surface, not advice stored in chat. Users should be able to view an active nutrition plan, follow daily targets, record simple adherence, and accept AI-proposed nutrition changes that create immutable revisions after backend validation.

The repository already has a partial foundation: `nutrition_plans` and `nutrition_plan_revisions`, shared contracts for calories/macros/hydration notes, NestJS active-plan and revision reads, accepted `create_nutrition_plan` and `adjust_nutrition_plan` proposal application, and a web read-only revision inspector. This phase should complete the MVP gaps: richer nutrition payloads, daily adherence, mobile Nutrition tab, stronger domain validation, and focused tests.

## Problem

MVP 1 needs users to execute both training and nutrition consistently. Today the nutrition domain can persist a revision-safe target, but it does not yet capture the user's meal structure, preferences, restrictions, or daily follow-through. Without these pieces, the AI can propose nutrition changes, but the product cannot prove the full loop of plan -> adherence -> feedback -> validated revision.

## Scope

- Extend nutrition plan payloads for calories, macros, hydration, meal structure, preferences, and restrictions.
- Keep nutrition plans revision-safe: every accepted change creates a new `nutrition_plan_revisions` row and moves the active pointer.
- Add daily nutrition adherence state and APIs for date-scoped targets such as meals followed, macro/calorie adherence, hydration progress, and lightweight notes.
- Add a mobile Nutrition tab for active targets, meal structure, hydration, daily adherence controls, and empty/loading/error states.
- Enrich the web Nutrition surface as a developer-oriented revision inspector, including preferences, restrictions, macro details, and adherence debugging where useful.
- Reuse the existing AI proposal approval path for nutrition changes, with backend schema/domain validation before revision creation.
- Add focused contracts, backend, proposal, and UI state tests.

## Out Of Scope

- Recipe database, recipe recommendations, shopping lists, ingredient inventory, and generated meal recipes; those belong to Phase 7.
- Diagnosis, treatment, disease-specific diet protocols, allergy treatment advice, or medical certainty language.
- Wearable, HealthKit, Health Connect, or nutrition app integrations.
- Calorie expenditure estimation, advanced analytics, long-term trend detection, or weekly adaptation summaries.
- Direct AI writes to nutrition state without user approval and backend validation.
- Full dietitian-grade nutrition planning; MVP should support wellness, fitness, consistency, and user-stated restrictions.

## Product Rules

- Structured nutrition state is authoritative; chat explanations are not plan state.
- Pending and rejected proposals must not change active nutrition plans or daily adherence.
- Accepted nutrition proposals must be revalidated for schema, user ownership, safety, and domain rules before creating a revision.
- Nutrition plan revisions are immutable. Edits append revisions instead of updating existing payloads.
- Daily adherence writes must be date-scoped, user-owned, and safe to repeat from mobile UI interactions.
- Restrictions are user-stated preferences/constraints for coaching context, not medical diagnosis or treatment.

## User Stories

- As an authenticated mobile user, I can open Nutrition and see my current calories, macros, hydration target, meal structure, preferences, and restrictions.
- As an authenticated mobile user, I can mark today's nutrition and hydration adherence so the app reflects what I actually followed.
- As an authenticated user, I can accept an AI-proposed nutrition change and see it become the new active plan revision after validation.
- As an authenticated user, I can reject a nutrition proposal without changing the active plan.
- As a developer, I can inspect active nutrition revisions and history from the web surface.
- As a developer, I can verify that daily adherence is structured state available to Today/progress flows without depending on chat text.

## Acceptance Criteria

- Authenticated users can fetch only their own active nutrition plan and active revision.
- Users with no active nutrition plan receive explicit empty states in mobile and web surfaces.
- Nutrition revision history is readable for the authenticated user.
- Nutrition payloads include explicit calories, protein/carbs/fat grams, hydration liters, meal structure, preferences, restrictions, summary, and notes.
- Backend validation rejects unsafe or nonsensical targets, such as negative macros, impossible hydration, empty required labels, or unsupported payload shape.
- Accepted `create_nutrition_plan` and `adjust_nutrition_plan` proposals create immutable revisions and update the active revision pointer.
- Pending and rejected nutrition proposals leave the active revision unchanged.
- Users can create or update today's nutrition adherence through domain APIs, including hydration progress and meal/target completion state.
- Repeated adherence writes for the same user/date update the intended daily record rather than creating conflicting duplicates.
- Mobile Nutrition reads active structured state and writes daily adherence through APIs.
- Web Nutrition remains useful for inspecting active revision data and revision history.
- Focused tests cover contracts, service/repository behavior, proposal application, rejected proposal no-op behavior, adherence idempotency, ownership, and UI empty/loading/error states.

## Data, Contracts, And APIs

- Shared contracts: expand `nutritionPlanPayloadSchema` with `mealStructure`, `preferences`, and `restrictions`; add date-scoped nutrition adherence schemas and response types.
- Database: keep existing `nutrition_plans` and `nutrition_plan_revisions`; add or extend a dedicated daily nutrition adherence model if `daily_checklists` is too generic for macro/hydration progress.
- API reads: keep `GET /nutrition/active` and `GET /nutrition/revisions`, returning the richer payload shape.
- API writes: add date-scoped daily adherence endpoints, for example read today's adherence and upsert adherence for a date.
- Proposal application: keep accepted nutrition proposals routed through the existing proposal decision flow, parse the richer nutrition payload, then call nutrition domain services to append revisions.
- Today integration: expose enough nutrition adherence state for Today checklist generation or summaries without making Today the owner of nutrition targets.

## UI Plan

- Mobile Nutrition tab: active plan summary, calories/macros cards, hydration target/progress, meal structure checklist, preferences/restrictions display, daily note/feedback capture, and empty/loading/error states.
- Web Nutrition inspector: active revision metadata, full target payload, revision history, validation-friendly formatting, and optional daily adherence debugging for the current user.
- Chat proposal cards: ensure nutrition proposal summaries show target deltas and restriction/preference changes clearly enough for approval decisions.
- Copy: use wellness and fitness language such as targets, preferences, restrictions, and consistency; avoid diagnosis, treatment, or medical claims.

## Testing Plan

- Contract tests for richer nutrition payloads and daily adherence schemas.
- Backend service/repository tests for revision creation, active pointer updates, revision listing, ownership, and adherence upsert idempotency.
- Proposal tests for accepted nutrition proposal application and pending/rejected no-op behavior.
- Validation tests for calorie, macro, hydration, meal structure, preferences, and restrictions boundaries.
- Web API client/UI state tests for active nutrition reads, revision history, proposal refresh, and empty/error states.
- Mobile UI state tests for rendering active targets and submitting date-scoped adherence where the project test setup supports it.

## Risks And Assumptions

- Nutrition scope can easily drift into recipes or dietetics; keep this phase focused on targets, structure, restrictions, hydration, and adherence.
- Daily adherence may overlap with `daily_checklists`; choose the smallest model that preserves nutrition-specific details while still feeding Today.
- Existing generated `dist`, `.next`, and cache files appear untracked in the working tree; implementation agents should avoid committing generated artifacts.
- Richer payload contracts may require migration or fixture updates for existing local nutrition revisions.
- Domain validation must be strong enough to reject nonsensical targets but should avoid pretending to provide medical nutrition therapy.
- Runtime verification may depend on local Clerk/Postgres setup and seeded or proposal-created nutrition state.

## Rollout Sequence

1. Expand contracts and domain validation for the complete MVP nutrition payload.
2. Add persistence and APIs for daily nutrition adherence, choosing a model that can feed Today without duplicating plan targets.
3. Update accepted nutrition proposal application to parse and validate the richer payload before appending revisions.
4. Build the mobile Nutrition tab against active plan and adherence APIs.
5. Enrich the web Nutrition inspector for full revision payloads and developer debugging.
6. Add focused contract, backend, proposal, API client, and UI state tests.
7. Run local API/web/mobile validation and verify the flow: accept nutrition proposal -> active revision updates -> Nutrition tab reads it -> daily adherence can be recorded.

## Default Subagents

- Use Backend Implementer for contracts, Drizzle schema/migrations, NestJS nutrition APIs, proposal application, and backend tests.
- Use Frontend Implementer for mobile Nutrition tab, web inspector updates, API client integration, and UI state handling.
- Use Test Writer for focused contract, backend, proposal, and UI tests after the first implementation pass.
- Use Implementation Reviewer for revision safety, ownership, validation, security, and MVP boundary review.
- Use App Runner for local stack verification of the proposal-to-revision and Nutrition tab flow.
- Skip Visual Designer by default unless the mobile Nutrition tab needs new visual direction beyond existing app patterns.
- Skip Design System Agent by default unless implementation needs new reusable nutrition/adherence primitives shared across mobile and web.
- Skip UI Polish Implementer until the core flow works and any visual polish is explicitly approved.
