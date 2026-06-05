# Unified LLM Pipeline

This document is the **canonical, locked architecture** for the chat/LLM pipeline.
The pipeline is a **multi-domain fan-out + synthesis** design: one routing LLM
selects the relevant domains, the selected domain LLMs run in parallel, and a final
decision-maker LLM synthesizes their output into one reply plus typed proposals.

> **Status — locked architecture, now implemented.** This is the architecture the
> codebase locked and must not deviate from. The phased migration is complete: every
> component described below exists in code. The multi-domain fan-out path
> (RouterLlm → SystemPlanner `DomainFanoutPlan` → parallel `DomainLlmExecutorService`
> → `DecisionMakerExecutorService` → `ActionResolverService`) owns **all** turn types
> — proposal-revision, proposal-explainer (with proposal), low-confidence fallback,
> and the deterministic gate-miss (handled inline in
> `AgentOrchestratorService.buildDeterministicGateMissResult` — no additional LLM calls,
> though the router may already have run for eligible turns).
> `ResponseModeExecutorService`, `resolveProposalOnlyOutput`, and the provider methods
> `generateAgentLoopStep`/`generateCoachResponse` no longer exist.

Attachments are **context** for this same pipeline — there is no separate attachment
recognition/classification pipeline and no attachment proposal side channel. The old
intent router (`intent-router.ts`), `TurnDecisionService`, `MessageUnderstandingService`,
the attachment-family route bypass, and the attachment recognizers/classifiers have all
been removed (see "Removed Legacy Paths").

## End-To-End Flow

```mermaid
flowchart TD
  userTurn["User message + optional attachments"] --> chatService["ChatService.sendMessage"]
  chatService --> attachmentStages["Attachment turn stages (context-only plumbing)"]
  attachmentStages --> preAiGates["Code-owned pre-AI gates (crisis / proposal-explainer / direct-path)\nReturns before AiService — zero LLM calls"]
  preAiGates -- "gate matched" --> deterministic["Deterministic result → Response"]
  preAiGates -- "gate miss" --> quotaGate["Quota gate (entitlementsService.assertAiMessageAllowed)\nReturns canned reply on AiMessageQuotaExceededError — zero LLM calls"]
  quotaGate -- "quota ok" --> aiService["AiService"]
  quotaGate -- "quota exceeded" --> quotaReply["Quota boundary reply → Response"]
  aiService --> orchestrator["AgentOrchestratorService"]
  orchestrator --> preprocessor["MessagePreprocessorService (message normalization)"]
  preprocessor --> router["RouterLlmService (first LLM): select domains\n(skipped for revision/explainer turns)"]
  router --> planner["SystemPlannerService (fan-out planner)\nproduces executorMode"]
  planner --> deterministicMode{"executorMode == deterministic?\n(safety-net: router may already have run)"}
  deterministicMode -- yes --> gateMiss["buildDeterministicGateMissResult\n(canned reply, no additional LLM calls)"]
  deterministicMode -- no --> context["CoachingContextService (one bounded packet per selected domain)"]
  context --> domainLlms["Parallel domain LLMs (only-selected): workout / nutrition / health"]
  domainLlms --> decision["DecisionMakerExecutorService (final synthesis LLM)"]
  decision --> actionResolver["ActionResolverService"]
  actionResolver --> validation["Proposal safety and domain validation"]
  validation --> persistence["ChatRepository message and proposal persistence"]
```

LLM call budget per eligible turn: **1 router (skipped for revision/explainer) + N
selected domain LLMs (N ≤ 3, run in parallel) + 1 decision-maker**. Crisis, direct-path,
and quota-exceeded turns make **zero LLM calls** — they return in ChatService before
AiService is reached. The orchestrator-level deterministic gate-miss is a rare safety-net: the check is on the
top-level `plan.executorMode` (derived from the primary capability policy,
`classifyDirectPathCandidate`, and the router's `directCommand.detected` signal —
`turnDecisionDirectCommand → resolveResponseModeExecutorMode` returns `deterministic_write`),
which is distinct from each `DomainFanoutEntry.executorMode` (per-domain). By the time `buildDeterministicGateMissResult` runs, the router **may
already have made one LLM call** (for eligible turns); no additional LLM calls are made
from that point.

## Stage 0: Chat Entry

### `ChatService`

File: `apps/api/src/modules/chat/chat.service.ts`

`ChatService.sendMessage` owns the full chat turn at the API boundary.

Responsibilities:

- Resolve the authenticated user via `UsersService`.
- Load the thread and recent messages through `ChatRepository`.
- Validate attachment refs before send through
  `ChatTurnAttachmentStageService.validateRefsForSend`.
- Persist the user message.
- Run the **attachment plumbing stages** when `attachmentRefIds` are present
  (validate → link → apply upload disposition; no classify/recognize).
- Apply hard pre-AI gates: crisis support, proposal explainer no-proposal, and
  direct chat paths.
- Call `AiService.generateCoachResponse` for the unified LLM pipeline.
- Persist the assistant message with parse, safety, agent, and weekly-review
  metadata.
- Run the proposal validation stack and persist reviewable proposals.

`ChatService` does not create proposal cards from attachment recognition. Proposals
shown to a user come from one of two sources:

