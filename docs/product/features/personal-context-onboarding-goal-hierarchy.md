# Personal Context, Onboarding, and Goal Hierarchy

**Status:** Proposed — builds on Phase 2 (User/Profile/Goals); onboarding flow and goal hierarchy not implemented.

## UX Placement

Onboarding is a first-run web flow that seeds Profile and the goal hierarchy. Profile owns stable personal context, direction, goals, documents, consent, and settings. Today can show goal-linked daily actions, Longevity can summarize goal progress, and Chat can propose profile or goal changes for user approval.

## Summary

Give every user a structured coaching foundation before (and beyond) chat: a guided onboarding flow that captures personal context, a four-level goal hierarchy from long-term longevity direction down to daily actions, and durable coach memory stored as validated structured state. Chat remains the interaction layer; onboarding and hierarchy edits use the same proposal/approval model as the rest of the product.

## Problem

The app has users, profiles, flat goals, and an `onboardingSchema` contract, but no first-run experience and no planning hierarchy. New users land on Profile/Chat with empty state and are told to "ask in Chat" for setup. Goals are a flat list with no link to quarterly focus, weekly priorities, or Today checklist items.

`CoachingContextService` feeds the AI a snapshot of profile, goals, plans, and progress — but not a coherent "why am I coaching this person?" narrative or time-horizon structure. Coach memory does not exist beyond what is already in structured tables.

Without onboarding and hierarchy, proposals for workouts, nutrition, and Today checklists lack anchoring context.

## In Scope (MVP slice)

### 1. Onboarding flow (web-first)

- Multi-step wizard after first auth: display name/timezone → profile basics → longevity direction → primary quarterly objective → optional constraints/preferences.
- Atomic submit via `POST /onboarding` validated against `onboardingSchema`.
- Set `onboardingCompletedAt` on user.
- Redirect incomplete users to onboarding; allow skip/resume for partial progress.

### 2. Personal context (structured coach memory)

- Extend profile with validated fields:
  - `longevityDirection` (short structured statement + optional tags)
  - `coachingNotes` (bounded list of coach-relevant facts, not free chat)
  - Existing `preferences` / `constraints` remain; onboarding seeds them.
- Post-onboarding edits via direct form or `update_profile` proposals.
- Onboarding first-run may write directly without proposal (user-initiated structured capture).

### 3. Goal hierarchy (four levels)

- **Direction** — long-term longevity/wellness north star (1 active per user).
- **Quarterly objective** — 90-day measurable outcome (`horizon: "quarterly"`, dates, typed `target`).
- **Weekly focus** — current week emphasis (`horizon: "weekly"`, `weekStart`, 1–3 active).
- **Daily actions** — Today checklist items with `sourceRef` linking to weekly focus and/or quarterly goal.

### 4. Coaching context enrichment

- Extend `CoachingContextSnapshot` / `toPromptContext` with direction, active quarterly goal, current weekly focus(es), onboarding completeness, summarized personal context.

### 5. Profile / Today UI

- Onboarding wizard (web).
- Profile: show direction + hierarchy summary.
- Today: optional "linked to this week's focus" on checklist items when source ref present.

### 6. Types and proposals

- Extend Zod schemas and proposal payloads for new profile fields and goal hierarchy fields.
- New intents only if needed (e.g. `set_weekly_focus`); prefer extending `update_profile` / `update_goal`.

## Out of Scope

- Chat-as-onboarding (chat may supplement; not the sole setup path).
- Unstructured "memory" scraped from chat without user approval.
- Medical history intake, diagnosis, treatment plans, or clinical risk scoring.
- Automatic hierarchy changes without user approval.
- Full mobile/Expo onboarding parity in first slice.
- Complex multi-quarter roadmaps, OKR dashboards, or social/sharing features.

## Safety and Product Rules

- Structured state is authoritative; chat history is not.
- Onboarding writes structured tables directly (user-initiated); ongoing AI-driven changes use typed proposals + approval.
- Wellness/fitness/coaching language only; no diagnosis or treatment guidance.
- Personal context fields are bounded, validated, and user-visible (no hidden coach memory).
- Constraints from documents/device sync follow existing consent rules.
- At most one active longevity direction; limit active quarterly/weekly items to prevent conflicting coach guidance.

## User Stories

