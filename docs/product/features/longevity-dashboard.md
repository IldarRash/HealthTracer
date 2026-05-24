# Longevity Dashboard

**Status:** Proposed — underlying data partially exists; named Longevity Dashboard surface not implemented.

## UX Placement

Longevity is the fourth primary web tab alongside Chat, Today, and Profile. It owns the weekly wellness overview and cross-domain trend surface. It may deep-link to read-only Training and Nutrition plan views, but plan changes happen through Chat proposals.

## Summary

Introduce a **consumer-facing Longevity Dashboard** that positions AI Health Coach around living longer and healthier through **habits, consistency, and coaching progress** — not clinical risk or diagnosis. The dashboard aggregates authoritative structured state (Today adherence, workout/nutrition consistency, goals, synced wellness metrics, self-reported recovery/mood, and consent-aware document context) into one premium, trend-oriented overview.

Chat remains the primary coaching entry point. The Longevity Dashboard is the structured "how am I doing?" home users return to between conversations.

## Problem

The product lacks a unified longevity-oriented overview:

- **Profile** is partially dashboard-like but account-centric — no sleep/steps, recovery rhythm, mood/energy, Today adherence, or document context as wellness signals.
- **Metrics** is a developer/support surface, not a consumer dashboard.
- **Progress** is workout-only weekly summaries embedded under secondary Training/plan context; nutrition, Today, recovery are deferred.
- Nothing ties signals together under a "longer, healthier life" narrative without crossing into clinical scoring.

Users need one calm, dense screen that answers: *What patterns matter for my wellness this week? Where am I consistent? What should I discuss with my coach?*

## In Scope (MVP slice)

**Web-first**

1. **New primary route** `/longevity` (or `/dashboard`) with nav label **Longevity** or **Overview**.
2. **Hero + signal grid** aggregating:
   - Weekly coaching consistency
   - Today adherence (7-day strip or current-week score)
   - Workout adherence + link to secondary Training weekly plan
   - Nutrition consistency + link to secondary Nutrition weekly plan
   - Active goals summary + link to Profile goals
3. **Wellness signals panel** (consent-gated): steps, sleep duration, weight trend; recovery rhythm from soreness, fatigue, mood — reframed as logged wellness signals, never vendor "readiness score" UX.
4. **Trends section** reusing weekly progress summary + trend observations; honest deferred-domain placeholders.
5. **Mental wellbeing strip:** Today daily feedback + mood recovery inputs — self-reported, non-clinical.
6. **Documents context card** (consent-aware): recent parsed document titles + "coach has context" indicator; link to Profile documents — no lab interpretation or clinical flags.
7. **Coach CTA:** "Message your coach about this week" → Chat; optional static suggested prompts from visible gaps.
8. **Empty/loading/partial states** per domain.

**Backend (minimal first pass)**

- Prefer read-model composition from existing endpoints.
- Optional `GET /longevity/overview` BFF aggregate returning typed `LongevityOverviewResponse` in `@health/types`.

**Visual**

- Reuse chat-primary design tokens; WHOOP-like density, wellness-only copy.

## Out of Scope

- Clinical longevity scoring, biological age, healthspan risk indices, readiness/recovery scores, or traffic-light "health status."
- Diagnosis, treatment guidance, lab result interpretation, or "normal/abnormal" clinical framing.
- Replacing Chat as primary nav anchor.
- Mobile/Expo dashboard in first slice.
- New wearable integrations beyond existing Phase 8 stack.
- AI-generated dashboard narratives that bypass proposal/approval for plan changes.
- Full document RAG UI on the dashboard (summary card + deep link only).
- Replacing Today execution or the secondary Training/Nutrition plan views.

## Safety Rules

| Rule | Requirement |
|------|-------------|
| No clinical scoring | Never surface readiness_score or vendor recovery scores as headline metrics |
| Source attribution | Copy uses "Based on your logged …" / "From synced data you shared" |
| Documents | Show title, date, consent status, parse status only; no diagnostic summaries |
| Labs | Labs appear as "uploaded context available to coach" — not interpreted values or reference ranges |
| Mental wellbeing | Mood/energy are self-reported wellness check-ins, not mental health assessment |
| AI context | Dashboard reads structured state; coach AI uses consented metric summaries |
| Proposals | Dashboard may surface pending proposals count/link to Chat; it does not apply changes |
| Deferred domains | Show "not enough data yet" — never impute or score |

## User Stories

1. As a user, I open Longevity and see a coaching snapshot of my week across habits, training, nutrition, and goals.
2. As a user, I see simple 7-day trends without medical scores.
3. As a user with device consent, I see normalized wellness signals as trends, not raw device logs.
4. As a user, I see how I've been feeling when I've logged it — framed as self-check-ins.
5. As a user with uploaded documents, I see that document context is available to my coach with consent boundaries.
6. As a user, I can jump to Chat with context from any empty or insight card.
7. As a user, I deep-link to Today, secondary Training, secondary Nutrition, or Profile for detail.
8. As a user without much data, I see encouraging empty states and clear next steps.

