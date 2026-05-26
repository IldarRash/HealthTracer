# Multimodal Chat Attachments And Recognition

## Problem Statement

Chat is the primary coaching surface, but the current composer is text-only. Users can already manage health documents in Profile, and the backend has separate foundations for food-photo analysis, nutrition incident proposals, document parsing/signals, coaching context, and workout proposals. The missing product layer is a governed attachment flow in Chat that lets users attach food photos, medical documents, and workout/training files or photos, have the system recognize what they are, and route each category through the correct consent, provider, review, and proposal gates.

The feature should make attachments useful without weakening core invariants: structured state remains authoritative, medical data is consented wellness context only, and workout/nutrition plan changes require typed proposals and explicit user acceptance.

## Current Codebase Baseline

- `apps/web/src/components/chat/chat-workspace.tsx` renders the Chat transcript, inline proposals, and a text-only composer. It does not accept files, show attachment previews, or send attachment refs with chat messages.
- `packages/types/src/index.ts` and `packages/types/src/chat-action-proposals.ts` already include `capture_wellbeing_checkin` and `log_nutrition_incident` proposal intents, deterministic chat triggers, and bounded nutrition incident payloads.
- `apps/api/src/modules/nutrition/food-photo-analysis.service.ts`, `nutrition.controller.ts`, and `packages/types/src/nutrition-incidents.ts` define a food-photo analysis boundary, owned image refs, confidence/provenance, and a `log_nutrition_incident` apply path. The current request shape assumes an existing `imageRef`; there is no general chat upload pipeline or binary food-image storage UX.
- `apps/web/src/components/proposals/inline-proposal-card.tsx` already routes specialized proposal cards for wellbeing, nutrition incidents, and recipe recommendations. This should be extended rather than replaced.
- `apps/api/src/modules/documents` and `apps/web/src/components/documents` support Profile-scoped text/PDF document upload, local storage, parse/summarize, signal extraction, consent scopes, search, review, revocation, and correlation preview. Chat does not yet offer an inline document attach/review flow.
- `apps/api/src/modules/coaching-context` can include approved document summaries/signals for health-context slices. Documents are eligible only after consent and review gates; raw document text is not the intended prompt payload.
- `packages/types/src/workouts.ts`, `apps/api/src/modules/workouts`, and proposal apply services already support revision-safe workout plan creation/adaptation and Today workout execution state. There is no training attachment recognition contract for exercise photos, plan screenshots, or training files.
- `docs/product/feature-roadmap.md` says documents/labs are implemented as an MVP and confirms medical/lab data is allowed only as consented coaching context, not diagnosis or treatment. `docs/product/mvp-scope.md` and `docs/product/mvp-slices.md` are referenced by workflow but are not present in the current docs tree.

## Goals

- Add Chat composer support for multiple attachment categories: food photos, medical documents, and workout/training files or photos.
- Recognize attachment category and intent before invoking downstream processors, with user-visible confidence and manual correction.
- Route each category through the least-privilege processing path: food image analysis for meals, document processing for health documents, and training recognition for workout/session/exercise context.
- Keep all structured writes behind editable proposal cards or explicit review/confirmation actions.
- Preserve provider boundaries so food photos, health documents, and training attachments do not share unnecessary context or raw content.
- Make failure states useful: low confidence, unsupported file type, OCR failure, provider failure, and manual fallback should be visible and recoverable.

## Non-Goals

- Diagnosis, treatment, clinical triage, medication guidance, or medical certainty.
- Sending raw medical documents to food-photo providers or unrelated AI providers.
- Automatically mutating workout plans, nutrition plans, goals, or Today state from attachment recognition.
- Replacing the existing Profile document center; Chat should create or link document records and point to Profile for deeper document management.
- Building broad wearable/training platform import parity in this slice. Training files should start with bounded MVP formats and clear unsupported-state copy.
- Full mobile parity unless explicitly added by the planner.

## Attachment Categories

### Food Photos

- Accepted inputs: meal photos and food-related images.
- Recognition output: candidate food items, quantities, calories/macros, confidence band, provenance, and analyzed image refs.
- Structured action: editable `log_nutrition_incident` proposal. Low-confidence estimates require user edits before acceptance.
- Boundary: the analyzer receives only the image reference/bytes and meal-estimation instructions. It must not receive medical documents, raw wellbeing notes, or broad profile context by default.

### Medical Documents

