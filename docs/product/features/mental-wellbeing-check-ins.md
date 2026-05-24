# Mental Wellbeing Check-ins

**Status:** Proposed — adjacent pieces exist (Today feedback, recovery_input types); dedicated wellbeing domain not implemented.

## UX Placement

Mental wellbeing capture belongs on Today as a quick stress/mood/checkpoint card. Trends and consistency belong on Longevity. Privacy, data-use preferences, and consent controls belong on Profile. Metrics must not become a primary user-facing tab for this feature.

## Summary

Add a lightweight, structured **mental wellbeing check-in** domain so users can log mood and stress in a few taps, see simple trends over time, and give the AI coach wellness-safe context for daily execution and plan adaptation. Check-ins are **structured state** (not chat history), separate from device-synced recovery metrics and from Today's end-of-day execution feedback.

## Problem

Users need a low-friction way to track how they feel mentally day to day, and the coach needs that signal to personalize workouts, recovery, and daily habits without turning the product into therapy or clinical monitoring.

Today the product has adjacent pieces but no coherent mental wellbeing loop:

- Today daily reflection has energy, difficulty, notes but is not in AI coaching context.
- Health metrics support mood/soreness/fatigue under device sync only; no manual entry API.
- AI metrics context excludes mood/recovery summaries from safe context types.
- Progress/trends are workout-only; recovery and today domains are deferred.
- No dedicated wellbeing entity, stress dimension, or mental/physical correlation loop.

## In Scope

- Structured check-in capture: mood (ordinal scale), stress (ordinal scale), optional bounded note, optional wellness tags.
- One primary check-in per calendar day per user (upsert by date).
- Dedicated domain module: repository, service, Zod contracts, Drizzle migration.
- Read APIs: today's check-in, recent history, aggregates/trends.
- User-facing entry points on Today tab; trend/history rollups on Longevity.
- Trend model: daily snapshot and 7-day rolling averages; streak/consistency counts.
- AI coaching context: summarized wellbeing trend block (no raw notes by default).
- Optional Today checklist integration for wellbeing habit items.
- Correlation insights (read-only v1): simple wellness messages when patterns co-occur.
- Crisis-safe support copy: static messaging and external resource links when user selects lowest mood tier or submits flagged keywords.

## Out of Scope

- Diagnosis, screening instruments (PHQ-9, GAD-7), clinical labels, treatment plans, medication guidance.
- Therapy replacement, CBT/DBT programs, guided mental health interventions.
- Full journaling (long-form entries, prompts library, search, export).
- AI-initiated check-ins via push/SMS without user action.
- Automatic plan changes from mood data without user proposal approval.
- Replacing Today execution feedback into wellbeing check-ins.

## Safety Rules

1. Wellness framing only: "How are you feeling?" / "Stress level" — never "symptoms," "disorder," "diagnosis."
2. No clinical interpretation: AI and UI describe patterns, not causes or conditions.
3. Notes excluded from AI prompt unless explicit opt-in (default off).
4. Crisis boundary: lowest tier or keyword match triggers fixed support copy; do not continue coaching on that turn.
5. No therapy language: avoid "treatment," "cure," "mental illness."
6. Correlation copy is observational, not diagnostic.
7. Proposal safety: wellbeing-driven plan changes use existing adaptation intents with human-readable reason; user must approve.
8. Data minimization: store scales and short note only.

## User Stories

- As a user, I can log mood and stress in under a minute so my coach understands my current state.
- As a user, I can see my last 7–14 days of check-ins so I notice patterns.
- As a user, I want check-ins separate from workout execution feedback.
- As a user, I want the coach to acknowledge my recent mood trend without reading my private note unless I allow it.
- As a user, I want gentle suggestions when stress is elevated — not medical advice.
- As a user in distress, I want clear guidance that this app is not crisis support and where to get help.

## Acceptance Criteria

- User can submit mood and stress for today; second submission same day updates the record.
- Today tab shows check-in card when none exists; shows summary when complete.
- User can view 7-day history with mood/stress visualization.
- Lowest-tier mood selection triggers crisis support panel.
- Coaching context snapshot includes wellbeing summary with data sufficiency flag.
- Raw notes absent from default coaching context.
- Coach can reference wellbeing summary when data sufficiency is partial or sufficient.
- AI may propose Today checklist wellbeing items when no check-in today and user asks about stress/recovery.
- Reply/proposal safety validators reject clinical/diagnostic phrasing.
- Crisis keyword list tested; support copy is static strings, not LLM-generated.

## Data and API Implications

**New entity: `WellbeingCheckIn`**

- `userId`, `date`, `moodScore` (1–5), `stressScore` (1–5), optional `tags`, optional `note` (max 280), `source`, timestamps.
- Unique constraint on `(userId, date)`.

**API sketch:**

- `GET /wellbeing-check-ins/:date`
- `PUT /wellbeing-check-ins/:date`
- `GET /wellbeing-check-ins/history?limit=14`
- `GET /wellbeing-check-ins/aggregates?periodType=daily&limit=30`

**Relationships:**

- Do not overload `daily_checklists.feedback`.
- Do not require device consent for user-entered check-ins.
- Optional later bridge to `health_metric_snapshots` as `recovery_input` with `source: user_report`.

## AI and Proposal Implications

- Add `wellbeingSummary` to coaching context alongside `metricsSummary`.
- Reuse existing intents for v1: `create_today_checklist`, `adapt_workout_plan`, `summarize_progress` (extended later).
- AI asks for check-in when user mentions stress/motivation and no recent data.
- Never infer diagnosis from mood/stress scores.

## Implementation Slices

1. **Domain foundation** — schema, types, repository, upsert/get/history APIs, unit tests.
2. **Today entry UI** — check-in card on Today (web), crisis copy.
3. **Trends and history UI** — 7–14 day list/chart on Longevity, with compact Today summary.
4. **Coaching context** — wellbeing summary in snapshot and prompt docs.
5. **Progress correlation** — add wellbeing domain to weekly summary.
6. **AI proposals polish** — check-in habit proposals; adaptation reasons referencing wellbeing.

Recommended first shippable vertical: slices 1, 2, and 4.

## Risks and Open Questions

- Scope creep into journaling/therapy if notes field grows unchecked.
- Duplicate signals with Today feedback and device mood inputs — document canonical source.
- Over-trusting sparse data — require minimum check-ins before trend adjectives in AI copy.
- Scale: 5-point vs 1–10; mood-only minimum vs required stress.
- Mobile parity required for MVP or web-only acceptable?

## Status vs Current Implementation

| Capability | Status |
|------------|--------|
| Dedicated wellbeing check-in domain | Missing |
| Mood/stress user entry (app-native) | Missing |
| Mood/stress trend aggregates | Missing |
| Wellbeing in AI coaching context | Missing |
| Today execution feedback | Implemented — adjacent, not equivalent |
| Device-synced mood/soreness | Partial — schema exists, no manual UI |
| Weekly progress wellbeing trends | Missing |
| Crisis-safe referral copy | Missing |
