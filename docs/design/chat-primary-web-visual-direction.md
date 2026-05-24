# Chat-Primary Web Visual Direction

Visual design specification for the web redesign. Implements the Visual Designer handoff from `docs/product/features/chat-primary-web-redesign.md`. All copy and metrics remain wellness, fitness, tracking, and coaching oriented — no diagnosis, treatment, clinical scoring, or medical certainty language.

## Design Intent

Transform the web app from a developer inspector shell into a focused wellness coaching product:

1. **Chat is the visual anchor** — the header gives Chat the most prominent treatment, making coaching the first action from every route.
2. **Navigation is simplified** — primary web nav is Chat, Today, Longevity, and Profile.
3. **Structured state stays authoritative** — Training and Nutrition remain secondary read-only plan views; Today shows today's execution; Longevity shows weekly overview; Profile absorbs Goals, Documents, Metrics settings, and consent.
4. **Premium but safe** — WHOOP-like density and progress motifs plus ReplicaAI-inspired component polish, all reframed as wellness and fitness coaching only.

## Visual Language

### Tone

- Calm, confident, modern wellness product — not clinical dashboard, not dev tooling.
- High information density where structured data matters (Today, Longevity, secondary plan views); generous whitespace in Chat.
- Dark chrome + light content (default) echoes premium fitness apps without copying medical score UX.
- ReplicaAI-inspired polish should appear as tactile rounded components, soft gradients, precise spacing, clean pill metadata, and low-friction action cards — not as playful mascots or diagnosis-like advice.

### Color System

| Token | Value | Usage |
|-------|-------|-------|
| `--surface-nav-dark` | `#121212` | Optional dark header strip or mobile tab bar background |
| `--surface-nav-hover` | `#1e1e1e` | Dark nav item hover |
| `--surface-nav-active` | `#262626` | Dark nav item active fill |
| `--surface-content` | `#f7f7f5` | Main content canvas |
| `--surface-elevated` | `#ffffff` | Cards, composer, proposal cards |
| `--surface-muted` | `#f0f0ed` | Secondary panels, empty states |
| `--text-primary` | `#0f0f0f` | Headings, body on light surfaces |
| `--text-secondary` | `#5c5c58` | Meta, captions, timestamps |
| `--text-nav-dark` | `#ececea` | Nav labels on dark header/tab surfaces |
| `--text-nav-muted` | `#9a9a96` | Secondary nav labels on dark surfaces |
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
- Header height: `3.5rem` minimum desktop; bottom tab bar optional on mobile.

### Elevation

- Cards: `0 1px 2px rgb(0 0 0 / 4%), 0 4px 16px rgb(0 0 0 / 6%)`.
- Composer (sticky): stronger shadow `0 -4px 24px rgb(0 0 0 / 8%)`.
- Proposal inline cards: left accent bar + light border, no heavy drop shadow (stay in transcript flow).

---

