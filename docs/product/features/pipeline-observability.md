# Pipeline Observability (stdout token/cost + per-turn diagnostics surface)

Status: **Planning**.

Related: the code-exact pipeline map is
[`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md); the one-message
decision tree is [`../../architecture/chat-message-flow.md`](../../architecture/chat-message-flow.md);
the umbrella chat-pipeline design is [`ideal-chat-pipeline.md`](./ideal-chat-pipeline.md).

## Problem (real owner case)

During the first live OpenAI runs, when a domain call failed the per-turn detail lived
primarily in `chat_messages.metadata` (DB) — diagnosing a failure meant opening `psql`.

The actual current state is partially better than "nothing on stdout, all in the DB": the
orchestrator **already emits** structured per-stage logs via the NestJS `Logger` in
`apps/api/src/modules/ai/agent-orchestrator.service.ts`:

- `stage: "router_done"` — source, confidence, selected-domain count + per-domain confidence,
  validation error count (`agent-orchestrator.service.ts:369`).
- `stage: "domain_done"` — per domain: `degraded`, degraded-reason count, candidate count,
  loop iterations, tools invoked, has-calorie-estimate flags (`:384`).
- `stage: "decision_done"` — degraded, degraded-reason count, selected action, selected-id
  count, `consentRequired`, low-confidence flag (`:452`).
- `stage: "resolution_done"` — resolved/dropped/final proposal counts, `replyBlocked` (`:537`).
- `event: "ai.turn_summary"` — a per-turn telemetry line with `totalLatencyMs`,
  `routerLatencyMs`, `contextLatencyMs`, `decisionLatencyMs`, per-domain `latencyMs`, router
  confidence/source, tools-per-domain, degraded domains, proposal count (`:596`).

So the gaps are narrower than "no events on stdout." They are:

- **No token/cost on stdout.** Per-stage token usage is captured (`result.usage`,
  `routerResult.usage`, `decisionResult.usage` — `agent-orchestrator.service.ts:937`, `:952`,
  `:962`) but is folded into persisted metadata, **not** the stdout stage logs or the
  `ai.turn_summary` line. The `domainLatencies` in `turn_summary` carry latency but not tokens.
- **No per-proposal validation event.** There is no `proposal.validation` stdout line; proposal
  validation (intent/status/error count) in `ProposalValidationService` does not log to stdout
  (the service has no `Logger`).
- **No daily aggregated token/cost line.** Per-stage usage exists per turn but nothing rolls it
  up into a daily cost summary.
- **No first-class developer diagnostics surface.** Per-turn diagnostics are reconstructable
  only from `chat_messages.metadata` via `psql`; there is no dev endpoint or documented snippet.

## Goals

1. Make a failing domain call **diagnosable from terminal output alone** — including token/cost
   per stage and a proposal-validation outcome line.
2. Give developers a documented, ownership-scoped way to inspect one turn's diagnostics without
   raw SQL.
3. Surface a daily aggregated token/cost line from the usage already captured per stage.

## User Stories

- As a developer watching the API log, when a domain LLM times out I see the degraded domain,
  its reason, latency, and token spend on the failed call without opening `psql`.
- As a developer, I can pull one turn's full diagnostics by message id (dev-only,
  ownership-scoped) instead of reconstructing it from metadata JSON.
- As the owner, I can see a daily token/cost line per stage to spot a runaway cost regression.

## In Scope

- **Token/cost on the existing stdout stage events.** Extend the per-stage logs and/or the
  `ai.turn_summary` line so each stage carries `promptTokens` / `completionTokens` /
  `totalTokens` (and a derived cost where a price table exists) alongside the latency already
  present. Reuse the `result.usage` values already threaded into metadata
  (`agent-orchestrator.service.ts:937/952/962`); do not add a second usage source.
- **A `proposal.validation` stdout event** per proposal: `intent`, `status`
  (accepted/rejected/superseded or validation pass/fail), `errorCount`. Emitted from the
  validation path; counts and enums only.
- **A daily aggregated token/cost log line** derived from the per-stage usage metadata
  (per-stage totals + grand total for the day).
- **A developer turn-diagnostics surface.** Either a dev-only, ownership-scoped
  `GET /chat/turns/:messageId/diagnostics` (note: the chat controller base is
  `chat/threads` — `apps/api/src/modules/chat/chat.controller.ts:22` — so this is a new route),
  OR documented `psql` snippets in
  [`../../architecture/chat-message-flow.md`](../../architecture/chat-message-flow.md). **The
  endpoint-vs-docs decision is deferred to implementation.**

## Out of Scope (Non-Goals)

- A metrics backend / dashboard (Prometheus, OTel exporters) — stdout + an optional dev endpoint
  only for now.
- Surfacing diagnostics to end users — this is developer/owner tooling.
- Changing pipeline behavior — observability only; no new gates, routes (beyond the optional
  diagnostics read), or proposal paths.
- Mobile.

## Privacy Floor (non-negotiable)

Per [`.claude/rules/security.md`](../../../.claude/rules/security.md) and the existing telemetry
comment (`agent-orchestrator.service.ts:592-594`, "no user message text, no reply text, no
health data"):

- **No user message content, reply text, health data, document text, or extracted attachment
  text** in any log line or diagnostics response. Counts, enums, ids, durations, and token
  numbers only.
- The dev diagnostics endpoint (if built) must be ownership-scoped and dev-gated, and must not
  return any free-text field that the telemetry floor already denies.

## Acceptance Criteria (testable)

1. A degraded/timed-out domain call is fully diagnosable from terminal output alone: the stdout
   shows the degraded domain, its reason, latency, **and** token spend for that turn — no `psql`
   required.
2. Each LLM stage's stdout line (or the `ai.turn_summary` line) carries prompt/completion/total
   tokens sourced from the existing `result.usage`, with no duplicate usage accounting.
3. A `proposal.validation` stdout event is emitted per proposal with `intent`, `status`, and
   `errorCount`, and contains no user/health content.
4. A daily aggregated token/cost line is emitted, summing per-stage usage for the day.
5. The developer turn-diagnostics surface (endpoint or documented snippet) returns/locates one
   turn's diagnostics by message id, ownership-scoped, with the privacy floor enforced.
6. A unit/log test asserts that no stage log or diagnostics payload contains user message text,
   reply text, or health/document/attachment text.

## Risks / Assumptions

- Cost derivation needs a price table per model; if absent, emit tokens only and defer cost.
- The dev endpoint adds a read route into the chat module — it must stay dev-gated so it never
  ships as a user-reachable surface.
- Daily aggregation needs a counter/store; pre-launch this can be an in-process or log-scrape
  rollup rather than a persisted table (decide at implementation).

## Initial Implementation Plan (for planner refinement)

- Orchestrator: add token fields to the per-stage logs / `ai.turn_summary` from `result.usage`.
- Proposals: add a `Logger` to the validation path; emit `proposal.validation` (intent/status/
  errorCount).
- Aggregation: daily token/cost rollup line from per-stage usage.
- Diagnostics surface: spike the dev-only `GET /chat/turns/:messageId/diagnostics` vs documented
  `psql` snippets in `chat-message-flow.md`; pick one.
- Tests: privacy-floor assertion over log payloads + diagnostics response; token-presence on
  stage logs; proposal.validation event shape.
