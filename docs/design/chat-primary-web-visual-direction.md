# Chat-Primary Web Visual Direction

Visual design specification for the web redesign. Implements the Visual Designer handoff from `docs/product/features/chat-primary-web-redesign.md`. All copy and metrics remain wellness, fitness, tracking, and coaching oriented — no diagnosis, treatment, clinical scoring, or medical certainty language.

## Design Intent

Transform the web app from a developer inspector shell into a focused wellness coaching product:

1. **Chat is home** — one dominant conversation surface, ChatGPT-like clarity and calm.
2. **Structured state is visible elsewhere** — Workouts, Goals, Nutrition, and Profile are first-class destinations, not buried in chat.
3. **Proposals are actionable inline** — confirmation cards feel like native chat artifacts, not admin panels.
4. **Profile feels premium** — WHOOP/BioCharge-inspired information density and hierarchy, reframed as wellness context only.

## Visual Language

### Tone

- Calm, confident, modern wellness product — not clinical dashboard, not dev tooling.
- High information density where structured data matters (Profile, Workouts); generous whitespace in Chat.
- Dark chrome + light content (default) echoes premium fitness apps without copying medical score UX.

### Color System

| Token | Value | Usage |
|-------|-------|-------|
| `--surface-sidebar` | `#121212` | App shell sidebar, mobile tab bar background |
| `--surface-sidebar-hover` | `#1e1e1e` | Nav item hover |
| `--surface-sidebar-active` | `#262626` | Active nav item fill |
| `--surface-content` | `#f7f7f5` | Main content canvas |
| `--surface-elevated` | `#ffffff` | Cards, composer, proposal cards |
| `--surface-muted` | `#f0f0ed` | Secondary panels, empty states |
| `--text-primary` | `#0f0f0f` | Headings, body on light surfaces |
| `--text-secondary` | `#5c5c58` | Meta, captions, timestamps |
| `--text-sidebar` | `#ececea` | Nav labels on dark sidebar |
| `--text-sidebar-muted` | `#9a9a96` | Sidebar section labels |
| `--accent-coach` | `#0d9488` | Primary actions, Chat emphasis, links |
| `--accent-coach-hover` | `#0f766e` | Primary hover |
| `--accent-coach-subtle` | `#ccfbf1` | Active nav accent tint, success-adjacent highlights |
| `--status-pending` | `#d97706` / `#fef3c7` | Pending proposals |
| `--status-success` | `#15803d` / `#dcfce7` | Accepted, completed |
| `--status-danger` | `#b91c1c` / `#fee2e2` | Rejected, errors |
| `--border-subtle` | `#e5e5e0` | Card borders |
| `--border-strong` | `#d4d4ce` | Inputs, dividers |

Accent is teal (coach/wellness), not clinical blue. Reserve blue tints only for informational callouts if needed.

### Typography

- **Font stack:** `Inter`, system-ui, sans-serif (existing).
- **Page title (structured screens):** 1.5rem / 600 / tight tracking.
- **Chat transcript:** 0.9375rem / 1.6 line-height — readable long-form coaching text.
- **Section labels:** 0.6875rem / 700 / 0.08em letter-spacing / uppercase — use sparingly.
- **Metric hero (Profile):** 2.5–3rem / 600 tabular nums for primary wellness numbers.
- **Meta / timestamps:** 0.8125rem / `--text-secondary`.

### Spacing & Radii

- Base unit: 4px.
- Card padding: 1rem (compact), 1.25rem (default), 1.5rem (dashboard hero).
- Card radius: `1rem` (16px); composer and pills: `1.25rem`–`9999px`.
- Chat column max-width: `48rem` (768px), centered.
- Sidebar width: `15rem` (240px) desktop; bottom tab bar mobile.

### Elevation

- Cards: `0 1px 2px rgb(0 0 0 / 4%), 0 4px 16px rgb(0 0 0 / 6%)`.
- Composer (sticky): stronger shadow `0 -4px 24px rgb(0 0 0 / 8%)`.
- Proposal inline cards: left accent bar + light border, no heavy drop shadow (stay in transcript flow).

---

