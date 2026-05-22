# MVP 1 Implementation Slices

These slices implement the MVP core from `docs/product/feature-roadmap.md`. The goal is a narrow but complete loop:

```text
profile + goals -> chat -> user-approved proposal -> validated revision -> daily execution -> progress feedback
```

## Slice 1: Repository Foundation

Purpose: create a working monorepo with API, mobile, web, database, shared contracts, AI helpers, and Cursor guidance.

Implementation tickets:

- Database: create `packages/db` with Drizzle, migration config, schema entry point, and no committed production credentials.
- Backend: create `apps/api` with NestJS, health endpoint, env validation, and an auth guard placeholder.
- Contracts: create `packages/types` with shared Zod setup and initial enum conventions.
- AI: create `packages/ai` with proposal type placeholders, prompt helper location, and tool schema location.
- Mobile: create `apps/mobile` with Expo Router shell, auth-ready navigation, and placeholder tabs for Today, Chat, Training, and Nutrition.
- Web: create `apps/web` as a lightweight developer/admin shell.
- Tests: wire `pnpm lint`, `pnpm typecheck`, and `pnpm test` across the workspace.

Primary proof:

- `pnpm install` and workspace scripts work.
- API, mobile, and web can boot minimally.
- Drizzle package is ready for migrations.

## Slice 2: User, Auth, Profile, Goals

Purpose: create the first user-owned structured state that the AI can safely use as coaching context.

Implementation tickets:

- Database: add `users`, `user_profiles`, and `goals` tables.
- Backend: add NestJS user/profile/goals modules with repositories and services.
- Contracts: add onboarding, profile, goal creation, and goal update schemas in `packages/types`.
- Mobile: add onboarding flow for profile, goals, preferences, constraints, and activity level.
- Web: add read-only developer view for user/profile/goal records.
- Tests: cover profile validation, goal creation rules, and authenticated user boundaries.

Done criteria:

- An authenticated user can create or update profile data.
- A user can create at least one active goal.
- Services enforce user ownership.

## Slice 3: Chat and Proposal Approval

Purpose: connect the AI coach to structured state without allowing the AI to mutate domain entities directly.

Implementation tickets:

- Database: add `chat_threads`, `chat_messages`, and `ai_proposals` tables.
- Backend: add chat module with endpoints to create/read threads and send messages.
- Backend: add proposal decision endpoints for accept/reject.
- Contracts: add chat request/response schemas, proposal schemas, proposal status enums, and decision schemas.
- AI: add structured output schemas for typed proposals and safety checks for unsupported medical diagnosis or treatment wording.
- Mobile: add Chat tab with message list, input, pending proposal card, accept action, and reject action.
- Web: add proposal inspector for debugging proposal status, validation errors, and applied revision links.
- Tests: cover invalid AI output, unsafe wording, pending proposal persistence, rejection without state changes, and ownership checks.

Done criteria:

- AI responses can include text plus a pending proposal.
- Pending proposals do not update Training, Nutrition, or Today state.
- Accepted proposals are routed to domain services for validation and application.

## Slice 4: Workout Plans and Training Tab

Purpose: prove the revision-safe plan model with the first AI-updatable domain.

Implementation tickets:

- Database: add `workout_plans`, `workout_plan_revisions`, and `workout_sessions` tables.
- Backend: add workout module with create initial plan, read active plan, create revision, and track session completion APIs.
- Backend: apply accepted workout proposals by validating domain rules and creating a new active revision.
- Contracts: add workout plan payload schemas, revision schemas, session completion schemas, and proposal change schemas.
- Mobile: add Training tab with active plan, scheduled sessions, exercise details, completion checkboxes, and feedback capture.
- Web: add read-only revision history and active revision inspector.
- Tests: cover revision 1 creation, revision incrementing, active revision switching, rejected proposal no-op behavior, and completion idempotency.

Done criteria:

- Workout plans are never overwritten in place.
- Accepted AI workout proposals create auditable revisions.
- Training UI reads from the active revision.

## Slice 5: Daily Execution Loop

Purpose: create the daily retention loop where the user mostly marks tasks as done or not done.

Implementation tickets:

- Database: add `daily_checklists` with structured items, completion state, date, and adherence score.
- Backend: add Today API to generate/read the daily checklist and mark items complete.
- Backend: connect workout sessions and nutrition adherence into Today items where available.
- Contracts: add Today checklist schemas, checklist item types, completion schemas, and adherence response schemas.
- Mobile: add Today tab with daily tasks, checkboxes, adherence summary, and lightweight feedback prompt.
- Web: add developer view for generated checklist payloads and adherence calculations.
- Tests: cover checklist generation, completion idempotency, date boundaries, ownership, and adherence calculation.

Done criteria:

- A user can complete daily tasks from the mobile app.
- Repeated completion actions are idempotent.
- Daily adherence can be calculated from structured checklist state.

## Slice 6: Nutrition Plans and Nutrition Tab

Purpose: add nutrition planning without requiring the full recipe database yet.

Implementation tickets:

- Database: add `nutrition_plans` and `nutrition_plan_revisions`.
- Backend: add nutrition module with create plan, read active plan, create revision, and daily adherence APIs.
- Backend: apply accepted nutrition proposals by validating targets and creating a new active revision.
- Contracts: add calories, macros, hydration, preferences, restrictions, and adherence schemas.
- Mobile: add Nutrition tab with active targets, simple meal structure, hydration target, completion checkboxes, and feedback capture.
- Web: add read-only nutrition revision inspector.
- Tests: cover nutrition target validation, revision creation, accepted proposal application, rejected proposal no-op behavior, and daily adherence updates.

Done criteria:

- Nutrition plans are revision-safe.
- Nutrition UI reads from the active revision.
- The AI can propose nutrition changes, but only accepted and validated proposals update the active plan.

## Later Product Slices

- Slice 7: Recipe database and recipe recommendations.
- Slice 8: Device sync and normalized health metrics.
- Slice 9: Health document upload, parsing, summaries, and document-aware context.
- Slice 10: Weekly progress reviews, trend detection, and richer adaptation.

## Slice Ordering Rules

- Foundation must exist before product domains.
- User/profile/goals must exist before AI personalization.
- Chat and proposal persistence can exist before workouts, but state-changing proposal application must wait for the target domain service.
- Workout revisions should be implemented before AI workout mutation flows.
- Nutrition revisions should be implemented before AI nutrition mutation flows.
- Device sync and documents require explicit consent flows before data ingestion.
