# Weekly Review and Cross-Domain Adaptation

**Status:** Proposed — workout-only weekly summaries and workout adaptation from progress exist; cross-domain review not implemented.

## UX Placement

Weekly review belongs on Longevity as the structured overview and in Chat as the coaching conversation. Training and Nutrition may show read-only plan-specific context, but they are not the primary weekly review entry point. Any cross-domain plan changes must be reviewed and approved as Chat proposals.

## Summary

Evolve the current workout-centric weekly progress module into an **AI-first weekly review** that synthesizes structured signals across physical training, mental/wellness inputs, nutrition, daily habits, and recovery. The coach explains what happened, surfaces cross-domain trends, and proposes **limited, typed changes** (workout, nutrition, recipes, Today checklist) that the user must approve before any plan state updates.

Aligns with **Phase 10: Progress and Adaptation** and the existing AI update flow.

## Problem

Users accumulate structured data across secondary Training and Nutrition views, Today, metrics, and recipe-supported nutrition recommendations, but the weekly review today is **workout-only**:

- `ProgressService.generateWeeklySummary` aggregates workout sessions only.
- `buildDeferredDomains()` explicitly excludes Today, nutrition, recipes, and recovery.
- `userMessage` and trends are deterministic workout templates, not AI-synthesized cross-domain narratives.
- Coaching context includes `metricsSummary` separately from `weeklyProgressSummary`.
- Adaptation from progress is limited to `adapt_workout_plan_from_progress`.

Users need a coherent weekly coaching moment that reflects their whole wellness picture and offers actionable, bounded plan adjustments.

## In Scope

### Weekly review generation

Extend progress aggregates and trend detection to include:

- **Today:** checklist adherence, daily feedback (energy, difficulty).
- **Nutrition:** meal completion, hydration, macro-target adherence.
- **Recovery / physical signals:** sleep, steps, weight trends; workout session fatigue.
- **Mental / wellness signals:** mood, soreness, fatigue; Today energy/difficulty.
- **Recipes (light):** recommendation activity within the week.

Compute per-domain `dataSufficiency` and overall `dataStatus`. Replace or augment deterministic `userMessage` with AI-generated narrative grounded in aggregates (with wellness-safe fallback templates).

### AI-first review flow

- Primary entry: Chat ("How was my week?") or user-initiated from the Longevity weekly overview.
- `summarize_progress` proposal triggers cross-domain summary generation.
- Coach reply references cited trend IDs and domain aggregates.

### Cross-domain adaptation proposals

After review, AI may propose at most 2–3 changes per review turn:

- `adapt_workout_plan_from_progress` (existing)
- New: `adjust_nutrition_plan_from_progress`
- Existing intents with progress provenance: `recommend_recipes`, `create_today_checklist`

Each proposal must cite `reason`, link to summary/trends, and stay within domain validation rules.

### UI surfaces (minimal MVP)

- Add a Weekly Review section on Longevity; Training may show read-only plan-specific trend context only.
- Chat renders summary + pending cross-domain proposals with existing approval UX.

## Out of Scope

- Medical diagnosis, treatment, readiness/clinical scores, or interpreting documents as clinical directives.
- Automatic plan changes without user approval.
- Full recipe/meal logging analytics.
- New device integrations beyond existing pipeline.
- Multi-week program periodization or unsolicited plan overhauls.
- Real-time mid-week auto-adaptation (weekly cadence only).

## Safety Rules

- Reuse and extend wellness-safe progress message patterns; block diagnosis/treatment/prescription/readiness-score language.
- AI narrative must use hedged coaching language.
- Device/recovery data only included when active consent + `allowAiContext`.
- Mental/mood signals are wellness context only — no mental health diagnosis or therapy framing.
- Progress-derived proposals cannot apply without valid provenance when `sourceSummaryId` is provided.
- Nutrition adjustments must pass domain validation; workout changes require structured plan validation.

## User Stories

1. As a user, I want a weekly coach summary of training, nutrition, habits, and recovery.
2. As a user, I want the coach to explain trends without telling me I have a medical condition.
3. As a user, I want suggested plan tweaks as reviewable proposals.
4. As a user with partial data, I want an honest partial review.
5. As a user with synced wearables, I want sleep/steps/recovery inputs reflected when consented.
6. As a user, I want coordinated adjustments via separate explicit proposals.