## App Shell

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] AI Health Coach                                      │
│ ─────────────────                                           │
│ ● Chat          ← primary, accent indicator                 │
│   Workouts                                                  │
│   Goals                                                     │
│   Nutrition                                                 │
│   Profile                                                   │
│ ─────────────────                                           │
│ [Account / Clerk]                                           │
├─────────────────────────────────────────────────────────────┤
│                    MAIN CONTENT AREA                        │
│              (full height, scrollable)                      │
└─────────────────────────────────────────────────────────────┘
```

- Replace centered `.shell` + `.card` wrapper for product routes with `.app-shell` full-viewport layout.
- Chat route: **no page title block** — conversation fills the main pane.
- Structured routes (Workouts, Goals, Nutrition, Profile): compact page header (title + one-line subtitle), then content grid.
- Remove developer nav items (Inspector, Proposals audit) from primary user nav; keep audit routes reachable only if needed for dev (out of primary shell).

### Navigation States

| State | Treatment |
|-------|-----------|
| Default | `--text-sidebar-muted`, no fill |
| Hover | `--surface-sidebar-hover`, `--text-sidebar` |
| Active (Chat) | `--surface-sidebar-active`, `--accent-coach-subtle` left border 3px, `--text-sidebar` |
| Active (other) | `--surface-sidebar-active`, subtle left border `--border-subtle` |
| Focus | 2px `--accent-coach` outline, offset 2px |

### Responsive

- **≥1024px:** Fixed left sidebar, content scrolls independently.
- **&lt;1024px:** Sidebar becomes bottom tab bar (5 items: Chat, Workouts, Goals, Nutrition, Profile). Chat remains first/left-most tab.
- Touch targets: minimum 44×44px on mobile tabs and proposal actions.

### Metadata

- App title: **AI Health Coach** (drop "Admin" / "Developer shell").
- `aria-label` on nav: "Main navigation" (not "Developer shell").

---

## Chat — Single Conversation Surface

### Layout (ChatGPT-like)

- Full-height main pane: `display: flex; flex-direction: column; min-height: 100dvh` minus shell chrome.
- **No visible thread list, thread picker, or "New thread" in primary UI.** Backend may persist threads; UI auto-resumes default/most-recent thread invisibly (Frontend Implementer).
- Transcript: flex-grow, scrollable, centered column `max-width: 48rem`, horizontal padding `1rem`–`1.5rem`.
- Composer: sticky bottom, same max-width, elevated surface with top shadow.

### Message Hierarchy

| Role | Visual treatment |
|------|------------------|
| User | Right-aligned bubble optional; prefer full-width row with subtle `--surface-muted` bubble, rounded `1rem`, no role label visible to user |
| Assistant | Full-width, no bubble or very light border; **hide raw "assistant" role label** — use "Coach" or no label |
| Timestamp | Collapsed meta; show on hover/focus or group hover for accessibility |
| Empty state | Centered illustration placeholder + "Start a conversation with your coach" + suggested prompts as subtle chips |
| Loading | Typing indicator or skeleton lines at bottom of transcript |
| Error | Inline banner above composer, `--status-danger` subtle background |

### Composer

- Single-line expanding textarea (max ~4 rows), placeholder: "Message your coach…"
- Send button: icon or "Send", `--accent-coach`, disabled when empty or sending.
- Remove phase eyebrow and page `<h1>` from chat route — the conversation is the page.

### UX Audit — Chat

| Severity | Finding |
|----------|---------|
| Critical | Visible thread sidebar violates single-chat product requirement; exposes dev-oriented thread IDs. |
| Critical | Raw `message.role` labels ("user", "assistant") read as debug output. |
| Warning | Transcript `max-height: 32rem` caps conversation — should fill available viewport. |
| Warning | Page wrapped in `.card` creates unnecessary inset; reduces ChatGPT-like immersion. |
| Warning | Empty state is plain text; missed opportunity for coaching-oriented prompts. |
| Opportunity | Suggested prompt chips on empty state ("Review my workout week", "Adjust my goals"). |
| Opportunity | Subtle fade mask at transcript bottom above composer. |

---

## Inline Proposal Confirmation Cards

### Purpose

Cards sit **inside** the assistant message flow as structured decision points. They must be scannable, concise, and clearly separate from free-form coach text.

### Anatomy

```
┌─ accent bar ────────────────────────────────────────────────┐
│ [Domain pill]  Proposal title                          [Status] │
│ One-line reason in plain language                               │
│ ─────────────────────────────────────────────────────────────  │
│ [ Accept change ]  [ Decline ]          View on Workouts →      │
└─────────────────────────────────────────────────────────────────┘
```

### Hierarchy

1. **Domain pill** — Workout / Goal / Nutrition / Profile (human labels, not `targetDomain` snake_case).
2. **Title** — `proposal.title`, 0.9375rem semibold.
3. **Reason** — `proposal.reason`, secondary color, max 2 lines in compact mode.
4. **Status badge** — pending / accepted / rejected; hide `validationStatus` from user-facing compact view (dev detail only).
5. **Actions** — Accept (primary teal), Decline (ghost/outline). Disabled Accept shows tooltip/hint for validation blockers.
6. **Post-decision** — Accepted: success strip + deep link to affected screen ("View updated plan →"). Rejected: muted card, no actions.

### States

| State | Visual |
|-------|--------|
| Pending + valid | White card, amber left bar, active buttons |
| Pending + invalid | Muted actions, inline notice with validation summary (non-alarming) |
| Accepting / rejecting | Button loading, `aria-busy` on card |
| Accepted | Green left bar, success badge, link to domain screen |
| Rejected | Gray left bar, no actions |
| Failed decision | Error text below actions |

### UX Audit — Proposals

| Severity | Finding |
|----------|---------|
| Warning | Compact cards still show `intent / targetDomain` — reads as API debug strings. |
| Warning | Dual badges (`status` + `validationStatus`) add noise in chat context. |
| Warning | No post-accept navigation affordance to structured screen. |
| Opportunity | Collapse JSON `proposedChanges` entirely in chat; never show raw JSON inline. |
| Opportunity | Left accent color keyed to domain (workout=teal, goal=amber, nutrition=green, profile=slate). |

---

## Structured Domain Screens

Shared patterns across Workouts, Goals, Nutrition, Profile:

- **Page header:** Title + subtitle; no phase eyebrows in user-facing copy.
- **Content width:** `max-width: 72rem`, padding `1.5rem`–`2rem`.
- **Section cards:** `.dashboard-section` white elevated cards on `--surface-content`.
- **Empty states:** Icon + headline + coaching CTA ("Ask your coach in Chat to create a goal").
- **Loading:** Skeleton blocks matching card layout.
- **Errors:** Top banner, retry action.

### Workouts (Training route)

- Rename user-facing label **Workouts** (route may stay `/training` initially).
- Hero: active plan name + revision badge + week adherence summary.
- Grid: upcoming sessions (left), plan detail (right) on desktop; stack on mobile.
- Session cards: retain status color coding; soften dev-heavy revision list into collapsible "History".

### Goals

- Dedicated route `/goals` (or section within Profile with nav item — prefer dedicated route per feature brief).
- List cards: goal title, type, priority, progress indicator if available.
- Empty: "No goals yet" + link to Chat.

### Nutrition

- Dedicated route `/nutrition`.
- Mirror Workouts layout: active plan revision, daily/weekly consistency summary, meal structure cards.
- Wellness framing: "nutrition plan", "meals", "consistency" — not macros-as-prescription language.

### UX Audit — Structured Screens

| Severity | Finding |
|----------|---------|
| Warning | "Phase N" eyebrows and developer page titles undermine product feel. |
| Warning | Home `/` is inspector layout, not Profile dashboard. |
| Warning | Proposals audit page in primary nav is admin-oriented. |
| Opportunity | Unify Training page header and card styles with new dashboard tokens. |

---

## Profile Dashboard (WHOOP / BioCharge Inspired, Wellness Only)

### Inspiration (patterns only — do not copy medical scoring UX)

- **WHOOP:** Dark metric cards, large circular progress motifs, trend strips, today-vs-baseline copy.
- **BioCharge:** Card grid density, soft gradients on hero metrics, contextual coaching snippets.

### Wellness-Safe Adaptation

Use coaching and habit language:

| Avoid | Use instead |
|-------|-------------|
| Recovery score | Weekly consistency |
| Strain | Training load balance |
| HRV readiness | Coaching focus / Energy rhythm (optional, non-clinical) |
| Diagnosis / treatment | Goals, habits, plan adherence |
| Medical certainty | "Based on your logged activity" / "Your coach suggests" |

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Profile                                    [Edit in Chat →] │
│  Good morning, {name} — here's your coaching snapshot        │
├────────────────────────────┬─────────────────────────────────┤
│  HERO METRIC CARD          │  GOALS SUMMARY                  │
│  (large ring or %):        │  Top 2–3 active goals           │
│  Weekly consistency        │  progress bars                  │
│  subtitle + 7-day strip    │                                 │
├──────────────┬─────────────┴──────────────┬─────────────────┤
│ Workout      │ Nutrition                   │ Recent coach    │
│ adherence    │ consistency                 │ activity        │
│ this week    │ this week                   │ (proposals)     │
└──────────────┴─────────────────────────────┴─────────────────┘
│  Profile details (activity level, preferences, constraints)  │
└──────────────────────────────────────────────────────────────┘
```

