# Phase 4: Workout Plans

## Summary

Phase 4 turns the minimal workout revision persistence from Phase 3 into the first usable Training product surface. The implementation is web/API first: authenticated users can read their active workout plan, inspect revision history, view scheduled sessions, and track workout completion from the web Training tab.

The phase should preserve the core product model: structured workout state is authoritative, chat remains an interaction layer, and accepted AI workout proposals create validated revisions instead of overwriting the active plan in place. Expo mobile remains a placeholder for this pass.

## Readiness Check

- Phase 1 foundations are present: TypeScript monorepo, NestJS API, Next.js web shell, Expo shell, Drizzle package, shared Zod contracts, and workspace validation scripts.
- Phase 2 foundations are present: authenticated user ownership, profile and goals state, Clerk-protected API patterns, and web developer inspector.
- Phase 3 foundations are present: chat, proposal persistence, proposal accept/reject flow, AI safety checks, and minimal workout plan/revision persistence.
- Existing workout backend support can create a first plan revision or append a revision when accepted workout proposals are applied.
- Missing Phase 4 pieces include active workout read APIs, richer workout payload contracts, scheduled sessions, completion tracking, and a user-facing web Training tab.
- Local validation depends on configured Clerk and Postgres development environment variables.

## Scope

- Backend workout APIs for active plan reads, revision history reads, scheduled session reads, and session completion updates.
- Workout plan contracts that are detailed enough for a Training tab: plan summary, training days, exercises, sets or targets where available, and safe notes.
- Workout session persistence and completion tracking for planned sessions, including idempotent completion behavior.
- Accepted AI workout proposals routed through domain validation and stored as immutable workout plan revisions.
- Web Training tab for the active plan, scheduled sessions, exercise details, completion state, and revision context.
- Web navigation from the existing shell to Training.
- Focused tests for workout contracts, ownership, active revision reads, revision creation, proposal application, and completion idempotency.

## Out Of Scope

- Expo mobile Training implementation beyond keeping the placeholder intact.
- Nutrition tab, Today tab, recipes, device sync, documents, advanced metrics, or wearable integrations.
- Medical diagnosis, treatment planning, injury diagnosis, or medical certainty language.
- Direct AI writes to workout tables without user approval and backend validation.
- Full periodization, exercise library management, media demos, coach marketplace features, or performance analytics.
- Production-grade AI prompt optimization beyond the existing typed proposal flow.

## Product Rules

- Structured workout plan and session state is the source of truth; chat messages are not.
- Workout plans are revision-safe: changes create new `workout_plan_revisions` records and update the active revision pointer.
- Pending and rejected AI proposals must not change active workout state.
- Accepted AI workout proposals must be revalidated for schema, ownership, safety, and domain rules before creating a revision.
- Training UI reads from the active workout revision and writes completion state through workout domain APIs.
- Workout completion should be idempotent so repeated client actions do not create conflicting session state.
- User-facing copy must stay within wellness, fitness, tracking, and coaching language.

## User Stories

- As an authenticated web user, I can open a Training tab and see my active workout plan.
- As an authenticated web user, I can see the current revision context so I know which plan version I am following.
- As an authenticated web user, I can review scheduled workout sessions and exercise details for the plan.
- As an authenticated web user, I can mark a workout session complete without duplicate completion records.
- As an authenticated web user, I can accept an AI-proposed workout change and see it become the new active revision after validation.
- As a developer, I can verify that pending or rejected workout proposals do not mutate the active workout plan.

## Acceptance Criteria

- Authenticated users can fetch only their own active workout plan and active revision.
- Users with no workout plan receive an explicit empty state that can be rendered by the web Training tab.
- Revision history is readable for the authenticated user's workout plan.
- Accepted workout proposals create an immutable revision and move the plan's active revision pointer to it.
- Pending and rejected workout proposals leave the active revision unchanged.
- Planned workout sessions can be listed for the authenticated user.
- Marking a session complete records structured completion state and is safe to repeat.
- The web Training tab shows active plan summary, training days or sessions, exercise details, completion state, and revision metadata.
- Workout APIs, repositories, and services enforce user ownership.
- Focused validation covers shared schemas and backend workout service behavior.

## Implementation Slices

1. Expand shared workout contracts for active plan, revision history, planned session, and completion responses.
2. Extend Drizzle workout schema/migrations if needed for scheduled sessions and completion metadata.
3. Add NestJS workout controller/service/repository methods for active plan reads, revision history, session reads, and completion updates.
4. Keep proposal application on the existing accepted-proposal path, but validate richer workout payloads before appending revisions.
5. Add the web Training route and navigation entry using the active plan and session APIs.
6. Add focused contract, service, repository, and UI state tests for the workout flow.
7. Run narrow API/web validation and verify the Training tab against local seeded or proposal-created workout state.

## Risks

- The phase can expand into a full exercise programming system; keep the MVP focused on active plan visibility, revisions, schedules, and completion.
- Richer workout payloads can outpace validation; add only fields the Training tab needs and keep schemas explicit.
- Completion tracking can conflict with the later Today loop; store structured workout completion now while leaving Today aggregation for Phase 5.
- AI-generated workout changes must remain proposals, not silent plan mutations.
- Training copy must avoid diagnosis, treatment, injury assessment, or medical certainty.
- Local verification may be blocked if Clerk or Postgres development configuration is missing.
