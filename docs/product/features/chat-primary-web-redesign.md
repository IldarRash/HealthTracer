# Chat-Primary Web Redesign

## Summary

This feature redesigns the web app around a ChatGPT-like coaching experience: one large, primary chat surface without visible thread management, with AI proposal confirmations rendered inline in the conversation. The web app becomes the main user-facing surface for this pass, while Workouts, Goals, Nutrition, and Profile remain separate structured screens that read from domain state rather than from chat messages.

The redesign also adds a modern visual refresh and a Profile dashboard inspired by WHOOP and BioCharge patterns, limited to wellness, fitness, tracking, readiness-style context, and coaching visibility. It must not introduce diagnosis, treatment, medical scoring, or medical certainty.

## Problem Statement

The current web experience is functionally useful but still feels like a developer/admin surface. Users need a clearer primary coaching loop: talk to the coach in one focused chat, review proposed structured changes inline, explicitly approve or reject those changes, and then see authoritative updated state on the relevant domain screens.

## Scope

- Web-first ChatGPT-like chat screen with a single dominant conversation area.
- No visible thread list, thread picker, or thread-management UI in the primary web chat experience.
- Inline proposal confirmation cards inside chat for accept/reject decisions.
- Separate web screens for Workouts, Goals, Nutrition, and Profile so structured state remains visible outside chat.
- Profile dashboard inspired by WHOOP/BioCharge information density and visual hierarchy, but wellness-only.
- Modern visual refresh across the redesigned web surfaces.
- Minimal API changes only where needed to refresh background structured state after proposals are accepted.
- Clear loading, empty, pending, accepted, rejected, and failed states for chat proposals and structured-state refresh.

## Out Of Scope

- Expo/mobile redesign.
- Visible multi-thread chat management in the primary user experience.
- Making chat messages the source of truth for workouts, goals, nutrition, profile, metrics, or progress.
- Direct AI mutation of domain tables.
- Diagnosis, treatment recommendations, medical triage, medical certainty, or clinical risk scoring.
- Wearable integrations, document upload, RAG, recipes, advanced analytics, or production AI prompt experimentation.
- Large backend rewrites beyond the minimal API support needed for state refresh and proposal-driven UI consistency.

## Product Rules

- Chat is the interaction layer, not the source of truth.
- Workouts, Goals, Nutrition, and Profile screens read from structured state.
- AI proposals require explicit user approval before any structured state changes.
- Pending and rejected proposals must not mutate structured state.
- Accepted proposals are revalidated by backend services before application.
- Workout and nutrition changes must create auditable revisions instead of overwriting plan state.
- Proposal decisions and applied references remain auditable.
- User-facing language stays in wellness, fitness, tracking, and coaching territory.
- The Profile dashboard may present wellness context and trends, but must avoid diagnosis, treatment, or medical certainty language.

## User Stories

- As an authenticated web user, I can open Chat and immediately see one large focused coaching conversation.
- As an authenticated web user, I do not need to choose or manage visible chat threads before messaging the coach.
- As an authenticated web user, I can receive an AI-proposed structured change inline in chat.
- As an authenticated web user, I can accept or reject an inline proposal before it changes my structured state.
- As an authenticated web user, I can navigate to Workouts, Goals, Nutrition, and Profile as separate screens.
- As an authenticated web user, I can see the accepted proposal reflected on the relevant structured screen after backend validation.
- As an authenticated web user, I can view a modern Profile dashboard with wellness-oriented coaching context and progress cues.
- As a developer, I can verify that proposal acceptance triggers the minimum structured-state refresh needed by the web UI.

## Acceptance Criteria