## Acceptance Criteria

- Authenticated web route renders Longevity Dashboard with loading, error, empty, and partial-data states.
- Dashboard pulls from structured APIs only; no chat transcript as source of truth.
- Hero shows weekly coaching consistency with 7-day trend strip.
- Cards present Today adherence, workout adherence, nutrition consistency, active goals — each links to authoritative screen.
- Consented metric aggregates appear when present; hidden or placeholder when consent revoked or no sync.
- Recovery/mood/energy use wellness-safe labels; no "recovery score" or clinical terms in UI strings.
- Documents card respects consent; no parsed clinical content on dashboard.
- Weekly progress section shows workout trends when generated; deferred domains listed honestly.
- Primary nav includes Longevity/Overview; Chat remains visually dominant.
- All user-visible copy passes wellness-only review.

## Data and API Implications

**Existing sources to compose:**

| Domain | Dashboard use |
|--------|---------------|
| Training | Adherence, consistency hero, trend strip |
| Today | Daily adherence score, energy/difficulty |
| Nutrition | Consistency card |
| Goals | Active goals summary |
| Progress | Trends, userMessage, deferred domains |
| Metrics | Steps/sleep/weight trends; mood/soreness/fatigue |
| Documents | Context card (metadata only) |
| Proposals | Recent coach activity strip |

**Gaps to close:**

- Extend progress aggregates to include today, nutrition, recovery (Phase 10 extension).
- Add `LongevityOverviewResponse` Zod schema.
- Optional `GET /longevity/overview?weekStart=` — server-side aggregation.
- Dashboard read model must not expose raw `readiness_score` to UI.

**Metrics route:** Keep `/metrics` out of primary nav and place metric consent/settings under Profile; Longevity becomes the consumer metrics view.

## AI and Proposal Implications

- Dashboard is **read-only** for structured state.
- Coach may reference dashboard-visible aggregates in Chat when user has `allowAiContext`.
- Suggested Chat prompts on dashboard are **static templates** tied to visible gaps, not LLM-generated clinical advice on page load.

## Implementation Slices

| Slice | Deliverable |
|-------|-------------|
| L1 — Shell and IA | Route, nav item, page layout, empty scaffold |
| L2 — Core cards | Hero consistency + Today/workout/nutrition/goals cards |
| L3 — Progress integration | Weekly summary + trends section |
| L4 — Wellness signals | Consent-gated metrics cards |
| L5 — Documents context | Consent-aware metadata card |
| L6 — Backend aggregate (optional) | LongevityOverviewResponse + endpoint |
| L7 — Progress domain expansion | Include today/nutrition/recovery in weekly summaries |
| L8 — Polish and tests | Motion, responsive grid, copy audit, snapshot tests |

Recommended MVP: L1–L5.

## Risks and Open Questions

- **IA collision:** Profile already has coaching snapshot — split roles (Profile = account/settings; Longevity = wellness overview).
- **Score leakage:** `recoveryInputTypeSchema` includes `readiness_score` — strict UI/backend filtering required.
- **Sparse data:** early users see mostly empty states; dashboard must feel useful, not broken.
- **Metrics on web:** native sync is mobile-first; web may show "connect on mobile" placeholders often.

**Open questions:**

1. Route name: `/longevity` vs `/dashboard` vs `/overview`?
2. Secondary plan links: should Training/Nutrition detail links appear as full cards, compact links, or proposal-card destinations?
3. Profile relationship: keep Profile focused on account/context while Longevity owns wellness overview.
4. Hero metric: weekly consistency composite or longevity-framed composite (still non-clinical)?
5. Backend BFF vs client compose for v1?
6. Which deferred domain first in progress expansion?

## Status vs Current Implementation

| Area | Current state | Gap |
|------|---------------|-----|
| Nav | Chat, Today, Workouts, Nutrition, Metrics, Profile | Target is Chat, Today, Longevity, Profile |
| Profile dashboard | Hero consistency, goals, workout/nutrition cards | Not longevity-positioned |
| Progress | Workout-only in Training/plan context | Not on unified overview |
| Metrics | Dev-oriented UI at `/metrics` | No consumer trend visualization |
| Today | Rich execution UI | Not aggregated on overview |
| Documents | Profile section with consent | No dashboard-level context card |
| Types | WeeklyProgressSummary, device metrics | No LongevityOverviewResponse |

**Overall:** ~25–30% of underlying data exists; ~0% of named Longevity Dashboard product surface.
