import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WELLBEING_CRISIS_SUPPORT_COPY } from "@health/types";
import {
  CHAT_EMPTY_STATE_DESCRIPTION,
  CHAT_EMPTY_STATE_TITLE,
  SUGGESTED_CHAT_PROMPTS,
} from "../../lib/chat-ui-state.js";
import {
  INLINE_PROPOSAL_VALIDATION_HEADING,
  getProposalDomainLabel,
  getProposalIntentLabel,
  shouldShowInlineProposalIntentLabel,
} from "../../lib/proposal-ui-state.js";
import { WEEKLY_REVIEW_CHAT_PROMPT } from "../../lib/weekly-review-ui-state.js";

const chatDir = dirname(fileURLToPath(import.meta.url));
const webSrcDir = join(chatDir, "../..");

const chatWorkspaceSource = readFileSync(join(chatDir, "chat-workspace.tsx"), "utf8");
const inlineProposalSource = readFileSync(
  join(webSrcDir, "components/proposals/inline-proposal-card.tsx"),
  "utf8",
);
const weeklyReviewSummarySource = readFileSync(
  join(chatDir, "weekly-review-chat-summary.tsx"),
  "utf8",
);
const crisisPanelSource = readFileSync(
  join(webSrcDir, "components/wellbeing/crisis-support-panel.tsx"),
  "utf8",
);
const metadataPanelSource = readFileSync(
  join(webSrcDir, "components/ui/chat-metadata-panel.tsx"),
  "utf8",
);
const chatBubbleSource = readFileSync(
  join(webSrcDir, "components/ui/chat-bubble.tsx"),
  "utf8",
);
const stylesSource = readFileSync(join(webSrcDir, "../app/styles.css"), "utf8");

const CHAT_USER_VISIBLE_SOURCES = [
  chatWorkspaceSource,
  inlineProposalSource,
  weeklyReviewSummarySource,
  crisisPanelSource,
  chatBubbleSource,
  JSON.stringify(SUGGESTED_CHAT_PROMPTS),
  CHAT_EMPTY_STATE_TITLE,
  CHAT_EMPTY_STATE_DESCRIPTION,
  INLINE_PROPOSAL_VALIDATION_HEADING,
  JSON.stringify(WELLBEING_CRISIS_SUPPORT_COPY),
];

const FORBIDDEN_CHAT_TERMS = [
  "diagnosis",
  "diagnose",
  "treatment plan",
  "prescribe",
  "clinical assessment",
  "medical certainty",
];

describe("Chat workspace prompt wiring", () => {
  it("renders chip labels but sends the full prompt message", () => {
    expect(chatWorkspaceSource).toContain("handlePromptSelect(prompt.message)");
    expect(chatWorkspaceSource).not.toMatch(/handlePromptSelect\(prompt\.label\)/);
    expect(chatWorkspaceSource).toMatch(/\{prompt\.label\}/);
    expect(chatWorkspaceSource).toContain("key={prompt.message}");
  });

  it("does not surface crisis or weekly review metadata on user bubbles", () => {
    expect(chatWorkspaceSource).toContain("const isUser = message.role === \"user\"");
    expect(chatWorkspaceSource).toContain("resolveChatMessageCrisisSupport(message)");
    expect(chatWorkspaceSource).toContain("resolveChatMessageWeeklyReview(message)");
    expect(chatWorkspaceSource).toMatch(
      /crisisSupportCopy[\s\S]*isUser[\s\S]*\? null/,
    );
    expect(chatWorkspaceSource).toMatch(
      /weeklyReviewPack[\s\S]*isUser[\s\S]*\? null/,
    );
  });
});

