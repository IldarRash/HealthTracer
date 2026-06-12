# Proposal pipeline hardening: normalization layer, self-repair, structured outputs, tolerant web contract

## Context

Two "almost working" chat scenarios ((1) document → workout plan proposal shown but REJECTED, exercises never expand/apply; (2) food photo correctly recognized but no proposal card + red "could not be loaded" error) were investigated with live DB evidence (`ai_proposals`, `chat_messages`, `last_msg.tmp.json`). **The LLM fan-out pipeline worked in both cases** — proposals were emitted; everything failed in the surrounding plumbing ("обвязка"):

1. **Workout REJECTED by one over-strict rule** — `"pendingExerciseRef values must be unique within the plan"` (`packages/types/src/workouts.ts:1249-1254`). The same exercise repeating across days → same slug → whole plan rejected. The apply path (`apps/api/src/modules/workouts/workout-plan-resolver.ts:31-47`) already caches per-ref resolution; repeats are safe. Payload in DB was fully expanded (concrete exercises, catalog IDs + pendingExerciseRefs).
2. **Nutrition photo proposal emitted 4× but invalid** — LLM shape variance: `provenance.source:"image_estimate"` (not in enum), `imageRefs` as UUID strings (schema wants objects), hallucinated `incidentDateTime:"2023-10-05"`. Trusted values (attachment ids, now, provenance) are known server-side but never stamped.
3. **Client cannot represent invalid proposals** — `aiProposalSchema` (`packages/types/src/ai-proposal.ts:515-517`) re-validates `proposedChanges` per intent, but the server intentionally persists invalid proposals. One invalid proposal → whole turn-response parse throws → generic red error, no card. The SSE path additionally **auto-falls-back to the sync endpoint** (`apps/web/src/components/chat/chat-workspace.tsx:550-565`) → duplicate paid LLM turn per click; user retried → 4 turns.

User approved **maximal scope**: 3 fixes + systemic per-intent normalization layer + self-repair LLM retry + OpenAI structured outputs for the domain step + expandable workout card. Execution via the repo's multi-agent feature workflow (github-agent bookends), subagents on **fable**.

Key discovery: router + final-decision stages **already use strict structured outputs** (`apps/api/src/modules/ai/openai-wire-schemas.ts`); only the domain step runs `strict:false` because `candidateProposals` is untyped. Zod is v4.4.3 → native `z.toJSONSchema`.

## Implementation slices

### Slice 1 — Fix pendingExerciseRef uniqueness rule (tiny)
- `packages/types/src/workouts.ts:1249-1254`: delete the uniqueness error; keep "every ref has a definition" + "no orphan definitions".
- Tests: repeated ref across days + one definition → no errors (`packages/types`); apply spec — repeated ref applies with ONE `findOrCreateExercise` call, both entries share `exerciseId`, revision created (`apps/api/src/modules/workouts/`). Regression test pinning the live failure (same legacy name on two days → normalizes → passes domain validation).

### Slice 2 — Per-intent proposal normalization registry (backend)
- **New** `apps/api/src/modules/proposals/proposal-normalization.service.ts`: registry `normalizeProposal(intent, changes, ctx)`, per-normalizer fault isolation (try/catch → original changes, warn without payload contents). Context built once per turn in ChatService: `{ userId, nowIso, turnAttachments: [{id, mimeType, category}] }`.
- Workout intents delegate to existing `workout-exercise-normalizer.ts` (stays put).
- **New** pure `packages/types/src/nutrition-incident-normalization.ts`: coerce string imageRefs→`{id}`; **stamp imageRefs from the turn's real attachment ids** (trusted, cap 5); coerce unknown/photo-claiming `provenance.source` → `vision_llm_estimate` (images present) / `text_estimate`; clamp `incidentDateTime` outside `[now−7d, now+12h]` → `nowIso`.
- **Modify** `apps/api/src/modules/chat/chat.service.ts:440-455` to call the registry; **delete** `ProposalValidationService.normalizeWorkoutProposalExercises` (`proposal-validation.service.ts:152-178`) + migrate its tests and the ~25 mock sites in chat specs (refactor-cleanup rule).
- Tests: normalization unit specs (coercion, stamping, date clamp, fault isolation, intent dispatch); chat.service integration — the exact scenario-2 payload + image attachment → persisted proposal **valid**.

