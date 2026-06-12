/**
 * Observation 3 fix: assistant reply + proposal card(s) now render as ONE unified message.
 * The `message-proposals` block was moved from a sibling AFTER the assistant <ChatBubble>
 * to INSIDE the bubble's non-crisis children branch, under <ChatBubble> → .chat-bubble__content.
 *
 * Assertion style: source-structure (readFileSync + string/regex matching), matching the
 * established style of chat-polish.spec.ts and inline-proposal-card.spec.ts.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const chatDir = dirname(fileURLToPath(import.meta.url));
const webSrcDir = join(chatDir, "../..");

// Normalize CRLF→LF so the positional `\n`-anchored assertions below are
// line-ending agnostic (Windows checkouts may have CRLF).
const chatWorkspaceSource = readFileSync(join(chatDir, "chat-workspace.tsx"), "utf8").replace(
  /\r\n/g,
  "\n",
);
const stylesSource = readFileSync(join(webSrcDir, "../app/styles.css"), "utf8").replace(
  /\r\n/g,
  "\n",
);

// ────────────────────────────────────────────────────────────────────────────
// Helpers for positional assertions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns the index of the first occurrence of `needle` after `afterIndex`.
 * Returns -1 if not found.
 */
function indexAfter(source: string, needle: string, afterIndex: number): number {
  return source.indexOf(needle, afterIndex);
}

// ────────────────────────────────────────────────────────────────────────────
// AC #1 — Unified rendering: proposals inside the assistant bubble unit
// ────────────────────────────────────────────────────────────────────────────