describe("Chat polish copy and labels", () => {
  it("uses coach-forward prompt chip labels with shorter display text", () => {
    for (const prompt of SUGGESTED_CHAT_PROMPTS) {
      expect(prompt.label.length).toBeLessThanOrEqual(40);
      expect(prompt.label).not.toContain("typed adaptation");
      expect(prompt.label).not.toContain("cross-domain");
    }

    expect(SUGGESTED_CHAT_PROMPTS[0]?.label).toBe("Review my weekly progress");
    expect(SUGGESTED_CHAT_PROMPTS[0]?.message).toBe(WEEKLY_REVIEW_CHAT_PROMPT);
  });

  it("keeps weekly review backend prompt semantics on the first chip message", () => {
    expect(SUGGESTED_CHAT_PROMPTS[0]?.message.toLowerCase()).toContain("approve individually");
  });

  it("uses clearer empty state copy in the chat workspace", () => {
    expect(chatWorkspaceSource).toContain("CHAT_EMPTY_STATE_TITLE");
    expect(chatWorkspaceSource).toContain("CHAT_EMPTY_STATE_DESCRIPTION");
    expect(CHAT_EMPTY_STATE_TITLE).toContain("coach");
    expect(CHAT_EMPTY_STATE_DESCRIPTION).toContain("week");
  });

  it("avoids raw intent and domain labels in inline proposal metadata", () => {
    const metaBlock = inlineProposalSource.slice(
      inlineProposalSource.indexOf("meta={"),
      inlineProposalSource.indexOf("badges={"),
    );

    expect(inlineProposalSource).not.toContain("proposal.intent.replaceAll");
    expect(metaBlock).not.toMatch(/\{proposal\.targetDomain\}/);
    expect(inlineProposalSource).not.toContain("validationStatus");
    expect(inlineProposalSource).not.toContain("accept only if");
    expect(inlineProposalSource).not.toContain("Validation issues");
    expect(inlineProposalSource).toContain("INLINE_PROPOSAL_VALIDATION_HEADING");
    expect(metaBlock).toContain("{domainLabel}");
    expect(inlineProposalSource).toContain("proposal.reason");
  });

  it("shows progress-linked intent labels only when mapped to user-facing copy", () => {
    expect(
      shouldShowInlineProposalIntentLabel("adapt_workout_plan_from_progress"),
    ).toBe(true);
    expect(getProposalIntentLabel("adapt_workout_plan_from_progress")).toContain(
      "Progress-based",
    );
    expect(
      shouldShowInlineProposalIntentLabel("create_goal"),
    ).toBe(false);
    expect(getProposalDomainLabel("workout")).toBe("Workout");
  });

  it("collapses weekly review lane details behind a summary control", () => {
    expect(weeklyReviewSummarySource).toContain(
      'className="chat-weekly-review-summary__details"',
    );
    expect(weeklyReviewSummarySource).toContain("<details");
    expect(weeklyReviewSummarySource).toContain("<summary>");
    expect(weeklyReviewSummarySource).toContain("WEEKLY_REVIEW_CHAT_ACTION_NOTICE");
  });

  it("preserves post-accept deep links in inline proposals", () => {
    expect(inlineProposalSource).toContain("View updated plan →");
    expect(inlineProposalSource).toContain("Open Today →");
    expect(inlineProposalSource).toContain("getProposalNavigationRoute");
  });

  it("exposes accept and decline affordances with decision accessibility", () => {
    expect(inlineProposalSource).toContain('"Accept change"');
    expect(inlineProposalSource).toContain("Decline");
    expect(inlineProposalSource).toContain('decisionMutation.mutate("accept")');
    expect(inlineProposalSource).toContain('decisionMutation.mutate("reject")');
    expect(inlineProposalSource).toContain("aria-busy={decisionMutation.isPending");
    expect(inlineProposalSource).toContain('aria-live="polite"');
    expect(inlineProposalSource).toContain("proposal-accept-hint-");
    expect(inlineProposalSource).toContain("canDecideProposal");
    expect(inlineProposalSource).toContain("canAcceptProposal");
  });

  it("keeps weekly review lane lists labelled inside collapsed details", () => {
    expect(weeklyReviewSummarySource).toContain('aria-labelledby={lanesHeadingId}');
    expect(weeklyReviewSummarySource).toContain(
      'aria-labelledby={droppedLanesHeadingId}',
    );
    expect(weeklyReviewSummarySource).toContain("Adaptation lanes");
    expect(weeklyReviewSummarySource).toContain("Not packaged this week");
  });

  it("uses dark-immersive chat success and notice tokens in styles", () => {
    expect(stylesSource).toContain(".chat-single .confirmation-card__success");
    expect(stylesSource).toContain("--color-chat-success-text");
    expect(stylesSource).toContain(".chat-single .chat-weekly-review-summary.chat-metadata-panel--notice");
    expect(stylesSource).toContain("--color-chat-notice-text");
    expect(stylesSource).toContain(".chat-single .chat-bubble--user");
    expect(stylesSource).toContain("--color-chat-user-immersive-bg");
  });

  it("styles crisis panels and composer focus for readable dark chat", () => {
    expect(stylesSource).toContain("--color-chat-crisis-bg");
    expect(stylesSource).toContain("--color-chat-crisis-link");
    expect(stylesSource).toMatch(
      /\.chat-single \.wellbeing-crisis-panel\.chat-metadata-panel--crisis[\s\S]*background:\s*var\(--color-chat-crisis-bg\)/,
    );
    expect(stylesSource).toMatch(
      /\.chat-single \.wellbeing-crisis-panel\.chat-metadata-panel--crisis[\s\S]*color:\s*var\(--color-chat-crisis-text\)/,
    );
    expect(stylesSource).toMatch(
      /\.chat-single \.wellbeing-crisis-panel\.chat-metadata-panel--crisis \.confirmation-card__link[\s\S]*color:\s*var\(--color-chat-crisis-link\)/,
    );
    expect(stylesSource).toMatch(
      /\.chat-single \.chat-bubble--crisis[\s\S]*border-color:\s*var\(--color-chat-crisis-border\)/,
    );
    expect(stylesSource).toContain(".chat-single .chat-composer textarea:focus-visible");
  });
});