### Hero Metric Card

- Large circular progress ring (CSS conic-gradient or SVG) showing **weekly consistency** — composite of logged workouts + goal check-ins if available; fallback to simple "sessions completed / planned" ratio.
- Subtitle: "Based on your logged workouts and goals" — not physiological claims.
- 7-day micro bar strip below ring for daily activity presence (boolean or count, not medical).

### Secondary Cards

- **Goals summary:** Up to 3 active goals with status chips.
- **Workout adherence:** Sessions completed vs planned this week.
- **Nutrition consistency:** Days with logged plan adherence if data exists; otherwise placeholder.
- **Recent coach activity:** Last 2–3 proposal outcomes (accepted/rejected) with links.

### Visual Treatment

- Profile may use **dark hero card** (`#1a1a1a` bg, light text) for premium contrast while rest of page stays light — single dark anchor, not full dark mode.
- Metric numbers: tabular nums, high contrast.
- Sparkline/trend bars: `--accent-coach` fill, muted track.

### UX Audit — Profile

| Severity | Finding |
|----------|---------|
| Critical | Current home page is read-only dl/grid inspector — not a coaching dashboard. |
| Warning | No workout/nutrition summary on profile. |
| Warning | No visual hierarchy or progress motifs. |
| Opportunity | Time-of-day greeting adds warmth without medical claims. |

