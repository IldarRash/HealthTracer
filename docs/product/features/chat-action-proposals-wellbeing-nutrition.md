# Chat Action Proposals: Wellbeing and Nutrition Incidents

## Problem Statement

The baseline proposal lifecycle already exists in `ai-proposal-flow-product-architecture.md` and `ai-proposal-flow-implementation-brief.md`, but two high-value conversational actions still need implementation-ready product boundaries:

- A wellbeing check-in capture flow triggered from chat when the user reports feeling bad and has not completed today's check-in.
- A nutrition incident flow that uses food photo analysis and confidence-aware user confirmation before logging.

These flows must extend the existing typed proposal system rather than duplicate it: AI proposes, user decides, backend validates, structured state updates only after confirmation.

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

- Extend typed proposal intents (names illustrative):
  - `capture_wellbeing_checkin`
  - `log_nutrition_incident`
- Wellbeing proposal payload must be bounded and typed:
  - `date`, `moodScore`, `stressScore`, optional `energyLevel`, optional bounded note, optional `safetyFlags`.
- Nutrition incident payload must support provenance and confidence:
  - `incidentDateTime`, `items[]`, `estimatedCalories`, `estimatedMacros`, `confidence`, `provenance`, `imageRefs`.
- Photo-analysis adapter contract should return normalized food candidates with confidence intervals and source/provenance metadata.
- Persist only user-confirmed records into structured state (check-ins, food logs, nutrition-today entries, recommendation history).
- External provider calls must exclude unnecessary sensitive context. Do not send health documents, raw wellbeing notes, or unrelated profile data.

## First Epic Implementation Slices

1. **Types and contracts**
   - Add/extend shared schemas for wellbeing capture proposal, nutrition incident proposal, photo-analysis result envelope, and provenance/confidence fields.
   - Add contract tests for parse failures, bounded notes, and confidence range validation.
2. **Backend orchestration and validation**
   - Add chat trigger logic for missing daily wellbeing check-in and nutrition-incident detection.
   - Implement provider adapter boundary for food-photo estimation with strict I/O validation.
   - Persist pending proposals and require explicit user decision before writes.
3. **Frontend chat actions**
   - Add wellbeing check-in proposal card and nutrition incident card flows in chat.
   - Support image upload, estimate preview, in-card editing, and Apply/Modify/Reject states.
4. **Tests**
   - Add backend and integration tests for trigger conditions, validation failures, and no-write-before-confirm behavior.
   - Add web tests for card states, editing before confirm, and crisis-safe rendering.

## Acceptance Criteria

1. When a user reports feeling bad and today's check-in is missing, chat shows a bounded wellbeing proposal card in the same thread.
2. Wellbeing check-in data is written only after explicit user confirmation.
3. Crisis-indicating messages route through crisis-safe support copy and never claim diagnosis or treatment.
4. Nutrition incident flow supports photo input and returns at least one confidence/provenance-annotated estimate.
5. Users can edit nutrition incident estimates before confirmation.
6. Confirmed nutrition incidents create a structured food-log or nutrition-today write; unconfirmed incidents do not mutate structured state.
7. Nutrition/workout target changes are never auto-applied from incident capture and require separate revision-safe proposals.
8. External photo-analysis calls exclude unrelated sensitive health context by default.

## Risks And Assumptions

- Food recognition confidence can vary by cuisine/portion size; UX must communicate uncertainty clearly.
- False-positive crisis detection can feel interruptive; safety trigger thresholds need iterative tuning.
- Image upload quality and latency can degrade completion rates without robust fallback to text-only entry.
- Existing nutrition log model may require minor schema expansion for provenance/confidence storage.
- Assumes existing chat proposal components can host interactive bounded forms without major redesign.

## Subagent Implementation Order

1. **Backend Implementer**
   - Proposal intents, trigger logic, adapter boundary, persistence rules, and safety guards.
2. **Frontend Implementer**
   - Chat cards for wellbeing and nutrition incidents, image upload, edit-before-confirm, and proposal actions.
3. **Test Writer**
   - Contract tests, backend flow tests, chat-state tests, and crisis-safe regressions.
4. **Implementation Reviewer**
   - Invariant checks: structured-state authority, no auto-mutation, privacy/safety boundaries.
5. **App Runner**
   - End-to-end verification of both chat flows in local stack.

Skip by default for this slice unless scope expands: Visual Designer, Design System Agent, UI Polish Implementer.

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
