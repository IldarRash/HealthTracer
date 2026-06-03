# Feature Brief: Chat Attachment Visibility on Persisted Messages

- **Type:** Bug fix (display-only enrichment of the chat message contract + web render path)
- **Surface:** `packages/types` (contract), `apps/api` chat module (DTO population), `apps/web` chat thread render
- **MVP fit:** Maintenance / correctness within current MVP. No scope expansion, no new feature.
- **Status:** Scoped, root cause confirmed by code audit (do not re-derive).
- **Owner workflow:** feature-planner orchestration. This is **observation 2 of 3**, done **sequentially**.
- **Decision:** **Approach B — backend DTO enrichment.** Justification in "Approach decision" below.

## Problem (Observation 2)

An uploaded attachment is **not visible on its user message in the chat thread after sending**. It appears only as a transient optimistic blob preview immediately after send and then disappears once the thread query refetches and the persisted message replaces the optimistic one.

## Why it matters

- A user attaches a food photo / document, sends it, and the visual evidence of what they shared vanishes from the transcript on reload. The transcript no longer faithfully represents the conversation.
- This is a **health-sensitive** surface: the fix must render placeholders for consent-gated medical/wellness documents **without ever leaking medical content**, and must degrade gracefully for purged/expired attachments.

## Root cause (confirmed — use, do not re-derive)

1. **Backend message DTO omits attachment display data.** `apps/api/src/modules/chat/chat.mapper.ts` `toChatMessage` (lines 14-23) returns only `{ id, threadId, role, content, metadata, createdAt }`. The user message persists attachments **only** as `metadata.attachmentRefIds` (opaque UUIDs), set in `apps/api/src/modules/chat/chat.service.ts:116-125`.
2. **Web persisted-message resolver returns empty previews.** `apps/web/src/lib/chat-message-attachments.ts:60-65` `resolveChatMessageAttachmentPreviews(...)` maps each persisted `refId` to `{ attachmentRefId, filename: "", mimeType: "", previewUrl: null }`. With empty `filename`/`mimeType` and no `previewUrl`, there is nothing reliable to render.
3. **The optimistic path is the only thing that ever shows content.** The optimistic branch (`chat-message-attachments.ts:35-58`) reads `metadata.optimisticAttachmentDisplays` (validated by `chatMessageAttachmentDisplaySchema` + a local `previewUrl`) and uses `URL.createObjectURL`. This is replaced by the persisted message on `threadDetailQuery` refetch, so the preview disappears.
4. **A fragile client-side fallback exists but does not solve it.** `ChatMessageAttachmentPreviews` (`apps/web/src/components/chat/chat-message-attachment-previews.tsx:56-99`) lazily calls `getChatAttachment(id)` then `fetchChatAttachmentContentBlob(id)` per ref **when `filename`/`mimeType` are empty** — i.e. on every persisted message, every render. This is an **N×2 client-fetch storm per attachment message**, cannot distinguish purged / `needs_consent` / expired (it just shows a bare filename chip with no status), and is exactly the fragile path Approach B replaces.

### Supporting facts (verified, shape the fix)