---

## Interaction & Accessibility

- All interactive elements: visible `:focus-visible` ring (`--accent-coach`, 2px, offset 2px).
- Proposal cards: `aria-live="polite"` region for status changes after accept/reject.
- Chat transcript: `aria-live="polite"` on new messages; avoid aggressive assertive live regions.
- Color is not sole status indicator — pair with text labels and icons.
- Contrast: WCAG AA minimum for text; verify teal on white for buttons.
- Reduced motion: disable ring/spinner animations via `prefers-reduced-motion`.

---

## CSS Foundation (Applied)

Foundational tokens and layout classes live in `apps/web/app/styles.css`. Existing Design System primitives in `apps/web/src/components/ui/` map to these classes:

| Component | CSS classes | Notes |
|-----------|-------------|-------|
| `AppShell`, `AppShellHeader`, `AppShellMain` | `.app-shell`, `.app-shell__*` | Top header nav today; sidebar variant documented below |
| `PageHeader`, `PageContent` | `.page-header`, `.page-content` | Structured screens only — omit on Chat |
| `ChatBubble`, `ChatTranscript`, `ChatComposer` | `.chat-bubble*`, `.chat-transcript`, `.chat-composer` | Wrap in `.chat-single` for full-height layout |
| `ProposalConfirmation` | `.confirmation-card`, `.confirmation-card--inline` | Use domain pills + coach accept button |
| `DashboardCard`, `DashboardGrid` | `.dashboard-card`, `.dashboard-grid--profile` | Pair with `.dashboard-hero` for Profile |
| `EmptyState`, `LoadingState`, `ErrorState` | `.state-message--*` | Chat empty + domain loading |

### Token naming (existing)

Use `--color-coach-*` for wellness primary actions; keep `--color-brand-*` for legacy until migration completes. Profile hero uses `--color-surface-hero-dark`.

### Classes added by Visual Designer pass

- `.chat-single` — full-viewport chat column, removes transcript height cap
- `.chat-empty-state`, `.chat-prompt-chips`, `.chat-prompt-chip`
- `.confirmation-card--inline`, `.proposal-domain-pill--*`, `.confirmation-card__success`, `.confirmation-card__link`
- `.dashboard-hero`, `.dashboard-hero__*`, `.metric-ring`, `.trend-strip`, `.dashboard-greeting`, `.dashboard-section`
- `.button-coach` — teal primary for accept/send in coaching context