- Accepted inputs: supported health documents, initially text and PDF to match current document parsing. Image OCR can be a later slice unless implemented explicitly.
- Recognition output: document type guess, upload consent prompt, parse/OCR status, safe summary, allowlisted structured signals, and provenance.
- Structured action: document record plus user-reviewed summary/signals. Any downstream workout, nutrition, recovery, or habit recommendation must be a separate proposal with evidence refs and no raw document leakage.
- Boundary: wellness coaching only. No diagnosis, treatment, medication dosing, clinical interpretation, or raw document text in unrelated prompts.

### Workout And Training Attachments

- Accepted MVP inputs: exercise/workout photos, plan screenshots/docs, and simple training files. Exact file types should be finalized by Backend Implementer and Product before implementation, with unsupported formats rejected clearly.
- Recognition output: attachment type, extracted workout/session/exercise context, candidate exercises or plan structure, date/time if present, confidence, and provenance.
- Structured action: one of:
  - editable workout session/execution proposal or Today action proposal for session logs,
  - `create_workout_plan` or `adapt_workout_plan` proposal for plan screenshots/docs,
  - exercise catalog candidate or pending exercise reference for recognized exercises.
- Boundary: no direct plan mutation. New or changed workout plans must create workout proposals and accepted proposals must create revisions.

## UX Behavior

- Composer shows an attachment button with accepted category hints and privacy copy before upload.
- Selected files render previews with filename, type guess, size, category selector, consent requirements, remove action, and upload/recognition status.
- Recognition states are explicit: queued, uploading, recognizing, needs consent, needs review, ready, low confidence, unsupported, failed.
- Users can correct category before processing if auto-detection is wrong.
- Food photo recognition can create an editable nutrition incident card; users can edit items/quantities before applying.
- Medical document attachment shows consent scopes before storage/parse/context use, then links to summary/signal review. Chat may explain that the document is available only after review/approval.
- Workout/training recognition creates editable cards for extracted exercise/session/plan context. Plan-level actions must use existing proposal approval language.
- All successful structured writes show clear confirmation, and all rejected/failed/unsupported states provide manual text fallback.

## Privacy And Security Boundaries

- Require explicit consent before storing medical documents, parsing/OCR, summarizing, semantic indexing, or using document context in Chat.
- Store attachment refs as ownership-scoped records. Proposal validation must reject refs not owned by the authenticated user.
- Keep provider boundaries separate:
  - food photo provider receives food images only,
  - document parser/summarizer receives consented health docs only,
  - training recognizer receives training attachments only.
- Do not log sensitive health data, raw document text, raw image contents, or provider prompts containing private data.
- Define retention per category:
  - food photos may be ephemeral analysis refs unless the user explicitly confirms retention,
  - medical documents follow document consent/revocation/delete rules,
  - training attachments should default to short-lived recognition refs unless attached to an accepted structured record.
- Revocation/deletion must remove or tombstone downstream context eligibility and prevent future prompt inclusion.

## Implementation Slices

1. **Attachment Contracts And Storage Boundary**
   - Add shared attachment schemas for category, MIME/size limits, upload refs, recognition status, provenance, retention policy, and ownership validation.
   - Decide whether to create a generic `chat_attachments` table or category-specific tables with a shared ref envelope.
   - Add upload endpoints or reuse existing document/nutrition boundaries behind a Chat-facing orchestration endpoint.

2. **Chat Composer And Attachment Preview**
   - Add file selection, previews, category correction, upload progress, recognition status, removal, and failure/manual fallback.
   - Extend `sendChatMessage` input to include attachment refs or recognition session refs.

3. **Food Photo Chat Flow**
   - Wire chat-selected food photos to the existing food-photo analysis service.
   - Create or update `log_nutrition_incident` proposal cards with analyzed image refs, confidence, provenance, edit-before-apply, and low-confidence gating.

4. **Medical Document Chat Flow**
   - Let Chat create/link health document records using existing document consent scopes and processing.
   - Show parse/summary/signal review status and prevent document context from entering Chat until consent and review gates are satisfied.
   - Ensure document-backed proposals use evidence refs rather than raw document text.

5. **Workout And Training Recognition**
   - Add recognition contracts/provider interface for training photos, screenshots/docs, and scoped training files.
   - Map recognized context into existing workout proposals, Today/session action proposals, or exercise catalog candidates with editable review.
   - Add proposal validation for training attachment refs and no-auto-mutation behavior.

6. **Provider Isolation, Retention, And Audit**
   - Enforce category-specific provider adapters, prompt minimization, request redaction, retention cleanup, revocation, and audit metadata.

7. **Runtime Verification**
   - Verify `/chat` on `localhost:3002` with the local stack after implementation, including upload previews and at least one successful or stubbed recognition path per category.

## Likely Affected Modules

