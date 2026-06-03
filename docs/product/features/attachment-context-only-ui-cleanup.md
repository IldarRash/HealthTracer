# Feature Brief: Attachment "Context-Only" UI Cleanup (web)

- **Type:** Bug fix (copy + dead-state cleanup)
- **Surface:** `apps/web` chat composer only
- **MVP fit:** Maintenance / invariant correction within current MVP. No scope expansion.
- **Status:** Scoped, root cause confirmed (do not re-derive).
- **Owner workflow:** feature-planner orchestration (product-analyst → frontend-implementer → test-writer → implementation-reviewer → app-runner).

## Problem

The web chat composer tells users their attachment will be **classified / recognized** after they send their message. The backend does **not** do this. This directly contradicts the locked product invariant in `docs/architecture/llm-pipeline.md` and `.claude/rules/ai-orchestrator.md`:

> Attachments are **context-only**. There is **no** recognition/classification machinery. The multimodal domain LLMs read attachment content directly; nothing classifies/recognizes attachments.

Backend confirmation (already verified, do not re-derive):
- `apps/api/src/modules/chat-attachments/chat-attachments.controller.ts` has **no** `/recognize` route.
- `apply_upload_disposition` in `chat-turn-attachment-stage.service.ts` only sets retention/consent/category.
- Upload sets `status: "queued"`.
- No production backend code under `chat-attachments` ever sets `status: "recognizing"` (only spec mocks do).

The result is twofold:
1. **Misleading user-facing copy** that promises recognition/classification that never happens.
2. A **dead local draft "recognizing" phase** in the composer that the running app can never reach, kept alive only by the stale copy era.

## Why it matters

- Violates a non-negotiable product invariant ("attachments are context-only").
- Sets a false user expectation (users wait for "recognition" that never runs).
- Carries dead UI state that the repo's refactor-cleanup rule requires removing.
- Health-copy correctness: the copy must stay supportive and wellness-only, never implying automated medical/clinical analysis of documents.

## Root cause (confirmed — use, do not re-derive)

Stale recognition-era UI in `apps/web`:

**A. Misleading copy constants** in `apps/web/src/lib/chat-attachment-ui-state.ts`:
- `:31-32` `CHAT_ATTACHMENT_PRIVACY_NOTICE` — "Attachments are classified when you send your message … handled separately during recognition."
- `:34-35` `CHAT_ATTACHMENT_CATEGORY_HINT` — "Recognition runs after send."
- `:37-38` `MESSAGE_FIRST_ATTACHMENT_COPY` — "will be classified and recognized after you send your message."
- `:46-47` `FOOD_OR_WORKOUT_RECOGNIZE_COPY` — "correct classification before send."
- `:64-65` `CHAT_ATTACHMENT_FAILED_COPY` — "Recognition could not finish."
- (Implementer should also scan `WORKOUT_ATTACHMENT_MANUAL_FALLBACK_COPY` `:55-56` which says "Workout recognition may not capture every detail" — same family; rewrite to context-only wording if it remains user-facing.)

**B. Unreachable local DRAFT `"recognizing"` phase** in the composer:
- `chat-attachment-ui-state.ts`: `ChatComposerAttachmentDraft.phase` union (~104-111) includes `"recognizing"`; branches in `resolveAttachmentDisplayStatus` (~332-356), `chatAttachmentStatusLabel` "Recognizing" (~358-383), `chatAttachmentStatusBadgeTone` (~385-407), `isChatComposerAttachmentProcessing` (~441-448), and the `phase === "recognizing"` guard in `isChatAttachmentSendEligible` (~409-439).
- `apps/web/src/components/chat/chat-composer-attachments.tsx`: `phase === "recognizing"` used for `isProcessing` (~121, ~191).

The backend never sets a draft to `"recognizing"` pre-send, so this draft phase is unreachable in production.

## Scope

### In scope (web only)
1. **Rewrite the misleading composer copy** (the constants in `chat-attachment-ui-state.ts` listed above) to accurate context-only wording.
2. **Remove the unreachable local draft `"recognizing"` phase** (preferred per refactor-cleanup) — the `ChatComposerAttachmentDraft.phase` union value and every branch that handles it in `chat-attachment-ui-state.ts` and `chat-composer-attachments.tsx`. If full removal proves to ripple beyond these two files, it must at minimum be provably unreachable and never rendered, with the reason stated.
3. Update affected web tests/snapshots that assert the old copy or the `"recognizing"` draft status.

### Secondary / optional (web only — implementer judgment, see note)
- There is a related dead affordance: the optional pre-send `onRecognizeDraft` callback and its gate `canPreviewRecognizeChatAttachmentDraft` in `chat-composer-attachments.tsx`. **Verified:** the parent `chat-workspace.tsx` never passes `onRecognizeDraft`, so the "Recognize now" button (line ~358) and `canRecognizeOptional` are always false / never render. This is also dead recognition-era machinery.
  - **Recommendation:** the implementer MAY remove `onRecognizeDraft` + `canPreviewRecognizeChatAttachmentDraft` + the recognize branch of `attachmentNeedsComposerExtras` **only if** it can be done without altering the **live** category-correction "extras" rendering (ambiguous-image and unclassified-document correction, which ARE used). If removing it risks the live category-correction path, **defer it** and call it out by name in the final summary. The primary bug fix (copy + the `"recognizing"` phase) does not depend on this.

