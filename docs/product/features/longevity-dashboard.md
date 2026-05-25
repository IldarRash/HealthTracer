# Longevity Dashboard

**Status:** Implementation-ready MVP brief. Underlying data partially exists; named Longevity Dashboard surface is not implemented.

## UX Placement

Longevity is the fourth primary web tab alongside Chat, Today, and Profile. It owns the weekly wellness overview and cross-domain trend surface. Training and Nutrition remain routeable secondary read-only plan views linked from Today, Longevity, and Chat proposal flows. Profile remains the account, context, consent, documents, and settings surface.

Default v1 route and nav label: **`/longevity` with nav label `Longevity`**. Do not use `/dashboard` or `/overview` for the MVP because the architecture docs already reserve Longevity as the named primary surface.

## Summary

Introduce a consumer-facing **Longevity Dashboard** that helps users understand how their weekly habits, training, nutrition, goals, and logged wellness signals are trending over time. The dashboard should feel premium and useful, but it must remain wellness-only: no diagnosis, treatment guidance, biological age, clinical risk score, readiness score, or lab interpretation.

Chat remains the dominant coaching and proposal surface. Longevity is the structured "how am I doing this week?" overview users return to between conversations, built only from authoritative structured state.

## Problem

The product lacks one unified wellness overview:

- **Profile** is account and context oriented. It should not become the main trend dashboard.
- **Metrics** is not a consumer primary surface. Consent/settings belong under Profile, while selected trends can appear in Longevity.
- **Training and Nutrition** are secondary read-only plan views. They show domain detail, not cross-domain wellbeing.
- **Progress** is not yet a unified consumer surface across Today, nutrition, recovery, wellbeing, goals, and documents.

Users need one calm, dense screen that answers: *What patterns mattered this week? Where am I consistent? What should I discuss with my coach?*

## MVP Decisions

| Decision | v1 default |
|----------|------------|
| Route | `/longevity` |
| Primary nav label | `Longevity` |
| Composition strategy | Web-first client composition from existing structured endpoints using TanStack Query where possible |
| Backend changes | Minimal; add backend/BFF only if existing endpoints cannot provide required structured fields safely |
| Hero framing | "Weekly consistency" from visible structured signals, not "longevity score" |
| Hero metric behavior | Show a non-clinical percent/count summary plus 7-day activity/adherence strip; show "not enough data yet" instead of imputing |
| Secondary links | Compact card actions to `/today`, secondary Training, secondary Nutrition, Profile goals/documents, and Chat |
| Coach CTA | Static prompts based on visible gaps; no page-load LLM narrative |
| Document behavior | Metadata/status only, linked to Profile documents; no parsed clinical values or interpretation |
| Metrics behavior | Show consent-gated trends only; hide or placeholder revoked/missing data |
| Mobile scope | Deferred until web v1 is stable |

## In Scope

**Web-first MVP**

1. Authenticated `/longevity` page and primary nav item.
2. Dashboard shell with responsive premium card layout using existing chat-primary visual language and design tokens.
3. Hero module titled around **Weekly consistency**, showing:
   - Current week summary from available structured adherence data.
   - 7-day strip for logged activity/adherence where data exists.
   - Clear partial/empty state when data is sparse.
4. Core cards:
   - Today adherence with link to `/today`.
   - Workout consistency with compact link to the secondary Training weekly plan.
   - Nutrition consistency with compact link to the secondary Nutrition weekly plan.
   - Active goals summary with link to Profile goals/context.
5. Wellness signals panel:
   - Consent-gated steps, sleep duration, and weight trend when available.
   - Self-reported mood, energy, soreness, or fatigue when available.
   - Safe labels such as "logged wellness signals", "sleep trend", and "self-check-ins".
6. Trends section:
   - Reuse existing weekly progress/workout summary where available.
   - Show honest deferred placeholders for domains without enough data.
7. Documents context card:
   - Show document title, upload/parse status, date, and consent status only.
   - Link to Profile documents.
8. Coach CTA:
   - Primary action: "Message your coach about this week" linking to Chat.
   - Static suggested prompts such as "Help me improve consistency this week" or "Review my logged recovery pattern".
9. Loading, error, empty, and partial-data states for every domain card.
10. Focused tests for dashboard composition, safe copy, empty states, and consent-gated rendering.

## Out of Scope

- Clinical longevity scoring, biological age, healthspan risk indices, readiness/recovery scores, traffic-light health status, or normal/abnormal labels.
- Diagnosis, treatment guidance, lab result interpretation, or medical certainty language.
- Replacing Chat as the dominant coaching/proposal surface.
- Mobile/Expo implementation in the first slice.
- New wearable, lab, document, or integration ingestion flows.
- AI-generated dashboard narratives on page load.
- Dashboard-driven plan mutation or proposal application.
- Full document RAG, document summaries, lab values, or clinical flags on the dashboard.
- Replacing Today execution or secondary Training/Nutrition plan views.
- Broad progress-domain expansion beyond what is needed to render v1 safely.