### Sidebar shell (P1 — Frontend Implementer)

Current `AppShellHeader` uses a horizontal sticky top bar with `.app-nav--coach` pill nav. Visual direction recommends migrating to a left dark sidebar (`.app-sidebar` pattern documented in wellness reference) on desktop with bottom tab bar on mobile. Until migrated, keep Chat as `.app-nav__link--featured` first item.

---

## Current Implementation Gap (audit snapshot)

| Area | CSS / components | Pages / behavior | Gap |
|------|------------------|------------------|-----|
| App shell | `AppShell` + header nav exist | Pages still use legacy `.shell`/`.card` | Migrate all routes to `AppShell` |
| Chat | `ChatBubble`, `.chat-single` CSS | `ChatWorkspace` shows thread sidebar; page has phase copy | Hide threads; adopt `chat-single` |
| Proposals inline | `ProposalConfirmation` | `ProposalCard` shows dev meta in compact mode | Wire confirmation component + domain pills |
| Profile dashboard | `DashboardCard`, `.dashboard-hero` CSS | Home is inspector dl/grid | Build profile dashboard layout |
| Goals / Nutrition | Shared page patterns documented | Routes not created | Add `/goals`, `/nutrition` |
| Nav | Chat featured, Workouts, Profile | Goals, Nutrition missing; Proposals still in nav | Extend nav per plan |

---

## Prioritized Implementation Plan

### P0 — Shell & Chat (Frontend Implementer + UI Polish)

1. Replace `.shell`/`.card` wrapper with `.app-shell` on all product routes.
2. Rebuild `AppNav` as dark sidebar / mobile tab bar; Chat first; drop Inspector/Proposals from primary nav.
3. Refactor `ChatWorkspace` to hide thread UI; full-height `.chat-single` layout.
4. Update chat page: remove eyebrow/h1/description block.
5. Map message roles to user-facing labels; remove transcript height cap.

### P0 — Inline Proposals (Frontend Implementer + UI Polish)

1. Add `.proposal-inline` compact variant styling in `ProposalCard`.
2. Replace `intent / targetDomain` with human domain labels.
3. Hide validation badge in compact mode; keep inline validation notice.
4. Add post-accept deep link component (visual only; href from `targetDomain`).

### P1 — Profile Dashboard (Frontend Implementer)

1. New `/profile` route (or repurpose `/`) with dashboard grid.
2. Hero weekly consistency card with ring + trend strip.
3. Secondary cards: goals, workouts, nutrition, recent proposals.
4. Profile details section at bottom.

### P1 — Domain Routes (Frontend Implementer)

1. `/goals` and `/nutrition` routes with shared page header pattern.
2. Rename Training nav label to Workouts; restyle with dashboard tokens.

### P2 — Design System (Design System Agent)

1. Extract `AppShell`, `NavItem`, `MetricCard`, `ProposalInlineCard`, `StatusBadge`, `EmptyState`, `PageHeader`.
2. Align shadcn tokens in `tailwind.config.ts` with CSS variables.
3. Add Lucide icons for nav and proposal domains.

### P2 — Polish (UI Polish Implementer)

1. Empty state illustrations/prompt chips on Chat.
2. Composer auto-grow, send icon, transcript bottom fade.
3. Profile hero dark card gradient refinement.
4. Motion: subtle card enter on new proposals.

---

## Handoff Notes

| Role | Action |
|------|--------|
| **Frontend Implementer** | Shell layout, nav restructure, chat single-thread UX, route pages, apply CSS classes from this doc. |
| **Design System Agent** | Promote tokens to shared primitives; shadcn component setup; icon set. |
| **UI Polish Implementer** | P2 motion, empty states, micro-interactions after P0 structure lands. |
| **Test Writer** | Snapshot/class tests for proposal compact mode labels; no medical terms in user-visible strings. |
| **App Runner** | Verify Chat fills viewport, no thread UI, proposal accept/reject visual states, Profile dashboard renders. |

### Open Design Decisions (recommend defaults)

1. **Default thread behavior:** Resume most recent thread silently — recommend yes.
2. **Profile route:** `/profile` as home dashboard; redirect `/` → `/chat` or `/profile` — recommend `/` → `/chat` (Chat primary) with Profile in nav.
3. **Goals placement:** Dedicated `/goals` nav item — recommend yes for parity with other domains.