- As a new user, I complete onboarding in a few minutes so my coach has context before I open Chat.
- As a returning user, I see my longevity direction and current quarterly objective on Profile.
- As a user, I understand how this week's focus connects to my longer-term direction.
- As a user, I see daily Today items that reflect my current weekly focus when the coach sets them up.
- As a user, I can update preferences/constraints in Profile or accept an AI proposal that explains the change.
- As the AI coach, I receive a compact hierarchy + personal context snapshot on every turn.

## Acceptance Criteria

1. New authenticated user with incomplete onboarding is routed to onboarding; completed user reaches main app.
2. `POST /onboarding` atomically creates/updates user, profile (incl. direction), and at least one quarterly goal.
3. Profile displays longevity direction, active quarterly goal, and current weekly focus when present.
4. Goals API supports hierarchy fields (`horizon`, `parentGoalId`, `weekStart` where applicable).
5. `CoachingContextService` prompt context includes direction, active quarterly goal, weekly focus, and personal context summary.
6. AI proposals that change profile/goals validate against extended schemas; rejected proposals do not mutate state.
7. Today checklist items may reference `weekly_focus` or `goal` in `sourceRef`.
8. Empty states no longer require Chat as the only path to initial setup.

## Data and API Implications

**Schema (Drizzle migration)**

- `users`: add `onboardingCompletedAt`.
- `user_profiles`: add `longevityDirection`, `coachingNotes`; optionally `onboardingDraft` for resume.
- `goals`: add `horizon` enum (`direction` | `quarterly` | `weekly` | `daily`), `parentGoalId`, `weekStart`.

**API**

- `POST /onboarding` — body: extended `onboardingSchema`; transactional upsert.
- `GET /users/me/state` — returns onboarding status + active hierarchy summary.
- Extend `GET /goals` with query `?horizon=weekly&active=true` or dedicated `GET /coaching/hierarchy`.

**Linkages**

- Today `sourceRef`: extend with `weekly_focus` / `goal`.
- Weekly focus rollover: manual or AI proposal in MVP.

## AI and Proposal Implications

- Add `coachingHierarchy: { direction, quarterly, weeklyFocus[], personalContext }` to `toPromptContext`.
- Existing intents: `update_profile`, `create_goal`, `update_goal` remain primary; extend change payloads.
- New intents if extension is awkward: `set_weekly_focus`, `update_longevity_direction`.
- Onboarding: no AI required for MVP; optional pre-filled quarterly objective user confirms before submit.
- Reject proposals that create conflicting active quarterly goals or multiple directions.

## Implementation Slices

| Slice | Deliverable |
|-------|-------------|
| 1 — Contracts and DB | Zod extensions, migration, hierarchy validation helpers |
| 2 — Onboarding API | POST /onboarding, completion flag, GET /users/me/state |
| 3 — Hierarchy services | Goal parent/horizon rules, quarterly/weekly active queries |
| 4 — Coaching context | Snapshot + prompt enrichment |
| 5 — Web onboarding UI | Wizard, gating, resume draft |
| 6 — Profile hierarchy UI | Direction, quarterly, weekly summary |
| 7 — Today linkage | sourceRef extension + display |
| 8 — Proposals and tests | Extended apply/validate paths, focused tests |

Recommended order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.

## Risks and Open Questions

- Over-modeling `target` JSON on goals without typed quarterly metrics.
- Hierarchy UI complexity on mobile if deferred too long.
- Tension between "Profile edits via Chat only" and onboarding direct-write — needs explicit product rule.

**Open questions:**

1. Should longevity direction live on `user_profiles` or as a special `Goal` row?
2. Onboarding: direct API write only for first-run, or always require proposals?
3. Is weekly focus one item or a set (1–3)?
4. Should incomplete onboarding block Chat or only Profile/Training?
5. Typed quarterly targets vs freeform `target` JSON for MVP?
6. Store onboarding draft server-side vs localStorage?

## Status vs Current Implementation

| Area | Current | Gap |
|------|---------|-----|
| Users / auth | Clerk + users table | No onboardingCompletedAt |
| Profile | user_profiles + CRUD | No longevity direction or coach memory fields |
| Goals | Flat goals + CRUD + proposals | No horizon/level, parent linkage |
| Onboarding | onboardingSchema in types only | No API route, service, UI |
| Coaching context | Flat goals in prompt | No hierarchy rollup or personal context summary |
| Today | create_today_checklist proposals | Items not linked to weekly focus or goals |
| Web UI | Profile + Goals read-only | No onboarding wizard |
