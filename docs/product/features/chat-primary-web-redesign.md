# Web-First Whoop-Inspired Redesign

## Summary

This feature redesigns the web app as the primary product surface with a Whoop-like, high-contrast, metric-forward visual system and polished ReplicaAI-inspired components. Chat becomes the most prominent item in the header and the main coaching entry point, while structured state remains authoritative for plans, goals, metrics, profile, and progress.

The navigation is simplified for web only: Workouts and Progress are merged into one training/progress surface; Goals and Documents move into Profile; Profile becomes the unified authenticated user/account area. Recipes are removed from the user-facing UI for this pass, but the backend may automatically source recipe candidates from a free, open, no-key API such as TheMealDB for nutrition planning and recommendation support.

## Problem Statement

The current web experience is functionally useful but still feels like a developer/admin surface. Users need a clearer premium coaching loop: start from Chat, see key wellness and training signals in a bold dashboard language, and move through a smaller set of structured screens that reflect authoritative backend state instead of duplicating or scattering product areas.

Nutrition recipe support is also too prominent for the current MVP navigation. Recipes should help the system behind the scenes, but they should not become a visible product surface until the core web coaching, profile, workout, nutrition, and progress loops are stronger.

## Scope

- Web-only redesign; Expo/mobile is intentionally skipped for this pass.
- High-contrast, metric-forward visual direction inspired by Whoop, with polished component treatment inspired by ReplicaAI.
- Header/navigation where Chat is the most prominent destination.
- ChatGPT-like chat screen with a single dominant conversation area.
- No visible thread list, thread picker, or thread-management UI in the primary web chat experience.
- Inline proposal confirmation cards inside chat for accept/reject decisions.
- Separate web surfaces for Chat, Workouts/Progress, Nutrition, and Profile.
- Merge Workouts and Progress into one combined structured surface.
- Move Goals into Profile while keeping goals as structured state.
- Move Documents into Profile/account area behind explicit consent boundaries.
- Make Profile a working unified authenticated user/account area for profile details, account identity, goals, document consent/upload entry points, and relevant settings.
- Hide Recipes from the user-facing navigation and primary UI.
- Backend recipe sourcing that can fetch from a free, open, no-key recipe API such as TheMealDB without sending private health data, documents, raw profile data, or private prompts to the external service.
- Minimal API changes only where needed to refresh background structured state after proposals are accepted.
- Clear loading, empty, pending, accepted, rejected, and failed states for chat proposals and structured-state refresh.

## Out Of Scope

- Expo/mobile redesign.
- Visible multi-thread chat management in the primary user experience.
- A standalone Recipes page, tab, or visible recipe browser.
- Sending private health data, uploaded documents, raw profile data, or raw AI prompts to external recipe APIs.
- Paid, key-based, or private recipe providers for this pass.
- Making chat messages the source of truth for workouts, goals, nutrition, profile, metrics, or progress.
- Direct AI mutation of domain tables.
- Diagnosis, treatment recommendations, medical triage, medical certainty, or clinical risk scoring.
- Wearable integrations, document RAG, advanced analytics, or production AI prompt experimentation.
- Large backend rewrites beyond the minimal API support needed for state refresh and proposal-driven UI consistency.

## Product Rules

- Chat is the interaction layer, not the source of truth.
- Chat must be the most prominent header item, but structured screens remain the source of truth.
- Workouts/Progress, Nutrition, Goals, Documents, and Profile account areas read from structured state.
- AI proposals require explicit user approval before any structured state changes.
- Pending and rejected proposals must not mutate structured state.
- Accepted proposals are revalidated by backend services before application.
- Workout and nutrition changes must create auditable revisions instead of overwriting plan state.
- Proposal decisions and applied references remain auditable.
- User-facing language stays in wellness, fitness, tracking, and coaching territory.
- The Profile dashboard may present wellness context, goals, account data, documents, consent state, and trends, but must avoid diagnosis, treatment, or medical certainty language.
- Documents require explicit consent before upload, parsing, or use as coaching context.
- Recipe backend sourcing must use non-sensitive query inputs only, such as public ingredient names, meal categories, cuisine tags, or nutrition-plan-safe preferences that do not reveal private health context.
- External recipe responses must be normalized and validated before becoming structured recipe data or recommendation candidates.

## User Stories