- **An image content endpoint exists, images-only.** `GET /chat/attachments/:attachmentId/content` (`apps/api/src/modules/chat-attachments/chat-attachments.controller.ts:42-54`) streams content but `getAttachmentContent` (`chat-attachments.service.ts:157-192`) throws `NotFoundException` when `storageKey` is null, `GoneException` (410) when expired, and `BadRequestException` for **non-image** MIME (181-183). Web helper `buildChatAttachmentContentPath` (`chat-message-attachments.ts:28-30`) builds this path but is **not** used for persisted messages today.
- **Attachments are already linked to their message.** The turn-stage `link_to_message` step (`chat-turn-attachment-stage.service.ts:195-202` → `chat-attachments.service.ts:326-338`) sets `messageId` (and `threadId`) on each `chat_attachments` row. So display rows are loadable per message by `messageId` — a clean owned-by-user join, no opaque-id resolution needed.
- **A display schema already exists.** `packages/types/src/chat-attachments.ts:380-388` defines `chatMessageAttachmentDisplaySchema = { attachmentRefId, filename, mimeType }` (already consumed by the optimistic web path). Approach B **extends this existing schema** rather than inventing a parallel one.
- **The consent-gate purge is real.** `apply_upload_disposition` (`chat-turn-attachment-stage.service.ts:211-263`) purges stored content and sets `storageKey: null`, `status: needs_consent` for medical/wellness docs uploaded without consent. For those rows there is legitimately **no content to show** — `/content` will 404/throw. The render must show a sensible placeholder/chip, never an error, and never any document content.
- **`<ChatAttachmentOutcomePanel>` shows outcome status after send.** It renders from `attachmentOutcomes` in the immediate send response only (not persisted per message), so it does not solve persisted-thread visibility. The persisted attachment view is a passive chip/thumbnail only. Note: the post-send medical-consent panel and `grantConsent` path were removed as dead code after the attachment-classification removal (backend never produces `needs_consent` outcomes; all attachments are created `category: "unclassified"`, `status: "queued"`). The consent-gated medical save is a deferred, proposal-driven follow-up — not the old status-triggered panel.

## Approach decision — **Approach B (backend DTO enrichment). Chosen.**

### The two candidates

- **(A) Frontend-only.** From `metadata.attachmentRefIds`, render `<img src={buildChatAttachmentContentPath(id)}>` for images and a fallback chip otherwise.
- **(B) Backend DTO enrichment.** Add a display-only `attachments` field to the chat message contract carrying per-attachment **display metadata only** — no raw content/bytes — populated server-side from the linked `chat_attachments` rows; web renders an image via `/content` when viewable, else a labelled status chip.

### Why B (decisive)

1. **A cannot satisfy AC #2 reliably.** On a persisted message the client has only opaque UUIDs — no `mimeType`, no `filename`, no `category`, no `status`. So Approach A cannot, without a per-attachment metadata round-trip, decide image-vs-file, label non-images, or distinguish purged / `needs_consent` / expired from a real failure. Approach A therefore *is* today's fragile fallback (the N×2 fetch storm in `chat-message-attachment-previews.tsx`), which is precisely the behavior we are fixing.
2. **B removes the N+1 client-fetch storm.** With display metadata inlined on the message, the client makes **zero** metadata calls and at most one `/content` GET per *viewable image* (the streamed bytes the user actually sees). Non-image / purged / `needs_consent` / expired attachments render from inlined metadata with **no** network call.
3. **B is cheap because the data and the join already exist.** Rows are already linked by `messageId`; `buildBoundedMetadata`/`buildOutcomes` in the turn-stage service already compute these exact fields; the display schema already exists. B is an additive, display-only contract field plus a per-message load — not new machinery.
4. **B is the safer health-data choice.** The DTO carries display metadata only (`filename`, `mimeType`, `category`, `status`, `hasViewableContent`) and **never** raw bytes, consent details, recognition payloads, or storage keys. `hasViewableContent` lets the server be the single source of truth for "is there safe, viewable content" (false whenever `storageKey` is null / non-image / expired), so the client never guesses and never requests purged medical content.
5. **B keeps the contract honest going forward** and lets `resolveChatMessageAttachmentPreviews` consume real data, collapsing the optimistic and persisted paths onto one shape.

**Cost of B (accepted):** a shared-contract change (`@health/types`) consumed by web + mobile + the API DTO, and an extra per-message attachment load on thread fetch. Mitigated by batching the load across the thread (one `messageId IN (...)` / `userId` query, not per-message) and by tests on the contract and render path.

## Scope

### In scope

**Contract (`packages/types`)**
1. Add a display-only attachment shape and attach it to `chatMessageSchema`. Prefer **extending the existing** `chatMessageAttachmentDisplaySchema` (`chat-attachments.ts:380-388`) — keep `attachmentRefId`, `filename`, `mimeType`; add display-only `category` (`chatAttachmentCategorySchema`), `status` (`chatAttachmentStatusSchema`), and `hasViewableContent: boolean`. **No** raw content, bytes, `storageKey`, `consent`, or `recognition` on this shape.
2. Add `attachments: z.array(<displaySchema>).default([])` (or `.optional()` — implementer picks the lowest-risk, backward-compatible form) to `chatMessageSchema` (`packages/types/src/index.ts:241-248`). Because `chatTurnResponseSchema` reuses `chatMessageSchema` (`index.ts:1218-1219`), the send response inherits it for free.
3. Keep `metadata.attachmentRefIds` as the persisted source of truth; the new `attachments` field is a **derived projection**, not a new persisted column. (Optimistic `metadata.optimisticAttachmentDisplays` stays.)

