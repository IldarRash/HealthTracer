# Phase 10: Progress and Adaptation

## Summary

Phase 10 turns completed execution history into a cautious weekly coaching loop: users can review progress summaries, see simple trends, understand adherence patterns, and receive richer AI adaptation proposals across workouts, nutrition, recipes, and recovery.

This phase should not make chat authoritative or allow the AI to silently rewrite plans. Structured state remains the source of truth. AI-generated adaptations are persisted as typed proposals, reviewed by the user, validated by backend services, and applied through domain-specific revision paths.

## Problem

The product can create structured plans and record some execution state, but it does not yet close the longer feedback loop. A user can accept a workout or nutrition proposal and complete workout sessions, but the system does not consistently answer:

- What happened this week?
- Which habits were consistent or inconsistent?
- Are there simple wellness trends worth noticing?
- Should the plan change, or should the user keep building consistency?
- Which changes are proposed, and what structured state would they affect?

Without a progress layer, adaptation risks being driven by conversational recency instead of reliable structured history.

## Goals

- Provide a weekly progress review built from structured state, not chat history.
- Detect simple wellness and adherence trends using cautious, non-medical language.
- Show actionable adherence insights for workouts, nutrition, recipes, recovery, and Today tasks where those surfaces exist.
- Allow AI to propose plan adaptations only as typed proposals that require user approval and backend validation.
- Preserve revision safety for workout and nutrition plan changes.
- Give users enough context to understand why an adaptation is suggested.
- Create auditability for weekly summaries, detected trends, proposal rationale, and applied revisions.

## Non-Goals

- No medical diagnosis, treatment recommendation, clinical risk scoring, or medical certainty.
- No automatic plan changes based on trends.
- No raw device log exposure to AI by default.
- No production-grade predictive analytics or experimentation platform.
- No replacing Phase 5 Today completion/adherence, Phase 7 recipes, Phase 8 metrics, or Phase 9 documents.
- No recovery score that implies medical readiness. Recovery should be framed as self-reported or synced wellness context.
- No mobile implementation unless the Feature Planner explicitly broadens the pass; current implementation patterns are web/API first.

## Current State Findings

- Chat and proposal approval exist for API/web, including persisted pending proposals, accept/reject decisions, safety checks, and backend apply paths.
- Proposal domains currently include `profile`, `goal`, `workout`, `nutrition`, `today`, and `general`; intents include `summarize_progress`, but there is no durable progress summary model or user-facing weekly review flow yet.
- Workout plans are revision-safe and have active plan, revision history, session scheduling, and completion APIs plus a web Training surface.
- Nutrition plans are revision-safe and have active plan and revision read APIs plus a web Nutrition surface, but daily nutrition adherence is not implemented.
- Today has checklist persistence through accepted proposals, but no read/update controller, completion flow, or adherence scoring surface.
- The web profile dashboard computes lightweight weekly consistency from workout sessions and goals, but it is a UI-only snapshot rather than a persisted summary or trend system.
- Recipes, device metrics, recovery metrics, documents, and consent-backed health integrations are not implemented in code yet.
- The AI provider is still a stub, and coaching context currently includes profile, goals, and active workout/nutrition revision ids rather than full plan history, adherence history, recipes, or metrics.

## Scope By Product Surface

### Progress / Dashboard

- Add a weekly progress review surface that summarizes the last 7 days and links to relevant structured records.
- Show adherence rollups for available sources: workout sessions, Today checklist items, nutrition adherence once implemented, recipe interactions once implemented, and recovery metrics once consented and available.
- Show trend cards using plain wellness language such as "more consistent than last week", "fewer completed planned sessions", or "sleep entries were lower this week" rather than clinical interpretations.
- Include empty and partial-data states, because early users may have workouts but no nutrition adherence, recipes, or synced metrics.

### Chat

- Let the coach explain the weekly review and answer follow-up questions using structured summary inputs.
- Chat may trigger adaptation proposals, but the proposal card remains the mechanism for any state-changing recommendation.
- Chat should not be the only place where the weekly summary exists.

### Workouts

- Use workout sessions and completion feedback to identify consistency, skipped sessions, rough fatigue patterns, and plan fit.
- Adaptation proposals may adjust workout volume, schedule, focus, or notes, but accepted changes must create a new workout plan revision.
- Avoid injury diagnosis or treatment copy. If the user reports pain, the app can suggest backing off intensity and consulting a qualified professional when appropriate, without diagnosing.

### Nutrition

- Use nutrition plan targets and future daily adherence records to summarize consistency and surface simple patterns.
- Adaptation proposals may adjust targets, hydration goals, meal structure, or notes, but accepted changes must create a new nutrition plan revision.
- Avoid prescriptive or clinical dietary claims. Keep language centered on user goals, preferences, constraints, and consistency.

