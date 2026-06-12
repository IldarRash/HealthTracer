# LLM Live-Contract Hardening (strict wire schemas + catalog-aware workout)

Status: **Planning**.

Branch context: follow-up to the first live OpenAI run of the fan-out pipeline on
`feature/no-stubs-honest-pipeline`. The "do it right" replacement for the four pragmatic
compromises that landed to get the live run green.

Related: the code-exact pipeline map is
[`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md); the umbrella
chat-pipeline design is [`ideal-chat-pipeline.md`](./ideal-chat-pipeline.md).

## Problem (real owner case)

The first live OpenAI run of the multi-domain fan-out hit **four stacked contract
failures** between the LLM and our Zod contracts. Each was fixed pragmatically to ship the
run, but the compromises trade structural safety for tolerance:

1. **`strict:false` on the domain step `response_format`.** The domain step wire schema has
   open-ended objects — `toolRequestWireSchema.input` and
   `domainAnswerWireSchema.candidateProposals` both carry `additionalProperties: true`
   (`apps/api/src/modules/ai/openai-wire-schemas.ts:179`, `:193`). OpenAI strict mode rejects
   any object with `additionalProperties: true`, so the domain call runs with `strict: false`
   (`apps/api/src/modules/ai/openai-coach-provider.ts:178-182`). The schema only *guides*
   generation; Zod is the sole post-receive gate.
2. **The domain union wrapped in a `result` object root.** OpenAI requires a `type: "object"`
   schema root, so the `tool_request | domain_answer` union is wrapped in a single required
   `result` key (`domainLlmStepWireSchema`, `openai-wire-schemas.ts:220-227`) and the provider
   unwraps `payload.result` with a flat-payload fallback
   (`openai-coach-provider.ts:208-213`).
3. **LLM-tolerance coercion helpers.** `llmInt` (round decimals → int) and `requiredNullable`
   (tolerate `null` stripped by `stripExplicitNulls`) were added in
   `packages/types/src/llm-coerce.ts` and applied across nutrition/workout/habit payloads;
   `workoutRepsSchema` gained a `number → string` arm (`packages/types/src/workouts.ts:63-71`).
4. **A name→catalog bridge.** `apps/api/src/modules/workouts/workout-exercise-normalizer.ts`
   maps each legacy name-only exercise to an exact/normalized catalog match (→ `exerciseId` +
   snapshot) or, on a miss, a `pendingExerciseRef` + minimal `pendingExercises` definition; the
   apply path (`workout-plan-resolver.ts` → `ExercisesService.findOrCreateExercise`) flags the
   created row `source: ai_generated` → `validationStatus: pending_validation`
   (`exercises.repository.ts:238-240`). It is invoked before validation from `ChatService`
   (`chat.service.ts:444`) via `ProposalValidationService.normalizeWorkoutProposalExercises`.

Compromises 3 (coercion) is a legitimate, narrow tolerance for real LLM output and is kept.
Compromises **1, 2, and 4** are the ones this brief hardens: open-ended objects defeat strict
structured output, and the bridge papers over the LLM not knowing the catalog.

## Goals

1. **`strict: true` on all three LLM stages** (router, domain, decision) with zero
   `additionalProperties: true` anywhere in the wire schemas.
2. **Catalog-aware workout domain LLM** so the model emits known exercise names/IDs directly,
   demoting the normalizer bridge to a measured fallback rather than the primary path.
3. **Exercise duration support** end-to-end so an LLM `{"duration":"5 min"}` is no longer
   silently dropped.
4. **An opt-in live smoke-eval lane** that exercises the real OpenAI contract so the next
   regression is caught before a manual live run.

## User Stories

- As a developer, when the LLM emits an unexpected field, the OpenAI API rejects it at the
  `response_format` boundary instead of silently passing it to a permissive Zod parse.
- As a coached user, when I ask for a workout plan the coach proposes catalog-backed exercises
  the app already knows, so my plan renders with real demos/metadata without a
  `pending_validation` placeholder.
- As a coached user, when I ask for a timed exercise ("plank 60s", "5 min jump rope"), the
  duration survives into the saved plan instead of being stripped.

## In Scope

- **Per-intent strict candidate wire schemas.** Replace the open-ended
  `candidateProposals: [{ additionalProperties: true }]` with per-intent strictly-typed wire
  schemas derived from the canonical Zod payload contracts in `packages/types`, OR encode
  genuinely open fields as JSON strings (string-typed, parsed and Zod-validated post-receive).
  Same treatment for `toolRequestWireSchema.input`.
- **Remove the `result`-wrapper unwrap fallback** once the strict root is stable (keep the
  wrapper only if OpenAI still requires an object root — but with a strict inner union, no flat
  fallback).
- **Flip `strict: false` → `strict: true`** for the domain step
  (`openai-coach-provider.ts:178-182`); keep router/decision at `strict: true` (already the
  default, `openai-coach-provider.ts:302`, `:358`).
- **Catalog-aware workout domain LLM:** a read-only exercise-search tool over the seeded
  exercise catalog (infra exists: `ExercisesRepository.findByNormalizedName`
  `apps/api/src/modules/exercises/exercises.repository.ts:128`,
  `ExercisesService.findExerciseByNormalizedName`
  `apps/api/src/modules/exercises/exercises.service.ts:124`), plus prompt guidance to emit
  known exercise names/IDs. The new tool is read-only and clamped to the workout domain
  allowlist.
- **Bridge stays as a measured fallback.** `workout-exercise-normalizer.ts` is retained for
  exercises the LLM still names freely, but it now emits a fires-count metric (how often the
  bridge had to resolve a name) so we can track how well the catalog-aware prompt works.
- **Exercise duration:** add a duration field to the legacy `workoutExerciseSchema`
  (`packages/types/src/workouts.ts:74-80`, which today has no duration field) and map it through
  `normalizeLegacyWorkoutPlanExercises` into the structured
  `workoutPlanExerciseSchema.durationSeconds` (`workouts.ts:110`, which already exists). Parse
  human strings ("5 min", "60s") to seconds; clamp to the existing `durationSeconds` max.
- **Live smoke-eval lane** (`pnpm eval:live`, opt-in, real OpenAI dev key): router shape,
  domain-step strict acceptance, file→`create_workout_plan` valid proposal, nutrition plan valid
  proposal. This extends the existing golden eval suite at
  `apps/api/src/modules/ai/evals/router-golden.eval.spec.ts`, which is already gated behind
  `LLM_EVALS=1` + `OPENAI_API_KEY` and run via
  `LLM_EVALS=1 corepack pnpm --dir apps/api exec vitest run src/modules/ai/evals` (no root
  `eval:*` package script exists yet — `eval:live` is new).

## Out of Scope (Non-Goals)

- Removing the `llmInt` / `requiredNullable` coercion helpers — they remain the legitimate,
  narrow tolerance for decimals and stripped-null fields (compromise 3 stays).
- Widening any capability/allowlist — the exercise-search tool is read-only and additive only.
- Mobile.
- Replacing the catalog data source (the seeded catalog stays; this brief makes the LLM use it,
  it does not change what is seeded).

## Acceptance Criteria (testable)

1. All three LLM stages call OpenAI with `strict: true`; no `response_format` uses
   `strict: false`.
2. No wire schema in `apps/api/src/modules/ai/openai-wire-schemas.ts` contains
   `additionalProperties: true` (verified by a unit test asserting absence across the schema
   tree).
3. The domain step accepts a valid live OpenAI response under strict mode for both the
   `tool_request` and `domain_answer` variants; the flat-payload `result`-unwrap fallback is
   removed (or proven unreachable) without breaking parsing.
4. A workout request that names a catalog exercise resolves to an `exerciseId` proposal with
   **no** `pendingExerciseRef` and **no** `pending_validation` catalog row created.
5. The normalizer bridge emits a fires-count metric; a turn where the LLM emits a known catalog
   name records zero bridge fires.
6. An LLM exercise carrying a duration (`"5 min"` / `"60s"`) produces a structured exercise with
   a populated `durationSeconds`; a regression test proves it is no longer silently stripped.
7. `pnpm eval:live` (opt-in, real key) is green for: router shape, domain-step strict
   acceptance, file→`create_workout_plan` valid proposal, and nutrition plan valid proposal.

## Risks / Assumptions

- Per-intent strict candidate schemas must stay in lock-step with the Zod payload contracts;
  the existing `openai-wire-schemas.spec.ts` pattern (a valid sample that passes the wire schema
  also passes the Zod contract) must be extended per intent, or the schemas should be *derived*
  from Zod to avoid drift.
- JSON-string encoding for genuinely open fields shifts a parse step into the provider; it must
  never log the parsed content (privacy floor, `.claude/rules/security.md`).
- Strict mode is less forgiving — a contract the model cannot satisfy degrades the domain to a
  safe empty output rather than a tolerated-but-wrong proposal; evals must confirm acceptance
  rates do not regress.
- Live evals cost real tokens and require a working dev key; the lane stays opt-in and out of
  CI.

## Initial Implementation Plan (for planner refinement)

- Types: derive per-intent strict candidate wire schemas from the Zod payloads (or JSON-string
  fields); add a `durationSeconds`-source field to `workoutExerciseSchema` + duration string
  parsing.
- Provider: flip domain `strict: true`; remove the `result`-unwrap flat fallback; keep
  `stripExplicitNulls` for nullable-required normalization.
- Workouts: read-only exercise-search tool on the workout domain allowlist; prompt guidance;
  bridge fires-count metric in `normalizeLegacyWorkoutPlanExercises`.
- Evals: `eval:live` lane extending `src/modules/ai/evals`, covering router/domain/file→plan and
  nutrition-plan cases.
- Tests: no-`additionalProperties:true` schema assertion, strict-acceptance fixtures per variant,
  duration round-trip, catalog-hit-no-pending regression, bridge-fires metric.
