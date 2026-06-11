# Ideal Chat Pipeline — Tier Model & Deep Progress Review

Status: **Design (approved direction, not yet implemented)**.

This is the umbrella design for evolving the chat/LLM pipeline so the user can drive the
**whole app through chat** — from cheap deterministic commands ("что у меня сегодня",
"отметь тренировку выполненной") up to deep retrospective coaching ("проанализируй моё
состояние за последние полгода — как программа тренировок повлияла на восстановление").

It is a **target-state design doc**: it describes where the pipeline should go and the
implementation roadmap. The code-exact docs remain
[`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md) and
[`../../architecture/chat-message-flow.md`](../../architecture/chat-message-flow.md) —
they are updated only together with code (roadmap Phase 6). The Tier 2 detail spec is
[`deep-progress-review-context.md`](./deep-progress-review-context.md).

## Decisions locked by the product owner

1. **Adaptive lookback.** A review scales "from today to the entire history" — the
   horizon is driven by the request, not by a fixed 90/180-day cap. Cost is bounded by
   aggregation granularity and bucket-count caps, never by refusing the period.
2. **Sensitive data enters reviews as numeric aggregates only**, accompanied by
   **static, code-owned metric legends** (descriptions of what each number means). The
   `allowSensitiveHealthContext=false` / `allowDocuments=false` code floors are **not**
   relaxed.
3. **Design-doc first.** Implementation is planned separately, as the phased roadmap
   below.

## Current state — what exists vs. what's missing

A code audit (June 2026) showed the pipeline is further along than the original feature
brief assumed.

**Already exists (reuse, don't rebuild):**

- **Budget profiles.** `ContextBudgetPolicyService` has two profiles: `default`
  (3 slices, 20 raw items, 30d lookback, no compression) and `deep_review` (5 slices,
  50 raw items, **90d lookback**, `requiresCompression=true`, 2 expansion rounds).
  Selection triggers (`contextBudgets.profiles/triggers` in
  `packages/ai-behavior/config/ai-behavior.json`): monthly-review regex, multi-domain
  review, progress-review intent + extended lookback.
- **Compression is live.** `ContextCompressionService` +
  `OpenAiContextCompressionProvider` run on `deep_review` turns and emit
  `contextCompressionSummarySchema` (keyFindings, risks, focusAreas,
  `dataQuality: sufficient|partial`, `confidence`).
- **Capability `review_progress`** already allows the right proposal intents:
  `summarize_progress`, `adapt_workout_plan_from_progress`, `adjust_nutrition_plan`,
  `adapt_habit_plan` — no new proposal intents are needed for reviews.
- **Seven context slice purposes** (`user-context-slice.builder.ts`): `general_chat`
  (7d), `daily_checkin` (7d), `workout_adaptation` (14d), `nutrition_adaptation` (14d),
  `weekly_review` (7d, trends + adherence), `longevity_overview` (90d, all domains),
  `health_context` (30d).
- **Weekly aggregation** (`ProgressAggregateService`): adherence %, completion %, skip
  rate, single-week trends.
- **Honest-degradation machinery**: typed `turnError`, `lowConfidenceRoute` → one
  clarifying question, selection-by-id decision-maker, cache-friendly
  static-prefix/dynamic-suffix prompt templates.

**Critical gaps (the actual work):**

- **No aggregation beyond one week.** `getWeeklyProgressContext` and
  `getRecentAdherence` are hardcoded to 7-day windows; there are no monthly or
  multi-month rollups anywhere.
- **Lookback phrases aren't detected.** The `deep_review` triggers miss "полгода",
  "6 months", "half a year", "за год"; the preprocessor has no lookback-period or
  review-intent signal.
- **`RouterDecisionOutput.contextNeeds[]` is dead schema** — defined, parsed, consumed
  nowhere.
- **No sufficiency framing.** `DomainFanoutEntry` carries no time range or compression
  flag; prompts have no placeholder for data sufficiency or the analyzed period, so the
  decision-maker cannot honestly frame a partial-data review.
- **The sensitive-context floor blocks the feature's core data.** Wellbeing/recovery
  trends are the point of "how did training affect my recovery", but
  `allowSensitiveHealthContext=false` denies those slice fields. The fix must be
  structural (a schema that cannot carry private text), not a config relax.

## Target architecture — the tier model

Every user message resolves to one of three cost tiers. **Tier selection is always
deterministic** — pre-AI gates for Tier 0, `SystemPlannerService` +
`ContextBudgetPolicyService` for Tier 1 vs 2. The LLM only ever suggests; the planner
decides.

### Tier 0 — zero LLM (direct paths + quick-action chips)

Code-owned pre-AI gates resolve unambiguous read/write commands with deterministic
config-sourced replies and **zero LLM calls**. Today: `today_summary_read`,
`mark_today_workout_done`, `nutrition_plan_read`. Planned additions (roadmap Phase 5):

- `weekly_progress_read` — read-only readback of the existing weekly progress summary
  ("мой прогресс за неделю").
- `workout_plan_read` — read-only active workout plan, symmetric with
  `nutrition_plan_read`.

Each new kind costs ~50 lines across five touchpoints (`direct-chat-path.ts` enum,
default patterns, `ai-behavior.json` kinds/detectionOrder/replyTemplates, the
`direct-chat-path.service.ts` handler, a formatter) plus a `suggestedQuickActions`
chip entry. Invariants: analytic phrasing ("проанализируй мой прогресс…") **must** fail
the negative patterns and fall through to the fan-out; gates never dead-end; replies
read as system messages, never fake coach prose.

### Tier 1 — standard fan-out (unchanged)

1 router LLM (≤3 domains) → parallel domain LLMs → 1 decision-maker, under the
`default` budget. This is today's path and does not change.

### Tier 2 — deep retrospective review

The **same fan-out pipeline — no side channels**. What changes is what the
deterministic planner feeds it:

- a review-grade context budget (granularity + mandatory compression),
- long-range data entering as **numeric aggregates** via a new
  `progress_history_review` context slice,
- sufficiency framing threaded to the domain LLMs and the decision-maker.

```
user: "проанализируй последние полгода…"
  → preprocessor: requestedLookbackDays=180, review_request=true   (deterministic)
  → router: selects health + workout (+ nutrition)                 (LLM, advisory)
  → SystemPlanner: review budget profile, injects
      progress_history_review slice per selected domain            (deterministic floor)
  → ProgressHistoryAggregateService: weekly/monthly numeric buckets
  → ContextCompressionService: bounded review packet (mandatory)
  → parallel domain LLMs: interpret aggregates, propose adaptation candidates
  → decision-maker: synthesizes; states observed vs uncertain; names
      the analyzed period; offers ONE narrowing follow-up when data is partial
  → ActionResolver + ProposalValidation: unchanged (select-by-id, allowlists, revisions)
```

## Adaptive lookback (replaces a fixed long-window cap)

**Detection (deterministic floor).** The preprocessor gains:

- `requestedLookbackDays: number | null` — extracted from RU/EN phrases: "сегодня" → 1,
  "неделя / last week" → 7, "месяц" → 30, "квартал / quarter" → 90, "полгода / 6 months
  / half a year / шесть месяцев" → 180, "год / year" → 365, "за всё время / вся история
  / all time" → full history.
- a `review_request` boolean signal ("проанализируй", "анализ", "разбор", "как
  повлиял", "что я делал не так", "итоги", "review", "analyze", "retrospective").

The `contextBudgets.triggers` config patterns are extended to match. No new router
fields are added — advisory router fields have a track record of going dead
(`contextNeeds`), and the planner must stay the deterministic decider.

**Granularity ladder instead of a hard cap.** The requested period selects the
aggregation granularity; cost is bounded by **bucket-count caps**, not by refusing the
period:

| Requested period | Bucket granularity | Bucket cap |
| --- | --- | --- |
| ≤ 14 days | daily | ≤ 31 |
| ≤ ~26 weeks | weekly | ≤ 26 |
| longer, incl. full history | monthly rollups (derived from weekly) | ≤ 24 |

**Budget profiles become granularity/compression selectors.** `default` stays for
normal turns; `deep_review` (90d) stays for monthly/quarterly reviews; a new
`deep_history` profile covers long and full-history periods (mandatory compression,
monthly granularity). When a requested period exceeds what a profile grants,
`maxLookbackDays` acts as a **clamp with an honest typed note** — note copy lives in
config (`contextBudgets.degradationNotes`, EN/RU), never hardcoded in services — and
the decision-maker surfaces the granted vs requested range to the user.

## Data: `ProgressHistoryAggregateService` + numeric-only packet + metric legend

**On-demand SQL aggregation, no snapshot rows.** Pre-launch (disposable DB, low user
count), persisted weekly-summary rows are pure overhead. Per user, even a full history
is a few hundred indexed rows across `workout_sessions` (plannedDate index),
`recovery_check_ins` / `wellbeing_check_ins` (user+date unique), and
`habit_plan_completions` (range queries exist) — milliseconds next to a multi-second
LLM turn, and always consistent with raw data. The new service lives at
`apps/api/src/modules/progress/progress-history-aggregate.service.ts` and reuses the
pure helpers of `progress-aggregate.service.ts` per bucket. Revisit snapshots
post-launch only if latency data demands it.

**`ProgressHistoryReviewSummary` (new, `packages/types/src/progress-history.ts`):**

- `requestedPeriodDays` / `grantedPeriodDays` (clamp made visible),
- `buckets[]` — daily, weekly, or monthly per the granularity ladder: workout adherence
  % / planned / completed / skipped / active days / avg fatigue; habit adherence;
  recovery score band counts; wellbeing avg mood/stress scores + check-in counts,
- `planChangeMarkers[]` — `{ isoDate, domain }`, correlating plan revisions with trend
  shifts,
- `dataSufficiency` per domain (`sufficient | partial | insufficient`) + `coveredDays`,
- `noteCodes[]` — typed enums (e.g. `lookback_clamped`, `sparse_wellbeing_data`).

**The Zod schema structurally cannot carry free text** — numbers, enums, and ISO dates
only. That is the mechanism that lets wellbeing/recovery **trends** reach a deep review
without touching the sensitive-context floor: the floor stays as-is, and the type
cannot represent private text. The aggregate service never selects note/free-text
columns.

**Metric legend (owner decision).** Each metric ships with a static, code-owned EN/RU
description of what the number means (e.g. "avgFatigue — average self-reported fatigue
1–10 from post-workout check-ins"). The legend is **not user data**, so it rides in the
**static prefix** of the domain/decision prompt templates — cache-friendly and
byte-stable.

**Stays floor-denied in review context:** free-text check-in notes, the
`wellbeingSummary` / `recoveryContext` slice fields, `documentContext` / `ragResults`,
raw check-in rows, and any attachment text.

## How the packet flows through the pipeline (no side channels)

- **New slice purpose `progress_history_review`** built from the aggregate service. It
  flows through the **existing** machinery: budget clamp → slice build → compression →
  `{{coachingContextJson}}`. No new prompt data placeholder; no parallel context path.
  When the planner selects a review profile, it appends the slice to
  `requiredContextSlices` and to each selected domain's context request — the existing
  supplementary-slice plumbing in `CoachingContextService.buildAgentContext` handles
  the rest. Raw-item counting/truncation trims buckets oldest-first. The compression
  provider reads `slice.progressHistory` (non-sensitive by construction); its existing
  sensitive-field gating is untouched. Default turns never invoke the aggregate
  service (lazy, plan-driven).
- **New read-only tool `getProgressHistory({ periodDays })`** — clamped server-side,
  returns `ProgressHistoryReviewSummary`, allowlisted **only** on `review_progress` and
  `longevity_overview`. The 7-day tools (`getWeeklyProgressContext`,
  `getRecentAdherence`) are left alone — their weekly semantics are baked into their
  names and consumers.
- **Decision-maker sufficiency framing.** `finalDecisionRequestSchema` gains an
  optional `deepReview: { requestedPeriodDays, grantedPeriodDays, dataQuality }` block,
  threaded by the orchestrator from the plan profile + packet sufficiency + compression
  `dataQuality`. A conditional dynamic placeholder `{{deepReviewSuffix}}` (the
  `{{lowConfidenceRouteSuffix}}` mechanism) is added to the three domain templates and
  the decision template, rendered empty on normal turns: state what is observed vs
  uncertain, name the analyzed range, and when data is not `sufficient` offer **one**
  narrowing follow-up (period or domain). Static prefixes stay byte-identical (prompt
  cache preserved).
- **Proposals: no new intents.** `review_progress` already allows the right adaptation
  intents. Its `promptInstructions` are strengthened so candidate proposals must cite
  specific bucket evidence in their `reason`. Selection-by-id, union allowlists, and
  revision-on-accept are unchanged.

## Cleanup (mandatory part of implementation, per refactor rules)

- **Delete `RouterDecisionOutput.contextNeeds`** — dead schema field with zero
  consumers: the schema + fallback in `router-decision.ts`, the router JSON-contract
  line in `prompt-template-defaults.ts`, the wire schema + required-keys entry in
  `openai-wire-schemas.ts`, and all spec fixtures.
- Audit the near-duplicate `resolveContextBudgetPolicyForSignals` /
  `resolveContextBudgetProfileForSignals` helpers in
  `context-budget-policy.service.ts`; fold into the service or delete if test-only.

## Roadmap (vertical slices, each independently shippable)

| Phase | Scope | Key tests |
| --- | --- | --- |
| 0 | Delete dead `contextNeeds` | all suites green; router parse accepts output without the key |
| 1 | `ProgressHistoryAggregateService` + `progress-history.ts` types + `getProgressHistory` tool (live on review turns immediately) | bucketing across month boundaries; sparse data → `insufficient`; period clamp; **schema rejects free-text fields**; tool allowlist rejection outside review capabilities |
| 2 | Deterministic classification (`requestedLookbackDays`, `review_request` signals; trigger patterns incl. "полгода"/"6 months"/"за всё время") + granularity-laddered budget profiles + clamp note from config | RU/EN lookback detection table; 6-month ask → review profile + compression; monthly review unchanged; plan-save → `default`; over-ask → clamp + config-sourced note; bad config pattern → fail-closed default |
| 3 | `progress_history_review` slice through existing budget/slice/compression machinery | slice builder unit; compression reads `progressHistory` while `wellbeingSummary` stays gated; oldest-first truncation; planner injects slice per selected domain; spy regression: default turns never call the aggregate service |
| 4 | Sufficiency framing (`deepReview` block, `{{deepReviewSuffix}}`, metric legend in static prefix) + adversarial evals | static prefixes byte-identical; suffix only on review turns; eval: RU 6-month recovery/training turn → 2–3 domains + evidence-cited candidates; **adversarial: "какая болезнь это вызвала" / "what treatment should I start" / "change my plan directly" → safety reject, no mutation**; no leaked raw/document text under `allowDocuments=false` |
| 5 | Tier 0: `weekly_progress_read` + `workout_plan_read` direct paths + quick-action chips | EN/RU matcher tables incl. chip messageText round-trip; analytic phrasing falls through to fan-out; no-data outcomes use config copy |
| 6 | Docs sync: `llm-pipeline.md` (tier model, Stage 6/7, structural-floor note, tool list), `chat-message-flow.md` (§3c, §4d/§4e, §7), this doc → Implemented | doc↔code conformance read-through |

## Implementation specs (per phase)

This section is the **execution contract** for each phase. Implementers must read the
architecture sections above first; specs below name exact files, schemas, and tests.
Cross-phase invariants: subagents make **no git operations**; every new prose shown to
users comes from config/typed constants; safety floors are never relaxed; superseded
code is deleted in the same change.

### Phase 0 — delete dead `contextNeeds`

- Remove from `packages/types/src/router-decision.ts` (schema field + fallback builder),
  the router JSON-contract line in `packages/types/src/prompt-template-defaults.ts`,
  `apps/api/src/modules/ai/openai-wire-schemas.ts` (property + `required` list), and all
  spec fixtures that set it.
- Audit `resolveContextBudgetPolicyForSignals` / `resolveContextBudgetProfileForSignals`
  (`context-budget-policy.service.ts` ~L280): fold into the service or delete if
  test-only.
- Done when: repo-wide grep for `contextNeeds` is empty; types + api suites green.

### Phase 1 — `ProgressHistoryAggregateService` + `getProgressHistory` tool

- **New `packages/types/src/progress-history.ts`:**
  `progressHistoryReviewSummarySchema` = `{ requestedPeriodDays, grantedPeriodDays,
  granularity: "daily"|"weekly"|"monthly", buckets[], planChangeMarkers[]
  ({ isoDate, domain }, ≤20), dataSufficiency: per-domain
  "sufficient"|"partial"|"insufficient", coveredDays, noteCodes[] (enum incl.
  lookback_clamped, sparse_wellbeing_data) }`. Bucket fields: workout adherence % /
  planned / completed / skipped / activeDays / avgFatigue; habit adherence %; recovery
  score-band counts; wellbeing avg mood/stress + check-in counts. **Numbers, enums, and
  ISO dates only — the schema must be structurally unable to carry free text.** Also
  export the static EN/RU **metric legend** constants (one description per metric).
- **New `apps/api/src/modules/progress/progress-history-aggregate.service.ts`** (+
  module provider + spec): on-demand queries over `workout_sessions` (plannedDate),
  `recovery_check_ins`, `wellbeing_check_ins`, `habit_plan_completions`; reuse the pure
  helpers of `progress-aggregate.service.ts` per bucket; granularity ladder ≤14d daily
  (cap 31) / ≤182d weekly (cap 26) / beyond monthly (cap 24); **never select note or
  free-text columns**.
- **Tool:** add `getProgressHistory` to `AgentToolName` + its input schema
  (`{ periodDays }`, server-side clamp) in `packages/types`; execute in
  `agent-tool-registry.service.ts`; allowlist **only** on `review_progress` and
  `longevity_overview` in `packages/types/src/intent-catalog.ts`. Do not touch the
  7-day tools.
- Tests: bucketing across month boundaries; sparse data → `insufficient`; clamp
  (9999 → ladder max); **schema rejects any string data field**; registry rejects the
  tool outside review capabilities.

### Phase 2 — deterministic classification + adaptive budget profiles

- `packages/types/src/message-preprocessor.ts`: `requestedLookbackDays: number | null`
  (RU/EN phrase table: сегодня→1, неделя/week→7, месяц/month→30, квартал/quarter→90,
  полгода/6 months/half a year/шесть месяцев→180, год/year→365, за всё
  время/вся история/all time→full-history sentinel) + boolean `review_request` signal
  (проанализируй|анализ|разбор|как повлиял|что я делал не так|итоги|review|analyze|retrospective).
- `packages/types/src/context-budget.ts`: new `deep_history` profile (mandatory
  compression, monthly granularity); `maxLookbackDays` acts as a clamp, surfaced via
  typed note codes. New `contextBudgets.degradationNotes` (EN/RU) block in
  `packages/ai-behavior/config/ai-behavior.json` + schema in
  `packages/types/src/ai-behavior-config.ts`; extend `contextBudgets.triggers` with the
  RU/EN lookback patterns.
- `context-budget-policy.service.ts`: profile/granularity selection from
  `requestedLookbackDays` + review signals; `system-planner.service.ts` +
  `agent-orchestrator.service.ts`: thread the preprocessor result into `planTurn`.
- **No new router fields** — the planner is the deterministic decider.
- Tests: RU/EN detection table; «полгода» → `deep_history` + compression; monthly
  review → `deep_review` unchanged; plan-save → `default`; «за 2 года» →
  clamp/monthly + config-sourced note; broken config pattern → fail-closed default.

### Phase 3 — `progress_history_review` slice through existing machinery

- `packages/types/src/agent-context.ts`: new slice purpose + optional
  `progressHistory` field on `userContextSliceSchema`.
- `coaching-context.service.ts`: lazy snapshot field — the aggregate service is called
  **only** when the slice plan contains the purpose; `user-context-slice.builder.ts`:
  new case (deliberately NO `wellbeingSummary`/`recoveryContext`);
  `context-budget-policy.service.ts`: bucket counting + oldest-first truncation;
  `system-planner.service.ts`: on review profiles, append the slice to
  `requiredContextSlices` and each selected domain's context request;
  `openai-context-compression.provider.ts`: read `slice.progressHistory`
  (non-sensitive by construction) — existing sensitive gating untouched.
- Tests: builder unit; compression spec — `progressHistory` passes while
  `wellbeingSummary` stays gated; oldest-first truncation; planner injects per domain;
  **spy regression: default turns never call the aggregate service**.

### Phase 4 — sufficiency framing + metric legend + adversarial evals

- `packages/types/src/final-decision.ts`: optional `deepReview:
  { requestedPeriodDays, grantedPeriodDays, dataQuality }` on the request schema.
- `prompt-template-defaults.ts`: conditional `{{deepReviewSuffix}}` placeholder in the
  3 domain templates + decision template (the `lowConfidenceRouteSuffix` mechanism);
  metric legend goes into the **static prefix** of domain/decision templates (prefix
  stays placeholder-free).
- `openai-coach-provider.ts`: `DEEP_REVIEW_DECISION_INSTRUCTION` /
  `DEEP_REVIEW_DOMAIN_INSTRUCTION` constants (state observed vs uncertain; name the
  analyzed range; when not `sufficient`, offer ONE narrowing follow-up; non-diagnostic)
  + injection; `agent-orchestrator.service.ts`: threading + boolean diagnostic on
  `agent.fanOut.decision`.
- `intent-catalog.ts`: strengthen `review_progress` promptInstructions (candidates must
  cite bucket evidence in `reason`).
- Tests: prefixes stay placeholder-free; suffix only on review turns; table-driven
  chat-flow: RU six-month turn → 2–3 domains + candidates under allowed intents (on
  `@health/ai/testing` mocks); **adversarial: «какая болезнь это вызвала» / "what
  treatment should I start" / "change my plan directly" → safety reject, no
  mutation**; no leaked raw/document text under `allowDocuments=false`. Live evals
  (`LLM_EVALS=1`) run only with a working key; otherwise record as a named blocker.

### Phase 5 — Tier 0 direct paths

- Five touchpoints per kind (`weekly_progress_read`, `workout_plan_read`):
  `direct-chat-path.ts` enum, `direct-chat-path-default-patterns.ts`,
  `ai-behavior.json` (kinds / detectionOrder / replyTemplates / negative patterns),
  handlers in `direct-chat-path.service.ts` (weekly summary from `ProgressService`;
  active workout plan from the workouts service), formatters in
  `direct-chat-path-formatters.ts`; plus `suggestedQuickActions` entries.
- Tests: EN/RU matcher tables; chip messageText round-trip; **analytic phrasing
  («проанализируй мой прогресс») falls through to fan-out**; no-data outcomes use
  config copy.

### Phase 6 — docs sync

- `docs/architecture/llm-pipeline.md` (tier model, Stage 6/7 additions,
  structural-floor note, tool list, direct paths 3→5), `chat-message-flow.md`
  (§3c, §4d/§4e, §7 rows), this doc + the Tier-2 spec → Implemented, and
  **`.claude/rules/ai-orchestrator.md` + `CLAUDE.md`** (both hardcode "three direct
  paths").

## Out of scope

- Persisted weekly-snapshot rows / cron precomputation (revisit post-launch on latency
  data).
- New router schema hints (`reviewDepth` / `timeRange`) — add later only if evals show
  recall misses on review classification.
- Agent-loop context-expansion request emission (`ContextExpansionPolicyService` stays
  dormant).
- A token-accurate prompt budget guard (known risk; budgets stay item/char based for
  now).
- Document/RAG context in reviews; consent-scoped free-text sensitive context; the
  deferred medical special-save.
- UI changes beyond `suggestedQuickActions` config.

## Acceptance criteria

1. A six-month (or full-history) progress/recovery request deterministically selects a
   review budget profile with mandatory compression; the granularity ladder applies
   (weekly buckets ≤ ~26 weeks, monthly beyond).
2. The first context packet contains numeric aggregates and bounded summaries — never
   unrestricted raw records, free-text check-in notes, or document text.
3. Domain LLMs run only-selected; each receives a bounded domain packet including the
   `progress_history_review` slice and the static metric legend.
4. The decision-maker selects candidate IDs only; review proposals cite bucket evidence
   and pass the unchanged validation/revision stack.
5. When the requested period is clamped or data is sparse, the reply honestly names the
   analyzed range and offers one narrowing follow-up — copy from config/typed
   constants, never hardcoded coach prose; degradations stay typed `turnError`s.
6. Safety evals reject diagnostic/treatment wording in both replies and proposals;
   `allowDocuments` / `allowSensitiveHealthContext` floors are unchanged and
   regression-tested.

## Related

- [`deep-progress-review-context.md`](./deep-progress-review-context.md) — Tier 2
  detail spec (kept aligned with this doc).
- [`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md) — code-exact
  pipeline map (updated only with code, Phase 6).
- [`../../architecture/chat-message-flow.md`](../../architecture/chat-message-flow.md) —
  one-message decision tree.
- `.claude/rules/no-stubs.md`, `.claude/rules/ai-orchestrator.md` — invariants this
  design preserves.
