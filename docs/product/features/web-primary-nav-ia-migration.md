# Web Primary Navigation IA Migration

**Status:** Proposed - architecture target exists; current web nav still exposes legacy primary tabs.

## Summary

Migrate the web product shell from the current six primary tabs to the canonical four-surface IA: **Chat, Today, Longevity, Profile**. Training and Nutrition remain routeable secondary plan views. Metrics becomes a settings/support surface under Profile and a data source for Today, Longevity, and AI context.

This is an IA alignment feature, not a rewrite of the underlying domain modules.

## Architecture Sources

- `docs/architecture/overview.md`
- `docs/architecture/product-surface-architecture.md`
- `docs/architecture/foundation-slice.md`
- `docs/product/ux-information-architecture.md`
- `docs/product/feature-roadmap.md`

## Problem

The architecture docs define a deliberately small primary navigation, but the app still presents legacy primary tabs:

- Chat
- Today
- Workouts
- Nutrition
- Metrics
- Profile

This makes Training, Nutrition, and Metrics look like peer product surfaces even though the architecture positions them as secondary views or support surfaces. It also blocks the named Longevity surface from becoming the weekly wellness overview.

## In Scope

- Replace web primary nav with `Chat | Today | Longevity | Profile`.
- Add `/longevity` to primary nav once the Longevity shell exists.
- Remove Workouts/Training, Nutrition, and Metrics from primary nav.
- Preserve secondary routes:
  - `/training`
  - `/nutrition`
  - `/metrics`
  - `/proposals`
  - `/goals`
  - `/documents`
  - `/recipes`
- Add clear entry points to secondary views from Today, Longevity, Chat proposal cards, and Profile.
- Update nav UI state tests to encode canonical IA.
- Keep redirect/alias behavior for legacy routes where useful.
- Ensure Chat remains visually dominant.

## Out of Scope

- Building the full Longevity dashboard content.
- Removing Training, Nutrition, Metrics, Recipes, Goals, Documents, or Proposals routes.
- Changing backend domain models.
- Adding mobile parity; that is covered by `mobile-product-surface-parity.md`.
- Adding plan editors to secondary views.

## Product Rules

- Chat is the dominant coaching conversation and proposal approval surface.
- Today is the daily execution surface.
- Longevity owns weekly trends, consistency, and cross-domain overview.
- Profile owns account, onboarding, goals, documents, consent, device settings, and preferences.
- Training and Nutrition are read-only plan views, not primary product tabs.
- Metrics is not a consumer primary surface.
- Structured state remains authoritative; nav changes must not introduce chat-history-derived state.

## User Stories

- As a user, I can understand the product through four stable primary destinations.
- As a user, I can still inspect my workout and nutrition plans when I need detail.
- As a user, I see metrics as context and settings, not as a standalone analytics product.
- As a user, I can reach plan details from relevant cards and proposal flows.
- As a returning user with old bookmarks, I can still open existing secondary routes.

## Acceptance Criteria

- Primary web nav renders only Chat, Today, Longevity, and Profile.
- `/training`, `/nutrition`, and `/metrics` remain authenticated and routeable.
- Secondary route links exist from appropriate primary surfaces.
- `/metrics` is removed from primary nav and is positioned as Profile/device data management or support diagnostics.
- Nav tests assert the canonical primary labels.
- Existing proposal approval flows continue to link to affected state after accept/reject.
- User-facing copy explains that Training and Nutrition plan changes happen through Chat proposals.
- No manual workout or nutrition plan editor appears as part of the nav migration.

## Data and API Implications

No new database tables are expected. The migration should primarily affect:

- `apps/web/src/lib/nav-ui-state.ts`
- `apps/web/src/lib/nav-ui-state.spec.ts`
- `apps/web/src/components/app-nav.tsx`
- `apps/web/app/*/page.tsx`

Longevity may depend on `LongevityOverviewResponse`, but that belongs to `longevity-dashboard.md`.

## Evidence Paths

- `apps/web/src/lib/nav-ui-state.ts`
- `apps/web/src/lib/nav-ui-state.spec.ts`
- `apps/web/src/components/app-nav.tsx`
- `apps/web/app/chat/page.tsx`
- `apps/web/app/today/page.tsx`
- `apps/web/app/training/page.tsx`
- `apps/web/app/nutrition/page.tsx`
- `apps/web/app/metrics/page.tsx`
- `apps/web/app/profile/page.tsx`
- `docs/product/features/longevity-dashboard.md`

## Implementation Slices

1. **IA state update** - update nav model, labels, featured behavior, and tests.
2. **Longevity shell dependency** - add or link to `/longevity` shell.
3. **Secondary links** - add contextual links from Today, Longevity, Profile, and proposal cards.
4. **Route copy pass** - clarify Training/Nutrition/Metrics roles.
5. **Regression pass** - verify auth, redirects, deep links, and proposal refresh behavior.

## Risks and Open Questions

- Users may rely on Workouts, Nutrition, and Metrics as primary tabs during development.
- Longevity should not enter primary nav as an empty or misleading shell.
- Naming should be consistent: use `Training` for the secondary workout plan route, not mixed `Workouts` terminology.
- Decide whether `/metrics` remains visible under Profile or hidden as a support/developer route.

