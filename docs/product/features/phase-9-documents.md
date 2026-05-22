# Phase 9: Documents

## Summary

Phase 9 adds a governed Documents surface for user-uploaded health documents, parsing/OCR, structured summaries, semantic search, and document-aware coaching context. The feature is MVP 3 scope and should not start until the core structured coaching loop, explicit consent primitives, and privacy controls are ready.

Documents are sensitive context, not a diagnosis engine. The product may summarize user-provided documents, extract coaching-relevant constraints, and use approved summaries as context for wellness, fitness, nutrition, and tracking conversations. It must not provide diagnosis, treatment guidance, medical certainty, or direct medical interpretation.

## Readiness And Current-State Check

- Roadmap Phase 9 is not started: there is no document module, schema, upload flow, OCR/parsing pipeline, document search, or document-aware coaching context.
- `docs/product/mvp-scope.md` places health document upload, OCR, semantic search, RAG, and stronger privacy controls in MVP 3, outside MVP 1.
- `docs/architecture/domain-model.md` already reserves `HealthDocument` and `HealthDocumentSummary` concepts with user ownership, document type, storage reference, parse status, consent scope, structured summary payload, extracted constraints, generated timestamp, and review status.
- `docs/architecture/database.md` lists later `health_documents` and `health_document_summaries` tables, warns against storing sensitive documents in plain database fields, and requires consent records before storing document-derived AI context.
- `docs/architecture/ai-update-flow.md` says Documents tabs read structured state and AI may summarize or propose but must not directly mutate domain entities.
- `packages/types` currently has no document contracts and no document proposal target domain.
- `apps/api` currently has modules for users, profiles, goals, chat, proposals, workouts, nutrition, today, coaching context, and AI, but no documents module.
- The current coaching context snapshot includes profile, goals, and active workout/nutrition revision ids only; it does not include document summaries or retrieved document context.
- `apps/web` navigation currently exposes Chat, Workouts, Goals, Nutrition, and Profile, with no Documents surface.

## In Scope

- Explicit consent flow before uploading, parsing, summarizing, indexing, or using health documents in AI context.
- Authenticated document upload metadata and storage references, with the binary document stored outside plain database fields.
- Supported document type classification for a narrow initial set, such as lab report, clinical note, imaging report, prescription/medication list, discharge summary, or other user-labeled health document.
- Parse status lifecycle: uploaded, processing, parsed, summary_ready, failed, and deleted or revoked where supported.
- OCR/text extraction pipeline with privacy-preserving error handling and no raw document or raw extracted text in application logs.
- Structured document summary records that separate safe summary text, extracted coaching constraints, source document reference, generation metadata, and review status.
- User-facing Documents web surface for upload, consent status, processing status, summary review, search, delete/revoke actions, and empty/error states.
- Semantic search over approved document-derived summaries or governed chunks, not unrestricted raw document exposure to chat.
- Document-aware coaching context that uses least-privilege retrieved summaries only after explicit consent and with source references visible to the user.
- AI-generated typed proposals only when document context implies a coaching-state change, with backend validation and user approval before applying changes to profile, goals, workout, nutrition, or Today state.
- Focused audit metadata for consent, upload, parsing, summary generation, retrieval, and AI-context use without storing private raw content in logs.

## Out Of Scope

- Diagnosis, treatment planning, clinical decision support, medical certainty language, or replacing professional medical advice.
- Emergency triage, medication dosing instructions, interpretation of imaging, or abnormal lab result diagnosis.
- Upload or AI use of documents without explicit, revocable user consent.
- Storing raw document files, raw OCR text, raw AI prompts, or private health data in plain database fields or application logs.
- Broad EHR integration, provider portals, FHIR ingestion, insurance claims processing, or production medical-records architecture.
- Automatic mutation of profile, goals, workouts, nutrition, Today, or metrics from a document summary.
- Mobile document upload unless explicitly chosen for this phase; initial implementation can be web/API first.
- Production-grade vector infrastructure choice without a privacy/security review.
- Document sharing with coaches, clinicians, or third parties.

## Product Rules And Safety

