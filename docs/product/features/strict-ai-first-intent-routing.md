# Strict AI-First Intent Routing

## Problem

Chat routing must be consistent with the product architecture: the AI layer interprets user input, but structured state remains authoritative. The current attachment direction risks treating deterministic rules, regexes, MIME fallbacks, or food-photo defaults as the primary source of truth, especially for ambiguous images. This can misroute training photos into nutrition proposals and makes attachment behavior diverge from normal AI-first chat turns.

This feature makes strict AI-first routing a hard architecture rule for both text-only and attachment turns while preserving proposal validation, medical consent, and user approval.

## Hard Architecture Rules

- Text-only messages first run explicit system-owned shortcuts only where the backend already owns the state, such as proposal revision routing. Otherwise, the system follows normal intent routing.
- If text intent is not already determined by an explicit system-owned rule, the orchestrator asks the LLM router to classify the user message against the typed intent knowledge base/catalog.
- After a text intent is selected, the backend builds the context slice required for that intent, then runs a second LLM pass with that intent's prompt, rules, safety constraints, tools, and proposal allowlist.
- Messages with attachments must not default images to food and must not use regex or filename/MIME heuristics as the primary source of truth.
- For attachment turns, the backend sends the file or image plus bounded safe message context to an LLM or vision-capable classifier with the allowed attachment categories: nutrition/food photo, workout/training, and medical document.
- The attachment classifier returns a structured category result with confidence, evidence, and any required consent or clarification state. Backend validation then routes to the matching recognizer/proposal path.
- Attachment recognizers and proposal builders may use deterministic checks as validation, safety, or fallback gates, but not as the primary category decision when the model can inspect the attachment.
- AI never mutates structured state directly. Any state-changing output remains a typed proposal that backend services validate and the user approves before application.

## Scope

In scope:

- Backend orchestration rules for text-only intent routing, including the LLM router pass and intent-specific generation pass.
- Backend attachment classification flow using an LLM/vision structured result before category-specific recognition.
- The allowed attachment category set for this feature: food photo, workout/training, and medical document.
- Validation contracts for structured intent/category results, confidence handling, unknown/ambiguous outcomes, and safe fallbacks.
- Focused tests proving text and attachment routing follows the strict workflow.
- Documentation updates to feature and architecture guidance after implementation if behavior changes canonical docs.

Out of scope:

- New attachment categories beyond food photo, workout/training, and medical document.
- Direct plan, nutrition, metric, or document state mutation by AI output.
- Diagnosis, treatment, medication guidance, or medical certainty workflows.
- Replacing user approval with automatic application of proposals.
- Broad UI redesign beyond what is needed to show clarification, consent, or proposal state.

## Acceptance Criteria

- A text-only message with no explicit system-owned shortcut is classified by the LLM router against the typed intent catalog before generation.
- Text-only generation runs in a second LLM pass using the selected intent's context, prompt, safety rules, allowed tools, and proposal allowlist.
- Proposal revision or other explicit system-owned shortcuts remain deterministic only when they are tied to backend-owned state and are documented in code/tests.
- An image-only or file attachment turn is sent to an LLM/vision classifier with the allowed attachment categories instead of being classified primarily by regex, filename, MIME type, or food-photo default.
- Generic images, sports photos, workout screenshots, and other ambiguous attachments do not create nutrition proposals unless the structured classifier selects the food-photo category with sufficient evidence.
- Attachment classifier output is schema-validated before routing to `attachment_food_photo`, `attachment_workout`, or `attachment_medical_document`.
- Low-confidence or unsupported attachment results produce a clarification/manual-review path rather than silently selecting food photo.
- Medical document classification preserves explicit consent requirements before document content enters coaching context.
- Raw private health documents, raw attachment contents, and prompt payloads containing private health data are not logged.
- All state-changing results remain pending proposals until backend validation and explicit user approval.

## Safety Requirements

- Medical consent must be checked before storing or using medical document summaries, signals, or context.
- Vision or LLM providers receive only the attachment and bounded context needed for category detection and recognition.
- Logs may include stable identifiers, category, confidence band, and validation status, but not raw document text, raw prompts, extracted sensitive health details, or private file URLs.
- Crisis, medical safety, provider isolation, ownership, expiry, and permission checks remain unchanged.
- Backend Zod schemas validate router output, attachment category output, recognition envelopes, and proposal payloads before downstream use.

## Implementation Plan By Role

### Backend Implementer

- Make the text-turn orchestrator enforce router pass, context build, and intent-specific generation pass, preserving explicit backend-owned shortcuts for proposal revisions.
- Add or revise the attachment LLM/vision classifier contract for the three allowed categories, including confidence, evidence, ambiguity, and consent flags.
- Route validated attachment category results into existing recognizers and proposal builders without using MIME or regex defaults as the primary decision.
- Ensure safe logging, ownership checks, provider isolation, expiry checks, and medical consent gates remain in the attachment path.

### Frontend Implementer

- Surface clarification/manual-review states when attachment classification is low confidence or unsupported.
- Preserve proposal approval UX and medical consent UX without implying that attachment upload directly changes structured state.

### Test Writer

- Add backend tests for text-only router pass, second intent-specific generation pass, deterministic shortcut boundaries, and invalid router output.
- Add attachment tests for generic image, food photo, workout/training photo, medical document, low-confidence result, and unsupported category routing.
- Add safety tests or assertions for medical consent, no direct state mutation, proposal validation, and no sensitive raw-content logging.

### Implementation Reviewer

- Review that deterministic logic is limited to explicit backend-owned shortcuts, validation gates, safety checks, and fallback behavior.
- Verify attachment category selection is model/vision-first and cannot silently default ambiguous images to nutrition.
- Check that architecture docs and learned workspace guidance are updated only where behavior is canonical.

### App Runner

- Smoke test text-only chat routing, a food-photo attachment, a workout/training attachment, a medical document consent path, and a low-confidence ambiguous attachment.
- Report any missing provider capability or local fixture limitation that prevents true vision verification.

## Risks And Open Questions

- Real vision classification may not be available in every local or test environment; the implementation needs a deterministic test double that preserves the same structured contract without becoming production routing logic.
- Provider cost and latency can increase because attachment turns require model inspection before recognition.
- Some attachments may contain mixed signals, such as a meal plan screenshot or workout notes in a photo. The classifier needs an explicit ambiguity/clarification path.
- The intent catalog must stay synchronized with implementation; stale categories could cause rejected model output or unsupported route selections.
- It is not yet decided whether multi-attachment messages should classify each attachment independently or produce one turn-level routing decision with per-attachment categories.
