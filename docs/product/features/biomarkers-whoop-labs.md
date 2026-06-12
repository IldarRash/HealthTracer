# Biomarkers (Whoop-style lab reports)

Status: Implemented MVP (branch `feature/biomarkers-whoop-labs`).
Supersedes and **fully replaces** the prior health-documents feature.

## Problem

Users want to bring their bloodwork into the coach: upload a lab PDF, see each marker
tracked over time in a clear dashboard, and let the coach reason over the values as
consent-gated context — without the product ever drifting into diagnosis. The earlier
general-purpose health-documents feature (OCR, governed summaries, document-signal pattern
extraction, correlations preview, semantic search, five-scope consent) was broad, hard to
keep safe, and not what users actually reached for. This feature narrows the surface to the
high-value case: **labs**.

## Whoop reference model

Whoop's "Blood / Body" experience is the reference: a small, curated set of meaningful
markers grouped into a few **areas**, each marker shown against a wellness-framed "typical"
band with a simple range bar and a value history — not a clinical lab portal with raw
reference ranges and abnormal flags. We mirror the *shape* (curated catalog, area grouping,
range bars, history, wellness-neutral wording), not Whoop's specific marker list or ranges.

## Decisions

- **Full replacement, not additive.** The documents module, its tables, contracts, UI, and
  the `DOCUMENT_STORAGE_PATH` env var are deleted (pre-launch, disposable DB; see
  "Removed Legacy Paths" in `llm-pipeline.md`). Migration
  `0038_biomarkers_replace_documents` drops the document tables and builds the new model.
- **Labs-only.** No OCR-everything / arbitrary-document handling — the extractor only maps
  measurements onto a closed catalog and counts everything else as unmapped.
- **Two-level consent** (replacing the five-scope per-document model): a
  structurally-required upload-time `storeAndParse` (`z.literal(true)`) plus an optional,
  revoke-able per-report `coachChat` toggle (`coachContextConsentAt`).
- **Show immediately + edit.** Extracted readings are shown to the user as soon as they
  exist; the user can add, edit, and delete readings manually. Manual readings are always
  coach-eligible (the user typed them deliberately); extracted readings reach the coach only
  with per-report coach-chat consent.
- **Wellness-neutral framing.** Ranges are "typical", never "normal/abnormal/deficient".
  Values are stored **as-reported** — there is deliberately **no unit conversion anywhere**
  (silent mmol/L↔mg/dL conversion is the most dangerous bug class for lab data).

## Architecture summary

### Catalog as code

`packages/types/src/biomarkers.ts` holds the catalog **as code** — **48 markers across 8
areas** (`metabolic`, `lipids_cardiovascular`, `hormones`, `nutrients`, `inflammation`,
`blood_count`, `kidney`, `liver`). There is **no DB catalog table and no pg enum**; each
`BiomarkerCatalogEntry` carries `canonicalUnit`, `acceptedUnits` (as-reported, no
conversion), a wellness-framed `typicalRange` (nullable where too sex/age-variable to frame
fairly), an `optimalRange` (null for nearly all markers at MVP), EN/RU `aliases` (consumed by
the extraction prompt), and `valueKind`. `BIOMARKER_KEYS` derives the closed `z.enum`; a
catalog-integrity test asserts keys stay in sync.

> Note: the engineering shorthand has called this a "47-marker" catalog; the catalog as
> shipped contains **48** keys (and the code comment says "~50"). Use 48 as the source of
> truth (`BIOMARKER_KEYS.length`).

`validateBiomarkerReadingValue` is the **single** shared value validator used by both the
extraction pipeline and manual add/edit: catalog re-check, exactly-one-of `value`/`valueText`,
plausibility band (`[low/20, high*20]`, `BIOMARKER_PLAUSIBILITY_FACTOR`), unit
allowlist/length, and an **injected** EN/RU unsafe-medical-language check (injected because
`packages/types` cannot depend on `packages/ai`).

### Tables (`packages/db/src/schema/biomarkers.ts`, migration `0038`)

- `lab_reports` — uploaded file record: `storage_reference`, `mime_type`, `file_size_bytes`,
  `status` (`uploaded`/`processing`/`extracted`/`failed`), `failure_code`, `observed_at`,
  `unmapped_marker_count`, `consent_version`, `store_parse_consent_at` (NOT NULL),
  optional `coach_context_consent_at`, `extracted_at`, soft-delete `deleted_at`.
- `biomarker_readings` — `biomarker_key` (text, catalog-validated), `value` (numeric) **or**
  `value_text`, `unit`, optional `reference_range_text`, `observed_at`, `source`
  (`extraction`/`manual`), `confidence`, `user_edited`, nullable `lab_report_id`,
  soft-delete `deleted_at`.

Migration `0038` drops `health_documents`, `health_document_summaries`, `document_signals`
(and their six `document_*` enums) plus `chat_attachments.linked_document_id`.

### Out-of-band extraction pipeline