### Recipes

- Once Phase 7 exists, include recipe recommendation acceptance, dismissal, completion, and suitability in weekly review context.
- AI may propose recipe sets or swaps as typed proposals.
- Recipe proposals should not directly change nutrition targets; nutrition target changes stay in nutrition plan revisions.

### Recovery / Metrics

- Once Phase 8 exists, use consented normalized aggregates such as sleep duration, steps, weight trend, mood, soreness, and self-reported recovery context.
- The system should summarize patterns, not infer medical causes.
- AI adaptation may use recovery context to propose gentler training, rest-day checklist items, hydration reminders, or nutrition consistency support.
- Device sync and metric use require explicit consent and least-privilege scopes.

### Today

- Use Today checklist completion as the daily execution backbone once completion endpoints and adherence scoring exist.
- Adaptation proposals may create or adjust future Today checklist templates/items, but user-facing tab state still changes only after acceptance and backend validation.

## Data And Domain Needs

- `weekly_progress_summaries`: user id, week start/end, generated source, summary payload, contributing aggregate references, created timestamp, and optional supersession metadata.
- `trend_observations`: user id, week range, domain, trend type, direction, confidence or data sufficiency label, supporting aggregate payload, wellness-safe message, created timestamp.
- `adherence_aggregates`: user id, date/week, domain, planned count, completed count, skipped count, adherence percent, source references, and created timestamp.
- Recipe recommendation and completion state from Phase 7 before recipe insights can be meaningful.
- Health metric snapshots or weekly aggregates plus consent records from Phase 8 before recovery or device-derived trends can be meaningful.
- Today checklist completion records and adherence scoring from Phase 5 before daily execution can be summarized reliably.
- Optional extension to `ai_proposals` for stronger applied references if a proposal can affect multiple domains or create both a revision and a checklist.
- Versioned schemas in `packages/types` for weekly summary responses, trend cards, adherence aggregates, and new proposal intents.

## AI Proposal Behavior

- Weekly summaries may be generated or refreshed by backend orchestration, but any state-changing recommendation must be stored as an `AIProposal`.
- Proposed adaptations should include the source summary id or trend observation ids used for rationale.
- Initial new proposal intents should be narrow, for example:
  - `adapt_workout_plan_from_progress`
  - `adjust_nutrition_plan_from_progress`
  - `recommend_recipe_set`
  - `adjust_today_checklist_from_progress`
  - `suggest_recovery_focus`
- Proposal target domains should expand only when the target domain has a backend validation and apply service.
- Multi-domain adaptation should either create separate proposals per domain or use an explicit validated bundle shape with per-domain apply results. The conservative default is separate proposals.
- Pending proposals must not update Training, Nutrition, Recipes, Metrics, or Today state.
- Rejected proposals remain auditable and do not alter structured state.
- Accepted workout and nutrition adaptations create new plan revisions.
- Accepted recipe recommendations should create or update structured recommendation records, not nutrition plan targets.
- Accepted Today adaptations should create validated checklist records or templates once the Today domain supports them.
- `summarize_progress` should remain non-mutating unless the implementation introduces a dedicated persisted weekly summary write path owned by backend services.

## Safety Language Constraints

- Use cautious wellness language: "may be associated with", "could suggest", "you were more consistent with", "consider", and "based on the entries available".
- Clearly label insufficient data states.
- Avoid diagnosis, treatment, prescription, symptom interpretation, clinical risk, medical certainty, and medication guidance.
- Avoid "recovery score" or "readiness score" language unless framed as a user-owned wellness indicator with transparent inputs and no medical implication.
- Do not expose raw private logs, health documents, raw prompts, or sensitive metric details in logs or proposal error messages.
- When data comes from integrations or documents, respect explicit consent scope and use normalized aggregates by default.

## User Stories

- As a user, I can open a weekly progress review and see what I completed across workouts, nutrition, Today tasks, recipes, and recovery inputs that are available.
- As a user, I can understand whether my consistency improved, declined, or stayed similar without the app making medical claims.
- As a user, I can see which data was missing or insufficient before trusting a trend.
- As a user, I can ask the coach about my weekly review and receive explanations grounded in structured state.
- As a user, I can review an adaptation proposal before it changes my workout plan, nutrition plan, recipes, or Today checklist.
- As a user, I can reject an adaptation proposal without any plan or tab state changing.
- As a developer, I can audit which weekly summary and trend observations led to a proposal.

## Acceptance Criteria