- As an authenticated web user, I can open Chat and immediately see one large focused coaching conversation.
- As an authenticated web user, I see Chat as the primary header destination.
- As an authenticated web user, I do not need to choose or manage visible chat threads before messaging the coach.
- As an authenticated web user, I can receive an AI-proposed structured change inline in chat.
- As an authenticated web user, I can accept or reject an inline proposal before it changes my structured state.
- As an authenticated web user, I can navigate to a combined Workouts/Progress area instead of separate workout and progress destinations.
- As an authenticated web user, I can manage Goals from Profile while goals remain structured state.
- As an authenticated web user, I can access account/profile information and document consent/upload entry points from one unified Profile area.
- As an authenticated web user, I do not see Recipes as a primary navigation item or standalone screen in this pass.
- As an authenticated web user, I can see the accepted proposal reflected on the relevant structured screen after backend validation.
- As an authenticated web user, I can view a modern Profile dashboard with wellness-oriented coaching context, account identity, goals, consent state, and progress cues.
- As a nutrition user, I can receive recipe-informed nutrition support without manually browsing a recipe catalog.
- As a developer, I can verify that proposal acceptance triggers the minimum structured-state refresh needed by the web UI.
- As a developer, I can verify that recipe API calls do not send private health data, documents, raw profile data, or raw prompts to external providers.

## Acceptance Criteria

- The web app ships the redesign for web only; mobile/Expo routes are unchanged except for shared package changes that are strictly necessary.
- The header makes Chat the most prominent destination by placement, visual weight, or both.
- The web Chat route presents a single large chat surface as the primary coaching experience.
- The primary Chat route does not show a visible thread list, thread switcher, or thread-management controls.
- The app may keep backend thread persistence internally, but the user-facing chat experience behaves like one default coaching conversation.
- Pending proposal confirmations render inline in the chat transcript with clear accept and reject actions.
- Accepting a proposal calls the backend proposal decision flow and waits for validated application before showing applied structured-state feedback.
- Rejecting a proposal records the decision and leaves structured state unchanged.
- Accepted workout and nutrition proposal changes create new revisions.
- Workouts and Progress are presented as one combined web destination with training plan, completion, trend, and progress context.
- Goals are removed as a standalone primary navigation destination and are manageable from Profile.
- Documents are removed as a standalone primary navigation destination and are accessible only from Profile/account with explicit consent language.
- Profile is a working unified authenticated user/account area that includes account identity, profile context, goals, document consent/upload entry points, and relevant settings.
- Recipes are hidden from the primary navigation and user-facing page structure for this pass.
- The backend can automatically fetch recipe candidates from a free, open, no-key API such as TheMealDB.
- External recipe API requests do not include private health data, uploaded document contents, raw user profile data, or raw AI prompts.
- Recipe responses are normalized into owned structured recipe fields before use by nutrition planning or recommendations.
- The redesigned surfaces use a Whoop-like high-contrast, metric-forward visual direction with polished ReplicaAI-inspired components while preserving accessible contrast and keyboard focus states.
- Background structured-state refresh after proposal acceptance is minimal and targeted to affected domains where practical.
- Empty, loading, error, proposal pending, proposal accepted, and proposal rejected states are visible and understandable.
- The UI copy avoids diagnosis, treatment advice, medical certainty, and clinical score framing.
- Focused validation covers proposal UI state, proposal decision behavior, structured-state refresh behavior, navigation consolidation, Profile/account access, hidden recipe UI, recipe sourcing privacy boundaries, and no-op behavior for rejected proposals.

## Initial Implementation Plan

1. Confirm current web routing and data-fetching boundaries for Chat, Workouts, Progress, Goals, Nutrition, Documents, Recipes, and Profile.
2. Redesign web navigation so Chat is visually primary, Recipes are hidden, Workouts/Progress are merged, and Goals/Documents are nested under Profile.
3. Refactor the Chat route into a single large conversation workspace without visible thread management.
4. Move proposal review into inline chat cards that use the existing proposal decision APIs.
5. Add or refine targeted structured-state invalidation/refetch behavior after accepted proposals.
6. Build the combined Workouts/Progress surface using workout plan, session completion, adherence, and trend data where available.
7. Build Profile as the unified authenticated user/account area with profile context, account identity, goals, document consent/upload entry points, and settings.
8. Add a backend recipe sourcing adapter for TheMealDB or equivalent open no-key API, with strict query shaping so no private health data, documents, raw profile, or raw prompt content leaves the system.
9. Normalize external recipe responses into owned recipe structures suitable for nutrition planning/recommendation logic.
10. Apply the Whoop-like high-contrast metric visual direction and ReplicaAI-inspired component polish through reusable styles or components instead of one-off page styling.
11. Add focused tests for proposal UI state, refresh decisions, navigation consolidation, Profile/account behavior, recipe sourcing privacy boundaries, and safety-sensitive copy boundaries.
12. Run web/API validation and smoke-test the chat-to-proposal-to-structured-screen flow plus hidden recipe sourcing behavior.