describe("ChatWorkspace proposal unified rendering (Obs-3 fix)", () => {
  it("renders the message-proposals block inside the non-crisis ChatBubble children branch", () => {
    // The non-crisis branch opens with a fragment after the crisisSupportCopy ternary.
    // The message-proposals div must appear BEFORE </ChatBubble> closes.
    const crisisCheck = chatWorkspaceSource.indexOf("crisisSupportCopy ? (");
    expect(crisisCheck).toBeGreaterThan(-1);

    const nonCrisisBranchOpen = chatWorkspaceSource.indexOf(") : (\n", crisisCheck);
    expect(nonCrisisBranchOpen).toBeGreaterThan(-1);

    const messageProposalsIndex = indexAfter(
      chatWorkspaceSource,
      'className="message-proposals"',
      nonCrisisBranchOpen,
    );
    expect(messageProposalsIndex).toBeGreaterThan(-1);

    // </ChatBubble> must close AFTER the message-proposals div.
    const chatBubbleCloseIndex = chatWorkspaceSource.indexOf("</ChatBubble>", messageProposalsIndex);
    expect(chatBubbleCloseIndex).toBeGreaterThan(messageProposalsIndex);
  });

  it("does not render message-proposals as a sibling of ChatBubble inside the same <li>", () => {
    // After </ChatBubble> closes the main message unit, none of the sibling content
    // (weeklyReviewPack, quick-action chips, </li>) should reference message-proposals.
    const chatBubbleCloseIndex = chatWorkspaceSource.indexOf("</ChatBubble>");
    expect(chatBubbleCloseIndex).toBeGreaterThan(-1);

    // There must NOT be a second message-proposals occurrence after </ChatBubble>.
    const siblingProposalIndex = indexAfter(
      chatWorkspaceSource,
      'className="message-proposals"',
      chatBubbleCloseIndex,
    );
    expect(siblingProposalIndex).toBe(-1);
  });

  it("scopes the message-proposals CSS rule inside .chat-bubble__content, not as a top-level block", () => {
    // The CSS must scope message-proposals under the bubble content wrapper.
    expect(stylesSource).toContain(".chat-bubble__content .message-proposals");

    // The old detached rule was `.message-proposals {` with no parent — must not exist.
    // A bare `.message-proposals {` at the start of a line would be the detached form.
    expect(stylesSource).not.toMatch(/^\.message-proposals\s*\{/m);
  });

  it("keeps InlineProposalCard inside the non-crisis branch alongside message-proposals", () => {
    const nonCrisisBranchOpen = chatWorkspaceSource.indexOf(") : (\n");
    expect(nonCrisisBranchOpen).toBeGreaterThan(-1);

    const inlineCardIndex = indexAfter(chatWorkspaceSource, "InlineProposalCard", nonCrisisBranchOpen);
    expect(inlineCardIndex).toBeGreaterThan(-1);

    // InlineProposalCard must appear before </ChatBubble>.
    const chatBubbleCloseIndex = chatWorkspaceSource.indexOf("</ChatBubble>", inlineCardIndex);
    expect(chatBubbleCloseIndex).toBeGreaterThan(inlineCardIndex);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC #2 — Multi-proposal: multiple proposals rendered in order within the unit
// ────────────────────────────────────────────────────────────────────────────

describe("ChatWorkspace multi-proposal rendering", () => {
  it("maps linkedProposals as a list inside the single message-proposals container", () => {
    // The map must be within the message-proposals div (not multiple separate containers).
    const containerStart = chatWorkspaceSource.indexOf('className="message-proposals"');
    expect(containerStart).toBeGreaterThan(-1);

    const mapCall = indexAfter(chatWorkspaceSource, "linkedProposals.map(", containerStart);
    expect(mapCall).toBeGreaterThan(-1);

    // The map must close before the message-proposals div closes.
    const containerEnd = chatWorkspaceSource.indexOf("</div>", containerStart);
    expect(containerEnd).toBeGreaterThan(mapCall);
  });

  it("uses proposal.id as the key for stable ordering of multiple proposals", () => {
    const containerStart = chatWorkspaceSource.indexOf('className="message-proposals"');
    expect(containerStart).toBeGreaterThan(-1);

    const keyPropIndex = indexAfter(chatWorkspaceSource, "key={proposal.id}", containerStart);
    expect(keyPropIndex).toBeGreaterThan(-1);

    // key must be before the container closes.
    const containerEnd = chatWorkspaceSource.indexOf("</div>", containerStart);
    expect(containerEnd).toBeGreaterThan(keyPropIndex);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC #3 — No-proposal: no empty proposal container on turns without proposals
// ────────────────────────────────────────────────────────────────────────────

describe("ChatWorkspace no-proposal turn", () => {
  it("guards the message-proposals container on linkedProposals.length > 0", () => {
    // The container must only render when there are proposals — guarded by length check.
    expect(chatWorkspaceSource).toMatch(/linkedProposals\.length\s*>\s*0/);

    // The guard must appear just before the message-proposals container in the source.
    const guardIndex = chatWorkspaceSource.search(/linkedProposals\.length\s*>\s*0/);
    const containerIndex = chatWorkspaceSource.indexOf('className="message-proposals"');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(containerIndex).toBeGreaterThan(guardIndex);
    // Container must follow within a close window (the JSX ternary).
    expect(containerIndex - guardIndex).toBeLessThan(200);
  });

  it("does not render an unconditional message-proposals element", () => {
    // There must be exactly one occurrence of the class — the conditional one.
    const all: number[] = [];
    let idx = 0;
    while (true) {
      const found = chatWorkspaceSource.indexOf('className="message-proposals"', idx);
      if (found === -1) break;
      all.push(found);
      idx = found + 1;
    }
    expect(all.length).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC #4 — Empty reply text + proposal: no empty <p> and proposal stays inside bubble
// ────────────────────────────────────────────────────────────────────────────

describe("ChatWorkspace empty reply text with proposal", () => {
  it("guards the text paragraph on messageText being truthy, not on linkedProposals", () => {
    // The chat-bubble__text <p> must be guarded solely by messageText.
    expect(chatWorkspaceSource).toMatch(/messageText\s*\?\s*<p className="chat-bubble__text">/);
  });

  it("renders the message-proposals block independently of messageText", () => {
    // The proposal container must be guarded by linkedProposals.length, not messageText,
    // so a turn with empty content but a proposal still shows the proposal inside the bubble.
    const messageTextGuardIdx = chatWorkspaceSource.search(
      /messageText\s*\?\s*<p className="chat-bubble__text">/,
    );
    const proposalGuardIdx = chatWorkspaceSource.search(/linkedProposals\.length\s*>\s*0/);

    expect(messageTextGuardIdx).toBeGreaterThan(-1);
    expect(proposalGuardIdx).toBeGreaterThan(-1);

    // They must be independent guards (different positions in source).
    expect(messageTextGuardIdx).not.toBe(proposalGuardIdx);

    // The proposal guard must come AFTER the text guard (text first, then proposals).
    expect(proposalGuardIdx).toBeGreaterThan(messageTextGuardIdx);
  });

  it("does not render an unconditional chat-bubble__text paragraph — every occurrence is messageText-gated", () => {
    // Every line in the source that contains `<p className="chat-bubble__text">` must
    // also contain `messageText ?` on that same line (i.e. it is inside the ternary guard).
    const lines = chatWorkspaceSource.split("\n");
    const textParaLines = lines.filter((line) => line.includes('<p className="chat-bubble__text">'));

    // There must be at least one such line (the component renders it).
    expect(textParaLines.length).toBeGreaterThan(0);

    // Every such line must have the messageText ternary guard on the same line.
    for (const line of textParaLines) {
      expect(line).toContain("messageText ?");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// AC #5 — Handler wiring: onDecision / onModifyRequest still passed to InlineProposalCard
// ────────────────────────────────────────────────────────────────────────────

describe("ChatWorkspace proposal handler wiring after render move", () => {
  it("passes onDecision={handleProposalDecision} to InlineProposalCard", () => {
    expect(chatWorkspaceSource).toContain("onDecision={handleProposalDecision}");
  });

  it("passes onModifyRequest={handleProposalModifyRequest} to InlineProposalCard", () => {
    expect(chatWorkspaceSource).toContain("onModifyRequest={handleProposalModifyRequest}");
  });

  it("keeps both handler props on the same InlineProposalCard invocation inside the bubble", () => {
    const containerStart = chatWorkspaceSource.indexOf('className="message-proposals"');
    expect(containerStart).toBeGreaterThan(-1);

    const containerEnd = chatWorkspaceSource.indexOf("</div>", containerStart);
    expect(containerEnd).toBeGreaterThan(-1);

    const fragment = chatWorkspaceSource.slice(containerStart, containerEnd);
    expect(fragment).toContain("onDecision={handleProposalDecision}");
    expect(fragment).toContain("onModifyRequest={handleProposalModifyRequest}");
  });

  it("keeps handleProposalDecision updating localProposals via mergeProposalsById", () => {
    expect(chatWorkspaceSource).toContain("handleProposalDecision");
    expect(chatWorkspaceSource).toContain("mergeProposalsById");
    // The handler must set localProposals.
    expect(chatWorkspaceSource).toContain("setLocalProposals");
  });

  it("keeps handleProposalModifyRequest building a revision send and mutating", () => {
    expect(chatWorkspaceSource).toContain("handleProposalModifyRequest");
    expect(chatWorkspaceSource).toContain("buildProposalRevisionChatSend");
    // Revision sends now go through the streaming path (with sync fallback).
    expect(chatWorkspaceSource).toContain("sendMessageStreaming");
    expect(chatWorkspaceSource).toContain("proposalRevision");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Regression guard: sibling panels (weekly-review, attachment-outcome) stay OUTSIDE bubble
// ────────────────────────────────────────────────────────────────────────────

describe("ChatWorkspace sibling panels remain outside the assistant bubble", () => {
  it("renders WeeklyReviewChatSummary as a sibling after </ChatBubble>, not inside it", () => {
    const chatBubbleClose = chatWorkspaceSource.indexOf("</ChatBubble>");
    expect(chatBubbleClose).toBeGreaterThan(-1);

    const weeklyReviewIndex = indexAfter(chatWorkspaceSource, "WeeklyReviewChatSummary", chatBubbleClose);
    expect(weeklyReviewIndex).toBeGreaterThan(-1);
  });

  it("does not render ChatAttachmentOutcomePanel (deleted in W3 — dead noise)", () => {
    // chat-attachment-outcome-panel.tsx was deleted: attachment status never leaves
    // "queued" at runtime so the panel was dead noise and has been removed entirely.
    expect(chatWorkspaceSource).not.toContain("ChatAttachmentOutcomePanel");
  });

  it("keeps crisis branch inside the bubble using CrisisSupportPanel, not message-proposals", () => {
    // CrisisSupportPanel must still be the child of the crisis branch (inside the bubble).
    const crisisBranchStart = chatWorkspaceSource.indexOf("crisisSupportCopy ? (");
    expect(crisisBranchStart).toBeGreaterThan(-1);

    const crisisPanelIndex = indexAfter(chatWorkspaceSource, "CrisisSupportPanel", crisisBranchStart);
    expect(crisisPanelIndex).toBeGreaterThan(-1);

    // message-proposals must NOT appear in the crisis branch — it is in the non-crisis branch only.
    const nonCrisisOpen = chatWorkspaceSource.indexOf(") : (\n", crisisBranchStart);
    expect(nonCrisisOpen).toBeGreaterThan(-1);

    // The crisis branch closes at ") : (" so message-proposals must not appear between
    // crisisBranchStart and the non-crisis marker.
    const proposalsInCrisis = chatWorkspaceSource
      .slice(crisisBranchStart, nonCrisisOpen)
      .indexOf('className="message-proposals"');
    expect(proposalsInCrisis).toBe(-1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CSS — in-bubble proposal card de-emphasis and status tints preserved
// ────────────────────────────────────────────────────────────────────────────

describe("styles.css in-bubble proposal grouping", () => {
  it("scopes proposal-card de-emphasis inside .chat-bubble__content", () => {
    expect(stylesSource).toContain(".chat-bubble__content .proposal-card");
  });

  it("preserves status tints on proposal cards nested inside the bubble", () => {
    expect(stylesSource).toContain(".chat-bubble__content .proposal-card.status-accepted");
    expect(stylesSource).toContain(".chat-bubble__content .proposal-card.status-rejected");
    expect(stylesSource).toContain(".chat-bubble__content .proposal-card.status-superseded");
    expect(stylesSource).toContain(".chat-bubble__content .proposal-card.status-pending");
  });

  it("provides top spacing/separation for the message-proposals group inside the bubble", () => {
    // The in-bubble message-proposals rule must set at minimum a margin-top or padding-top
    // to separate the proposal block from the reply text.
    const ruleStart = stylesSource.indexOf(".chat-bubble__content .message-proposals {");
    expect(ruleStart).toBeGreaterThan(-1);

    const ruleEnd = stylesSource.indexOf("}", ruleStart);
    const ruleBody = stylesSource.slice(ruleStart, ruleEnd);
    expect(ruleBody).toMatch(/margin-top|padding-top/);
  });
});