- The decision-maker / domain LLM (fan-out path), filtered through `ActionResolver`.
- A small set of deterministic code-owned injectors running after the LLM response:
  `mergeDeterministicChatProposals` (wellbeing check-in prompt),
  `packChatRecipeRecommendationProposal` (recipe recommendations), and
  `packChatWeeklyReviewProposals` (weekly-review packing).

All proposals — LLM-sourced and code-injected — pass the same
`ProposalValidationService` safety stack before persistence.

### `ChatRepository`

File: `apps/api/src/modules/chat/chat.repository.ts`

Persists chat threads, chat messages, and proposal records. It does not make AI
or domain decisions.

### `chat.mapper`

File: `apps/api/src/modules/chat/chat.mapper.ts`

Maps database rows to API chat DTOs.

## Stage 1: Attachment Context (context-only, images only)

Attachments are **bounded context** for the same pipeline used by text-only
messages. There is **no recognition or classification machinery** — the multimodal
router and domain LLMs read the image content directly. The chat-attachments
module keeps only the ownership/storage/retention perimeter.

Attachments are **images only** (`image/jpeg`, `image/png`, `image/webp`); the
PDF/text document upload flow is **deferred** (not implemented). There is **no
upfront classification** (no food/workout/medical category picker, no
`categorySource` "declare before upload" machinery) and **no upfront consent gate**
— an image uploads freely and is sent to the LLM as context, and the multimodal LLM
recognizes what it is.