### Slice 3 — Self-repair retry (backend)
- One bounded payload-only repair LLM call per invalid proposal; **not** a decision-maker re-run (it no longer writes payloads — selection-by-id). Eligibility via existing `classifyProposalValidationFailure`: schema/domain failures only; **never** safety- or ownership-class.
- **New** `packages/ai/src/proposal-repair-provider.ts` (single-method interface, mirrors `ContextCompressionProvider` optional-DI pattern); `apps/api/src/modules/ai/openai-proposal-repair-provider.ts` (re-emit corrected JSON given exact error strings + original payload; ~10s AbortController timeout; extract shared `fetchWithRetry`/`stripExplicitNulls` into `openai-http.ts` and delete the inline copies); DI token + `ai.module.ts` factory (only when openai provider configured); `proposal-repair.service.ts` → repaired `RawAiProposal` or `null`.
- **Modify** `chat.service.ts`: extract the 13-validator stack into `runProposalValidationStack(...)`; flow per proposal: normalize → validate → if eligible-invalid → repair → **re-normalize + re-validate fully** → persist final status (still-invalid persists honest invalid card as today). Compute before `createMessage` so `metadata.agent.repair {attempted, succeeded}` rides the message (additive optional field in `packages/types/src/agent-context.ts` ~line 813). Reply text never regenerated; quota counter untouched.
- Tests: repaired→valid persists with telemetry; still-invalid persists final errors; safety-class → repair never invoked; no provider → null without attempt.

### Slice 4 — Structured outputs for the domain step (backend)
- **New** `packages/types/src/llm-emission/`: per-intent strict-mode-compatible **LLM emission schemas** (no optional/default/transform/refine; `.nullable()` instead of `.optional()`; workout emission = name-based exercises only — Slice 2 normalizer is the bridge to catalog-backed form; emission imageRefs may be plain UUID strings). Cover intents domain LLMs emit: `log_nutrition_incident`, `log_workout_activity`, `create_workout_plan`/`adapt_workout_plan`, `capture_wellbeing_checkin` + candidate envelope.
- **New** `apps/api/src/modules/ai/openai-json-schema.ts`: `toOpenAiStrictJsonSchema()` via `z.toJSONSchema(..., {target:"draft-2020-12"})` + strict-mode post-pass (additionalProperties:false everywhere, all-required, strip unsupported keywords). Consult context7/OpenAI docs for current strict-mode constraints during implementation.
- **Modify** `openai-wire-schemas.ts`: `buildDomainStepWireSchema(allowedProposalIntents)` — `candidateProposals.items = anyOf(emission schemas)`; strict:true only when every allowed intent is covered, else today's strict:false (per-turn graceful fallback, no big-bang). `openai-coach-provider.ts:178-183` passes the allowlist.
- Tests: round-trip pin (emission sample → normalizer → canonical schema parses); strict-shape invariants spec; strict/fallback selection spec.

### Slice 5 — Tolerant client contract + invalid-proposal card (types + web)
- **Replace** `aiProposalSchema` semantics (`packages/types/src/ai-proposal.ts:515-517`): per-intent payload check runs only when `validationStatus === "valid"`; invalid/pending_validation keep `proposedChanges` as raw unknown. Type becomes a discriminated union (`ValidatedAiProposal | UnvalidatedAiProposal`) + `isValidatedProposal()` guard. Existing honesty test (habits.spec:817 — valid-claim+bad payload fails) stays green by design.
- **New** `packages/types/src/zod-tolerant.ts`: `tolerantArraySchema(element, label)` — element-wise safeParse, keep successes, warn dropped entities (ids/paths only, never payload contents — privacy floor).
- Apply tolerance: `chat-turn.ts` proposals array (fixes sync + SSE final frame), `apps/web/src/lib/api.ts` `listProposals` + `chatThreadDetailSchema.messages`.
- Relax `chatProposalRevisionSchema.originalProposal` (ai-proposal.ts:417) → `proposedChanges: z.unknown()` so **Modify works for invalid proposals** (server consumer already types it unknown; flag to security-review).
- **Web routing**: `inline-proposal-card.tsx` — route `validationStatus==="invalid"` to `GenericInlineProposalCard` before intent dispatch (the invalid notice + disabled Apply + Reject/Modify UI already exists and becomes reachable).
- Tests: invalid proposal parses raw / valid stays typed / tolerant array drops one keeps rest; api.spec fixtures; card render spec (notice, Apply disabled with reason, Modify/Reject enabled); change-summary returns empty for unknown shapes.