**Backend (`apps/api` chat module)**
4. Load the linked `chat_attachments` rows per message (by `messageId`, owned by user) and populate `attachments` in `toChatMessage`. Set `hasViewableContent = (storageKey != null) && image-MIME && !expired` using existing helpers (`isChatAttachmentImageMimeType`, `isChatAttachmentExpired`). For `needs_consent` / purged / non-image / expired rows, emit the chip metadata with `hasViewableContent: false`.
   - **Both** read paths must populate it: `ChatService.getThread` (`chat.service.ts:72-89`) and the `userMessage` returned from `sendMessage` (`chat.service.ts:440-447`). The mapper signature change must keep all other `toChatMessage` callers (assistant/crisis/explainer/direct-path returns) compiling — assistant messages simply have an empty `attachments` array.
   - **Batch** the load (single query for the whole thread by `userId` + `messageId IN (...)`, e.g. a new `ChatAttachmentsRepository.listByMessageIds(userId, ids)`); do not issue one query per message.
   - This is **display projection only** — it must not mutate attachment rows, run any disposition, or re-trigger consent/retention logic.

**Web (`apps/web`)**
5. Update `resolveChatMessageAttachmentPreviews` (`chat-message-attachments.ts:32-66`): for persisted messages, build previews from the new `message.attachments` (real `filename`/`mimeType`/`category`/`status`/`hasViewableContent`) instead of empty strings. Set `previewUrl` to `buildChatAttachmentContentPath(refId)` **only when** `hasViewableContent` is true. Keep the optimistic branch behavior (blob `previewUrl`) intact. Extend `ChatMessageAttachmentPreview` with the fields the chip needs (`category`, `status`, `hasViewableContent`).
6. Simplify `ChatMessageAttachmentPreviews` (`chat-message-attachment-previews.tsx`) to render from the enriched preview without the per-render `getChatAttachment` + blob fallback: image (when `hasViewableContent` && image MIME) via `/content`, else a labelled chip (filename + category, and a clear non-error status for `needs_consent` / unavailable / expired). Per refactor-cleanup, **remove** the now-dead lazy metadata-fetch / object-URL fallback for the persisted path. Keep `<img>`/blob handling only where still required (optimistic preview). If a viewable image's `/content` request still 410s/errors at runtime, degrade to the chip rather than a broken image.

### Out of scope (HARD boundaries)

- **Do NOT touch the proposal-rendering block** — the `<div className="message-proposals">` and `<InlineProposalCard>` mapping at `apps/web/src/components/chat/chat-workspace.tsx:827-838`. That is **Observation 3** (assistant reply + proposal render as one message), which shares this file and is the next sequential workflow. Edits here are limited to the **user-message attachment preview** path (`chat-workspace.tsx:759-797`) and the two web helper files.
- **Do NOT duplicate the consent/outcome UI.** Leave `<ChatAttachmentOutcomePanel>` and the `attachmentOutcomes` send-response path (`chat-workspace.tsx:815-825`) as-is. The persisted attachment view is a passive chip/thumbnail; the consent grant flow stays where it is.
- **Do NOT reintroduce recognition/classification** (removed in Obs 1). Attachments remain context-only. No recognizer/classifier, no `prepare_proposal_candidates`, no attachment proposal side-channel. The new field is **display metadata derived from already-persisted rows**, not a recognition output.
- **No changes to upload, consent gating, retention/expiry, send-eligibility, the attachment proposal model, or the Obs-1 context-only composer copy.**
- **No raw medical/document content exposure.** No bytes, `storageKey`, `consent`, document text, or `recognition` payload in the new contract field or any new endpoint. No new endpoint that serves non-image content; `/content` stays images-only.
- **Mobile:** check whether `apps/mobile` consumes `chatMessageSchema` / renders message attachments. The contract change must keep mobile **compiling** (additive, defaulted field). Implementing the mobile render is **out of scope** unless the contract change would break the mobile build — if it would, the smallest fix to keep mobile green is in scope; a full mobile attachment-render feature is not.

