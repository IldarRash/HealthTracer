# Phase 3: Chat and Proposal Approval

## Summary

Phase 3 adds coach chat as an interaction layer, durable AI proposal review, and user-approved application into structured state. This pass is web/API first. Expo mobile chat remains out of scope for this implementation pass.

The phase is intentionally broader than the original Slice 3: it includes minimal Workout, Nutrition, and Today domain state so accepted proposals can create auditable structured records now instead of only being stored for later.

## Readiness Check

- Phase 1 repository foundations are present: TypeScript monorepo, NestJS API, Next.js web shell, Expo shell, Drizzle package, shared Zod contracts, and placeholder AI package.
- Phase 2 backend foundations are present: Clerk-protected API patterns, application users, profiles, goals, Drizzle schema, shared contracts, and focused service/schema tests.
- Phase 2 mobile onboarding/auth was explicitly out of scope and remains deferred for this pass.
- Local validation still depends on configured Clerk and Postgres development environment variables.
- No chat, proposal, AI orchestration, workout, nutrition, or Today persistence exists before this phase.

## Scope

- Chat threads and messages stored separately from structured state.
- AI structured output envelope with conversational reply plus optional typed proposals.
- Proposal persistence with pending, accepted, rejected, and superseded states.
- Proposal validation status and auditable validation errors.
- Accept/reject proposal APIs with ownership checks.
- Minimal Workout and Nutrition plan identity plus immutable revision records.
- Minimal Today checklist records that can be created from accepted proposals.
- Web chat and proposal approval/inspector surfaces.
- Focused tests for contracts, proposal state transitions, safety checks, ownership, and supported apply paths.

## Out Of Scope

- Expo mobile chat, mobile auth, or mobile onboarding.
- Full Training, Nutrition, or Today product tabs.
- Device sync, health documents, recipes, advanced metrics, or RAG.
- Medical diagnosis, treatment, or medical certainty language.
- Direct AI writes to domain tables.
- Production-grade prompt experimentation or provider-specific model tuning.

## Product Rules

- Chat history is never the source of truth for plans, goals, metrics, or progress.
- AI may explain and propose, but backend services validate and apply.
- Pending and rejected proposals never mutate structured state.
- Accepted proposals must be re-validated against ownership, schema, safety, and domain rules.
- Workout and Nutrition changes create revisions instead of overwriting plan state.
- Today changes are stored as structured checklist records.
- Proposal records must keep enough metadata to audit what was shown, decided, and applied.

## User Stories

- As an authenticated web user, I can create or continue a coach chat thread.
- As an authenticated web user, I can send a message and receive a coach response.
- As an authenticated web user, I can see when the coach suggests a structured change.
- As an authenticated web user, I can approve or reject a suggested change before anything mutates.
- As an authenticated web user, I can inspect proposal status, validation errors, and applied structured state references.
- As a developer, I can verify that rejected proposals and pending proposals do not change domain state.

## Acceptance Criteria

- Authenticated users can create/read chat threads and send chat messages from web.
- AI responses can include text plus one or more schema-valid pending proposals.
- Invalid AI output and unsafe diagnosis/treatment wording fail safely.
- Pending proposals are persisted and auditable without changing structured state.
- Rejected proposals record the decision and do not call domain apply services.
- Accepted proposals are validated and applied through backend services only.
- Accepted profile and goal proposals update existing structured state through current services.
- Accepted workout and nutrition proposals create immutable revision records.
- Accepted Today proposals create structured checklist records.
- Web proposal inspector shows status, validation status/errors, target domain, proposed changes, and applied reference.
- Focused validation runs for shared contracts and backend proposal lifecycle behavior.

## Implementation Slices

1. Add shared contracts for chat, proposals, AI output, and minimal domain payloads.
2. Add Drizzle schema and migration for chat, proposals, workout revisions, nutrition revisions, and Today checklists.
3. Add backend coaching context, AI, chat, proposal, and minimal domain apply modules.
4. Add web chat and proposal approval/inspector UI.
5. Add tests and run the narrowest useful validation commands.
6. Review architecture, safety, and prerequisite readiness before final handoff.

## Risks

- The phase can grow into full workout/nutrition product implementation; keep domain modules minimal and proposal-focused.
- AI provider details can distract from the proposal workflow; keep the provider behind an adapter boundary.
- Proposal schemas can become too generic; start with narrow typed intents and domain payloads.
- Logs and errors must not expose sensitive wellness context or raw private prompts.
- Accepted proposals must not imply medical advice or treatment.
