# Phase Audit

This audit compares the roadmap phases in `docs/product/feature-roadmap.md` and `docs/product/mvp-slices.md` with the current repository implementation.

Status terms:

- `Done`: implemented in code for the intended surface.
- `Partial`: supporting code exists, but the phase is not complete as a product flow.
- `Not started`: no meaningful implementation beyond placeholders.
- `Blocked`: cannot be verified locally without missing infrastructure or credentials.

## Summary

| Phase | Product area | Current status | Working surface | Main gaps |
| --- | --- | --- | --- | --- |
| 1 | Foundation | Done | Monorepo packages, API/web/mobile shells, shared scripts, Docker Compose, migration scripts | Runtime verification still requires Docker and Clerk credentials |
| 2 | User, Auth, Profile, Goals | Done for API/web | Clerk-protected API modules and web inspector | Mobile auth/onboarding remains out of scope |
| 3 | Chat and Proposal Approval | Done for API/web | Web chat, proposal inspector, stub AI, accept/reject flow | No mobile chat; AI provider is a stub |
| 4 | Workout Plans | Partial to done for API/web | Web Training tab, workout APIs, revisions, sessions, completion | Mobile Training placeholder; runtime verification needs local DB and Clerk |
| 5 | Daily Execution Loop | Partial | Proposal apply can create Today checklist records | No Today REST API, UI, completion flow, or adherence scoring |
| 6 | Nutrition Plans | Partial | Proposal apply can create nutrition plan revisions | No Nutrition REST API, UI, or daily adherence flow |
| 7 | Recipe Database | Not started | None | No recipe schema, API, or UI |
| 8 | Device Sync and Health Metrics | Not started | None | No consent flow or HealthKit/Health Connect integration |
| 9 | Documents | Not started | None | No upload, parsing, OCR, summaries, or document-aware context |
| 10 | Progress and Adaptation | Not started | None | No weekly summaries, trend detection, or progress feedback loop |

## Phase Details

### Phase 1: Foundation

Implemented:

- Root pnpm/turbo workspace scripts.
- `apps/api`, `apps/web`, and `apps/mobile` shells.
- `packages/db`, `packages/types`, `packages/ai`, `packages/config`, and `packages/ui`.
- Drizzle migrations and schema package.

Works when:

- Dependencies are installed.
- Postgres is available for DB-backed validation.

Local infra:

- Root `pnpm db:up`, `pnpm db:migrate`, and `pnpm db:down` scripts.
- `docker-compose.yml` for local Postgres on `localhost:5432`.
- Drizzle migrations in `packages/db/drizzle`.

Remaining gap:

- End-to-end runtime verification still depends on Docker being available and Clerk development credentials being configured.

### Phase 2: User, Auth, Profile, Goals

Implemented:

- `users`, `profiles`, and `goals` API modules.
- Clerk JWT auth guard and application user provisioning.
- `users`, `user_profiles`, and `goals` tables.
- Shared Zod contracts for profile, goals, and onboarding payloads.
- Web inspector for current user/profile/goals.

Works when:

- `DATABASE_URL` points at a migrated Postgres database.
- `CLERK_JWKS_URL` and web Clerk environment are configured.

Gap:

- Expo mobile auth and onboarding were explicitly deferred.

### Phase 3: Chat and Proposal Approval

Implemented:

- Chat threads/messages and proposal persistence.
- Proposal decision endpoints for accept/reject.
- Backend validation and application path for profile, goals, workouts, nutrition, and Today payloads.
- Web `/chat` and `/proposals` surfaces.
- Stub AI provider for deterministic local proposal generation.

Works when:

- Auth and database requirements are satisfied.

Gaps:

- No mobile chat.
- No production LLM provider is wired yet.

### Phase 4: Workout Plans

Implemented:

- Workout active plan, revision history, session creation/listing, and completion APIs.
- Workout sessions migration.
- Web `/training` surface and navigation.
- Focused workout repository/service/mapper tests.

Works when:

- A user has workout state, usually from an accepted workout proposal.
- Auth and database requirements are satisfied.

Gaps:

- Expo Training tab is still a placeholder.
- Runtime smoke verification has not been captured as a docs artifact.

### Phase 5: Daily Execution Loop

Implemented:

- Database schema for `daily_checklists`.
- Backend service/repository support used by accepted Today proposals.

Not complete:

- No Today controller or client API.
- No checklist generation/read endpoint.
- No mark-complete flow.
- No adherence scoring.
- No web or mobile Today product surface.

### Phase 6: Nutrition Plans

Implemented:

- Database schema for nutrition plans and revisions.
- Backend service/repository support used by accepted nutrition proposals.
- Shared proposal payload contracts.

Not complete:

- No Nutrition controller or client API.
- No active nutrition plan read/revision API.
- No daily nutrition adherence flow.
- No web or mobile Nutrition product surface.

### Phases 7-10

These are roadmap phases only. They should remain out of implementation scope until the MVP 1 loop is complete:

- Recipe database.
- Device sync and normalized health metrics.
- Document upload and document-aware coaching context.
- Weekly progress reviews and richer adaptation.

## Current Runtime Expectations

The smallest local runtime stack is:

1. Postgres on `localhost:5432`.
2. Drizzle migrations applied from `packages/db/drizzle`.
3. API on `http://localhost:3000`.
4. Web on `http://localhost:3001`.
5. Clerk development credentials for authenticated routes.

The API/web product surfaces that can be smoke tested after local setup are:

- `/` for user/profile/goals inspector.
- `/chat` for chat and generated proposals.
- `/proposals` for proposal review.
- `/training` for workout plan and session state.