- Users can fetch their own latest weekly progress summary and cannot access another user's summary.
- Weekly summaries are generated from structured state and store enough references or aggregate metadata to audit their inputs.
- The progress surface handles partial data gracefully when recipes, metrics, or recovery data are unavailable.
- Trend detection labels insufficient data and avoids conclusions when the minimum data window is not met.
- User-facing summary and trend copy avoids diagnosis, treatment, clinical certainty, and medical advice wording.
- Workout adaptation proposals created from progress are pending until accepted and create a new workout plan revision only after backend validation.
- Nutrition adaptation proposals created from progress are pending until accepted and create a new nutrition plan revision only after backend validation.
- Recipe adaptation proposals do not change nutrition targets directly.
- Today/recovery adaptation proposals do not change tab state until accepted and validated by the relevant domain service.
- Pending and rejected proposals do not mutate structured state.
- Accepted proposals store applied references to created revisions or domain records.
- Coaching context for progress uses summarized structured data, not raw private logs or chat-only assertions.
- Focused tests cover aggregate calculation, trend sufficiency rules, safety wording checks, proposal validation, ownership, and revision creation for accepted adaptations.

## Risks And Open Questions

- Phase 10 depends on incomplete prior phases. Today adherence, recipes, and metrics should be implemented before full cross-domain adaptation.
- Trend detection can overstate weak signals. The first implementation should use simple rules, explicit data sufficiency thresholds, and transparent copy.
- Multi-domain proposals can become hard to validate and apply atomically. Separate per-domain proposals are safer for the first pass.
- AI context can become too sensitive if raw health data is passed through prompts. Prefer weekly aggregates and normalized summaries.
- Nutrition adherence and recovery metrics are not yet modeled, so the first usable version may need to be workout + Today only unless prerequisite phases are completed.
- The current AI provider is a stub. Production LLM behavior, structured output reliability, and safety filters will need additional validation.
- Runtime verification may depend on local Clerk and Postgres configuration.

Open questions for Feature Planner:

- Should Phase 10 wait until Phases 5, 7, and 8 are complete, or should it ship a narrow workout/Today-only weekly review first?
- Should weekly summaries be generated on demand, scheduled weekly, or both?
- Should summaries be immutable audit records, replaceable snapshots, or versioned when regenerated?
- What minimum data threshold is required before showing a trend?
- Should "recovery" start as self-reported checklist feedback before device sync exists?

## Sequencing Recommendation

1. Complete the Phase 5 Today read/update/completion/adherence loop.
2. Complete the Phase 6 nutrition adherence model if nutrition insights are in scope.
3. Complete Phase 7 recipe recommendation records before including recipe adaptation.
4. Complete Phase 8 consented metrics and normalized aggregates before including synced recovery trends.
5. Add weekly aggregate services and persisted weekly summaries.
6. Add simple deterministic trend detection with data sufficiency rules.
7. Extend shared contracts and proposal schemas for progress-driven adaptation.
8. Add backend validation and apply paths for each new adaptation proposal intent.
9. Add the web weekly progress surface and chat integration.
10. Add tests, implementation review, and runtime verification for the full progress-to-proposal-to-revision loop.

## Initial Implementation Plan

1. Backend: add summary, adherence aggregate, and trend observation schemas/migrations in `packages/db`, with ownership indexes and week-range lookup indexes.
2. Contracts: add Zod schemas for weekly summaries, trend cards, adherence aggregates, progress API responses, and narrow progress-driven proposal intents.
3. Backend: add a Progress module with services for aggregate calculation, summary generation, trend detection, and safe summary reads.
4. Backend: extend coaching context to include weekly summary snapshots and trend observations instead of raw logs.
5. Backend: extend proposal validation/apply services only for target domains with implemented validation paths.
6. Frontend: add a web Progress or dashboard weekly review surface with partial-data states, trend cards, proposal entry points, and links to source domains.
7. Frontend: update Chat and proposal cards to show progress-derived rationale and accepted applied references.
8. Tests: cover aggregate math, trend thresholds, safety wording, ownership, proposal lifecycle, and revision-safe workout/nutrition application.
9. Runtime: verify a seeded user can complete sessions/tasks, generate a weekly summary, receive an adaptation proposal, reject without mutation, accept with backend validation, and see the new structured state.

## Recommended Implementation Roles

- Backend Implementer for data model, Progress module, aggregate/trend services, proposal schema extensions, and domain apply paths.
- Frontend Implementer for the web weekly progress surface, dashboard integration, and progress-aware proposal UI.
- Test Writer for aggregate, trend, safety, ownership, proposal, and revision tests.
- Implementation Reviewer for architecture fit, safety language, structured-state invariants, and sequencing risk.
- App Runner for local stack verification once implementation is ready.
- Visual Designer or Design System Agent only if the weekly progress surface needs a polished new information architecture beyond existing dashboard patterns.
