# Feature Brief: Assistant Reply + Proposal as One Message

- **Type:** Bug fix (frontend render/layout only — no data flow, contract, or backend change)
- **Surface:** `apps/web` only — primarily `apps/web/src/components/chat/chat-workspace.tsx`, plus a small CSS adjustment in `apps/web/app/styles.css`; possibly a thin wrapper class on `<InlineProposalCard>` instances.
- **MVP fit:** Maintenance / correctness within current MVP. No scope expansion, no new feature, no contract change.
- **Status:** Scoped, root cause confirmed by code audit (do **not** re-derive).
- **Owner workflow:** feature-planner orchestration. This is **Observation 3 of 3**, done **sequentially** (Obs 1 = context-only composer cleanup; Obs 2 = attachment visibility on persisted messages, `chat-attachment-visibility.md`).
- **Decision:** **Approach A — move the proposal block INSIDE the assistant `<ChatBubble>` children.** Justification in "Approach decision" below.

## Problem (Observation 3)

The assistant reply text and its linked proposal card(s) render as **two separate stacked blocks**: a `<ChatBubble>` containing only the reply text, then a detached sibling `<div className="message-proposals">` below it. The user expects the reply + proposal to read as **one message** — a single visually-unified unit, not a bubble with a floating card under it.

## Why it matters

- A coaching turn is conceptually one act: "here's my reply, and here's the typed change I'm proposing." Splitting it into two visually-unrelated boxes makes the proposal look like an unrelated system card rather than part of the coach's response, weakening the chat-as-interaction-layer experience.
- The split is purely a **frontend layout choice**. The backend contract is already correct (one assistant message + linked `proposals[]`), so this is low-risk to fix and should not require touching any data path.
- A secondary edge case (assistant `content` empty while a proposal exists) currently renders an **empty bubble + a floating card** — visibly broken. The fix should make that case read as one coherent message too.

## Root cause (confirmed — use, do not re-derive — file:line)

In `apps/web/src/components/chat/chat-workspace.tsx`:

1. **The assistant `<ChatBubble>` closes before the proposals are rendered.** The bubble (`:777-806`) contains only the reply text / crisis panel / direct-path feedback. It closes at `:806`.
2. **Linked proposals are rendered AFTER and OUTSIDE the bubble**, as a sibling inside the same `<li>`: `<div className="message-proposals">` at `:827-838`, mapping `linkedProposals` → `<InlineProposalCard>`.
3. **`linkedProposals = proposalsByMessageId.get(message.id) ?? []`** (`:757`), where `proposalsByMessageId` (`:609-620`) is built by joining a **separate** `threadProposalsQuery` (merged with `localProposals` via `mergeProposalsById`) keyed on `proposal.sourceMessageId`. So on **both** fresh send and reload, proposals are a separate in-memory data list joined to the message and rendered as a detached block.
4. **Backend is correct.** One assistant message (`content` = the reply) plus a separate linked `proposals[]` (each `sourceMessageId` = the assistant message id). This is the intended "one reply + typed proposals" contract — the split is **purely a frontend layout choice**.
5. **Secondary (empty-content case).** Assistant `messageText = message.content` (`:762-764` non-user branch); the reply text is guarded by `{messageText ? ... }` (`:798`). If `content` is empty while a proposal exists, the bubble renders effectively empty and only the detached card shows.

### Supporting facts (verified by code audit — shape the fix)