A **dedicated pipeline, separate from the chat fan-out** — it has its own provider interface
(`LabExtractionProvider`, `packages/ai`; live impl `OpenAiLabExtractionProvider`,
`apps/api/src/modules/biomarkers`) so the `CoachAiProvider` three-method fan-out surface is
untouched. `LabReportsService.extract` runs: storage read → parse (`LabDocumentParser`) →
extraction LLM → `labExtractionOutputSchema` parse → per-reading
catalog/plausibility/unsafe-language validation → transactional reading replacement.

- Strict structured output: OpenAI `response_format: json_schema` with `strict: true` over the
  closed 48-key catalog enum; `temperature: 0`; static/cacheable system prompt built from the
  catalog; **document text goes only into the user message**, never the system prompt, a log
  line, or a persisted field.
- Retry/timeout: up to 2 retries on network/429/5xx; 60s `AbortSignal.timeout` budget.
- Typed `failureCode`s (never fake-success): `file_unreadable`, `pdf_no_text`,
  `content_too_large`, `not_a_lab_report`, `llm_unavailable`, `llm_invalid_output`,
  `no_readings_extracted`.
- Unmapped markers are counted only; their free-text labels are never returned or persisted.
  Individual invalid/unsafe readings are dropped (counted into `unmappedMarkerCount`), never
  failing the whole batch. EN/RU unsafe-language drops apply to unit/`valueText`/reference
  range. `OPENAI_MODEL_LAB_EXTRACTION` overrides the model (falls back to `OPENAI_MODEL`).

### Coach context slice

`BiomarkersService.buildBiomarkerContextSummary` produces a single bounded
`biomarkerContext` slice (`packages/types/src/biomarker-context.ts`): ≤30 items, one latest
reading per marker, **no reference ranges**, structured catalog-labeled data only. This
replaces the deleted `documentContext` / `documentSignalContext` / `correlationInsights`
slices. It is **exempt from the `allowDocuments` context-budget floor by design** (it is
user-visible, user-editable, consent-gated structured state, not raw document text). Proposal
evidence may reference a `biomarker_reading` (`packages/types/src/proposal-evidence.ts`),
replacing the removed `document_signal` evidence type.

## API surface

All under `BiomarkersController` (`apps/api/src/modules/biomarkers`), Clerk-guarded,
ownership-scoped:

- `POST /lab-reports` — upload (base64 + `consent.storeAndParse` literal-true + optional
  `consent.coachChat`).
- `GET /lab-reports` — list active reports.
- `GET /lab-reports/:reportId` — report + its readings.
- `POST /lab-reports/:reportId/extract` — run the out-of-band extraction pipeline.
- `PATCH /lab-reports/:reportId/consent` — toggle per-report coach-chat consent.
- `DELETE /lab-reports/:reportId` — delete report (storage + soft-delete).
- `GET /biomarkers` — dashboard by area (markers + latest reading + typical range).
- `POST /biomarkers/readings` — add a manual reading.
- `PATCH /biomarkers/readings/:readingId` — edit a manual/extracted reading.
- `DELETE /biomarkers/readings/:readingId` — delete a reading.
- `GET /biomarkers/:biomarkerKey` — per-marker history.

Web: `/biomarkers` (`apps/web/app/biomarkers`, `apps/web/src/components/biomarkers/*`) — a
dark-world route whose wayfinding parent is **Nutrition** (secondary route, not a primary
tab). Dashboard-by-area with range bars, per-marker history detail, an upload panel, and
"typical range" wellness wording.

## Safety invariants

- AI never produces diagnosis/treatment/medical-certainty language; ranges are "typical".
- Values stored as-reported; **no unit conversion** anywhere.
- Extracted **document text is never persisted or logged**; only structured readings and the
  raw file bytes survive. All extraction failure reasons are fixed enum strings.
- A reading reaches the coach **only** when the user deliberately put it there (manual, or
  extracted with `coachContextConsentAt`). The chat slice carries no reference ranges.
- The `allowDocuments=false` context-budget floor is **kept** (now meaning raw
  document-derived text slices); `biomarkerContext` is exempt by design.
- **No attachment path may create or parse `lab_reports` / `biomarker_readings`** — the
  chat-attachments path stays context-only (enforced + regression-tested). Reading
  persistence is explicit-upload / manual-entry only.
- Storage: raw bytes on an access-controlled, encrypted store in production
  (`STORAGE_ALLOW_LOCAL_IN_PRODUCTION` only behind a durable volume).

## Deferred items

- OCR / photo (image) lab upload — current extraction is PDF/plain-text only.
- Unit conversion between accepted units (deliberately a non-goal for now).
- Optimal / longevity ranges (`optimalRange` is null for nearly all markers at MVP).
- Sex-specific ranges (no profile sex field yet; sex-variable markers use null or a wide
  unisex band).
- Reading ids in the coach context slice for self-citation (the slice has no ids today).
- LLM-recognized attachment **special save**: an attachment recognition signal → consent-gated
  save proposal → on accept persist a reading. Still a hard boundary, not built.