## App Shell

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ AI Health Coach        [ Message your coach ] [avatar]      │
│                         Chat is the dominant header action   │
│ Chat   Today   Longevity   Profile                          │
├─────────────────────────────────────────────────────────────┤
│ MAIN CONTENT AREA                                           │
│ Chat: full-height transcript                                │
│ Other routes: premium card grid on light canvas             │
└─────────────────────────────────────────────────────────────┘
```

- Keep the web shell as a top-header product layout for this pass; do not introduce a desktop sidebar.
- Header hierarchy: brand left, large Chat CTA/composer affordance center or right, user account far right, simplified nav below or as a compact row.
- Chat route: **no page title block** — conversation fills the main pane under the header.
- Structured routes: compact page header (title + one-line subtitle), then content grid.
- Remove developer/admin nav items from primary user nav. Keep dev routes reachable only by direct URL if needed.
- Keep Training and Nutrition out of primary navigation while preserving them as secondary read-only plan views linked from Today, Longevity, and proposal cards.
- Hide Recipes, raw Metrics, Goals, Documents, proposal audit, and developer routes from primary UI and route discovery. Backend recommendation services may continue to exist and feed Nutrition or Chat surfaces when approved by product logic.

### Navigation States

| State | Treatment |
|-------|-----------|
| Default | Muted text on translucent header surface |
| Hover | Light elevated pill, stronger text |
| Active (Chat) | Teal filled pill or prominent coach CTA; must be visually stronger than other nav items |
| Active (other) | Subtle light pill with 1px border |
| Focus | 2px `--accent-coach` outline, offset 2px |

### Responsive

- **≥1024px:** Sticky top header with Chat CTA prominent and simplified nav visible.
- **<1024px:** Header compresses to brand + Chat CTA + account; nav becomes horizontally scrollable or bottom tab bar with 4 items: Chat, Today, Longevity, Profile.
- Touch targets: minimum 44×44px on mobile tabs and proposal actions.

### Metadata

- App title: **AI Health Coach** (drop "Admin" / "Developer shell").
- `aria-label` on nav: "Main navigation" (not "Developer shell").
- Chat CTA label should be action-oriented, for example "Message your coach"; avoid medical urgency language.

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

Shared patterns across Today, Longevity, Profile, and secondary Training/Nutrition plan views:

- **Page header:** Title + subtitle; no phase eyebrows in user-facing copy.
- **Content width:** `max-width: 72rem`, padding `1.5rem`–`2rem`.
- **Section cards:** `.dashboard-section` white elevated cards on `--surface-content`.
- **Empty states:** Icon + headline + coaching CTA ("Ask your coach in Chat to create a goal").
- **Loading:** Skeleton blocks matching card layout.
- **Errors:** Top banner, retry action.

### Today

- Keep Today as the daily execution route for checklist-style adherence, quick feedback, and near-term coaching tasks.
- Visual style should be calm and task-oriented: stacked cards, clear completion controls, and one understated progress summary.
- Avoid making Today compete with Chat; the header Chat CTA remains the dominant global action.

### Training Weekly Plan

- Keep `/training` routeable as a secondary read-only plan view, not a primary navigation item.
- Hero: active plan name + revision badge + weekly consistency/adherence summary.
- Grid: upcoming sessions (left), plan detail (right) on desktop; stack on mobile.
- Add lightweight progress context below the workout plan: weekly completion strip, recent session outcomes, and simple trend cards.
- Session cards: retain status color coding; soften dev-heavy revision list into collapsible "History".
- Hide the standalone Progress nav item. If `/progress` remains available during migration, route or link it into Longevity or Training rather than presenting it as a primary destination.
- User-facing plan structure is read-only; plan changes are requested through Chat proposals.

### Nutrition Weekly Plan

- Keep `/nutrition` routeable as a secondary read-only plan view, not a primary navigation item.
- Mirror Training layout: active plan revision, daily/weekly consistency summary, meal structure cards.
- Wellness framing: "nutrition plan", "meals", "consistency" — not macros-as-prescription language.
- Recipes should not appear as a primary route or standalone catalog. If recipe recommendations are surfaced, they should appear as contextual recommendations inside Nutrition or Chat, with backend recommendations continuing behind the scenes.
- User-facing plan structure is read-only; plan changes are requested through Chat proposals.

### Longevity

- Longevity is the weekly overview primary tab.
- Show weekly consistency, Today adherence, workout and nutrition consistency, goals, recovery/wellbeing trends, consent-aware metric summaries, and static Chat prompts.
- Do not expose clinical scores, diagnosis, treatment, biological age, or vendor readiness scores as product truth.
- Link to secondary Training and Nutrition views for detail; link to Chat for changes.

### Profile

- Profile becomes the home for stable coaching context: profile details, Goals, Documents, Metrics/settings consent, preferences, constraints, and recent coach activity.
- Goals section: show active goals as compact cards with progress cues and "Update with coach" CTA.
- Documents section: show consent-aware document summaries and upload/search entry points only when explicit consent is present.
- Keep Documents out of the primary nav. Preserve safety copy around consent and avoid suggesting diagnosis or treatment from documents.

### UX Audit — Structured Screens

| Severity | Finding |
|----------|---------|
| Warning | "Phase N" eyebrows and developer page titles undermine product feel. |
| Warning | Primary nav is too broad; Goals, Documents, Recipes, Metrics, and Progress create unnecessary top-level complexity. |
| Warning | Proposals audit page in primary nav is admin-oriented. |
| Opportunity | Longevity can carry Progress naturally through weekly consistency, recent sessions, and trend strips. |
| Opportunity | Profile can stay focused on account/context while Longevity owns the premium wellness overview. |

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
- **Documents summary:** Consent-aware card with recent document context, upload/search entry, and a clear wellness-only boundary note.
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
| Warning | Goals and Documents need to move into Profile to reduce top-level navigation complexity. |
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
| `AppShell`, `AppShellHeader`, `AppShellMain` | `.app-shell`, `.app-shell__*` | Top header nav; keep header-first for this pass |
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

### Header shell (P1 — Frontend Implementer)

Current `AppShellHeader` uses a horizontal sticky top bar with `.app-nav--coach` pill nav. Keep that direction, but simplify the nav to Chat, Today, Longevity, and Profile. Chat should remain the most prominent header element through a larger teal CTA, center-positioned composer affordance, or featured nav item. Do not migrate to a left sidebar for this approved web pass.

---

## Current Implementation Gap (audit snapshot)

| Area | CSS / components | Pages / behavior | Gap |
|------|------------------|------------------|-----|
| App shell | `AppShell` + header nav exist | Pages still use legacy `.shell`/`.card` | Migrate all routes to `AppShell` |
| Chat | `ChatBubble`, `.chat-single` CSS | `ChatWorkspace` shows thread sidebar; page has phase copy | Hide threads; adopt `chat-single` |
| Proposals inline | `ProposalConfirmation` | `ProposalCard` shows dev meta in compact mode | Wire confirmation component + domain pills |
| Profile dashboard | `DashboardCard`, `.dashboard-hero` CSS | Profile needs to absorb Goals, Documents, Metrics/settings consent | Build profile context layout |
| Longevity | No implemented primary tab | Weekly overview is scattered across Progress/Profile/Metrics | Add Longevity primary route |
| Training/Nutrition | Routes exist as primary-style destinations | Plans are too prominent and may imply manual editing | Treat as secondary read-only plan views |
| Recipes | Recipes route exists | Recipes are visible in primary nav today | Hide from UI nav while preserving backend recommendations |
| Nav | Chat featured today | Too many top-level links | Simplify to Chat, Today, Longevity, Profile |

---

## Prioritized Implementation Plan

### P0 — Shell, Nav & Chat (Frontend Implementer + UI Polish)

1. Replace `.shell`/`.card` wrapper with `.app-shell` on all product routes.
2. Simplify `AppNav` to Chat, Today, Longevity, Profile.
3. Make Chat the most prominent header action using the existing featured link pattern or a larger "Message your coach" CTA.
4. Drop Progress, Goals, Documents, Recipes, Metrics, Inspector, and Proposals from primary nav.
5. Refactor `ChatWorkspace` to hide thread UI; full-height `.chat-single` layout.
6. Update chat page: remove eyebrow/h1/description block.
7. Map message roles to user-facing labels; remove transcript height cap.

### P0 — Information Architecture (Frontend Implementer)

1. Add Longevity as the weekly overview for consistency, recent outcomes, cross-domain trends, and coach prompts.
2. Keep Training and Nutrition routeable as secondary read-only weekly plan views.
3. Move Goals content into Profile as stable coaching context.
4. Move Documents and Metrics/settings consent into Profile with explicit consent and wellness-only boundary copy.
5. Hide Recipes from navigation and user-facing route discovery; backend recommendation flows continue.
6. Keep any legacy routes stable during migration, but avoid advertising them in the primary UI.

### P0 — Inline Proposals (Frontend Implementer + UI Polish)

1. Add `.proposal-inline` compact variant styling in `ProposalCard`.
2. Replace `intent / targetDomain` with human domain labels.
3. Hide validation badge in compact mode; keep inline validation notice.
4. Add post-accept deep link component (visual only; href from `targetDomain`).

### P1 — Longevity and Profile (Frontend Implementer)

1. New `/longevity` route with dashboard grid, weekly consistency, Today adherence, workout/nutrition consistency, recovery/wellbeing trends, goals, and Chat prompts.
2. Keep `/profile` focused on account identity, onboarding, goals, documents, Metrics/settings consent, preferences, constraints, and settings.
3. Use WHOOP-like dense metric hierarchy on Longevity while avoiding "recovery score", diagnosis, treatment, or medical certainty.

### P1 — Domain Routes (Frontend Implementer)

1. `/training` remains a secondary read-only weekly workout plan route.
2. `/nutrition` remains a secondary read-only weekly nutrition plan route.
3. Treat `/goals`, `/documents`, `/metrics`, `/progress`, and `/recipes` as non-primary routes unless the planner explicitly reopens them.

### P2 — Design System (Design System Agent)

1. Extract `AppShell`, `HeaderChatCTA`, `NavItem`, `MetricCard`, `ProposalInlineCard`, `StatusBadge`, `EmptyState`, `PageHeader`.
2. Align shadcn tokens in `tailwind.config.ts` with CSS variables.
3. Add Lucide icons for nav and proposal domains.
4. Add component tokens for ReplicaAI-inspired polish: rounded cards, subtle gradients, tactile hover/focus states, and compact metadata pills.

### P2 — Polish (UI Polish Implementer)

1. Empty state illustrations/prompt chips on Chat.
2. Composer auto-grow, send icon, transcript bottom fade.
3. Profile hero dark card gradient refinement.
4. Motion: subtle card enter on new proposals.

---

## Handoff Notes

| Role | Action |
|------|--------|
| **Frontend Implementer** | Shell layout, simplified nav, prominent header Chat CTA, chat single-thread UX, Longevity route, secondary read-only Training/Nutrition views, Profile sections for Goals/Documents/Metrics consent, hide Recipes from UI, apply CSS classes from this doc. |
| **Design System Agent** | Promote tokens to shared primitives; define HeaderChatCTA, metric cards, metadata pills, proposal cards, shadcn component setup, icon set. |
| **UI Polish Implementer** | P2 motion, empty states, micro-interactions after P0 structure lands. |
| **Test Writer** | Snapshot/class tests for proposal compact mode labels; no medical terms in user-visible strings. |
| **App Runner** | Verify Chat fills viewport, no thread UI, simplified nav, hidden Recipes UI, proposal accept/reject visual states, Profile dashboard renders. |

### Open Design Decisions (recommend defaults)

1. **Default thread behavior:** Resume most recent thread silently — recommend yes.
2. **Default route:** redirect `/` → `/chat` (Chat primary) with Today, Longevity, and Profile in nav.
3. **Goals placement:** Goals live inside Profile, not as a primary nav item.
4. **Documents placement:** Documents live inside Profile with explicit consent states and wellness-only safety copy.
5. **Recipes visibility:** Hide route links and catalog UI; keep backend recommendations available to Nutrition/Chat proposal flows.
6. **Training/Nutrition visibility:** keep route links available from Today, Longevity, and proposal cards, but not as primary nav items.