## Risks And Assumptions

- The request changes MVP emphasis from mobile-first to web-first for this redesign; the trade-off is that Expo/mobile polish remains deferred.
- Hiding visible thread management should not require removing backend thread persistence; preserving persistence keeps auditability and future continuity.
- Whoop inspiration can drift into health, readiness, or recovery scoring that sounds clinical; keep the dashboard framed as wellness context, habits, goals, training, nutrition, and coaching progress.
- ReplicaAI inspiration should guide polish, component quality, spacing, motion, and surface treatment without copying protected brand assets.
- Inline proposals can become too dense inside chat; cards should be concise and link to relevant structured screens after acceptance.
- State refresh should not become a broad API rewrite; use targeted invalidation/refetch unless a narrow endpoint is clearly simpler.
- Existing local verification may depend on Clerk, Postgres, and seeded or proposal-created state.
- TheMealDB has limited nutrition/macros coverage; downstream code may need to treat sourced recipes as candidates requiring internal enrichment, estimation, or filtering before nutrition use.
- Hidden recipe sourcing must not become an implicit external health-data integration; recipe lookup inputs should stay generic and non-sensitive.
- Moving Documents into Profile may imply UI entry points before full document processing exists; use consent-aware placeholders if backend document upload/parse support is not ready.

## Open Questions

- Should the single visible chat always map to one default thread per user, or should it resume the most recent thread while hiding thread controls?
- Which Profile dashboard cards are required for the first pass: account identity, profile summary, goals, document consent status, workout adherence, nutrition adherence, recent proposal activity, or all of these?
- Which accepted proposal domains must trigger immediate cross-screen refresh in the first pass: workouts, nutrition, goals, profile, or all supported domains?
- Should the combined Workouts/Progress route be named "Workouts", "Training", or "Progress" in the header?
- Should backend recipe sourcing happen on demand during nutrition recommendation generation, via scheduled cache refresh, or both?
- What minimum recipe fields are required before a sourced recipe is eligible for nutrition recommendations if the provider lacks complete macro data?

## Role Handoff Notes

- Visual Designer: Define the web-only Whoop-like high-contrast, metric-forward direction; header hierarchy with Chat dominant; combined Workouts/Progress presentation; and Profile/account dashboard treatment while keeping all language wellness-only.
- Design System Agent: Extract reusable navigation, metric cards, dark panels, badges, proposal status cards, empty states, loading states, consent callouts, and dashboard primitives with accessible contrast, focus states, and responsive behavior.
- Frontend Implementer: Build the web routes and UI states, hide visible chat thread controls and recipe UI, merge Workouts/Progress, move Goals/Documents into Profile, wire inline proposal decisions, and add targeted structured-state refresh after accepted proposals.
- Backend Implementer: Keep API changes minimal; support any needed default-thread/resume behavior and affected-domain refresh metadata; add a TheMealDB-compatible recipe sourcing adapter that sends only non-sensitive lookup terms and normalizes provider responses before internal use.
- Test Writer: Cover proposal UI state transitions, accept/reject no-op and apply behavior, affected-domain refresh decisions, navigation consolidation, Profile/account behavior, hidden recipe UI, recipe API privacy boundaries, and copy/safety boundaries around wellness-only language.
- Reviewer: Check that chat remains an interaction layer, structured screens remain authoritative, approvals are explicit, workout/nutrition revisions are preserved, recipe sourcing does not leak private health context, documents keep explicit consent boundaries, and the redesign does not introduce diagnosis/treatment claims.
- App Runner: Verify the web flow end to end: open Chat from the prominent header item, send/inspect a coach response with an inline proposal, reject without state mutation, accept a proposal, confirm the relevant structured screen refreshes, confirm Workouts/Progress and Profile consolidation, and confirm Recipes are not exposed in primary navigation.