## Safety Rules

| Rule | Requirement |
|------|-------------|
| No clinical scoring | Never surface `readiness_score`, vendor recovery scores, biological age, healthspan risk, or clinical status as product truth |
| Source attribution | Copy uses "Based on your logged..." or "From synced data you shared" |
| Documents | Show title, date, consent status, and parse status only; no diagnostic summaries |
| Labs | Labs appear only as "uploaded context available to coach" when consented; no values, ranges, or interpretations |
| Mental wellbeing | Mood, energy, soreness, fatigue, and stress are self-reported wellness check-ins, not mental health assessments |
| AI context | Dashboard reads structured state; coach AI may use consented summaries only inside Chat |
| Proposals | Dashboard may link to Chat for pending coach work; it does not apply changes |
| Deferred domains | Show "not enough data yet"; never impute, score, or infer risk |

## User Stories

1. As a user, I open Longevity and see a weekly coaching snapshot across Today, training, nutrition, goals, and logged wellness signals.
2. As a user, I see simple 7-day consistency trends without medical scores.
3. As a user with device consent, I see selected synced wellness trends in a consumer-friendly way.
4. As a user without device consent or enough data, I see useful placeholders and next actions instead of broken cards.
5. As a user with uploaded documents, I can see whether document context is available to my coach without seeing clinical interpretation.
6. As a user, I can jump from each card to the authoritative detail surface.
7. As a user, I can message my coach about visible patterns without the dashboard becoming an AI chat surface.

## Acceptance Criteria

- Authenticated web users can open `/longevity`; unauthenticated behavior follows existing app auth routing.
- Primary web navigation includes `Longevity`; Chat remains visually dominant in the overall app shell.
- Dashboard uses structured APIs/state only; chat transcripts are never used as dashboard source data.
- Hero displays **Weekly consistency** using available non-clinical adherence/logging signals and a 7-day strip.
- No card labels the hero or any metric as "longevity score", "health score", "readiness score", "biological age", "risk", "normal", or "abnormal".
- Today, workout, nutrition, and goals cards render with real data when available and partial/empty states when not.
- Card actions route to authoritative surfaces: Today, secondary Training, secondary Nutrition, Profile goals/context, Profile documents, or Chat.
- Wellness signals are hidden or replaced with consent-aware placeholders when consent is missing, revoked, or no data is available.
- Recovery, mood, energy, soreness, fatigue, and stress copy is framed as self-reported wellness check-ins.
- Documents card shows metadata/status only and never exposes parsed clinical values, reference ranges, or interpretations.
- Trends section reuses existing weekly progress where available and labels missing domains as "not enough data yet".
- Static Chat prompts are safe, wellness-oriented, and do not promise diagnosis, treatment, or medical interpretation.
- Dashboard has loading, error, empty, and partial-data states that are covered by focused tests.
- User-visible copy passes a wellness-only safety review.

## Data And API Implications

V1 should prefer client-side composition from existing structured endpoints to avoid inventing a new backend aggregate too early. If the frontend cannot safely compose required values from existing endpoints, add the smallest backend read endpoint rather than duplicating business rules in the UI.

**Structured sources to compose**

| Domain | Dashboard use | v1 handling |
|--------|---------------|-------------|
| Today | Daily adherence, current-week strip, feedback/check-ins | Use existing Today/checklist data where available; empty state otherwise |
| Training | Workout adherence and weekly trend | Link to secondary Training; reuse existing workout/progress summaries |
| Nutrition | Nutrition consistency and weekly plan context | Link to secondary Nutrition; show partial state if adherence is unavailable |
| Goals | Active goals summary | Link to Profile goals/context |
| Progress | Weekly summary and trend observations | Reuse workout-focused summary; label other domains as deferred/not enough data |
| Metrics | Steps, sleep, weight, mood, soreness, fatigue, energy | Consent-gated trends only; filter unsafe readiness/recovery scores |
| Documents | Recent document metadata and consent status | Metadata only; link to Profile documents |
| Proposals/Chat | Coach CTA and optional pending-work link | Link to Chat; no dashboard mutation |

**Backend default**

- Do not require `GET /longevity/overview` for MVP if existing endpoints can support the page.
- If composition becomes duplicated or unsafe, add `GET /longevity/overview?weekStart=` returning a typed `LongevityOverviewResponse` from `@health/types`.
- Any aggregate endpoint must filter out raw `readiness_score`, clinical lab values, reference ranges, diagnosis/treatment language, and document summary content.
- Keep `/metrics` out of primary nav. Consent and raw metric management belong under Profile/settings; Longevity is the consumer trend view.