### Slice 6 — Stream-fallback duplicate-turn guard (web)
- `apps/web/src/lib/chat-stream.ts`: detect a present-but-unparseable `final` frame → new `StreamFailureReason` `"final_unparseable"`; `shouldFallbackToSync` returns **false** for it (backend turn succeeded — re-send = duplicate paid turn).
- `chat-workspace.tsx`: on `final_unparseable` clear pending, invalidate thread + proposals queries (tolerant refetch shows the persisted turn), soft inline error. Also invalidate thread query in `sendMessageMutation.onError`.
- Tests: chat-stream spec for the new reason + no-fallback.

### Slice 7 — Expandable workout card (web, pure frontend)
- `apps/web/src/lib/proposal-change-summary.ts`: add structured `workoutDays` from already-computed `summarizeWorkoutPlanForCoaching(...).days` (it already includes `exercises[{name, sets, reps, durationSeconds}]`).
- **New** `apps/web/src/components/proposals/workout-plan-day-details.tsx`: expandable day rows (aria-expanded button; header = current day summary line; body = `name — sets×reps` / `Nmin`); wire into `ProposalChangeSummaryView` in `inline-proposal-card-generic.tsx`. Reuse `DetailLineList`/existing card primitives.
- Tests: summary spec + expand/collapse render spec.

### Slice 8 — Acceptance/revision e2e tests + docs
- Apply specs: accepted repeated-ref workout proposal → new revision (never overwrite); accepted normalized nutrition incident → row with stamped imageRefs/provenance/date (`proposal-accept-nutrition-incident.spec.ts`).
- Doc sync (doc-updater): `docs/architecture/llm-pipeline.md` (normalization stage, self-repair + `metadata.agent.repair`, domain-step strict status, deleted normalizeWorkoutProposalExercises), `chat-message-flow.md`.

## Execution (multi-agent workflow, subagents on fable)

product-analyst brief → **github-agent (open)**: issue + branch `feature/proposal-pipeline-hardening` (from current `feature/no-stubs-honest-pipeline`) → **backend-implementer**: slices 1-4 → **frontend-implementer**: slices 5-7 → **test-writer**: gap coverage → **implementation-reviewer** (+ correctness AND cleanliness passes per global rule) → **app-runner**: live verification → **github-agent (ship)**: PR. Planner never writes code; smallest corrective tasks routed back on failure.

## Verification (definition of done)

1. CI parity: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` green.
2. **Live scenario 1**: attach `Week2_Athletic_System.txt` + "запиши в workout" → proposal card with expandable days/concrete exercises → Accept → new workout plan revision exists (DB check), exercises resolved (pending refs materialized once each).
3. **Live scenario 2**: attach food photo + "запиши в мой завтрак" → `log_nutrition_incident` proposal card renders (valid after normalization/repair) → Accept → `nutrition_incidents` row with stamped imageRefs/provenance/today's date.
4. No red "could not be loaded" on send; an artificially-invalid proposal renders the honest invalid card with disabled Apply + working Modify; one bad entity никогда не валит весь ответ.
5. Telemetry visible: `metadata.agent.repair` on repaired turns; dropped-entity warns contain no payload contents.
6. OpenAI key works (confirmed live 2026-06-11/12, gpt-4o-mini). Browser verification via app-runner + claude-in-chrome.

## Invariants preserved
Proposal-only writes (stamped values come from server turn state, never LLM authority); full validation stack always re-runs after normalize/repair; no-stubs (repair failure → honest invalid card, reply never regenerated, no canned prose); safety floors untouched (repair skipped for safety-class; calorie scrub unchanged); revisions never overwrite (re-tested).

## Risks
- OpenAI strict-mode keyword drift → runtime 400; mitigated by shape unit tests + per-turn strict:false fallback.
- `AiProposal` union ripple across typed accesses → monorepo typecheck after slice 5; inventory says only casts in `proposal-revision.ts:28,37`, `chat.service.ts:386`.
- Emission schemas = second representation of payloads → drift guarded by round-trip specs.
- Relaxed `chatProposalRevisionSchema` loosens a server input boundary → security-review flag.
