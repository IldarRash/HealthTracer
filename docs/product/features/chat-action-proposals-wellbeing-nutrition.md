# Chat Action Proposals: Wellbeing and Nutrition Incidents

## Problem Statement

The baseline proposal lifecycle already exists in `ai-proposal-flow-product-architecture.md` and `ai-proposal-flow-implementation-brief.md`, but two high-value conversational actions still need implementation-ready product boundaries:

- A wellbeing check-in capture flow triggered from chat when the user reports feeling bad and has not completed today's check-in.
- A nutrition incident flow that uses food photo analysis and confidence-aware user confirmation before logging.

These flows must extend the existing typed proposal system rather than duplicate it: AI proposes, user decides, backend validates, structured state updates only after confirmation.

## Current Baseline

- The universal proposal lifecycle is implemented through `ai_proposals`, chat-linked pending proposals, validation on creation and acceptance, `Apply`/`Modify`/`Reject` card states, and proposal revision chat turns.
- Existing proposal intents cover profile, goal, workout plan, nutrition plan, recipe recommendations, Today checklist, progress summary, and habit plans. They do not yet cover wellbeing check-in capture or nutrition incident logging.
- Wellbeing check-ins already exist as structured state with date uniqueness, bounded mood/stress scores, optional note, aggregate coaching summary, Today UI card, and crisis-support copy for keyword or lowest-mood flags.
- Chat already has crisis keyword handling before AI provider invocation; crisis messages produce supportive copy and no proposals.
- Nutrition currently supports revision-safe nutrition plans and daily adherence, but not food logs, nutrition incident records, photo upload, or image-analysis provider boundaries.
- Chat composer is text-only today. Document upload exists for health documents, but it is consented document storage and should not be reused as food-photo context without a separate least-privilege path.

## Goals

- Reuse and extend the existing universal proposal engine for chat-triggered wellbeing and nutrition incident actions.
- Add a bounded wellbeing check-in proposal card flow in chat for users who report feeling bad and lack a check-in for today.
- Add a nutrition incident flow where AI can request a food photo, produce confidence/provenance-backed estimates, and let users confirm or edit before recording.
- Keep structured state authoritative; chat remains interaction and explanation only.
- Preserve safety boundaries: no diagnosis, no treatment guidance, crisis-safe support only.

## Non-Goals

- Rebuilding the base proposal lifecycle already defined in existing proposal docs.
- Automatic logging of wellbeing or nutrition incidents without explicit user confirmation.
- Automatic workout or nutrition target mutation from incident capture.
- Reusing health-document upload consent or document RAG context for food photos.
- Storing raw photo-analysis prompts, unrelated health documents, or raw wellbeing notes in AI provider logs.
- Clinical triage, diagnosis, medication advice, or treatment workflows.
- Broad redesign of chat UI beyond action cards and proposal states required for this slice.

## User Stories

- As a user who says "I feel bad" in chat, I get a quick, bounded wellbeing check-in card when today's check-in is missing.
- As a user, I can confirm or edit wellbeing answers before anything is saved.
- As a user in possible crisis language, I receive supportive safety messaging and crisis-safe resources without diagnostic claims.
- As a user who reports a cheat meal or missed logging, I can submit a food photo and receive editable nutrition estimates with confidence and provenance.
- As a user, I can confirm/edit nutrition incident details before they become a food log or nutrition-today entry.
- As a user, I can trust that nutrition/workout target changes still require separate typed revision-safe proposals.

## Accepted UX Behavior

- **Wellbeing check-in trigger**
  - If the user expresses low mood/stress/fatigue in chat and today's wellbeing check-in is missing, chat renders a `Wellbeing check-in` proposal card.
  - Card asks only bounded fields (for example: mood, stress, energy, optional short note, optional safety prompt).
  - Save occurs only after explicit `Apply`/confirm action.
- **Crisis-safe behavior**
  - Crisis-indicating phrases trigger safety copy and support guidance.
  - The assistant remains wellness-coaching scoped, avoids diagnosis/treatment language, and does not pretend emergency services integration.
- **Nutrition incident from chat**
  - If user reports nutrition incident, assistant asks for a photo (or accepts text-only fallback).
  - Assistant returns one or more estimated food candidates with calories/macros, confidence, and provenance/source labels.
  - User can edit quantities/items before confirming.
  - Confirmed result records a food log or nutrition-today entry, and can optionally create a recommendation record for follow-up.
- **Mutation boundary**
  - No nutrition target or plan mutation is applied through incident capture; those remain separate proposal cards with explicit approval.