## Acceptance criteria (testable)

1. **Persistent visibility.** A user-uploaded attachment remains visible on its user message in the chat thread **both** immediately after send **and** after a reload/refetch (not just the transient optimistic preview). After refetch, `GET /chat/threads/:id` returns the user message with a populated `attachments` array.
2. **Correct per-type rendering, no leakage.**
   - **Image** (food photo / image workout attachment, content present) → inline thumbnail via `/content`.
   - **Non-image** (PDF / text) → filename + category chip, no broken image, no `/content` call.
   - **`needs_consent` / purged / expired** → a clear **non-error** placeholder/chip (filename + category + status such as "Consent required" / "No longer available"); **no** raw medical/document content is ever rendered, and `hasViewableContent` is `false`.
3. **No regression.** No change to upload, consent gating, retention/expiry, send-eligibility, attachment proposals, the `attachmentOutcomes` send response, the consent/outcome panel, or the Obs-1 context-only composer copy. The Obs-3 proposal-rendering block is untouched. Mobile still builds.
4. **No raw content in the contract.** The new `attachments` DTO field contains only display metadata (`attachmentRefId`, `filename`, `mimeType`, `category`, `status`, `hasViewableContent`); it never contains bytes, `storageKey`, `consent`, document text, or recognition payloads. (Asserted by a schema/DTO test.)
5. **Tests cover the persisted-message render path and the new contract:**
   - **Contract (`packages/types`):** `chatMessageSchema` accepts a message with `attachments` and rejects disallowed/raw-content fields on the display shape; backward-compatible with messages that have no attachments.
   - **Backend (`apps/api` chat):** `toChatMessage` / `getThread` populate `attachments` from linked rows; `hasViewableContent` is true only for present, non-expired image rows and **false** for `needs_consent` / purged (`storageKey: null`) / non-image / expired; the projection performs **no** row mutation and the load is batched (not N queries).
   - **Web:** `resolveChatMessageAttachmentPreviews` builds image previews (viewable image) and chips (non-image, `needs_consent`/purged/expired) from `message.attachments`; the persisted path no longer issues the per-render metadata/blob fallback; optimistic preview behavior unchanged.
6. **Validation passes:** `corepack pnpm --dir packages/types {typecheck,test}`, `corepack pnpm --dir apps/api {typecheck,test}` (relevant chat specs), `corepack pnpm --dir apps/web {lint,typecheck,test}` (repo lint is `--max-warnings=0`). If the contract change reaches mobile, `corepack pnpm --dir apps/mobile typecheck`.
7. **Runtime verified (the real exit gate):** in the running stack, uploading an image and a non-image attachment, sending, then **reloading/refetching the thread**, shows the image thumbnail and the file chip persistently; a `needs_consent`/unavailable attachment shows a clear non-error placeholder with no leaked content — OR a concrete blocker preventing local run is reported.

## Files / contracts to change