- Shared contracts: `packages/types/src/index.ts`, `packages/types/src/nutrition-incidents.ts`, `packages/types/src/documents.ts`, `packages/types/src/workouts.ts`, new attachment/recognition contracts.
- Database: `packages/db/src/schema/*`, `packages/db/drizzle/*`, existing document/nutrition/workout attachment or provenance tables.
- Backend chat/API: `apps/api/src/modules/chat`, `apps/api/src/modules/nutrition`, `apps/api/src/modules/documents`, `apps/api/src/modules/workouts`, `apps/api/src/modules/proposals`, `apps/api/src/modules/coaching-context`.
- AI/provider layer: `packages/ai`, `apps/api/src/modules/ai`, category-specific recognition provider adapters.
- Web chat: `apps/web/src/components/chat/chat-workspace.tsx`, `apps/web/src/components/ui/chat-bubble.tsx`, `apps/web/src/components/proposals/*`, `apps/web/src/lib/api.ts`, attachment UI-state helpers and tests.
- Existing document/Profile UI may need link targets or shared upload helpers, but should not be replaced.

## Acceptance Criteria

1. Chat composer accepts supported food photo, medical document, and workout/training attachment inputs with visible previews and category labels.
2. Users can remove an attachment or correct its category before recognition.
3. Food photo attachments can produce editable nutrition incident proposals with confidence/provenance and no structured write before acceptance.
4. Medical document attachments require explicit consent before storage/parse/context use and use only reviewed summaries/signals for coaching context.
5. Medical document recognition never produces diagnosis, treatment, medication, or clinical certainty language.
6. Workout/training attachments extract bounded exercise/session/plan context and surface editable proposal cards or manual fallback.
7. Workout/training recognition never mutates active plans directly; accepted plan-level changes create workout plan revisions.
8. Attachment refs are ownership-scoped and cannot be applied or cited across users.
9. Provider calls are category-isolated and exclude unrelated sensitive context.
10. Unsupported, failed, and low-confidence recognition states are recoverable through clear manual fallback.
11. Accepted proposals refresh the relevant Chat, Today, Nutrition, Training, Longevity/Profile document, and proposal query state.
12. Runtime smoke at `localhost:3002/chat` verifies previews, recognition status, proposal cards, and failure fallback.

## Recommended Subagents

1. **Backend Implementer**
   - Attachment contracts, storage/ref model, upload/recognition orchestration, provider isolation, proposal validation, migrations, and backend tests.
2. **Frontend Implementer**
   - Chat composer attachment UI, previews/statuses, API integration, specialized proposal card extensions, and manual fallback states.
3. **Design System Agent**
   - Reusable attachment preview/status components, accessible file input patterns, progress/status tokens, and proposal-card consistency.
4. **Test Writer**
   - Contract, backend, proposal-validation, privacy-boundary, and frontend state tests.
5. **Implementation Reviewer**
   - Security, medical-safety, structured-state, provider-boundary, and revision-safety review.
6. **App Runner**
   - Start local stack and verify `/chat` at `localhost:3002/chat` in the browser.

Skip by default unless scope expands: Visual Designer and UI Polish Implementer. Use them only if the attachment experience needs a broader visual redesign beyond accessible previews/status states.

## Verification Plan

- Shared contract tests for attachment refs, category detection, recognition result envelopes, consent scopes, provenance, and retention policy.
- Backend tests for upload limits, MIME/type rejection, ownership checks, consent gates, provider isolation, no sensitive logging, and stale/ref cross-user rejection.
- Food-photo tests for analysis ref ownership, low-confidence edit requirement, and nutrition incident apply behavior.
- Document tests for upload/parse/summarize/signal eligibility, revocation, context exclusion before review/consent, and unsafe medical language rejection.
- Workout/training tests for recognition result validation, proposal mapping, no direct plan mutation, and revision creation only after acceptance.
- Frontend tests for file selection, preview removal, category correction, status rendering, proposal cards, low-confidence/manual fallback, and disabled submit states.
- App Runner verifies the implemented flows at `localhost:3002/chat`; if auth blocks verification, report the blocker and required test session/credentials.

## Risks And Blockers

- Browser verification at `localhost:3002/chat` depends on the local stack, auth state, and available stub/provider behavior.
- The current code has food-photo analysis refs but no general binary upload path in Chat; implementation must choose a durable or ephemeral storage strategy.
- Current medical document support is text/PDF; image OCR for photographed documents is a separate capability unless explicitly included.
- Training file formats can sprawl quickly. MVP should start with a narrow allowlist and clear unsupported-format copy.
- External multimodal providers can retain or log inputs depending on vendor settings; provider selection must be security-reviewed before production use.
- New Drizzle migrations under `packages/db/drizzle` require the standard manual Railway migration step after deploy/push.