## Data And Contracts

- Extend typed proposal intents:
  - `capture_wellbeing_checkin`
  - `log_nutrition_incident`
- Wellbeing proposal payload must be bounded and typed:
  - `date`, `moodScore`, `stressScore`, optional `energyLevel`, optional bounded note, optional `tags`, optional `safetyFlags`.
- Nutrition incident payload must support provenance and confidence:
  - `incidentDateTime`, `items[]`, `estimatedCalories`, `estimatedMacros`, `confidence`, `provenance`, `imageRefs`, optional `userEdits`.
- Add a photo-analysis adapter contract that returns normalized food candidates with confidence bands and source/provenance metadata. It should accept only a scoped image reference plus minimal prompt text needed for food estimation.
- Add a structured persistence target for confirmed nutrition incidents. Prefer a dedicated food-log or nutrition-incident table over overloading `nutrition_adherence.notes`; if MVP timing requires a narrower write, store a normalized incident entry inside nutrition-today/adherence with schema-owned provenance and confidence.
- Persist only user-confirmed records into structured state (check-ins, food logs, nutrition-today entries, recommendation history).
- External provider calls must exclude unnecessary sensitive context. Do not send health documents, raw wellbeing notes, or unrelated profile data.

## Implementation-Ready Scope

### Slice 1: Shared Contracts And Schema

- Add proposal intent enum values in shared types and Drizzle enum migrations.
- Add schemas for `capture_wellbeing_checkin`, `log_nutrition_incident`, photo-analysis result envelopes, confidence bands, provenance labels, and user-editable nutrition items.
- Add or choose persistence schema for confirmed nutrition incidents/food logs. Include user/date/time indexes and ownership-scoped image references if images are retained.
- Add contract tests for parse failures, score bounds, note length, confidence ranges, image reference shape, and unsupported intent rejection.

### Slice 2: Backend Proposal Generation And Validation

- Add deterministic chat trigger logic for low mood/stress/fatigue phrases when today's wellbeing check-in is missing.
- Keep crisis keyword handling as the highest-priority path: return crisis-safe copy and do not create a wellbeing proposal in that turn.
- Add nutrition incident detection for cheat meals, missed logs, "I ate this", and photo-backed meal logging. If no image is available, return a proposal-ready text-only estimate flow or ask for a photo without mutating state.
- Extend proposal validation and acceptance so pending/rejected nutrition and wellbeing proposals do not write structured state, while accepted proposals call domain services.
- Validate that nutrition incident acceptance cannot call `applyNutritionPlanProposal` and cannot create nutrition-plan revisions or workout revisions.

### Slice 3: Photo Analysis Boundary

- Add an API-owned food-photo analysis service/adapter with strict request and response schemas.
- Start with a deterministic dev adapter if production provider credentials are not configured; keep the provider interface ready for external image analysis.
- Limit provider input to image bytes/reference and meal-estimation instructions. Do not include documents, raw wellbeing notes, or broad profile context by default.
- Return candidate items with confidence/provenance and support low-confidence copy that asks the user to review or edit.

### Slice 4: Frontend Chat Action Cards

- Add specialized inline proposal rendering for wellbeing check-in capture with bounded mood/stress/energy/note editing before `Apply`.
- Add nutrition incident card states: request photo, uploading/analyzing, estimate preview, item/quantity editing, low-confidence notice, apply/reject/modify.
- Preserve existing proposal card status behavior and query invalidation, with refresh keys for wellbeing, Today, nutrition adherence/food logs, and proposals.
- Keep broader Chat UI redesign out of scope; only add composer upload affordance and proposal-specific card forms needed for this slice.

### Slice 5: Verification And Runtime Smoke

- Add backend tests for trigger conditions, crisis precedence, validation failures, ownership, no-write-before-confirm, and no target-plan mutation.
- Add shared contract tests for both proposal payloads and photo-analysis envelopes.
- Add frontend tests for card states, editing before confirm, image analysis states, and crisis-safe rendering.
- App Runner should verify both local happy paths after implementation; authenticated browser verification may remain blocked by Clerk sign-in unless test credentials or a bypass are available.

## Likely Affected Modules

