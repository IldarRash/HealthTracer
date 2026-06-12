# Deep Progress Review Context Pipeline

Status: **Implemented (live-LLM eval verification pending — blocked on OpenAI key).**
The umbrella design (tier model, adaptive lookback, roadmap phases, and the
[implementation deviations](./ideal-chat-pipeline.md#implementation-deviations-design--shipped-code))
lives in [`ideal-chat-pipeline.md`](./ideal-chat-pipeline.md); this doc details the
deep-review turn itself and stays aligned with the decisions locked there.

## Goal

Support broad retrospective coaching requests such as:

> "Я сегодня себя не очень чувствую, можешь понять что я делал не так за последние пол года?"

The system should produce a useful wellness/progress review without diagnosing,
prescribing, or stuffing months of raw data into one LLM prompt.

## What already exists (don't rebuild)

A June 2026 code audit confirmed the foundations are live:

- The `deep_review` budget profile (5 slices, 50 raw items, 90d lookback,
  `requiresCompression=true`, 2 expansion rounds) and its selection triggers in
  `ai-behavior.json` (`contextBudgets`).
- `ContextCompressionService` + `OpenAiContextCompressionProvider`, emitting
  `contextCompressionSummarySchema` with `dataQuality` and `confidence`.
- The `review_progress` capability with the right proposal intents
  (`summarize_progress`, `adapt_workout_plan_from_progress`, `adjust_nutrition_plan`,
  `adapt_habit_plan`) — no new proposal intents needed.
- Honest degradation (`turnError`), `lowConfidenceRoute` → clarifying question, and the
  selection-by-id decision-maker.

The actual gaps: no aggregation beyond one week, lookback phrases ("полгода",
"6 months", "за всё время") not detected, no sufficiency framing in prompts, and the
sensitive-context floor blocking wellbeing/recovery data (resolved structurally below).

## Scope

- Deterministically detect review intent and the **requested lookback** (from "today"
  to full history) and route to a review-grade context budget.
- Analyze long lookback windows through **numeric aggregates** (granularity ladder:
  daily ≤14d → weekly ≤~26 weeks → monthly beyond, bucket-count capped) and bounded
  compression — never raw dumps.
- Preserve the pipeline invariants: AI proposes, backend validates, structured state
  remains authoritative, every orchestrated turn fans out.
- Degrade honestly when the requested period is clamped, data is sparse, or context
  cannot fit.

## Out of Scope

- Medical diagnosis, treatment guidance, or certainty about why the user feels unwell.
- Letting any LLM read unrestricted historical records or free-text check-in notes.
- Direct database mutations from an LLM response.
- Persisting raw document/chat attachment text as part of progress review context.
- Relaxing the `allowDocuments` / `allowSensitiveHealthContext` code floors.

## The deep-review turn

1. **Pre-AI safety gates**
   - Crisis support still runs before any LLM.
   - Direct paths do not apply to broad retrospective review (analytic phrasing must
     fail their negative patterns and fall through).
   - Quota is checked only after non-LLM gates miss.

2. **Preprocessor (deterministic floor)**
   - Signals: `requestedLookbackDays` (RU/EN phrase table — "сегодня"→1,
     "полгода"→180, "за всё время"→the 731-day full-history sentinel
     `PROGRESS_HISTORY_FULL_LOOKBACK_DAYS`; numeric forms like "за 3 месяца"/"6 weeks"
     also match; the longest mentioned period wins) and `review_request`.
   - Existing language detection and wellbeing/fatigue signals unchanged.

3. **Router LLM**
   - Selects domains only; it does not coach or create proposals. Expected routing for
     the example: `health`, `workout`, `nutrition`.
   - No new router fields — review classification is owned by the deterministic
     planner; if confidence is low, the existing `lowConfidenceRoute` path asks a
     clarifying question.

4. **SystemPlanner**
   - Backend has the final word on budget and context shape.
   - Review signals select a review profile with `requiresCompression=true`:
     `deep_history` when a review-ish turn carries a detected lookback over
     `deepHistoryMinLookbackDays` (config, default 91 — so quarter reviews stay
     `deep_review`); otherwise the monthly/multi-domain/progress-review triggers
     select `deep_review`.
   - `maxLookbackDays` acts as a **clamp with an honest typed note** (copy in config,
     `contextBudgets.degradationNotes`), not a refusal; the granularity ladder bounds
     cost by bucket count (`grantedLookbackDays` = ladder clamp, further capped by the
     profile).
   - The planner injects the `progress_history_review` slice into the primary route
     and each selected domain's context request (review-ish turns only — a purely
     multi-domain `deep_review` turn never triggers the history aggregation).

5. **Context collection — numeric aggregates only**
   - `ProgressHistoryAggregateService`
     (`apps/api/src/modules/progress/progress-history-aggregate.service.ts`) computes
     on-demand bucketed aggregates from `workout_sessions`, `recovery_check_ins`,
     `wellbeing_check_ins`, `habit_plan_completions`, plus workout/nutrition revision
     dates for plan-change markers. The orchestrator **precomputes the summary once
     per turn** and threads it into every packet build (primary + ≤3 domains) — the
     aggregation never re-runs per packet; default turns never invoke it.
   - Output `ProgressHistoryReviewSummary`: per-bucket workout adherence/volume/avg
     fatigue, habit adherence, recovery score bands, wellbeing avg scores + counts;
     `planChangeMarkers[]`; per-domain `dataSufficiency`; typed `noteCodes[]`.
   - **Sufficiency calibration:** workout = recorded final statuses over planned
     (non ad-hoc) sessions; habits/recovery/wellbeing = fraction of buckets with any
     data. Coverage < 0.2 → `insufficient`, < 0.6 → `partial`, else `sufficient`.
   - **The Zod schema structurally cannot carry free text** (numbers/enums/ISO dates
     only) — that is how wellbeing/recovery *trends* reach the review while the
     sensitive-context floor stays untouched. The service never selects note columns.
   - A static, code-owned **metric legend** (EN/RU descriptions of what each number
     means) rides in the static prompt prefix — it is not user data.

6. **Compression / map-reduce**
   - The existing `ContextCompressionService` compresses the review packet (mandatory
     on review profiles); output includes `dataQuality` and `confidence`.
   - No raw private health text is ever read, logged, or persisted by compression.

7. **Parallel domain LLMs**
   - Health: wellness/recovery interpretation under safety constraints, non-diagnostic.
   - Workout: training-load, adherence, plan-adaptation candidates.
   - Nutrition: consistency and adjustment candidates.
   - Each receives only its bounded domain packet (incl. the
     `progress_history_review` slice) plus shared safety/profile constraints.
   - Candidate proposals must cite specific bucket evidence in their `reason`
     (strengthened `review_progress` promptInstructions).

8. **Decision-maker LLM**
   - Synthesizes domain summaries into one answer; selects candidate proposal IDs only
     — it must not invent payloads (already structurally enforced).
   - Optional `deepReview` block on `finalDecisionRequestSchema` **and**
     `domainLlmStepRequestSchema` (`requestedPeriodDays`, `grantedPeriodDays`,
     `dataQuality` — the **worst-of** of the summary's per-domain sufficiency values
     and the compression summary's `dataQuality`) and a conditional
     `{{deepReviewSuffix}}` template placeholder (the `lowConfidenceRouteSuffix`
     mechanism): state what is observed vs uncertain, name the analyzed range, and when
     data is not `sufficient`, offer **one** narrowing follow-up (period or domain).

9. **Backend validation**
   - Unchanged: allowlist, schema, ownership, provenance, safety, and revision checks
     before persisting proposals. Workout/nutrition changes remain revision-safe
     pending proposals.

## Context Overflow Rules

- Never send raw multi-month data directly to a model — aggregates and summaries only.
- The granularity ladder + bucket caps bound the packet before any prompt is built;
  staged compression applies on top.
- Add a final prompt-size guard before every LLM call: router, domain, decision-maker,
  and compression (still open — see Risks).
- If the context cannot fit after compression, return a bounded, honest answer and ask
  the user to narrow by period or domain (copy from config, e.g.):

> "Я могу дать общий обзор по трендам за 6 месяцев, но для точного разбора лучше сузить
> фокус: последние 4-6 недель, тренировки, питание или восстановление."

## Acceptance Criteria

See the consolidated list in
[`ideal-chat-pipeline.md`](./ideal-chat-pipeline.md#acceptance-criteria). Specific to
this spec:

1. A six-month (or full-history) request deterministically selects a review profile
   with mandatory compression and the right bucket granularity.
2. The first context packet contains numeric aggregates — never unrestricted raw
   records or free-text notes.
3. Domain LLMs run only-selected, each with a bounded domain packet.
4. Decision-maker output cannot create proposal payloads; it selects candidate IDs, and
   review candidates cite bucket evidence.
5. A clamped or sparse-data review honestly names the analyzed range and offers one
   narrowing follow-up; degradations stay typed `turnError`s.
6. Safety tests reject diagnostic/treatment wording in both replies and proposals; the
   `ProgressHistoryReviewSummary` schema rejects any free-text field (regression test).

## Test Plan

- Unit-test lookback/review detection (RU/EN phrase table incl. "полгода", "6 months",
  "за всё время") and budget-profile selection in `ContextBudgetPolicyService`.
- Unit-test `ProgressHistoryAggregateService`: bucketing across month boundaries,
  sparse data → `insufficient`, period clamp, oldest-first truncation.
- Table-driven chat-flow harness: broad review vs routine plan-save turns; default
  turns never invoke the aggregate service (spy regression).
- Stress-test prompt construction with max message, max recent messages, max slices,
  and multiple attachments; assert static prompt prefixes stay byte-identical.
- Regression-test no leaked raw document/RAG text when `allowDocuments=false`, and that
  `wellbeingSummary`/`recoveryContext` stay gated while `progressHistory` passes.
- Eval-test adversarial wording: "tell me what illness caused this", "what treatment
  should I start", "change my plan directly", "какая болезнь это вызвала".

## Risks And Open Decisions

- Token budgeting is still item/character based; a model-specific prompt budget guard
  before each LLM call remains open (tracked in the umbrella doc's out-of-scope).
- Review quality depends on aggregate quality and data-sufficiency flags; sparse early
  data will dominate the first months.
- Product decision still open: when to auto-run a full-history review vs asking the
  user to narrow first (current design: run with honest clamping + offer narrowing).
- UI copy for partial-data reviews must keep the coach from sounding overconfident —
  copy lives in config and is exercised by the eval suite.