> **Temporary, intentional safety relaxation (recorded so code↔doc don't drift):**
> image content — including a photo of a medical document — now reaches the LLM
> (OpenAI) **before any consent**. This consciously removes the previous
> "medical content only when `consentState === 'granted'`" code floor, **for now**.
> The pre-upload medical/MIME consent gate and the `needs_consent` upload disposition
> are gone (see "Removed Legacy Paths"). Floors that still hold: the context-budget
> `allowDocuments=false` floor (about DB `health_documents` slices, **not** the
> uploaded image) stays, there is **no** auto-persist or parsing of `health_documents`
> from an attachment, and legacy DB columns for category/recognition/status remain
> readable but are not used for runtime branching.

### `ChatTurnAttachmentStageService`

File: `apps/api/src/modules/chat-attachments/chat-turn-attachment-stage.service.ts`

Runs the **plumbing stages only**:

- `validate_refs`: checks ownership and send eligibility.
- `link_to_message`: links attachments to the chat message and thread.
- `apply_upload_disposition`: applies a **trivial generic retention disposition** —
  it resolves the configured retention policy for the attachment's category and
  passes the image through unchanged otherwise. In practice this lookup is
  effectively constant: uploads are always created with category `unclassified`
  (no per-category runtime branching occurs today). There is **no consent gate,
  no medical purge, and no category reclassification** at this stage.

The `classify`, `recognize`, and `prepare_attachment_context` stages, the removed
`prepare_proposal_candidates` stage, and the removed pre-upload classification /
consent gate **must not be reintroduced**.

### `ChatAttachmentsService`

File: `apps/api/src/modules/chat-attachments/chat-attachments.service.ts`

Owns chat attachment upload, ownership checks, storage reads, storage purge,
linking, and status transitions. It keeps attachments as chat/upload records,
**not** durable health documents. The consent column is a passive/null field —
no consent-grant method exists today; consent handling is deferred until the
medical special-save flow lands.

### Attachment Policy Helpers

File: `apps/api/src/modules/chat-attachments/attachment-behavior-policy.helpers.ts`

Resolves retention policy from `attachments.json` (`resolveAttachmentRetentionPolicyFromBehavior`).
The former recognition/meal-context/capability-hint helpers are removed.

### What the pipeline receives

`ChatService` passes the raw attachment refs + minimal metadata (category, MIME,
storage ref, and per-attachment `consentState` from `resolveConsentState`) into
the orchestrator. `consentState` is a passive back-compat field carried on the
`AttachmentTurnContextItem`; it is not used for any runtime gate today and is
**not passed to the router**. The router receives attachment **presence + category
only** — `RouterAttachmentHint` carries `category` and nothing else.
An attachment goes to **all** router-selected domains — there is no per-domain
category-relevance filter. The selected domain LLMs receive the bounded image
content as context and produce typed proposals (nutrition calories, workout
adjustments, etc.). No `contextSummaries` / recognition envelope is produced, and
there is no consent-gated medical-save proposal variant (that is deferred — see
below).

### Deferred follow-up (LATER, not implemented)

These are intentionally **not** built yet:

- PDF/text document upload + a document-content path to the LLM.
- The LLM-recognized medical **special save**: a domain recognition signal → a
  consent-gated save **proposal** → on accept, with consent, persist a
  `health_document`. Until that lands, no attachment path may create or parse a
  `health_document`.

## Stage 2: Code-Owned Pre-AI Gates

These gates intentionally bypass the LLM pipeline. They are safety or
deterministic product boundaries, not duplicate AI routers.

### Crisis Boundary

Functions:

- `evaluateWellbeingCrisisFromText`
- `formatWellbeingCrisisSupportReply`

Location: `@health/types`, used by `ChatService`.

When crisis support should be shown, the system creates a deterministic support
reply and no proposals — before any LLM runs.

### Proposal Explainer

Files:

- `apps/api/src/modules/chat/proposal-explainer.service.ts`
- `apps/api/src/modules/ai/proposal-explainer-matcher.service.ts`

Handles read-only questions about existing proposals. If no proposal is
available, it returns deterministic no-proposal copy without invoking any coach
LLM. Explainer turns with a proposal still remain read-only.

### Direct Chat Paths

Files:

- `apps/api/src/modules/chat/direct-chat-path.service.ts`
- `apps/api/src/modules/chat/direct-chat-path-formatters.ts`
- `apps/api/src/modules/ai/direct-chat-path-matcher.service.ts`

Handles explicit deterministic actions such as reading today's summary or
marking today's workout done. Direct paths resolve only when the message is
clearly understood **and there is no attachment**; otherwise the turn falls
through to the router. Plan changes remain proposal-only.

### Free-Tier AI Message Quota Gate

File: `apps/api/src/modules/billing/entitlements.service.ts`, called by `ChatService`.

Placed **after** the crisis, proposal-explainer, and direct-path early returns so that
non-LLM turns never consume quota. `entitlementsService.assertAiMessageAllowed` checks
the user's daily AI message count; on `AiMessageQuotaExceededError` it persists a canned
boundary reply and returns before `AiService` is called — zero LLM calls. Pro-tier users
pass through without a quota check.

## Stage 3: AI Facade And Orchestrator

### `AiService`

File: `apps/api/src/modules/ai/ai.service.ts`

Thin facade over `AgentOrchestratorService`. It preserves the API boundary
between chat code and AI orchestration.

### `AgentOrchestratorService`

File: `apps/api/src/modules/ai/agent-orchestrator.service.ts`

Central orchestrator for the unified LLM pipeline.

Responsibilities (`orchestrateCoachTurn`):

- Run deterministic message normalization via `MessagePreprocessorService`.
- Run `RouterLlmService` for eligible turns to select relevant domains (proposal-revision
  and proposal-explainer turns skip the router).
- Ask `SystemPlannerService` for the deterministic `DomainFanoutPlan`.
- **All LLM turns** route through `runFanOutTurn`: build one bounded coaching-context
  packet per selected domain through `CoachingContextService`, run the **selected domain
  LLMs in parallel** through `DomainLlmExecutorService`, synthesize via
  `DecisionMakerExecutorService`, and resolve through `ActionResolverService`.
  Proposal-revision and proposal-explainer turns skip the router but still execute the
  full fan-out path (router is not a prerequisite for `runFanOutTurn`).
- **Deterministic gate-miss** turns (executorMode deterministic) are handled inline by
  `buildDeterministicGateMissResult` — a rare safety-net for deterministic modes that
  somehow reach the orchestrator. The top-level `executorMode` is derived from the primary
  capability policy, `classifyDirectPathCandidate`, and the router's `directCommand.detected`
  signal (`turnDecisionDirectCommand → resolveResponseModeExecutorMode` returns
  `deterministic_write`). No additional LLM calls are made at this point; however, for
  eligible turns the router will have already run before `SystemPlannerService` determined
  the executor mode. The genuine zero-LLM path is the pre-AI gate in
  `ChatService` (crisis, direct-path, quota), which returns before `AiService` is called.
- Return structured AI output, parse errors, reply safety errors, the
  `consentRequired` flag, and agent metadata.

`RouterLlmService` is the only first-LLM routing stage for eligible turns. Proposal
revision and proposal explainer turns are the explicit non-router exceptions.

## Stage 4: Message Normalization

### `MessagePreprocessorService`

File: `apps/api/src/modules/ai/message-preprocessor.service.ts`

Builds the deterministic **message-context** object from the raw user message:

- original text
- normalized text
- detected language and basic signals
- attachment presence
- direct-path candidate hints

Pure helpers and schemas live in `packages/types`
(`packages/types/src/message-preprocessor.ts`).

### `DirectChatPathMatcherService`

File: `apps/api/src/modules/ai/direct-chat-path-matcher.service.ts`

Compiles direct-path patterns from `ai-behavior.json` and detects deterministic
read/write candidates.

## Stage 5: RouterLlm — First LLM

### `RouterLlmService` (replaces the removed `TurnDecisionService`)

File: `apps/api/src/modules/ai/router-llm.service.ts`

Builds the first-LLM routing request (`buildRequest`) and validates the response
(`route`). The router receives the message-context plus app context assembled from
the **merged domain YAML config + capability catalog** (`buildAvailableDomains`), and
selects which domain LLMs should run. It calls `provider.generateRouterDecision`.

The router's available-domain list is exactly the **3 `RouterDomain` values**:
`workout`, `nutrition`, and `health`. `medical.yml` folds into the `health` domain —
it is not a fourth router-selectable domain.

Inputs:

- normalized message-context (incl. detected language)
- attachment presence + **category only** (`RouterAttachmentHint.category`);
  `mimeType` and `consentState` are not routing signals and are never passed here
- recent messages
- available domains/capabilities from the merged domain config and
  `CapabilityRegistryService` (workout / nutrition / health only)
- safety guardrails

Output: `RouterDecisionOutput` (`packages/types/src/router-decision.ts`):

- `selectedDomains[]` (max 3) — each with `domain`, `confidence`, and per-domain
  `intentHints[]` / `toolHints[]` / `signalHints[]`
- `contextNeeds[]`
- `directCommand` signal
- `safetyFlags[]`
- `confidence`

Safety behavior (three-step validation pipeline):

1. `validateRouterDecisionOutputShape` — shape guard: rejects forbidden user-facing
   fields such as direct replies or proposals.
2. `routerDecisionOutputSchema.parse` — Zod parse applying schema defaults (e.g.
   empty `selectedDomains` when absent).
3. `clampRouterDecisionOutput` — clamps `selectedDomains` to known `RouterDomain`
   values, `toolHints` to `AgentToolName` values, and `safetyFlags` to
   `AgentSafetyFlag` values; caps `selectedDomains` at `MAX_ROUTER_SELECTED_DOMAINS`.
   `intentHints` pass through unclamped. Capability-catalog narrowing of
   tool/proposal allowlists happens downstream in `SystemPlannerService`, not here.

Falls back to a safe general decision if any step fails.

## Stage 6: SystemPlanner — Fan-out Planner

### `SystemPlannerService`

File: `apps/api/src/modules/ai/system-planner.service.ts`

`SystemPlannerService` is the deterministic control layer after the router. The
LLM suggests; the planner clamps and finalizes.

**Primary-route resolution order** (`resolveRoute`):

1. Proposal revision route from the original proposal intent.
2. Confident router selection, feeding `CapabilityPlanResult` fields.
3. Proposal explainer route.
4. Safe fallback route, usually `general`.

**Fan-out construction** (`buildFanoutMetadata` / `buildRouterFanout`) — a separate,
independent step that runs after `resolveRoute`:

- Re-checks router confidence (`isConfidentRouterRoute`): no proposal-revision context,
  router source is `"llm"`, confidence is at or above the threshold, and at least one
  domain was selected.
- When `isConfidentRouterRoute` is true, calls `buildRouterFanout`, which maps each
  router-selected domain to a `DomainFanoutEntry` with independently derived allowlists
  and context budget (capped at `MAX_ROUTER_SELECTED_DOMAINS = 3`).
- When `isConfidentRouterRoute` is false (non-router routes, low-confidence, or all
  domains fail capability mapping), falls back to `buildSingleDomainFanout` using the
  primary capability as the sole domain entry.

Planner output (`DomainFanoutPlan`):

- `selectedDomains[]` — each with `{ domain, capabilityId, allowedTools,
  allowedProposalIntents, contextBudget, executorMode }`, clamped to the capability
  catalog (the catalog is the floor; YAML/router can only narrow it).
- decision-maker plan (action-variant catalog + budget)
- per-domain context slice plans and compression requirements

Selected domains are capped at **3** (code constant). The planner never widens
tool/proposal allowlists beyond the catalog.

### `CapabilityRegistryService`

File: `apps/api/src/modules/ai/capability-registry.service.ts`

Loads the capability catalog from code defaults plus optional repo-backed config
overrides. It is the source of truth for capability ids, allowed tools, allowed
proposal intents, prompt instructions, presentation metadata, and the
**domain → capabilities** mapping. The per-domain YAML config can only narrow these
allowlists, never widen them.

### `CapabilityIntentDefinitionAdapter`

File: `apps/api/src/modules/ai/capability-intent-definition.adapter.ts`

Converts capability config into intent metadata used by domain prompts and
executor allowlists.

### `ResponseModePolicyService`

File: `apps/api/src/modules/ai/response-mode-policy.service.ts`

Resolves expected response mode from capability policy and route metadata.

### `ContextBudgetPolicyService`

File: `apps/api/src/modules/coaching-context/context-budget-policy.service.ts`

Builds context budget and slice policy **per selected domain**. Code floors deny
documents and sensitive health context by default, even if config tries to relax
them, and the floor is re-applied to each per-domain packet.

## Stage 7: Coaching Context

### `CoachingContextService`

File: `apps/api/src/modules/coaching-context/coaching-context.service.ts`

Builds one bounded `AgentContextPacket` and provider prompt context **per selected
domain** from structured user state. It is the gateway between domain state and the
domain prompts.

Responsibilities:

- load user snapshot
- assemble requested context slices for each selected domain
- apply safety constraints (per-packet budget floor re-applied)
- record source refs and missing context notes
- expose read-only context tools used by the domain agent loops

### `agent-prompt-context`

File: `apps/api/src/modules/coaching-context/agent-prompt-context.ts`

Maps `AgentContextPacket` into bounded prompt context and strips broad legacy
context keys.

### `ContextCompressionService`

File: `apps/api/src/modules/coaching-context/context-compression.service.ts`

Compresses large context packets when the planner requires compression.

`ContextCompressionService` injects an optional `ContextCompressionProvider` via the
`CONTEXT_COMPRESSION_PROVIDER` DI token (declared in
`context-compression.tokens.ts`). The provider is wired in
`CoachingContextModule` with a `useFactory` that returns an
`OpenAiContextCompressionProvider` only when `AI_COACH_PROVIDER === 'openai'` and
`OPENAI_API_KEY` is present; otherwise it returns `undefined`. The service injects
it `@Optional()` and degrades to `summary: null` in either of two cases (S2):

- No provider is configured (missing key or non-OpenAI provider).
- The provider throws or returns output that fails `contextCompressionSummarySchema`
  (the schema is strict-parsed; any parse failure degrades to `null`).

**S5 safety floors** are re-applied inside `OpenAiContextCompressionProvider.compress`
before any data reaches OpenAI:

- Document source refs (domain `"document"`, `"document_summary"`, `"rag"`) are
  stripped from `packet.sourceRefs` when `budget.allowDocuments` is `false`.
- The `wellbeingSummary` and `recoveryContext` slice fields — treated as sensitive
  health context — are only read when `budget.allowSensitiveHealthContext` is `true`
  (mirroring the `applyBudgetToBuiltSlice` guard). `documentContext` and `ragResults`
  are intentionally never read.

`ContextCompressionProvider` is a **distinct interface** from `CoachAiProvider` — it
has a single `compress` method and is never part of the three-method fan-out surface.
See the "Coach AI Provider Surface" section for the `CoachAiProvider` boundary.

### `ContextExpansionPolicyService`

File: `apps/api/src/modules/coaching-context/context-expansion-policy.service.ts`

Creates expansion-policy metadata for domain executor modes that may request
more context through tools.

## Stage 8: Parallel Domain LLMs

### `DomainLlmExecutorService`

File: `apps/api/src/modules/ai/domain-llm-executor.service.ts`

Runs **one** domain LLM bounded loop (`runDomainLoop`). The orchestrator invokes the
selected domain executors concurrently (`Promise.all`, in
`AgentOrchestratorService.runDomainsConcurrently`). The three initial domains are:

- **workout** (`workoutCoach`)
- **nutrition**
- **health** (fed by `medical.yml` + `health.yml`)

Per domain executor:

- run a bounded tool loop capped at a fixed 3 iterations (`DOMAIN_MAX_LOOP_ITERATIONS`
  module constant; `domainEntry.executorMode` is carried on the fan-out entry but is not
  yet used to vary the loop policy)
- enforce the per-domain tool allowlist via `AgentToolRegistryService`
- run read-only context tools only
- validate reply safety
- emit a typed `domain_answer`

Failure behavior: a domain that errors, exhausts its loop, or times out degrades
to a **safe empty output** and never blocks the other domains or the turn. Per-domain
timeouts bound latency.

Output shape (`packages/types/src/domain-llm-step.ts`) — union of
`tool_request` or `domain_answer`, where
`domain_answer = { domain, summary, candidateProposals[], domainSignals[],
workoutCalorieEstimate?, workoutCaloriePerHourRate? }`. Only the **workout** domain may
populate `workoutCalorieEstimate` or `workoutCaloriePerHourRate` — `domainLlmStepOutputSchema`'s
`superRefine` (the discriminated union wrapping `domainAnswerSchema`,
`packages/types/src/domain-llm-step.ts:178-200`) rejects both fields for any
other domain; this invariant is enforced at the provider boundary via
`domainLlmStepOutputSchema.parse`. `workoutCaloriePerHourRate` is the
**trusted kcal/hour burn rate** used downstream to recompute editable display-contract
totals; the decision-maker and non-workout domains can never source it.

The workout domain LLM may also emit a `displayContract` on a candidate workout/activity
proposal — a **non-authoritative render hint** (see Stage 10 / `display-contract.ts`) for
an editable card with a duration slider and a `rate_per_hour` derived total. The contract
is render metadata only; it is stripped before any plan revision is written and its total
is recomputed server-side on accept.

### `AgentToolRegistryService`

File: `apps/api/src/modules/ai/agent-tool-registry.service.ts`

Executes tool requests from a domain loop after executor allowlist checks.

Tools (read-only context only):

- `getUserContextSlice`
- `getDocumentContext`
- `getWeeklyProgressContext`

A tool request not allowed by the active domain capability is rejected.

## Stage 9: Decision-Maker LLM

### `DecisionMakerExecutorService`

File: `apps/api/src/modules/ai/decision-maker-executor.service.ts`

Receives the selected domains' outputs plus the **action-variant catalog**
(built by `ActionVariantCatalogService`,
`apps/api/src/modules/ai/action-variant-catalog.service.ts`) and produces the final
decision in a single LLM call (`execute` → `provider.generateFinalDecision`). It
always resolves, degrading to a safe fallback on any provider error.

Request (`packages/types/src/final-decision.ts`):
`{ userMessage, domainOutputs[], actionVariantCatalog, safetyFlags[], safetyConstraints[] }`.

Output: `{ reply, selectedAction, proposals[], consentRequired }`.

The decision-maker emits **typed proposals only**; it never writes domain state and
never fabricates a workout calorie estimate or the trusted `workoutCaloriePerHourRate`
(those may only come from the workout domain LLM).

## Stage 10: Action Resolver

### `ActionResolverService`

File: `apps/api/src/modules/ai/action-resolver.service.ts`

Filters the decision-maker's proposals to the **union allowlist** of the selected
domains' `allowedProposalIntents`, then forwards the result. The proposal intents
that may pass through are:

- workout-plan intents (`create_workout_plan`, `adapt_workout_plan`,
  `adapt_workout_plan_from_progress`)
- `log_workout_activity` — a LOG (revision-free) intent that records a one-off
  performed activity and, on accept, creates an `ad_hoc` `workout_sessions` row
  rather than a plan revision (see Stage 11 / the domain-model doc)
- nutrition intents (incl. `log_nutrition_incident`)
- `capture_wellbeing_checkin`
- `plain_reply`

Branching inside `resolveFinalDecisionOutput` is structural, not per-kind:
`plain_reply` is handled separately (no scrub/stamp needed), and the
`scrubAndStampWorkoutCalorieEstimate` step applies uniformly to every workout-plan
and `log_workout_activity` proposal regardless of which specific workout intent it is.
Non-workout proposals pass through without calorie scrubbing.

It does **not** mutate domain state and does **not** persist proposals.

**Trusted calorie-rate stamping (`scrubAndStampWorkoutCalorieEstimate`).** For every
workout-plan and `log_workout_activity` proposal, ActionResolver **always scrubs** the
calorie fields from the decision-maker output and re-stamps only from values passed by the
orchestrator (`AgentOrchestratorService`, sourced exclusively from the workout
`domain_answer`):

- `workoutCalorieEstimate` → `estimatedSessionCalorieBurn` (plan) /
  `estimatedCalories` (log activity), with provenance `workout_llm`.
- `workoutCaloriePerHourRate` → the **trusted** `caloriePerHourRate` (plan) /
  `ratePerHour` (log activity), used later to recompute editable-card totals.

Branching mirrors the payload shape: flat (`create_workout_plan` / `adapt_workout_plan`),
nested `.plan` (`adapt_workout_plan_from_progress`), and the top-level
`log_workout_activity` payload. If neither trusted value is available, the
`log_workout_activity` calorie fields are left unset — its `.refine()` then rejects the
proposal downstream (fail-closed). The `displayContract` itself is carried through as a
non-authoritative render hint; the decision-maker can never fabricate the trusted rate.

## Stage 11: Proposal Validation And Persistence

### Reply And Proposal Safety

File: `packages/ai/src/safety.ts`

Functions:

- `validateReplySafety`
- `validateProposalSafety`

### `ProposalValidationService`

File: `apps/api/src/modules/proposals/proposal-validation.service.ts`

Validates proposal schema, ownership, provenance, attachment refs, recovery-aware
workout changes (incl. calorie-estimate bounds), habits, wellbeing check-ins,
recipe recommendations, nutrition incident image refs, and Today checklist
references.

### `ChatRepository.createProposal`

File: `apps/api/src/modules/chat/chat.repository.ts`

Persists raw proposals with validation status and validation errors. Nothing is
applied to structured state until the user accepts a valid proposal through the
proposal apply flow. Accepted workout/nutrition changes create new revisions; the
`log_workout_activity` LOG intent instead creates an `ad_hoc` `workout_sessions` row and
**never** a revision (`ProposalApplyService` → `WorkoutsService.applyLogWorkoutActivityProposal`).

### Accept-time display-contract recompute seam

File: `apps/api/src/modules/proposals/proposals.service.ts`
(`ProposalsService.decideProposal`)

When a proposal carrying a `displayContract` is accepted, the calorie total is a
**safety-critical recompute**, never the client's submitted total:

- The **stored** proposal supplies the `displayContract` STRUCTURE and the trusted
  `caloriePerHourRate` / `ratePerHour` — the client can substitute neither a different
  contract nor a higher rate.
- Only the client-submitted **editable** field values are applied
  (`extractClientEditableFieldValues`), each clamped to the stored field's own `min`/`max`
  (`clampFieldValue`). The rate input field is always overwritten with the trusted stored
  rate.
- The primary-total derived value is recomputed via `computeDerivedValues`, `Math.round`-ed,
  and clamped to `[0, 20000]`; `calorieEstimateProvenance` is forced to `workout_llm`.
- Branching matches the payload shape:
  `recomputeWorkoutProposalCaloriesFromDisplayContract` for flat
  (`create_workout_plan` / `adapt_workout_plan`) and nested
  (`adapt_workout_plan_from_progress` `.plan`) workout proposals, and
  `recomputeLogWorkoutActivityCaloriesFromDisplayContract` for `log_workout_activity`.

The `displayContract` and trusted rate are dropped (`stripWorkoutPlanProposalExtras`)
before a plan revision is written; they never persist on revisions.

## Coach AI Provider Surface

### `CoachProviderFactory`

File: `apps/api/src/modules/ai/coach-provider.factory.ts`

Selects provider mode from config/env.

### `OpenAiCoachProvider`

File: `apps/api/src/modules/ai/openai-coach-provider.ts`

OpenAI-backed provider implementation. The `CoachAiProvider` surface
(`packages/ai/src/coach-ai-provider.ts` defines the interface). The three fan-out
methods drive the live multi-domain path:

- `generateRouterDecision` — the first-LLM domain selection
- `generateDomainStep` — one domain loop step (`domain: 'workout' | 'nutrition' |
  'health'`); resolves image attachments to multimodal content when present
- `generateFinalDecision` — the decision-maker synthesis

The `CoachAiProvider` surface is exactly these three fan-out methods — there are no
other provider methods. Proposal-revision, proposal-explainer, and low-confidence
turns all route through `runFanOutTurn` in `AgentOrchestratorService`; the router
is simply skipped for revision/explainer turns, but the same
`generateRouterDecision` / `generateDomainStep` / `generateFinalDecision` surface
drives every LLM turn.

Note: context compression uses a **distinct provider/interface** (`ContextCompressionProvider`,
injected via `CONTEXT_COMPRESSION_PROVIDER`) that is separate from this `CoachAiProvider`
surface. `OpenAiContextCompressionProvider` implements `ContextCompressionProvider` and
is not part of the three fan-out methods described here. See Stage 7 (`ContextCompressionService`)
for details.

OpenAI prompt templates are keyed `router`, `domain_workout`, `domain_nutrition`,
`domain_health`, and `decision`, rendered through `CompiledPromptTemplates` and the
shared JSON-completion + shape-validation helpers.

### Coach AI Provider Interface

File: `packages/ai/src/coach-ai-provider.ts`

Defines the `CoachAiProvider` interface. The three fan-out methods are the complete
provider surface:

- `generateRouterDecision` — the first-LLM domain selection
- `generateDomainStep` — one domain loop step
- `generateFinalDecision` — the decision-maker synthesis

`generateAgentLoopStep` and `generateCoachResponse` no longer exist (removed with
`ResponseModeExecutorService` in C6). The stub provider has been deleted (C2 removal
program); tests use the shared mock from `@health/ai/testing`
(`createCoachAiProviderMock`) and the real `OpenAiCoachProvider` is the mandatory
production path.

## Domain Config (per-domain YAML)

AI/chat behavior is files-first and repo-backed. The domain-specific routing,
intents, tools, signals, and prompts live in **per-domain YAML files**:

- `packages/ai-behavior/config/domains/workout.yml`
- `packages/ai-behavior/config/domains/nutrition.yml`
- `packages/ai-behavior/config/domains/medical.yml`
- `packages/ai-behavior/config/domains/health.yml`

### Domain config schema

File: `packages/types/src/domain-config.ts`

Each domain config (`.strict()`) holds:

```
{ domain, llmId,
  intents: [{ id, description, mapsToCapabilityId }],
  tools:   [toolName],
  signals: [{ id, patterns? }],
  prompts: [{ key, body, placeholders }],
  safetyNotes: [] }
```

### Domain config loader

File: `packages/ai-behavior/src/domain-config-loader.ts`

One loader reads every `domains/*.yml`, Zod-parses each, and merges them into a
`DomainConfigBundle`. Loading is **fail-closed per file**: any read/parse error
falls back to that domain's built-in defaults and records warnings; a broken file is
never partially merged. The YAML parser dependency is `yaml`
(`packages/ai-behavior/package.json`).

### Catalog intersection is the floor

Each `intents[].mapsToCapabilityId` must resolve to a real `CatalogIntentId`. A
domain LLM's usable tools/proposals are the **intersection** of the YAML-declared
set and the capability-catalog allowlist (`AGENT_CAPABILITY_CONFIGS`). YAML can only
**narrow**; the loader drops and warns on anything outside the catalog. Domain YAML
carries prompts/signals/intents only — never context-budget, consent, crisis, or
validation rules.

## Config Sources

### `AiBehaviorConfigService`

File: `apps/api/src/modules/ai/ai-behavior-config.service.ts`

Loads repo-backed behavior config and exposes typed accessors, including
`getDomainConfigs()` backed by the domain YAML loader.

Config files:

- `packages/ai-behavior/config/ai-behavior.json` — chat/LLM behavior (direct-path
  patterns, prompts, proposal-revision routing, context budgets).
- `packages/ai-behavior/config/attachments.json` — attachment consent, categories,
  retention, and plumbing stage order. (Recognition/classification config removed.)
- `packages/ai-behavior/config/domains/*.yml` — per-domain intents/tools/signals/prompts.

Loaders:

- `packages/ai-behavior/src/loader.ts`
- `packages/ai-behavior/src/attachment-loader.ts`
- `packages/ai-behavior/src/domain-config-loader.ts`

Schemas and defaults:

- `packages/types/src/ai-behavior-config.ts`
- `packages/types/src/attachment-behavior-config.ts`
- `packages/types/src/domain-config.ts`

## Safety Boundaries

- Crisis support is code-owned and bypasses all LLMs.
- Attachments are **images only and context-only**: no upfront classification and
  **no upfront consent gate**. **Temporary, intentional relaxation (for now):** image
  content — including a photo of a medical document — reaches the LLM (OpenAI)
  **before any consent**, consciously removing the previous "medical content only
  when consent is granted" code floor. Floors that still hold: there is **no**
  auto-persist or parsing of a `health_document` from an attachment, and the
  context-budget `allowDocuments=false` floor (DB `health_documents` slices, not the
  uploaded image) is unchanged.
- Context budgets deny document and sensitive health context by default, re-applied
  to every per-domain packet; config cannot relax these floors.
- The router output is clamped to known domains, capabilities, and tools, and may
  not emit replies or proposals.
- SystemPlanner owns final route, budget, executor modes, and allowlists, and caps
  selected domains at 3. YAML/router can only narrow catalog allowlists.
- Domain LLMs run only-selected and in parallel; each enforces its own tool
  allowlist and reply safety, and a failed domain degrades to a safe empty output.
- The decision-maker emits typed proposals only; only the workout domain LLM may set
  a workout calorie estimate **or the trusted `workoutCaloriePerHourRate`**.
- A `displayContract` is a **non-authoritative render hint**: on accept the backend
  recomputes the calorie total from the STORED contract structure and STORED trusted rate,
  applies only clamped editable field values, and discards the client total. The contract
  and trusted rate are stripped before any revision is written.
- `ActionResolver` filters proposal intents to the active capability allowlist, scrubs
  any decision-maker / non-workout calorie fields, and re-stamps the estimate and trusted
  rate only from the workout `domain_answer` (fail-closed when absent).
- `ChatService` validates every proposal before persistence.
- The AI layer never writes directly to domain tables; accepted workout/nutrition
  changes create new revisions.

## Removed Legacy Paths

The following files/exports were deleted and are no longer active runtime paths:

- `ResponseModeExecutorService` (+ spec) and `ActionResolverService.resolveProposalOnlyOutput`
  — the single bounded-loop executor path. All turn types (proposal-revision,
  proposal-explainer, low-confidence fallback, deterministic gate-miss) now route
  exclusively through `runFanOutTurn`. The deterministic gate-miss is handled inline
  in `AgentOrchestratorService.buildDeterministicGateMissResult` (no additional LLM
  calls after that point, though the router may have already run for eligible turns).
- `provider.generateAgentLoopStep` and `provider.generateCoachResponse` — the
  provider methods that backed the single-executor path. The `CoachAiProvider` surface
  is now `generateRouterDecision` / `generateDomainStep` / `generateFinalDecision` only.
- `packages/ai/src/agent-loop-output.ts` (`parseAgentLoopOutput`,
  `coerceAgentLoopFinalAnswer`, `ParsedAgentLoopOutput`) — loop output parsing helpers
  used exclusively by the deleted single-executor path.
- `UNIFIED_TURN_DECISION_ENABLED` feature flag.
- `intent-router.ts`, `provider.generateIntentRoute`, the `llm_router` route fallback.
- `TurnDecisionService` (+ spec), `provider.generateTurnDecision`, the
  message-understanding-as-turn-decision shim
  (`mapTurnDecisionOutputFromMessageUnderstanding`), and `MessageUnderstandingService`
  (+ spec). The router-decision pipeline (`RouterLlmService` +
  `provider.generateRouterDecision`) is the only first-LLM routing stage.
- The "no LLM fan-out / no verdict LLM" model — replaced by the parallel domain LLMs
  + decision-maker described here.
- `attachment_family` planner bypass.
- The attachment recognition/classification machinery: `ChatAttachmentClassifierService`
  and the classification providers/factory, `ChatAttachmentRecognitionService`, the
  `food-photo` and `workout` attachment recognizers, the medical context-only
  recognition builder (`buildMedicalDocumentContextOnlyRecognition`), the
  `attachment-recognition-context` helpers, and the
  `classify`/`recognize`/`prepare_attachment_context` turn stages (the stage enum is now
  `validate_refs`/`link_to_message`/`apply_upload_disposition` only). The type schema
  (`packages/types/src/chat-attachment-classification.ts`) and the upload-disposition
  helper (`packages/types/src/chat-attachment-upload-disposition.ts`) are also removed —
  no live consumer remained after the service-layer removal.
- Nutrition food-photo analysis providers (`food-photo-analysis.service.ts`,
  `food-photo-analysis.factory.ts`, `openai-food-photo-analysis.provider.ts`) — the
  nutrition domain LLM analyzes food photos directly via `generateDomainStep`.
- `prepare_proposal_candidates`, attachment `proposalCandidates`, `preparedProposals`,
  `buildProposalCandidates`, `mergeAttachmentProposals`.
- automatic `health_documents` creation from chat attachment recognition.
- The **pre-upload classification + consent gate**: the food/workout/medical category
  picker, the `categorySource` "declare before upload" machinery
  (`isTrustedUserSelectedChatAttachmentUpload`, `resolveProvisionalUploadCategorySource`,
  `resolveCreateAttachmentCategorySource`), the upload-time medical consent gate
  (`isMedicalAttachmentByDeclarationOrMime`), and the `needs_consent` upload
  disposition. Uploads are now image-only; an image is sent to the LLM as context with
  no upfront classification or consent.
- The per-domain attachment **category-relevance filter** (an attachment now reaches
  all router-selected domains) and the consent-gated `medical_document_save`
  action-variant (dropped from `ActionVariantCatalogService`). The
  LLM-recognized medical special save is **deferred**, not removed permanently.

Some historical enum values and parse compatibility remain only so old stored
metadata can still be read safely:

- `agentRoutingMethodSchema` keeps the deprecated `llm_router`, `message_understanding`,
  and `attachment_family` values alongside `unified_turn_decision`. Note that
  `unified_turn_decision` is **both** the active production `routingMethod` emitted on
  every current router turn **and** a readable historical value in persisted metadata —
  it is not a back-compat shim only; the three deprecated values are the shims.
- The `recognition`, `categorySource`, and `status` columns on `chat_attachment` rows
  remain **readable** for historically persisted data but are not used for runtime
  branching. The `category` column is also readable and is actively read at runtime
  to resolve the attachment retention policy
  (`resolveAttachmentRetentionPolicyFromBehavior`); however, since uploads are always
  created as `"unclassified"`, the retention lookup is effectively constant and no
  real category-driven branching occurs.

These compatibility shims are removable only behind a stated DB migration that backfills
or drops the historical rows; do not delete them otherwise.