- `packages/types/src/chat-attachments.ts` — extend `chatMessageAttachmentDisplaySchema` with display-only `category` / `status` / `hasViewableContent` (or add a sibling `chatMessageAttachmentSchema` if extending the optimistic-shared schema risks the optimistic path; implementer picks the least-risk option and states it).
- `packages/types/src/index.ts` — add the defaulted/optional `attachments` array to `chatMessageSchema` (`:241-248`); `chatTurnResponseSchema` (`:1216-1221`) inherits it via reuse.
- `apps/api/src/modules/chat/chat.mapper.ts` — `toChatMessage` accepts + emits per-message display attachments.
- `apps/api/src/modules/chat/chat.service.ts` — `getThread` (`:72-89`) and `sendMessage` user-message return (`:116-125`, `:440-447`) provide linked display rows to the mapper (batched).
- `apps/api/src/modules/chat-attachments/chat-attachments.repository.ts` — add `listByMessageIds(userId, messageIds)` (owned-by-user, batched).
- `apps/api/src/modules/chat-attachments/chat-attachments.service.ts` and/or a small mapper — derive the display projection (`hasViewableContent` via `isChatAttachmentImageMimeType` + `isChatAttachmentExpired` + `storageKey != null`). Reuse existing helpers; do not add recognition logic.
- `apps/web/src/lib/chat-message-attachments.ts` — `resolveChatMessageAttachmentPreviews` persisted branch + `ChatMessageAttachmentPreview` type extension.
- `apps/web/src/components/chat/chat-message-attachment-previews.tsx` — render from enriched preview; remove the dead persisted-path metadata/blob fallback.
- Tests alongside each of the above (see AC #5).

**Explicitly NOT changed:** `chat-workspace.tsx:827-838` (Obs-3 proposal block), `chat-attachment-outcome-panel.tsx`, the `attachmentOutcomes` path, upload/consent/retention code, the turn-stage disposition logic, any recognition/classification concept, and `apps/mobile` beyond keeping it compiling.

## Roles needed (for the chosen Approach B)

- **backend-implementer** — contract field in `@health/types`, DTO population in `chat.mapper`/`chat.service`, batched repository load + display projection, backend tests. (Required for B.)
- **frontend-implementer** — web preview resolver + `ChatMessageAttachmentPreviews` render simplification, removal of the dead fallback, web tests. (Required.)
- **test-writer** — focused contract/schema, backend projection, and web render-path tests (image / non-image / `needs_consent`-purged / expired), if not fully covered by the implementers.
- **implementation-reviewer** — correctness, architecture fit, refactor-cleanup (dead fallback removed), and confirming the Obs-3 / outcome-panel boundaries are untouched.
- **security-reviewer** — **required** (health-data safety): confirm the DTO carries display metadata only and never raw bytes / `storageKey` / consent / document text / recognition; confirm purged/`needs_consent`/expired never expose content and `/content` stays images-only and ownership-scoped.
- **app-runner** — runtime verification of AC #7 (the exit gate): image thumbnail + file chip persist across reload; consent-gated/unavailable attachment shows a clear non-error placeholder.
- **Skipped:** design-system / visual-designer / ui-polish (reuses existing `AttachmentPreviewThumb` + chip primitives; no new design tokens). Full **mobile** implementation skipped unless the contract change breaks the mobile build.

## Risks & mitigations

- **Shared-contract change ripples to mobile.** Mitigation: make `attachments` additive and defaulted/optional so existing consumers are unaffected; run `apps/mobile` typecheck; only the minimal break-fix for mobile is in scope.
- **Accidental health-data leak via the new field or `/content`.** Mitigation: display-metadata-only DTO (no bytes/storageKey/consent/recognition); `hasViewableContent` computed server-side; security-reviewer gate; `/content` remains images-only + ownership-scoped + 410-on-expiry.
- **Collision with Obs-3 in `chat-workspace.tsx`.** Mitigation: hard boundary — edits limited to the user-message preview region (`:759-797`) and the two helper files; the `message-proposals` block (`:827-838`) is untouched.
- **Per-message N+1 load on thread fetch.** Mitigation: batch via `listByMessageIds` (single `messageId IN (...)` query per thread fetch); add a test/assertion that the load is batched.
- **Regressing the optimistic preview while collapsing paths.** Mitigation: keep the optimistic branch (`metadata.optimisticAttachmentDisplays` + blob `previewUrl`) intact; test optimistic and persisted render independently.
- **Re-triggering disposition/consent during the display projection.** Mitigation: the projection is read-only (no row updates, no disposition); backend test asserts no mutation occurs on thread fetch.

## Non-goals

- No recognition/classification feature (invariant forbids it; removed in Obs 1).
- No change to upload pipeline, consent model, retention/expiry, send-eligibility, or attachment proposals.
- No new endpoint serving non-image content; `/content` stays images-only.
- No proposal-rendering changes (Observation 3, handled separately).
- No full mobile attachment-render feature in this fix.