## AI And Proposal Implications

- Longevity is read-only for structured state.
- The dashboard may link to Chat with a visible prompt template, but it should not generate an LLM narrative during page load.
- Chat may reference dashboard-visible structured aggregates only when the user has appropriate AI context consent.
- Any plan changes suggested from a Longevity conversation must still use typed proposals, user approval, backend validation, and revision-safe updates.

## Implementation Slices

| Slice | Deliverable | Likely owner |
|-------|-------------|--------------|
| L1 - Shell and IA | `/longevity` route, primary nav item, app-shell placement, responsive empty scaffold | Frontend Implementer |
| L2 - Core overview cards | Hero weekly consistency, Today/workout/nutrition/goals cards, compact links | Frontend Implementer |
| L3 - Data composition | TanStack Query composition from existing structured APIs; safe partial states | Frontend Implementer with Backend Implementer support if endpoint gaps appear |
| L4 - Wellness and documents | Consent-gated wellness signals, self-check-in labels, documents metadata card | Frontend Implementer, Backend Implementer if data filtering is needed |
| L5 - Backend aggregate fallback | Optional `LongevityOverviewResponse` and `GET /longevity/overview` only if needed | Backend Implementer |
| L6 - Tests and safety copy | Focused tests for composition, empty states, consent gating, and forbidden terms | Test Writer |
| L7 - Review and runtime verification | Architecture/safety review, then run local stack and smoke test `/longevity` | Implementation Reviewer, App Runner |

Recommended MVP: L1-L4 plus L6-L7. L5 is a fallback, not a default requirement.

## Execution Plan

1. **Frontend Implementer** builds the `/longevity` route, nav entry, layout shell, hero, cards, static prompts, links, and loading/error/empty/partial states.
2. **Frontend Implementer** composes available structured data with TanStack Query and keeps all derived labels non-clinical.
3. **Backend Implementer** only steps in if required fields are unavailable or unsafe to compose in the client; the default task is to add a narrow read model or filter unsafe fields, not a broad new domain.
4. **Test Writer** adds focused coverage for rendering states, consent gating, card links, and forbidden clinical/readiness-score copy.
5. **Implementation Reviewer** checks structured-state usage, safety language, IA fit, backend scope, and test coverage.
6. **App Runner** starts the local stack, opens `/longevity`, verifies navigation and key states, and reports any blocker with the next owner.

## Risks And Open Questions

**Known risks**

- **Score leakage:** Existing recovery/metric schemas may include readiness-style values. UI and any aggregate response must filter these out.
- **Sparse data:** Early users may see many empty cards. Empty states must explain what to log next and link to Today or Chat.
- **Metrics availability:** Device sync may be mobile-first or absent on web. V1 must tolerate missing signals gracefully.
- **Profile overlap:** Profile may already show some coaching/context cards. Keep Profile focused on account, goals, documents, consent, and settings; Longevity owns weekly overview.
- **Overbuilding backend:** A BFF endpoint could be useful later, but v1 should not block on it unless client composition is unsafe or too duplicated.

**Remaining open questions**

1. What exact existing endpoint names and fields are available for Today adherence, nutrition consistency, goals, metrics, documents, and weekly progress in the current branch?
2. What are the final secondary route paths for Training, Nutrition, Profile goals, and Profile documents if they differ from the architecture names?
3. Should the MVP include a pending-proposals indicator on Longevity, or defer that to Chat after the core dashboard is working?

## Status Vs Current Implementation

| Area | Current state | MVP gap |
|------|---------------|---------|
| IA | Architecture docs define Chat, Today, Longevity, Profile as primary surfaces | Add `/longevity` route and nav item |
| Profile | Account/context-oriented surface with some dashboard-like content | Keep as context/settings; avoid moving Profile into dashboard role |
| Progress | Workout-focused weekly summary exists conceptually | Reuse where available; defer broader progress expansion |
| Metrics | Consumer trend placement belongs in Longevity, raw settings under Profile | Add consent-gated trend cards only |
| Today | Daily execution surface | Aggregate weekly adherence/logging into Longevity |
| Documents | Profile-owned consent/document context | Add metadata/status card and Profile link |
| Types/API | No required Longevity read model yet | Prefer client composition; add `LongevityOverviewResponse` only if needed |

**Overall:** The MVP can start with a web-first, mostly frontend implementation that composes existing structured data, adds safe empty states, and keeps backend work narrowly scoped to missing or unsafe read fields.
