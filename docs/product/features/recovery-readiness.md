# Recovery and Readiness

**Status:** Proposed — partial foundation (health metrics, Today feedback, workout fatigue); recovery fusion and readiness-aware proposals not implemented.

**Roadmap fit:** Phase 10 (Progress and Adaptation), with partial dependency on Phase 8 (Device Sync).

## UX Placement

Daily recovery focus belongs on Today beside stress/wellbeing and the current workout. Weekly recovery and readiness patterns belong on Longevity. Device and metric consent lives in Profile/settings. Metrics must not become a primary user-facing tab, and no screen should expose a clinical or vendor-style readiness score as product truth.

## Summary

Introduce a structured **Recovery Context** that fuses available wellness signals — sleep, subjective fatigue/soreness/mood, workout session feedback, Today daily feedback, and synced recovery inputs (HRV summary, resting HR, vendor readiness when consented) — into a **coaching-oriented readiness band** (not a clinical score). Use that context to drive **recovery-aware typed proposals** for workouts, nutrition, and Today habits, surfaced in chat and weekly progress.

## Problem

Users accumulate recovery-relevant data across the product, but nothing synthesizes it into actionable coaching:

| Signal | Exists today | Used for adaptation? |
|--------|--------------|----------------------|
| Workout session fatigue | Yes | Partially in weekly progress |
| Today daily feedback | Yes | No — not in coaching context |
| Sleep snapshots/aggregates | Schema + API | AI summary only |
| Recovery inputs (HRV, RHR, soreness, mood, fatigue) | Schema + aggregates | Generic AI summary |
| Weekly progress / recovery domain | Deferred explicitly | Not populated |
| Stress | No | — |

There is no readiness model, no recovery trends in progress summaries, and no proposal path that cites recovery context as a source.

## In Scope

### Recovery Context (structured state)

- Persisted or computed snapshot per user per date with inputs used, qualitative readiness band (`well_supported`, `moderate_load`, `prioritize_recovery`, `insufficient_data`), data sufficiency, and contributing signals.
- No numeric "readiness score" exposed to users or AI copy.

### Signal capture enhancements

- Manual recovery check-in on Today: soreness, fatigue, mood, optional perceived stress — stored as `recovery_input` with `source: user`.
- Reuse existing Today `recovery` checklist items for habit proposals.

### Coaching integration

- Include `recoveryContext` in coaching context prompt payload.
- Extend metrics AI summaries with recovery-band-aware phrasing (wellness-safe).
- Weekly progress: populate recovery aggregate; remove recovery from deferred domains when data exists.

### Recovery-aware typed proposals

| Domain | Intent | Example adaptation |
|--------|--------|-------------------|
| Workout | `adapt_workout_plan` / `adapt_workout_plan_from_progress` | reduce volume, reduce load, simplify |
| Nutrition | `adjust_nutrition_plan` | higher protein/hydration; lighter deficit on low-readiness days |
| Today | `create_today_checklist` | mobility, sleep hygiene, lighter movement |

Proposal `reason` must cite recovery signals in plain language. Extend adaptation schemas with optional recovery source refs.

### API (read paths)

- `GET /recovery/context?date=`
- `GET /recovery/context/weekly?weekStart=`
- `POST /recovery/check-in` (manual recovery_input)

## Out of Scope

- Clinical readiness algorithms, strain/recovery scores, or HRV interpretation as medical signal.
- Automatic plan mutation without user approval.
- Diagnosis of injury, overtraining syndrome, or treatment recommendations.
- Native HealthKit / Health Connect live sync (Phase 8 — feature must work without it).
- Real-time intraday coaching push notifications.

## Safety Rules

1. No diagnosis/treatment language — extend blocked patterns for recovery/readiness score framing.
2. No authoritative medical claims — use "may suggest," "based on what you logged."
3. Explicit uncertainty when `insufficient_data`.
4. Consent-scoped device data only when `allowAiContext` is granted.
5. Conservative adaptations — cap volume/load reductions.
6. Vendor readiness scores treated as optional input, not product truth.
7. User override — proposals are suggestions; skipping recovery day remains valid.

## User Stories

- As a user, I can log how I feel so the coach considers it when suggesting plan changes.
- As a user, I see a plain-language recovery focus for today/this week, not a medical score.
- As a user, when sleep and fatigue suggest high load, the coach proposes a lighter workout revision I can accept or reject.
- As a user, I can get a Today checklist with recovery habits via typed proposal.
- As a user with synced sleep/HRV, weekly progress includes recovery trends.
- As a user with sparse data, the product says "not enough recovery data yet" instead of guessing.

## Acceptance Criteria

- System computes a daily recovery band from at least one signal; returns `insufficient_data` when none.
- Band updates when new sleep, recovery_input, workout feedback, or Today feedback is recorded.
- Chat coaching context includes recovery context when available.
- AI can emit recovery-aware proposals using existing intents; proposals validate and require acceptance.
- Accepted workout adaptations create a new WorkoutPlanRevision with recovery source metadata.
- Weekly summary no longer lists recovery in deferred domains when recovery aggregate is present.
- User can submit soreness/fatigue/mood without device sync.
- Revoked device consent excludes synced metrics from context.

## Data and API Implications

- New types: `RecoveryReadinessBand`, `RecoveryContextSnapshot`, `RecoveryProgressAggregate`.
- Extend `ProgressSourceAggregates` with `recovery`.
- Table: `recovery_context_snapshots` (userId, date, band, payload JSON, calculatedAt).
- New service: `RecoveryContextService` — fuse signals from health-metrics, today, workouts repositories.

## AI and Proposal Implications

- Context payload: compact `recoveryContext` with band, sufficiency, signals, optional weekly summary.
- Map recovery band to allowed adaptation operations (`reduce_load`, `reduce_volume`, `simplify`).
- Reject proposals that increase volume on `prioritize_recovery` unless user explicitly requests it.
- No new intent required for MVP — extend reasons and source refs.

## Implementation Slices

| Slice | Deliverable |
|-------|-------------|
| R1 — Recovery fusion core | Types, DB snapshot, service, manual check-in API, read endpoints |
| R2 — Coaching context | Wire into CoachingContextService; improve metric summaries |
| R3 — Progress integration | Recovery aggregate, trends, undefer domain |
| R4 — Recovery-aware proposals | AI prompt rules, validation guards, source refs on apply |
| R5 — UI surfaces | Today check-in, recovery focus card |
| R6 — Device sync enrichment | Auto-ingest sleep/HRV when Phase 8 lands |

Recommended order: R1 → R3 → R2 → R4.

## Risks and Open Questions

- Recovery quality improves with sync; v1 must not feel broken without it.
- Score language creep — users may expect vendor-style percentages.
- HRV interpretive liability — treat as logged trend input only.
- Signal conflicts — user feels great but sleep is poor; default conservative weighting.
- Compute vs persist — recommend persist daily snapshot for auditability.
- Nutrition adjustment bounds need domain validation rules.

## Status vs Current Implementation

| Area | Current state | Gap |
|------|---------------|-----|
| Health metrics | Snapshots/aggregates for sleep, recovery_input | No fusion |
| Device sync | API + consent; mobile scaffold only | No live ingestion |
| Workout feedback | Per-session fatigue | Not in coaching context |
| Today feedback | Energy, difficulty, notes | Not in coaching context |
| Progress | Workout-only; recovery deferred | Recovery aggregate, trends |
| Proposals | adapt intents exist | No recovery source refs |
| Coaching context | Profile, goals, plans, metrics | Missing recovery snapshot |