- The web Chat route presents a single large chat surface as the primary experience.
- The primary Chat route does not show a visible thread list, thread switcher, or thread-management controls.
- The app may keep backend thread persistence internally, but the user-facing chat experience behaves like one default coaching conversation.
- Pending proposal confirmations render inline in the chat transcript with clear accept and reject actions.
- Accepting a proposal calls the backend proposal decision flow and waits for validated application before showing applied structured-state feedback.
- Rejecting a proposal records the decision and leaves structured state unchanged.
- Accepted workout and nutrition proposal changes create new revisions.
- Workouts, Goals, Nutrition, and Profile are reachable as separate web screens from the main navigation.
- The Profile screen uses a polished dashboard layout with wellness-only cards, trend/context blocks, and coaching-friendly language inspired by WHOOP/BioCharge visual patterns.
- Background structured-state refresh after proposal acceptance is minimal and targeted to affected domains where practical.
- Empty, loading, error, proposal pending, proposal accepted, and proposal rejected states are visible and understandable.
- The UI copy avoids diagnosis, treatment advice, medical certainty, and clinical score framing.
- Focused validation covers proposal UI state, proposal decision behavior, structured-state refresh behavior, and no-op behavior for rejected proposals.

## Initial Implementation Plan

1. Confirm current web routing and data-fetching boundaries for Chat, Training/Workouts, Goals, Nutrition, and Profile.
2. Redesign web navigation so Chat is visually primary while structured domain screens remain first-class routes.
3. Refactor the Chat route into a single large conversation workspace without visible thread management.
4. Move proposal review into inline chat cards that use the existing proposal decision APIs.
5. Add or refine targeted structured-state invalidation/refetch behavior after accepted proposals.
6. Build the Profile dashboard content model and visual layout using existing profile, goals, workout, and nutrition summaries where available.
7. Apply a modern visual refresh through reusable styles or components instead of one-off page styling.
8. Add focused tests for proposal UI state, refresh decisions, and safety-sensitive copy boundaries.
9. Run web/API validation and smoke-test the chat-to-proposal-to-structured-screen flow.

## Risks And Assumptions

- The request changes MVP emphasis from mobile-first to web-first for this redesign; the trade-off is that Expo/mobile polish remains deferred.
- Hiding visible thread management should not require removing backend thread persistence; preserving persistence keeps auditability and future continuity.
- WHOOP/BioCharge inspiration can drift into health or readiness scoring; keep the dashboard framed as wellness context, habits, goals, and coaching progress.
- Inline proposals can become too dense inside chat; cards should be concise and link to relevant structured screens after acceptance.
- State refresh should not become a broad API rewrite; use targeted invalidation/refetch unless a narrow endpoint is clearly simpler.
- Existing local verification may depend on Clerk, Postgres, and seeded or proposal-created state.

## Open Questions

- Should the single visible chat always map to one default thread per user, or should it resume the most recent thread while hiding thread controls?
- Which Profile dashboard cards are required for the first pass: goals, profile summary, workout adherence, nutrition adherence, recent proposal activity, or all of these?
- Should Goals be a dedicated route in this redesign or part of Profile with a direct navigation item?
- Which accepted proposal domains must trigger immediate cross-screen refresh in the first pass: workouts, nutrition, goals, profile, or all supported domains?

## Role Handoff Notes

- Visual Designer: Define the ChatGPT-like chat layout, inline proposal card hierarchy, modern web visual direction, and WHOOP/BioCharge-inspired Profile dashboard treatment while keeping all language wellness-only.
- Design System Agent: Extract reusable navigation, card, badge, proposal status, empty-state, loading-state, and dashboard primitives with accessible contrast, focus states, and responsive behavior.
- Frontend Implementer: Build the web-first routes and UI states, hide visible chat thread controls, wire inline proposal decisions, and add targeted structured-state refresh after accepted proposals.
- Backend Implementer: Keep API changes minimal; support any needed default-thread/resume behavior and affected-domain refresh metadata without allowing direct AI writes or weakening proposal approval.
- Test Writer: Cover proposal UI state transitions, accept/reject no-op and apply behavior, affected-domain refresh decisions, and copy/safety boundaries around wellness-only language.
- Reviewer: Check that chat remains an interaction layer, structured screens remain authoritative, approvals are explicit, workout/nutrition revisions are preserved, and the redesign does not introduce diagnosis/treatment claims.
- App Runner: Verify the web flow end to end: open Chat, send/inspect a coach response with an inline proposal, reject without state mutation, accept a proposal, then confirm the relevant structured screen refreshes.