- **`.chat-bubble` is the unit frame.** `apps/web/app/styles.css:1549-1556` gives `.chat-bubble` its border, `--radius-lg`, padding, and `font-size-chat`. The assistant variant (`.chat-bubble--assistant`, `:1567-1574`) sets the background, `margin-right: auto` (left alignment), and `max-width: min(100%, 42rem)`. The coach accent (`.chat-bubble--coach`, `:1576-1578`) adds the `inset 3px 0 0` left bar. `.chat-bubble__content` (`:1598-1603`) is the children wrapper. **Anything nested in `__content` automatically inherits the bubble frame, accent, alignment, and width.**
- **`.message-proposals` is a detached sibling.** `styles.css:1605-1609` is a `display: grid; gap; margin-top: var(--space-3)` block with **no** border, **no** background, **no** coach accent, and — critically — **no** `max-width`/`margin-right: auto`, so it spans the full `<li>` width and visually breaks away from the left-aligned 42rem bubble. Each `<InlineProposalCard>` is its own `.proposal-card` (`:1707-1714`) with its own border + `--shadow-card` + padding. That standalone card framing is what makes it read as a separate block.
- **The codebase already distinguishes "inside the bubble" vs "related sibling panel."** The crisis panel renders **inside** the bubble (`chat-workspace.tsx:788-792`). The weekly-review summary (`:808-813`) and the attachment-outcome panel (`:815-825`) render **outside** the bubble as siblings; weekly-review is explicitly re-aligned to the bubble via `.chat-weekly-review-summary { margin-right: auto; max-width: min(100%, 42rem) }` (`styles.css:1611-1615`). So there is precedent for both patterns, and a precedent for the realignment a sibling needs to look related.
- **`<ChatBubble>` accepts arbitrary `children`** (`apps/web/src/components/ui/chat-bubble.tsx:7-12,39`) and renders them inside `.chat-bubble__content`. Nesting the proposal block there is a supported, additive change with no component API change.
- **`<InlineProposalCard>` is an intent router** (`apps/web/src/components/proposals/inline-proposal-card.tsx:15-29`) → generic / wellbeing / nutrition-incident / recommend-recipes cards. Its props (`proposal`, `onDecision`, `onModifyRequest`) and behavior are **out of scope** and must not change.
- **The empty-reply assistant message is reachable.** Some assistant turns can carry a proposal with little/no prose `content` (e.g. proposal-led turns). With the text guarded by `{messageText ? ...}`, today this yields an empty bubble + floating card. The fix must keep that as one coherent unit.

## Approach decision — **Approach A (proposals INSIDE the bubble). Chosen.**

### The two candidates (from the task)

- **(A) Move the `message-proposals` block INSIDE the assistant `<ChatBubble>` children** (render it within `.chat-bubble__content`, after the reply text / direct-path feedback).
- **(B) Wrap the bubble + proposals in a single new grouped container** with shared styling (a new outer element that visually unifies the two existing boxes).

### Why A (decisive)