- Chat remains an interaction layer; structured document records and summaries are the authoritative document state.
- Documents require explicit consent before collection, parsing, summarization, indexing, or use in coaching context.
- Consent must be scoped and revocable, including separate treatment for upload/storage, parsing/OCR, AI summarization, semantic retrieval, and coach-chat context use.
- Least-privilege context is mandatory: AI receives only the minimum approved summary snippets or extracted constraints needed for the current request.
- Raw documents, raw OCR text, private health data, and raw AI prompts containing private health data must not be logged.
- Document summaries must be governed structured data with schema validation, ownership checks, review status, and traceability to the source document.
- AI may explain what a user-uploaded document appears to contain in cautious, non-diagnostic language, but must direct users to qualified professionals for medical interpretation.
- AI may propose coaching changes based on approved document context, but backend services must validate and the user must approve before any state changes are applied.
- Workout and nutrition changes remain revision-safe when accepted proposals are derived from document context.
- Deleting a document or revoking consent must prevent future AI-context use and search retrieval of that document-derived context.
- Access control must enforce user ownership for document metadata, summaries, search results, and generated proposals.

## User Stories

- As an authenticated user, I can understand what document access is used for before I upload anything.
- As an authenticated user, I can grant explicit consent to upload a health document and choose whether it can be parsed, summarized, indexed, and used by the coach.
- As an authenticated user, I can upload a supported health document and see processing status without exposing raw content in the UI unnecessarily.
- As an authenticated user, I can review a concise structured summary and extracted coaching constraints from my document.
- As an authenticated user, I can search my approved document summaries and see which source document each result came from.
- As an authenticated user, I can ask the coach a wellness or fitness question that uses approved document summaries as context.
- As an authenticated user, I can revoke document context use or delete a document so it is no longer used in coaching responses.
- As an authenticated user, I can approve or reject any AI-proposed profile, workout, nutrition, goal, or Today change derived from document context.
- As a developer, I can verify that documents never cause direct domain mutations and that revoked documents are excluded from retrieval.

## Acceptance Criteria

- Users must explicitly consent before a document is uploaded, parsed, summarized, indexed, or made available to coach chat.
- Authenticated users can create, list, read, and delete or revoke only their own document records.
- Document metadata is persisted with user id, type, storage reference, parse status, consent scope, timestamps, and deletion/revocation state.
- Raw document binaries are stored outside plain database fields, and raw OCR text is not stored unless a reviewed, encrypted, retention-governed design explicitly permits it.
- The parsing pipeline records status transitions and safe failure reasons without logging raw document content.
- A successful parse can produce a structured `HealthDocumentSummary` with summary payload, extracted constraints, generated timestamp, source document id, and review status.
- Users can inspect summaries before they are used in coaching context when review is required by consent or product policy.
- Semantic search returns only consent-approved document-derived summaries or chunks owned by the authenticated user.
- Coaching context includes document-derived information only when consent allows it and only as least-privilege summary snippets or extracted constraints.
- AI responses using document context avoid diagnosis, treatment, and medical certainty language.
- AI-derived state changes are saved as typed proposals and require user approval plus backend validation before application.
- Accepted workout or nutrition changes derived from documents create auditable revisions rather than overwriting active plans.
- Revoked consent or deleted documents are excluded from search, AI context, and future proposal generation.
- Focused tests cover schema validation, consent gates, ownership checks, parse status transitions, summary governance, search filtering, AI context filtering, proposal flow, and unsafe medical wording.

## Implementation Slices

1. Define privacy, consent, and retention decisions for document upload, parsing, summary storage, semantic indexing, revocation, and deletion.
2. Add shared document contracts in `packages/types` for document metadata, consent scopes, upload requests, parse status, summary payloads, search responses, and safe document-context references.
3. Add database schema and migrations for document metadata, summaries, and any consent/audit records needed before ingestion.
4. Add a backend Documents module with controller, service, repository, ownership checks, upload metadata lifecycle, delete/revoke handling, and safe status reads.
5. Integrate object storage or a local development storage adapter for raw files, keeping secrets out of the repository and raw files out of the database.
6. Add OCR/text extraction and summary generation as a controlled asynchronous pipeline with safe failure handling, redacted logs, and schema-validated outputs.
7. Add semantic indexing/search over approved summary chunks or governed extracted context, with consent and ownership filters applied before retrieval.
8. Extend coaching context so chat can retrieve least-privilege document summaries only when explicitly consented, and can cite document source references in the user-facing response.
9. Extend proposal validation only if document-aware coaching needs to create profile, goal, workout, nutrition, or Today proposals; do not add direct document mutation proposals unless a later phase requires them.
10. Add the web Documents route and navigation entry for consent education, upload, status, summary review, search, and revoke/delete actions.
11. Add focused tests, security review, and runtime verification across upload, parse, summary, search, chat context, proposal approval, and revocation flows.

## Role-Specific Work Plan

