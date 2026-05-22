# Phase 2: User, Auth, Profile, Goals

## Summary

Phase 2 creates the first user-owned structured state for the AI Health Coach: authenticated users, profile context, preferences, constraints, and goals. This pass is web-only for client work; mobile auth and onboarding are intentionally out of scope.

## Scope

- Clerk-backed authentication for protected API routes.
- Application-owned user records mapped to Clerk subjects.
- User profile storage with `birth_date`, body metrics, activity level, training experience, preferences, and constraints.
- Goal storage with type, priority, status, timeframe, and structured target metadata.
- Shared Zod contracts for API payloads and responses.
- Drizzle schema and migration for `users`, `user_profiles`, and `goals`.
- NestJS modules for current user, profile, and goals.
- Minimal Next.js developer inspector for current user/profile/goals.

## Out Of Scope

- Mobile implementation.
- Chat threads, AI proposals, workout plans, nutrition plans, device sync, recipes, and documents.
- Diagnosis, treatment, or medical-record workflows.

## Acceptance Criteria

- Authenticated requests resolve to an application user record.
- Protected profile and goal endpoints reject unauthenticated requests.
- A user can read and upsert their profile.
- A user can create, list, and update their own goals.
- Services enforce ownership boundaries.
- Shared schemas validate profile, goal, and onboarding payloads.
- The web app can inspect the authenticated user's profile and goals.
- Focused tests cover schema validation, core service rules, and API ownership boundaries where practical.

## Implementation Slices

1. Add shared contracts and Drizzle schema for user/profile/goal state.
2. Add API database wiring and Clerk auth boundary.
3. Add user/profile/goals repositories, services, controllers, and tests.
4. Add web auth/API client integration and a minimal read-only inspector.
5. Run focused validation and document any environment blockers.

## Risks

- Clerk verification depends on local environment configuration and should fail closed when auth is required.
- Database validation requires a local or development Postgres URL.
- Profile and goals include wellness context, so logs and errors must not expose sensitive user data.
- The web inspector should remain a development surface and not grow into a polished product dashboard in this phase.
