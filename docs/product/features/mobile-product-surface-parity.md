# Mobile Product Surface Parity

**Status:** Proposed - Expo shell exists; product surfaces do not yet match the canonical web IA.

## Summary

Bring the mobile app into parity with the canonical product surface hierarchy: **Chat, Today, Longevity, Profile** as primary surfaces, with Training and Nutrition available as secondary read-only plan views. Mobile should support the same structured-state and proposal-approval principles as web, while allowing platform-specific layouts and native device-sync entry points.

## Architecture Sources

- `docs/architecture/overview.md`
- `docs/architecture/product-surface-architecture.md`
- `docs/architecture/auth.md`
- `docs/architecture/foundation-slice.md`
- `docs/product/ux-information-architecture.md`

## Problem

The mobile app has an Expo tab shell, but it does not match the architecture target. Current mobile navigation includes Today, Chat, Training, Nutrition, and Metrics, while Profile and Longevity are missing as primary destinations. Chat and proposal approval are also placeholder-level on mobile, so mobile users cannot complete the same coaching loop as web users.

## In Scope

- Mobile primary tabs: Chat, Today, Longevity, Profile.
- Secondary mobile views for Training and Nutrition.
- Mobile Chat proposal cards with accept/reject parity for supported intents.
- Auth gating for all primary tabs, not only individual feature screens.
- Profile destination for account, context, documents/consent, device/data settings, and preferences.
- Longevity mobile shell and partial-data overview once the web read model exists.
- Platform-aware links to HealthKit / Health Connect setup from Profile or Metrics settings.
- Loading, empty, offline/error, and partial-auth states.

## Out of Scope

- Pixel-perfect duplication of web layouts.
- Native device sync implementation; covered by `device-sync-native-integration.md`.
- Full mobile onboarding parity in this slice unless required for auth/session flow.
- Replacing Expo Router.
- Adding manual plan editors.

## Product Rules

- Mobile IA should express the same product hierarchy as web.
- Chat remains the interaction and approval layer.
- Today remains the execution layer.
- Longevity is the weekly overview.
- Profile owns account, consent, documents, devices, and preferences.
- Training and Nutrition remain secondary read-only plan views.
- Mobile must not apply AI proposals without explicit user approval.

## User Stories

- As a mobile user, I can approve or reject coach proposals without opening web.
- As a mobile user, I can complete Today's actions and see relevant plan detail.
- As a mobile user, I can review my weekly Longevity overview in a mobile-friendly layout.
- As a mobile user, I can manage account and data consent from Profile.
- As a mobile user, I can still inspect Training and Nutrition details from contextual links.

## Acceptance Criteria

- Mobile tab layout exposes Chat, Today, Longevity, and Profile as the primary tabs.
- Training and Nutrition are reachable from Today, Longevity, Chat proposals, or Profile, but not primary tabs.
- Metrics is not a primary mobile tab.
- Chat can render pending proposals and submit accept/reject decisions for supported intents.
- Mobile API calls consistently attach Clerk bearer tokens.
- All primary tabs have authenticated states and sensible unauthenticated handling.
- Device/data consent entry points are visible under Profile or a nested settings route.
- Mobile copy follows the same wellness and no-diagnosis constraints as web.

## Data and API Implications

No mobile-specific backend tables are expected. Mobile should reuse shared contracts from `@health/types` and existing REST endpoints. The largest API dependencies are:

- Proposal decision endpoints.
- Today read and completion endpoints.
- Longevity overview read model.
- Profile/user state endpoints.
- Device connection and health metric consent endpoints.

## Evidence Paths

- `apps/mobile/app/(tabs)/_layout.tsx`
- `apps/mobile/app/(tabs)/index.tsx`
- `apps/mobile/app/(tabs)/chat.tsx`
- `apps/mobile/app/(tabs)/nutrition.tsx`
- `apps/mobile/src/providers.tsx`
- `apps/mobile/src/lib/api.ts`
- `apps/web/src/components/proposals/inline-proposal-card.tsx`
- `apps/api/src/modules/proposals/proposals.controller.ts`
- `packages/types/src/index.ts`
- `docs/product/features/web-primary-nav-ia-migration.md`

## Implementation Slices

1. **Mobile IA shell** - update tabs and route groups to canonical primary surfaces.
2. **Auth parity** - apply consistent authenticated states and token handling.
3. **Proposal parity** - render and decide pending proposals in Chat.
4. **Secondary plan routing** - move Training/Nutrition into contextual secondary routes.
5. **Profile and consent** - expose account/device/document entry points.
6. **Longevity shell** - add mobile overview once the shared read model is available.

## Risks and Open Questions

- Mobile may need different density and progressive disclosure than web.
- Proposal cards must be touch-friendly and avoid accidental acceptance.
- Offline/mobile network states can make proposal decision UX more complex.
- Decide whether mobile Longevity should wait for the web BFF endpoint or compose client-side.