- Product Analyst: complete this brief, resolve first-pass scope questions, and keep acceptance criteria aligned with consent, privacy, and non-diagnostic safety rules.
- Backend Implementer: add shared contracts, Drizzle schema and migrations, Documents module APIs, storage abstraction, parse status lifecycle, summary governance, semantic search interfaces, coaching-context retrieval, and document-derived proposal integration.
- Frontend Implementer: add the web Documents route, navigation entry, consent education, upload/status flows, summary review, search, revoke/delete controls, and document-source references in chat where applicable.
- Design System Agent: review or add reusable upload, consent, status, summary, search-result, and destructive-action patterns if existing primitives are not sufficient.
- Visual Designer: audit the Documents surface for trust, clarity, privacy reassurance, and cautious medical-language framing before polish implementation.
- UI Polish Implementer: apply approved visual-only refinements after functional web flows exist.
- Test Writer: add focused contract, backend, AI-context, safety, search, proposal lifecycle, and UI state tests.
- Implementation Reviewer: review architecture fit, security/privacy posture, least-privilege retrieval, logging behavior, safety copy, migrations, and test coverage.
- App Runner: start the local stack and verify the upload-to-summary-to-search-to-chat-context-to-revocation smoke flow with a synthetic non-private sample document.

## Approval Gate

Implementation should not start until the user approves the plan and confirms which subagents to use or skip. The default recommended role list is Backend Implementer, Frontend Implementer, Design System Agent, Visual Designer, Test Writer, Implementation Reviewer, and App Runner. UI Polish Implementer should be used only after functional flows exist and visual changes are approved.

## Test And Verification Plan

- Contract tests for document type, consent scope, parse status, summary payload, search result, and document-context schemas.
- Repository/service tests for user ownership, consent enforcement, parse status transitions, deletion/revocation behavior, and summary visibility.
- Upload tests for supported/unsupported file types, size limits, metadata validation, and safe error messages.
- Pipeline tests for OCR/parse failures, summary validation failures, retry/idempotency behavior, and redacted logging.
- Search tests proving results are scoped to the authenticated user, consent-approved summaries only, and revoked/deleted document context is excluded.
- AI context tests proving coach prompts receive only approved summary snippets or extracted constraints and never raw documents by default.
- Proposal lifecycle tests proving document-derived coaching changes become typed proposals and do not mutate structured state until accepted and validated.
- Safety tests for diagnosis, treatment, emergency, medication dosing, and medical certainty wording.
- Web UI tests for consent education, upload states, processing states, summary review, search empty/error states, and revoke/delete flows.
- Runtime smoke test: authenticated user grants consent, uploads a sample non-private test document, receives a structured summary, searches it, asks a document-aware coaching question, sees no direct mutation, accepts a safe proposal if generated, revokes consent, and verifies the document no longer appears in search or coaching context.

## Risks

- Health documents create a high privacy and trust burden; the phase should not proceed without consent, storage, retention, and logging controls.
- OCR and AI summarization can produce inaccurate summaries; user review, cautious copy, and source references are necessary.
- Semantic search can accidentally over-share sensitive context; retrieval must be filtered by ownership, consent, review status, and least-privilege relevance.
- The feature can drift into medical diagnosis or treatment; product copy, prompts, validation, and tests must keep it in wellness/coaching scope.
- Raw document storage and vector indexing introduce infrastructure and compliance questions beyond the current MVP 1 stack.
- Revocation semantics can be hard if summaries or embeddings have already been generated; deletion, tombstoning, and index cleanup must be designed before launch.
- Document-derived constraints may conflict with existing profile, workout, or nutrition state; changes must route through proposals and preserve revision history.
- Local verification may be blocked by missing object storage, OCR provider, vector search, Clerk, or Postgres configuration.

## Open Questions

- What exact consent scopes are needed for upload, storage, OCR, summarization, indexing, and AI-context use, and should any be enabled by default after upload?
- Which document types and file formats are supported in the first pass, and what size/page limits apply?
- Where are raw document binaries stored, how are they encrypted, and what retention/deletion guarantees are required?
- Is raw OCR text stored at all, or is it treated as transient input for summary/chunk generation only?
- What review status is required before a generated summary can be searched or used by chat: automatic, user-reviewed, or admin-reviewed?
- Which semantic search backend is acceptable for local development and production, and how will embeddings be removed after revocation or deletion?
- Should document-aware coaching be web-only initially, or should mobile read/search support be included in this phase?
- How should the UI phrase uncertain extracted facts so the product avoids medical certainty while still being useful?
- What audit events are required for consent changes, upload, parsing, summary generation, search, AI-context retrieval, proposal creation, and deletion?
- Should document context ever create a new document-specific proposal target domain, or should it only inform existing profile, goal, workout, nutrition, and Today proposals?
