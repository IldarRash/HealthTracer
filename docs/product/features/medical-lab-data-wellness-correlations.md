# Medical and Lab Data Wellness Correlations

**Status:** Proposed — partial foundation exists (documents module, health metrics, proposal pipeline); lab extraction and correlation engine not implemented.

## UX Placement

Document upload, extracted-signal review, consent, revocation, and auditability belong in Profile. Wellness-safe correlation summaries may appear in Chat responses and Longevity overview cards when consented and bounded. This feature must not create a standalone medical analytics tab or expose clinical interpretation as product UI.

## Summary

Enable users to upload medical and lab documents with explicit consent and allow the coach to use **wellness-safe extracted signals** plus existing fitness/recovery metrics to generate correlation insights and **typed, user-approvable proposals** (workout, nutrition, recovery, habits). This feature is a coaching-context and proposal-quality enhancement, not a diagnosis or treatment capability.

## Problem

Users already have meaningful health context (lab reports, clinical notes, symptoms journals, wearables), but current product behavior can only use limited document summaries and basic metrics snapshots. Without structured biomarker extraction, temporal alignment, and governed correlation reasoning, coaching adjustments are generic and cannot reliably connect user-observed trends across physical and mental indicators and plan adherence.

## In Scope

- Consent-first upload and use of medical/lab documents as contextual input.
- Structured extraction pipeline for wellness-relevant fields (biomarker name, value, unit, reference range text, date, source doc section).
- Governance layer that transforms extracted data into **wellness-safe signals** (not clinical interpretations).
- Cross-signal correlation service combining document-derived signals, health metrics aggregates, and progress/adherence context.
- AI prompt-context extension to include bounded correlation artifacts.
- Proposal generation enhancements that cite correlation evidence and remain in existing typed proposal + approval flow.
- UX/API support for data consent visibility, correlation insight summaries, and evidence traceability for each proposal.

## Out of Scope

- Clinical diagnosis, treatment plans, medication recommendations, dosage changes, or urgency triage.
- Replacing clinician interpretation of labs.
- Autonomous plan mutation without explicit user approval.
- Full EHR interoperability or provider network integrations in this slice.
- Unexplainable risk scoring or black-box clinical outputs.

## Product and Safety Rules

**Allowed (with explicit user consent):**

- Use uploaded medical/lab data as contextual wellness input.
- Detect and summarize non-clinical correlations (for example lower sleep + higher fatigue + reduced training completion).
- Propose coaching adjustments in wellness domains (training load, recovery, nutrition structure, habit cadence).

**Not allowed:**

- Diagnose conditions, infer diseases, provide treatment, or interpret labs with medical certainty.
- Present medical conclusions as facts ("you have X", "this confirms Y").
- Provide medication or dosing guidance.
- Bypass safety filters or proposal validation layers.

## User Stories

- As a user, I can upload lab/medical documents and explicitly choose whether they can be used for coaching context.
- As a user, I can see what was extracted from my document and what was ignored.
- As a user, I can receive wellness-oriented correlation insights linking mental/physical indicators and behavior patterns.
- As a user, I can review AI-proposed plan changes with clear evidence references before accepting.
- As a user, I can revoke consent and ensure the system stops using that data for future coaching context.

## Acceptance Criteria

- Document ingestion supports a real file parsing path (beyond dev `text/plain` sample path).
- Lab-oriented extraction produces structured signal records with provenance and confidence metadata.
- Only consent-eligible, approved summaries/signals appear in AI context.
- Correlation output is bounded to wellness-safe language and format.
- AI responses and proposals pass existing safety and schema validation.
- Any accepted proposal still creates revision-safe plan updates (no in-place overwrite).
- Revoked document consent removes the document from future context and search/correlation eligibility.
- System exposes user-visible rationale/evidence references for correlation-backed proposals.
- Tests cover unsafe wording rejection, consent gating, invalid extraction payload rejection, and proposal application correctness.

## Data and API Implications

- Extend data model with structured document-derived signal entities (new table(s), not only summary text).
- Add typed contracts in `packages/types` for extracted lab/medical wellness signals, correlation insight objects, and evidence references.
- Documents module additions: parse/extract endpoint lifecycle, extraction status and errors, retrieval of extracted signals.
- Coaching-context additions: include correlation artifacts and provenance-safe references.
- Optional read endpoint for correlation insights preview, similar to existing AI-context preview pattern.

## AI and Proposal Implications

- AI input context should include approved document-safe signals, consent-filtered metrics summaries, and trend/adherence context.
- AI output remains typed proposals; no direct domain mutation.
- Proposal payloads need explicit evidence refs and rationale inputs for auditability.
- Safety guardrails remain hard constraints: reply safety, proposal safety, domain/schema validation, user approval gate.

## Implementation Slices

1. **Consent and contracts hardening** — finalize consent scopes and add typed schemas.
2. **Document extraction foundation** — replace dev-only parse path with pluggable extraction pipeline; persist structured signals with provenance.
3. **Correlation engine v1** — build deterministic, explainable correlation heuristics across document signals, metrics, and progress.
4. **AI context and proposal wiring** — inject correlation artifacts into coaching context and require evidence-backed proposal rationale.
5. **API/UI surfaces** — add endpoints/views for extraction results, correlation summaries, consent/revocation transparency.
6. **Safety/test hardening and rollout controls** — expand automated safety tests, feature flags, and observability for extraction/correlation errors.

## Risks and Open Questions

- **Safety drift risk:** correlation language could creep toward diagnosis without strong policy tests.
- **Extraction quality risk:** OCR/parsing noise may create false correlations; need confidence thresholds and fallback behavior.
- **Consent UX complexity:** users need clear, granular controls and understandable consequences of revocation.
- **Data provenance:** should users approve extracted signals before AI can use them, or only approve summaries?
- **Metric coverage gaps:** native device sync is scaffolded but not live; correlation quality may be uneven until real sync lands.
- **Retention/deletion:** define behavior for extracted lab signals and audit logs.

## Status vs Current Implementation

| Capability | Status |
|------------|--------|
| Document upload with consent | Partial — dev text path |
| Structured lab/biomarker extraction | Missing |
| Wellness correlation engine | Missing |
| Correlation-backed proposals | Missing |
| Proposal pipeline and validation | Implemented |
| Health metrics aggregates | Partial — API exists, native sync missing |