1. **A directly satisfies "one message" with the existing frame.** Nesting inside `.chat-bubble__content` means the reply text and the proposal card(s) share **one** border, **one** background, **one** coach left-accent, **one** left alignment, and **one** `42rem` max-width — i.e. literally one bubble. That is exactly the user's ask. B would have to re-derive all of that frame on a new wrapper and then suppress the bubble's own frame to avoid a double border, which is more CSS for the same visual result.
2. **A removes the alignment/width mismatch for free.** The detached `.message-proposals` block today is full-width and unaccented (the visible "second block" problem). Moving it inside inherits the bubble's `max-width`/`margin-right: auto`/accent automatically — no need to copy the weekly-review realignment hack onto proposals.
3. **A is the smaller, lower-risk diff.** It is a JSX move (cut the `:827-838` block, paste it inside the bubble's non-crisis children branch) plus minor CSS (drop `.message-proposals`' detached `margin-top` in favor of an in-bubble spacing rule, and de-emphasize the nested `.proposal-card` frame so the inner card doesn't read as a hard second box inside the bubble). No new component, no new wrapper element, no React structure around the `<li>` to reason about.
4. **A leaves the data flow untouched.** `proposalsByMessageId`, the `sourceMessageId` join, `localProposals`/`mergeProposalsById`, and the `InlineProposalCard` map all stay; only their **render location** moves. Multiple proposals still map in order, inside the unit.
5. **A composes cleanly with the empty-content fix.** Because the proposals now live inside `.chat-bubble__content`, the bubble is non-empty whenever a proposal exists, so the empty-bubble case disappears as a natural consequence — we just need the children branch to render even when `messageText` is falsy (see Scope item 3).

### Why not B

A new grouping wrapper duplicates the bubble frame (or forces hiding the bubble's own frame), reintroduces the alignment/accent work A gets for free, and adds a structural element with no behavioral benefit. Reserve B only if visual review finds that an inner `.proposal-card` inside the bubble looks too nested — in which case the fallback is a lighter in-bubble proposal treatment, **not** a new outer container (see "Visual direction").

### What stays OUTSIDE the bubble (explicit decision)

Only the **proposal** moves inside (the user's explicit ask). The **crisis variant** already renders inside the bubble — leave it. The **weekly-review summary** (`:808-813`) and the **attachment-outcome panel** (`:815-825`) **stay as siblings outside the bubble**, unchanged: they are distinct interactive/structured panels (consent grant, weekly summary disclosure) that are intentionally separated and already styled as related-but-separate cards, and Obs 2 just shipped the outcome-panel behavior. Pulling those inside is out of scope and risks regressing just-completed work. This brief unifies **reply + proposal** only.

## Scope

### In scope (`apps/web` only)

**`chat-workspace.tsx` (render move + empty-content handling)**

1. **Move the proposal render inside the assistant bubble.** Relocate the `linkedProposals.length > 0 ? <div className="message-proposals">…</div> : null` block (currently `:827-838`) from the `<li>` sibling position into the assistant `<ChatBubble>` children, in the **non-crisis** branch (the `<>...</>` at `:793-805`), rendered **after** the reply text and direct-path feedback. Keep the exact same `linkedProposals.map(...)` with the same `key={proposal.id}`, `onDecision={handleProposalDecision}`, and `onModifyRequest={handleProposalModifyRequest}` props.
   - Implementer's choice of class: either keep `className="message-proposals"` (and restyle it as an in-bubble group in CSS) or rename to an in-bubble class (e.g. `chat-bubble__proposals`). Whichever is chosen, update the spec assertion that references it (see Testing) and the CSS to match.
2. **Crisis turns:** do not render proposals inside the crisis panel branch. (In practice crisis/safety turns don't carry proposals; preserve current behavior — proposals only render in the normal coach branch.) Do not change `CrisisSupportPanel`.
3. **Handle empty assistant `content` with a proposal.** Ensure the assistant non-crisis children branch renders (and renders the proposals) even when `messageText` is falsy, so a proposal-only turn reads as one coherent message instead of an empty bubble + floating card. Keep the `{messageText ? <p className="chat-bubble__text">…</p> : null}` guard for the **text** itself (don't render an empty `<p>`), but make the proposal block render based on `linkedProposals.length`, independent of `messageText`. If both `messageText` and `linkedProposals` are empty for a coach turn, behavior is unchanged from today (the bubble shows whatever else applies, e.g. direct-path feedback).

**`apps/web/app/styles.css` (in-bubble grouping)**

4. Replace the detached `.message-proposals` spacing (`:1605-1609`, currently `margin-top: var(--space-3)` on a full-width sibling) with an **in-bubble** treatment: top spacing/separation from the reply text **within** the bubble content (e.g. a `margin-top`/`padding-top` and optionally a hairline top divider using existing tokens), keeping the `display: grid; gap: var(--space-3)` stack for multiple proposals. The proposals must visually sit **inside** the bubble's left-accented, 42rem-wide frame.
5. **De-emphasize the nested proposal card frame** so the inner `.proposal-card` does not read as a hard second box inside the bubble (e.g. soften/remove the card's own border or `--shadow-card` **only when nested inside `.chat-bubble__content`**, via a scoped selector such as `.chat-bubble__content .proposal-card`). Do **not** change the standalone `.proposal-card` styling used elsewhere (confirmation cards, other surfaces) — scope the change to the in-chat-bubble context. Preserve the status border tints (`.proposal-card.status-*`, `:1766-1790`) so accepted/rejected/superseded/pending states stay legible inside the bubble.
6. Verify the mobile/responsive block (`styles.css:4194-4205`) and reduced-motion block (`:4253-4259`) still behave; the bubble already goes `max-width: 100%` on small screens, and the nested proposals inherit that — no separate mobile rule for the detached block should remain dangling. Remove any now-unused `.message-proposals` rule if the class is renamed (per refactor-cleanup).

**Optional thin wrapper**

7. If needed for the scoped CSS hook, the implementer may add a wrapper class around the nested cards (item 1's class). No new React component is required.

### Out of scope (HARD boundaries)

- **Do NOT change proposal data flow.** `proposalsByMessageId` (`:609-620`), the `sourceMessageId` join, `threadProposalsQuery`, `localProposals`, and `mergeProposalsById` stay exactly as-is. This is a **render-location** change only.
- **Do NOT change `<InlineProposalCard>` or its child cards** (`inline-proposal-card.tsx`, generic / wellbeing / nutrition-incident / recommend-recipes cards) — no behavior, props, copy, or intent-routing changes. Only the wrapper class / nesting context around them changes.
- **Do NOT change accept / modify / revision wiring.** `handleProposalDecision` (`:667-669`), `handleProposalModifyRequest` (`:671-681`), `buildProposalRevisionChatSend`, `pendingRevisionSend`, and `shouldShowProposalRevisionSendRetry` (`:683-687`) stay intact.
- **Do NOT touch the API or any contract.** No `apps/api`, no `packages/types`, no `packages/db`. The backend already emits one message + linked proposals.
- **PRESERVE just-completed work in the same file:**
  - **Obs 2 user-message attachment previews** (`resolveChatMessageAttachmentPreviews` usage at `:759-761`, `<ChatMessageAttachmentPreviews>` at `:795-797`) must keep working.
  - **The `<ChatAttachmentOutcomePanel>` / `attachmentOutcomes` block** (`:815-825`) must keep working and **stay outside** the bubble. Note: the post-send medical-consent wiring (`pendingMedicalConsentByAttachmentId`, `updatePendingMedicalConsent`, `grantMedicalConsentForOutcome`, `grantChatAttachmentConsent`) was removed as dead code after the attachment-classification removal — the backend never produces `needs_consent` outcomes (all attachments are `unclassified`/`queued`). The consent-gated medical save is a deferred, proposal-driven follow-up, not the old status-triggered panel.
  - **Obs 1 context-only behavior** — do **not** reintroduce recognition/classification or alter the Obs-1 composer copy.
- **Do NOT move the weekly-review summary or attachment-outcome panel inside the bubble.** They remain siblings (decision above).
- **No new dependencies, no new global layout primitives.** Stay within existing tokens/classes.

## Visual direction

Default expectation: a single bubble where the reply text and the proposal card(s) read as one unit — proposals separated from the reply by light in-bubble spacing (and optionally a hairline divider), the inner card frame de-emphasized so it doesn't look like a box-in-a-box, status tints preserved, all within the bubble's coach accent and 42rem left-aligned width. This is a **mechanical grouping**, not a redesign. **A dedicated visual-designer/ui-polish pass is likely NOT required** unless implementation review finds the nested card still reads as a second block; in that case route a small ui-polish task to refine the in-bubble proposal treatment (lighter card, better divider/spacing) — **without** introducing a new outer wrapper (that would be Approach B).

## Acceptance criteria (testable)

1. **Unified rendering.** When an assistant turn has proposal(s), the reply text and the proposal card(s) render as **one visually-unified message** (proposals nested inside the assistant bubble's content, not a detached sibling block) — on **fresh send** AND after **thread reload**. In the rendered DOM, the proposal element(s) are descendants of the assistant `.chat-bubble` / `.chat-bubble__content`, not siblings of `.chat-bubble` within the `<li>`.
2. **Behavior preserved.** Proposal **accept / modify / revision** still work; the `sourceMessageId` join still associates each proposal with the correct message; **multiple proposals** on one message all render, in order, inside the same unit. `onDecision`/`onModifyRequest` still fire `handleProposalDecision`/`handleProposalModifyRequest`, and the revision retry path is unaffected.
3. **No-proposal & empty-text cases.** An assistant turn with **no** proposal is **unchanged** (bubble with reply text only, no empty proposal container). A turn with a proposal but **empty reply text** reads as **one coherent message** (proposal inside the bubble; **no** empty `<p className="chat-bubble__text">` and **no** floating detached card).
4. **No regressions.** No regression to: Obs-2 user-message **attachment previews**, the **attachment-outcome panel** (still rendered, still outside the bubble, consent wiring intact), the **weekly-review summary** (still outside the bubble), **crisis / direct-path** rendering, or **Obs-1** composer copy / context-only behavior.
5. **Tests cover the change.** Tests assert: (a) the unified rendering — proposal markup is inside the assistant message unit, not a detached `.message-proposals` sibling; (b) the **multi-proposal** case renders all cards inside the unit; (c) the **no-proposal** case renders no proposal container; (d) the **empty-reply-text + proposal** case renders one coherent unit (no empty text `<p>`, no detached card). The existing source-text assertions in `inline-proposal-card.spec.ts` for the revision-routing block (`onModifyRequest={handleProposalModifyRequest}`, `buildProposalRevisionChatSend`, `shouldShowProposalRevisionSendRetry`, etc.) must **still pass unchanged** — they assert wiring, not layout, so the render-location move should not break them; the test-writer confirms this rather than rewriting them.

## Recommended roles & sequence

1. **frontend-implementer** — perform the JSX render-location move (proposals into the assistant bubble children), the empty-content handling, and the scoped CSS grouping/de-emphasis in `styles.css`. (This is a small, focused change — well under a context-budget split; one task.)
2. **test-writer** — add focused web tests for AC #1–3,5: unified in-bubble rendering (proposal markup inside the assistant bubble unit, not a detached `.message-proposals` sibling), multi-proposal, no-proposal, and empty-reply-text cases. **Note:** the `.message-proposals` class string is referenced **only** in `chat-workspace.tsx` (not asserted in any current spec), and `inline-proposal-card.spec.ts` only asserts the **revision-wiring** source text (`onModifyRequest={handleProposalModifyRequest}`, `buildProposalRevisionChatSend`, …) — those must keep passing unchanged. Confirm Obs-2 preview / outcome-panel specs (`chat-message-attachment-previews.spec.ts`, `chat-composer-attachments.spec.ts`) still pass.
3. **implementation-reviewer** — verify the data flow / `InlineProposalCard` / accept-modify-revision wiring is untouched, the change is render-only, scoped CSS doesn't leak to standalone proposal/confirmation cards elsewhere, and Obs-1/Obs-2 work is preserved.
4. **app-runner** — start the web stack and verify in the running app: an assistant turn with a proposal renders as one unified message on fresh send and after reload; accept/modify/revision still work; no-proposal and (if reproducible) empty-text turns look coherent; attachment previews + outcome panel + weekly review + crisis rendering unregressed. Feature is **done** only when app-runner reports the flow `working`.
5. **visual-designer / ui-polish-implementer** — **skip by default.** Engage only if implementation review or app-runner finds the nested proposal still reads as a second block; if so, a small ui-polish refinement of the in-bubble proposal treatment (no new outer wrapper).

## Files expected to change

- `apps/web/src/components/chat/chat-workspace.tsx` — move proposal render into the assistant `<ChatBubble>` children; render proposals independent of `messageText`.
- `apps/web/app/styles.css` — convert `.message-proposals` (or its renamed in-bubble class) from a detached sibling block to an in-bubble proposal group; scope-de-emphasize `.chat-bubble__content .proposal-card`; clean up any now-unused rule.
- New/updated web tests for AC #1–3,5 (unified in-bubble rendering, multi-proposal, no-proposal, empty-reply-text) — land in a focused chat-workspace render spec or alongside `inline-proposal-card.spec.ts` (test-writer's call). Existing revision-wiring assertions in `inline-proposal-card.spec.ts` are expected to pass **unchanged** (wiring, not layout). `chat-polish.spec.ts` does **not** assert the detached proposal structure, so no change expected there.
