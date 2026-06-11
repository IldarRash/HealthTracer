# No-Stubs Program — Conformance Follow-ups

Status: **Planning**.

Related: the no-stubs invariants are in
[`../../../.claude/rules/no-stubs.md`](../../../.claude/rules/no-stubs.md); the refactor-cleanup
rule is [`../../../.claude/rules/refactor-cleanup.md`](../../../.claude/rules/refactor-cleanup.md);
the code-exact pipeline map is
[`../../architecture/llm-pipeline.md`](../../architecture/llm-pipeline.md). Umbrella design:
[`ideal-chat-pipeline.md`](./ideal-chat-pipeline.md).

## Problem (real owner case)

The no-stubs honest-pipeline program (`feature/no-stubs-honest-pipeline`) removed canned coach
replies and dead-end gate branches, but left a handful of conformance leftovers — hardcoded
copy, a half-finished error-state consolidation, and UI/contract loose ends. Each is small and
scoped; this brief tracks them so they don't quietly persist.

## Goals

Close the five verified conformance gaps below so the pipeline matches the no-stubs and
refactor-cleanup rules end-to-end.

## In Scope (each item verified against current code)

### 1. Quota reply hardcoded English → config + RU copy

The free-tier quota gate persists a hardcoded English sentence:

> "You've reached today's free AI message limit — upgrade to Pro for unlimited coaching."

at `apps/api/src/modules/chat/chat.service.ts:273-274`. Per
[`.claude/rules/no-stubs.md`](../../../.claude/rules/no-stubs.md) ("Deterministic product
replies ... must live in repo config (`packages/ai-behavior/config/*`) or typed constants with
tests — and they must read as system messages"), move the copy into
`packages/ai-behavior` config with an RU translation, selected by the turn's response language.

### 2. Finish the `turnDegraded` → `turnError` consolidation

Two parallel honest-failure contracts exist:

- `turnError` — no usable reply produced (`decision_failed` / `reply_blocked`); content
  persisted as `" "` (`packages/types/src/chat-turn.ts:66`, comments at `:144-151`).
- `turnDegraded` — a usable reply *was* persisted but a stage degraded
  (`chatTurnDegradedReasonSchema`: `reply_blocked`, `parse_failed`, `provider_error`,
  `decision_failed` — `chat-turn.ts:161-167`).

The backend already writes them **mutually exclusively** ("When turnError is set, turnDegraded
is NOT written" — `chat-turn.ts:150-151`). But the web layer still carries two resolvers
(`resolveChatMessageDegradedTurn` and `resolveChatMessageTurnError` in
`apps/web/src/lib/chat-degraded-ui-state.ts`) and two card branches in
`apps/web/src/components/chat/chat-workspace.tsx` (`messageTurnError` at `:940`,
`degradedTurn && !messageText.trim()` at `:951`). The reason enums overlap (`reply_blocked`,
`decision_failed` appear in both). **Either** fold `parse_failed` (and the
reply-still-present degraded case) into a single contract/UI path, **or** document the split as
permanent with the precise boundary (reply-present vs reply-absent) so the duplication is
intentional and not a refactor leftover.

### 3. Persist `suggestedQuickActions` so chips survive thread reload

The quick-action chips are captured into **live-turn-only** React state:
`setLiveSuggestedQuickActions(...)` from the just-returned turn
(`apps/web/src/components/chat/chat-workspace.tsx:355`) and rendered only on the latest
assistant message (`:1004`). They are lost on thread reload because they are not read from
persisted assistant message metadata. Persist `suggestedQuickActions` in the assistant message
metadata and resolve them from there (like the other `resolveChatMessage*` metadata helpers) so
chips survive a reload.

### 4. `AttachmentPreviewThumb` document icon instead of the `📄` emoji

`AttachmentPreviewThumb` renders a literal `📄` emoji as the no-preview document fallback
(`apps/web/src/components/ui/attachment-preview.tsx:29`). Replace it with a proper icon
component (consistent with the design system). Deferred from the chat-file-attachments brief.

### 5. `consentRequired` — wire a consumer or remove

`consentRequired` is plumbed end-to-end but **no client consumes it**:

- set on `OrchestratedCoachTurnResult` (`apps/api/src/modules/ai/agent-orchestrator.service.ts:107`,
  `:636`, forwarded from the decision-maker output),
- surfaced on the chat turn response with an explicit "not currently consumed by any client
  gate" comment (`apps/api/src/modules/chat/chat.service.ts:607-611`),
- present in the wire/decision contracts (`openai-wire-schemas.ts:247`,
  `decision-maker-executor.service.ts`),
- but **zero `.tsx` references** consume it (grep-verified).

Per [`.claude/rules/refactor-cleanup.md`](../../../.claude/rules/refactor-cleanup.md) ("delete,
don't preserve" pre-launch), **either** wire a consent prompt that consumes the flag **or**
remove the plumbing. Note: the chat.service.ts comment says it is held for the *deferred medical
special-save* flow — if it is kept, it must be marked compatibility code with that explicit
removal condition (which the comment already gestures at); otherwise remove it.

## Out of Scope (Non-Goals)

- The deferred medical special-save flow itself (attachment recognition → consent-gated proposal
  → persist `health_document`). Item 5 only decides whether to keep or cut the dangling
  `consentRequired` flag, not to build that flow.
- Mobile.
- Any change to the LLM stages, routing, or proposal validation behavior — these are copy/UI/
  contract-cleanliness fixes.

## Acceptance Criteria (testable)

1. The quota-limit reply text is sourced from `packages/ai-behavior` config (EN + RU), selected
   by response language; no hardcoded English sentence remains in
   `chat.service.ts`; a test covers both languages.
2. The web error-state path is either a single resolver/card contract (with `parse_failed`
   folded in), or the split is documented as permanent with the reply-present-vs-absent
   boundary; no dead/duplicate resolver remains unexplained.
3. `suggestedQuickActions` are persisted in assistant message metadata and re-render after a
   thread reload (not just on the live turn).
4. `AttachmentPreviewThumb` renders an icon component instead of the `📄` emoji for the
   no-preview document fallback.
5. `consentRequired` is either consumed by a client consent prompt, or removed across
   `OrchestratedCoachTurnResult` / chat turn response / wire+decision contracts; if kept, it is
   explicitly marked compatibility code with its removal condition.

## Risks / Assumptions

- Item 2 (error-state consolidation) touches both `packages/types` contracts and web rendering;
  scope it so the contract decision (fold vs document) is made first.
- Item 3 requires the backend to include `suggestedQuickActions` in persisted metadata and the
  web to resolve it; keep the live-turn path working during the transition.
- Item 5: removing `consentRequired` is the simpler path pre-launch, but the owner has signalled
  intent to keep it for the deferred medical special-save — confirm direction before deleting.

## Initial Implementation Plan (for planner refinement)

- Backend: quota copy → `ai-behavior` config (EN/RU); persist `suggestedQuickActions` in
  assistant metadata; resolve `consentRequired` direction (consume vs remove).
- Types: decide `turnDegraded`/`turnError` fold-vs-document; adjust enums/contracts accordingly.
- Web: collapse or document the dual error cards; resolve quick-action chips from metadata;
  swap the `📄` emoji for an icon; consume or drop `consentRequired`.
- Tests: bilingual quota copy, chips-survive-reload, error-state path, icon render, consent
  flag wiring/removal.
