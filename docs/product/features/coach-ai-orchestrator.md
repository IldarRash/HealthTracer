# Coach AI Orchestrator

**Status:** Proposed - proposal pipeline exists; production AI orchestration is still stub-based.

## Summary

Replace the keyword-driven stub coach with a production-ready AI orchestrator that reads structured coaching context, returns safe conversational replies, and emits typed proposals that pass backend validation before becoming pending user decisions.

The orchestrator is not allowed to mutate domain state directly. It maps coaching goals into typed proposal intents and relies on the existing approval and apply pipeline.

## Architecture Sources

- `docs/architecture/ai-update-flow.md`
- `docs/architecture/overview.md`
- `docs/architecture/domain-model.md`
- `docs/architecture/product-surface-architecture.md`
- `docs/product/feature-roadmap.md`

## Problem

The architecture describes an AI update flow with structured outputs and tool-like proposal generation. The code has the important safety pipeline, but generation is still a stub provider with limited keyword matching. It cannot reliably use the full coaching context, cover newer intents, or produce production-quality bounded proposals.

## In Scope

- Production `CoachAiProvider` implementation behind the existing provider interface.
- Prompt/context assembly that uses structured state, not chat history as source of truth.
- Strict structured JSON output parsing and retry/fallback behavior.
- Intent mapping for profile, goals, workouts, nutrition, recipes, Today, habits, and progress summaries.
- Safety validation for replies and proposals before persistence.
- Deterministic fallback response when AI output is invalid, unsafe, or unavailable.
- Observability that avoids logging private health data or raw prompts.
- Configuration for local stub vs production provider by environment.
- Focused tests for invalid output, unsupported intent, safety rejection, and fallback behavior.

## Out of Scope

- Direct database writes from AI.
- Autonomous plan changes without user approval.
- Clinical diagnosis, treatment, medication guidance, or medical certainty.
- Full external tool-calling runtime if typed proposal generation covers MVP needs.
- Replacing the proposal validation or apply services.
- Long-term memory scraped from chat without explicit structured-state approval.

## Product Rules

- Structured state is authoritative.
- Chat is the interaction layer.
- AI creates proposals; backend services validate and apply them only after user approval.
- Unsafe replies and unsafe proposal reasons are rejected or replaced with safe fallback copy.
- Device and document context is included only when consent allows it.
- Proposal count per turn should stay bounded to prevent overwhelming the user.

## User Stories

- As a user, I can ask the coach for plan changes and receive clear, reviewable proposals.
- As a user, I can trust that the coach uses my current structured plans and goals.
- As a user, I see safe fallback copy if the AI cannot produce a valid response.
- As a user, I never have a plan changed just because the AI suggested it.
- As an operator, I can switch between stub and production AI providers by environment.

## Acceptance Criteria

- Production provider can be configured without changing application code.
- AI output must parse through the existing structured output schema before persistence.
- Unsupported, unsafe, or invalid proposals are not persisted as valid pending proposals.
- Chat response still succeeds with fallback copy when provider output fails.
- Provider never receives raw documents or raw private logs unless an explicit consented summary is part of structured context.
- Generated proposals use known intent schemas and target domains.
- Existing accept/reject behavior remains unchanged.
- Tests cover bad JSON, unsafe reply text, unsafe proposal reason, unsupported intent, provider failure, and valid proposal persistence.

## Data and API Implications

The first slice should not require new product tables. Potential implementation areas:

- `packages/ai/src/*` for provider, parsing, safety helpers, and prompt contracts.
- `apps/api/src/modules/ai/ai.service.ts` for orchestration.
- `apps/api/src/modules/coaching-context/coaching-context.service.ts` for context selection.
- `apps/api/src/modules/chat/chat.service.ts` for persistence handoff.
- `packages/types/src/index.ts` and domain files for proposal schemas.

## Evidence Paths

- `apps/api/src/modules/ai/ai.service.ts`
- `apps/api/src/modules/chat/chat.service.ts`
- `apps/api/src/modules/coaching-context/coaching-context.service.ts`
- `apps/api/src/modules/proposals/proposal-validation.service.ts`
- `apps/api/src/modules/proposals/proposal-apply.service.ts`
- `packages/ai/src/stub-provider.ts`
- `packages/ai/src/structured-output.ts`
- `packages/ai/src/safety.ts`
- `packages/types/src/index.ts`
- `apps/web/src/components/chat/chat-workspace.tsx`

## Implementation Slices

1. **Provider boundary** - formalize provider config, errors, and fallback behavior.
2. **Prompt and context contract** - compact structured context with consent filtering.
3. **Production generation** - implement structured output provider.
4. **Intent coverage** - cover profile, goals, workouts, nutrition, recipes, Today, habits, progress.
5. **Safety and observability** - add redacted metrics/logging and policy tests.
6. **Integration tests** - verify chat generation through pending proposal persistence.

## Risks and Open Questions

- AI context can grow too large; context selection needs domain priorities.
- Logs and traces must not contain private health data or raw prompts.
- Tool-calling vs structured JSON should be chosen deliberately; both must end in typed proposals.
- Provider latency and failures should not break chat history persistence.
- Habit target domain currently needs alignment with proposal target domains before production generation relies on it.

