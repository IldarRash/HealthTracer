# Chat File Attachments (PDF/TXT/MD) + 20k Message Cap

GitHub issue: #59 · Branch: `feature/chat-file-attachments`

## Problem (real owner case)
A user had to paste a whole workout program as chat text because attachments are images-only — and the AI replied "Я не могу напрямую сохранить вашу программу тренировок..." instead of proposing `create_workout_plan`. Root cause for the second part: Zod 4000-char `userMessage` caps in the domain/decision request schemas force the domain LLM into the fallback path → no candidates → `plain_reply`.

## Goals
1. Attach PDF/TXT/Markdown files in chat as **context-only** input — extracted text reaches ALL selected domain LLMs (including workout), 12k-char cap, lazy per-turn extraction, never persisted or logged.
2. Raise the user message cap to **20 000 chars** (the router keeps its 4 000 budget via explicit head-truncation).
3. Golden eval coverage for "paste long RU program → `create_workout_plan` proposal".

## User Stories
- As a coached user, I can attach my program as a PDF/TXT/MD file in chat and ask the coach to save it, and get a `create_workout_plan` proposal.
- As a user pasting a long program as plain text, I get a proposal instead of a "can't save" refusal.

## In Scope
- Chat composer upload of `.pdf` / `.txt` / `.md` (≤5MB), category `document_file`, `categorySource = mime_inferred`.
- Lazy per-turn text extraction (12k cap) injected as context to all selected domain LLMs.
- Message cap raised to 20 000 chars; router head-truncates to 4 000.
- Graceful degradation for scanned/empty PDFs.

## Out of Scope (Non-Goals)
- No recognition/classification machinery; no consent gates for chat files.
- No DOCX; no mobile (no chat attachments there).
- No persistence of extracted text.
- Document upload/parse remains the separate, explicit **Profile Documents** feature.

## Acceptance Criteria (testable)
1. Upload `.pdf`/`.txt`/`.md` (≤5MB) in the chat composer succeeds → category `document_file`, `categorySource = mime_inferred`.
2. Send a message with an attached program file + "сохрани эту программу" → coach proposes `create_workout_plan` built from the file content.
3. Paste a >4000-char program as plain text + ask to save → `create_workout_plan` proposal (no more "can't save").
4. Scanned/empty PDF degrades gracefully: metadata-only context, the turn succeeds, and the coach explains it couldn't read the file.
5. No `health_documents` row is ever created from a chat attachment (`linkedDocumentId` stays null) — regression-tested.
6. Images behavior unchanged (vision still nutrition/health only).

## Risks / Assumptions
- Scanned PDFs without a text layer yield no usable text (covered by AC 4).
- `.md` MIME variance — normalize by extension on web.
- Token cost bounded by the 12k extraction cap.
- One-time prompt-cache invalidation from editing the static-prefix template.

## Initial Implementation Plan (for planner refinement)
- Backend: relax domain/decision `userMessage` Zod caps to 20 000; raise chat input cap; router head-truncates to 4 000.
- Attachments: accept `document_file` category for PDF/TXT/MD; lazy per-turn extractor (12k cap), context-only, no persistence/logging; assert `linkedDocumentId` stays null.
- Context: inject extracted text into all selected domain packets (incl. workout); keep `allowDocuments=false` DB-slice floor intact.
- Frontend (web only): composer accepts the new file types, extension-based MIME normalization.
- Tests: golden eval (long RU program → `create_workout_plan`), no-`health_documents` regression, scanned-PDF degradation, images-unchanged.