## Acceptance Criteria

1. Weekly summary populates `sourceAggregates` for all domains with available data.
2. Overall `dataStatus` reflects multi-domain sufficiency rules.
3. At least one cross-domain trend can be produced when two or more domains have sufficient data.
4. `summarize_progress` acceptance produces a persisted summary with AI or fallback narrative passing wellness safety checks.
5. AI can return progress-linked proposals for workout and at least one additional domain with schema validation.
6. Accepted proposals create revisions; rejected/pending proposals do not mutate active plans.
7. Coaching context `weeklyProgressSummary` includes new aggregates and trends after generation.
8. UI shows cross-domain summary, per-domain deferred notices, and plan-change approval notice.
9. Users without nutrition plan or device consent still receive a valid partial review.

## Data and API Implications

- Extend `progressSourceAggregatesSchema` with nullable aggregates: `today`, `nutrition`, `recovery`, `recipes`.
- Extend `trendTypeSchema` for cross-domain types.
- Add `adjustNutritionPlanFromProgressChangesSchema` parallel to workout variant.
- Optional shared `progressProvenanceSchema` for all progress-derived intents.
- New repository queries: Today history, nutrition adherence, health metric aggregates, recipe activity by week.
- Likely no new tables for MVP — JSONB `source_aggregates` and trend rows already flexible.

## AI and Proposal Implications

| Intent | Status | Target change |
|--------|--------|---------------|
| `summarize_progress` | Exists | Trigger cross-domain aggregation + narrative |
| `adapt_workout_plan_from_progress` | Exists | Keep; cite cross-domain trends |
| `adjust_nutrition_plan_from_progress` | **New** | Small nutrition revision from weekly signals |
| `recommend_recipes` | Exists | Optional provenance |
| `create_today_checklist` | Exists | Habit/recovery items from weekly gaps |

AI orchestrator prompt: include aggregates, trends, deferred domains, active plans, goals; instruct max proposals and safety language.

## Implementation Slices

1. **Domain aggregators + types** — Today, nutrition, recovery/recipe weekly aggregates.
2. **Cross-domain trends** — trend detectors + at least one composite trend.
3. **AI narrative layer** — generate `userMessage` via AI with template fallback.
4. **Progress-derived nutrition intent** — schema, validation, apply via NutritionService.
5. **Provenance on existing intents** — optional citation fields for recipes/Today proposals.
6. **Coaching context + AI prompts** — richer weekly block.
7. **UI** — extend training-progress-panel for multi-domain display.
8. **Tests** — aggregators, API integration, proposal validation, AI safety, partial-data scenarios.

**Dependencies:** Today, Nutrition, Recipes, Device Metrics modules should exist; feature degrades gracefully when domains are empty.

## Risks and Open Questions

- Thin data weeks may over-interpret — lean on `dataSufficiency` and deferred messaging.
- AI cost/latency for weekly batch + narrative.
- Conflicting proposals in same turn (workout deload + calorie increase).
- Mental health boundary for mood trend copy.
- Recipe signal depth may be too weak for trends in MVP.
- Scheduled review notifications out of scope for MVP?
- Timezone week boundaries — confirm single week definition.

## Status vs Current Implementation

| Area | Current state | Gap |
|------|---------------|-----|
| Weekly summary API | Workout-only aggregates | Cross-domain aggregates |
| Trends | Workout only | No nutrition/Today/recovery/composite |
| Deferred domains | Static list of 4 deferred | Should shrink dynamically |
| `userMessage` | Deterministic template | Not AI cross-domain narrative |
| `summarize_progress` | Triggers workout summary | Needs cross-domain pipeline |
| `adapt_workout_plan_from_progress` | Implemented | Workout-only adaptation |
| Other adapt intents | Exist without progress link | Need provenance + review-triggered use |
| Coaching context | Workout summary + separate metrics | Not unified weekly review |
| UI | Workout trends in Training | No cross-domain review surface |