describe("Chat polish safety and accessibility", () => {
  it("keeps crisis support visible through dedicated metadata panel wiring", () => {
    expect(chatWorkspaceSource).toContain("CrisisSupportPanel");
    expect(chatWorkspaceSource).toContain('variant={');
    expect(chatWorkspaceSource).toContain("crisis");
    expect(crisisPanelSource).toContain('tone="crisis"');
    expect(crisisPanelSource).toContain("wellbeing-crisis-resources");
  });

  it("defines transcript, composer, thinking, and metadata panel accessibility hooks", () => {
    expect(chatBubbleSource).toContain('aria-live={live}');
    expect(chatBubbleSource).toContain('aria-label={label}');
    expect(chatBubbleSource).toContain('role="status"');
    expect(chatBubbleSource).toContain("aria-busy=\"true\"");
    expect(metadataPanelSource).toContain('role="region"');
    expect(metadataPanelSource).toContain("aria-labelledby={titleId}");
    expect(weeklyReviewSummarySource).toContain("titleId={headingId}");
    expect(crisisPanelSource).toContain("titleId={titleId}");
    expect(crisisPanelSource).toContain('tone="crisis"');
    expect(chatWorkspaceSource).toContain("ChatThinkingIndicator");
    expect(chatWorkspaceSource).toContain('htmlFor="chat-message"');
    expect(chatWorkspaceSource).toContain('className="sr-only"');
    expect(chatWorkspaceSource).toContain('role="alert"');
  });

  it("avoids forbidden clinical terms in chat user-visible copy", () => {
    const combined = CHAT_USER_VISIBLE_SOURCES.join("\n").toLowerCase();

    for (const term of FORBIDDEN_CHAT_TERMS) {
      expect(combined).not.toContain(term);
    }
  });
});