### Out of scope (DO NOT TOUCH — collision risk with other in-flight workflows)
This bug is **observation 1 of three**. The other two are handled by separate workflows that share these files; staying in scope avoids merge conflicts:
- **Bug: attachment-not-visible** — separate workflow (touches attachment outcome rendering).
- **Bug: proposal-rendered-separately** — separate workflow (touches proposal rendering).

The word "recognition" also survives in **live shared contract** that must NOT be changed here:
- `packages/types/src/chat-attachments.ts`: the `ChatAttachmentStatus` enum value `"recognizing"` (line 32) remains a valid contract value; also `recognitionProvenanceSchema`, `RecognitionConfidenceBand`, the `"ephemeral_recognition"` retention value, and the `low_confidence` / `needs_review` statuses. **Leave all of these.**
- `apps/api` backend and its specs (e.g. `chat.service.spec.ts:2570` "rejects chat send when attachment refs are still recognizing"; `chat-turn-attachment-stage.service.spec.ts`). **Leave all of these.**
- Web **outcome** rendering and `ChatAttachmentOutcome.recognition` provenance: `apps/web/src/components/chat/chat-attachment-outcome-panel.tsx`, `chat-workspace.tsx` outcome paths. **Leave these** (tied to shared contract + the other two bugs).

Distinction the implementer must hold: this fix touches the **local pre-send draft** `phase` (a web-only union, value `"recognizing"`) and **composer copy** — NOT the shared `ChatAttachmentStatus` contract value `"recognizing"` nor any post-send outcome rendering.

### Mobile
`apps/mobile` was checked: it has **no** recognition/classification copy and **no** "recognizing" UI state (grep for `recogniz`/`classif` and `recognizing` returns nothing under `apps/mobile`). **Mobile is out of scope** — there is nothing to fix there.

## Acceptance criteria (testable)

1. **No recognition/classification promises in composer copy.** No user-facing composer string asserts that attachments are recognized or classified after send. Copy accurately conveys: attachments are shared as **context for coaching**; nothing is auto-recognized/classified; the **user picks the category**; medical/wellness documents are **consent-gated**.
2. **Wellness-only, supportive tone.** No diagnosis, treatment, or medical-certainty language. Wellness documents are described as coaching context only, explicitly not reviewed for medical advice/care.
3. **No reachable "Recognizing" UI.** The composer cannot render a "Recognizing" status/label, and the `"recognizing"` draft phase is removed (preferred) or provably unreachable. `isChatComposerAttachmentProcessing` and `isChatAttachmentSendEligible` no longer branch on a `"recognizing"` draft phase (or that branch is dead-by-construction and documented).
4. **No behavior change** to: file upload, consent gating, send-eligibility decisions, or category selection. Send/consent behavior for `local` / `uploading` / `uploaded`(queued) / `needs_consent` / `ready` / `error` draft phases is identical to before.
5. **Tests updated and green.** `apps/web/src/lib/chat-attachment-ui-state.spec.ts`, `apps/web/src/lib/api.spec.ts`, and `apps/web/src/components/chat/chat-composer-attachments.spec.ts` (and any other web spec) no longer assert the old recognition copy or the `"recognizing"` draft status; new assertions cover context-only copy and the absence of a reachable recognizing state.
6. **Validation passes:** `corepack pnpm --dir apps/web lint` (repo is `--max-warnings=0`), `corepack pnpm --dir apps/web typecheck`, and the relevant `vitest` files.
7. **Runtime verified:** uploading an attachment in the running web app shows accurate context-only copy and never a "Recognizing" state — OR a concrete blocker preventing local run is reported.

## Risks & mitigations

- **Scope bleed into shared recognition contract / the other two bug workflows.** Mitigation: hard boundary above; do not edit `packages/types`, backend, backend specs, or outcome-panel recognition rendering. Distinguish local draft `phase` from the `ChatAttachmentStatus` contract value.
- **Health-copy safety regression.** Mitigation: implementation-reviewer treats copy as health-sensitive; wellness-only, no medical-certainty language; reviewer explicitly checks new strings.
- **Removing the draft phase value ripples into the component or send/consent logic.** Mitigation: keep send/consent/category behavior byte-for-byte equivalent for all surviving phases; test-writer asserts send-eligibility unchanged; if removal is too invasive, gate-and-document instead of partial removal.
- **Accidentally removing the live category-correction "extras" path while removing the dead `onRecognizeDraft` affordance.** Mitigation: the secondary cleanup is optional and conditional; defer + report if it endangers the live category-correction rendering.

## Non-goals
- No new recognition/classification feature (the invariant forbids it).
- No change to upload pipeline, consent model, retention, or category model.
- No backend, contract, mobile, or outcome-panel changes.
- No fix for the other two attachment bugs (handled separately).