- Shared contracts: `packages/types/src/index.ts`, `packages/types/src/wellbeing-check-ins.ts`, focused proposal/nutrition/wellbeing specs.
- Database: `packages/db/src/schema/proposals.ts`, `packages/db/src/schema/wellbeing-check-ins.ts`, `packages/db/src/schema/nutrition.ts`, new migration files.
- Backend chat and AI: `apps/api/src/modules/chat`, `apps/api/src/modules/ai`, `packages/ai/src/stub-provider.ts`, `packages/ai/src/stub-wellbeing.ts`, intent router and context slice plumbing as needed.
- Backend proposals: `apps/api/src/modules/proposals/proposal-validation.service.ts`, `proposal-apply.service.ts`, proposal tests.
- Backend domain services: `apps/api/src/modules/wellbeing-check-ins`, `apps/api/src/modules/nutrition`, plus a new food-photo or nutrition-incident adapter/service if persisted separately.
- Web chat/proposals: `apps/web/src/components/chat/chat-workspace.tsx`, `apps/web/src/components/proposals/inline-proposal-card.tsx`, proposal UI state helpers, API helpers, and specialized card components.

## Acceptance Criteria

1. When a user reports feeling bad and today's check-in is missing, chat shows a bounded wellbeing proposal card in the same thread.
2. Wellbeing check-in data is written only after explicit user confirmation.
3. Crisis-indicating messages route through crisis-safe support copy and never claim diagnosis or treatment.
4. Nutrition incident flow supports photo input and returns at least one confidence/provenance-annotated estimate.
5. Users can edit nutrition incident estimates before confirmation.
6. Confirmed nutrition incidents create a structured food-log or nutrition-today write; unconfirmed incidents do not mutate structured state.
7. Nutrition/workout target changes are never auto-applied from incident capture and require separate revision-safe proposals.
8. External photo-analysis calls exclude unrelated sensitive health context by default.
9. Pending, rejected, invalid, and superseded proposals remain auditable and cannot be applied through stale UI state.
10. If the photo estimate is low confidence or provider analysis fails, the user sees a text/manual fallback and no structured nutrition write occurs until they confirm an edited estimate.

## Risks And Assumptions

- Food recognition confidence can vary by cuisine/portion size; UX must communicate uncertainty clearly.
- False-positive crisis detection can feel interruptive; safety trigger thresholds need iterative tuning.
- Image upload quality and latency can degrade completion rates without robust fallback to text-only entry.
- Existing nutrition log model may require minor schema expansion for provenance/confidence storage.
- Assumes existing chat proposal components can host interactive bounded forms without major redesign.
- Existing proposal superseding currently groups by intent and target domain; adding nutrition incident proposals should avoid superseding unrelated pending nutrition-plan proposals.
- `proposal_intent` is a Postgres enum, so migrations are required for new intents and deployment will need the standard Railway migration step if pushed.
- The app has no current food-photo storage path. Implementation must choose between ephemeral analysis and retained image refs with explicit retention/privacy rules.
- Authenticated browser verification may be blocked by Clerk sign-in unless the planner supplies test credentials, a seeded session, or a local auth bypass.

## Subagent Implementation Order

1. **Backend Implementer**
   - Shared contract wiring, Drizzle migrations, proposal intents, trigger logic, adapter boundary, persistence rules, apply behavior, and safety guards.
2. **Frontend Implementer**
   - Chat cards for wellbeing and nutrition incidents, image upload, edit-before-confirm, and proposal actions.
3. **Test Writer**
   - Contract tests, backend flow tests, chat-state tests, and crisis-safe regressions.
4. **Implementation Reviewer**
   - Invariant checks: structured-state authority, no auto-mutation, privacy/safety boundaries.
5. **App Runner**
   - End-to-end verification of both chat flows in local stack.

Skip by default for this slice unless scope expands: Visual Designer, Design System Agent, UI Polish Implementer.

Backend Implementer should run before Frontend Implementer because the web card shapes depend on final shared schemas and API contracts. Test Writer can start with contract tests in parallel after Backend Implementer defines the schema, then add UI and apply-flow tests after frontend implementation.

## Verification Plan

- Run focused shared-contract tests for new proposal and photo-analysis schemas.
- Run backend tests for:
  - wellbeing trigger with/without existing daily check-in,
  - crisis-safe path,
  - nutrition incident estimate validation and confirmation gating,
  - no-write behavior for pending/rejected proposals.
- Run frontend tests for:
  - wellbeing and nutrition card rendering in chat,
  - image upload and estimate editing,
  - Apply/Modify/Reject state transitions.
- Run integration smoke tests:
  - user reports low mood -> check-in card -> confirm -> record appears,
  - user reports cheat meal + photo -> estimate -> edit -> confirm -> log appears.
- App Runner verifies runtime flow in web + API with target user journey and reports blockers.
