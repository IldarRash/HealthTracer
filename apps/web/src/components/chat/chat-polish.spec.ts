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

/** Normalize CRLF to LF so whitespace assertions work on Windows checkouts. */
function readSource(path: string): string {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

const chatDir = dirname(fileURLToPath(import.meta.url));
const webSrcDir = join(chatDir, "../..");

const chatWorkspaceSource = readSource(join(chatDir, "chat-workspace.tsx"));
const inlineProposalRouterSource = readSource(
  join(webSrcDir, "components/proposals/inline-proposal-card.tsx"),
);
const genericInlineProposalSource = readSource(
  join(webSrcDir, "components/proposals/inline-proposal-card-generic.tsx"),
);
const wellbeingProposalSource = readSource(
  join(webSrcDir, "components/proposals/wellbeing-checkin-proposal-card.tsx"),
);
const nutritionProposalSource = readSource(
  join(webSrcDir, "components/proposals/nutrition-incident-proposal-card.tsx"),
);
const proposalCardShellSource = readSource(
  join(webSrcDir, "components/proposals/proposal-card-shell.tsx"),
);
const weeklyReviewSummarySource = readSource(join(chatDir, "weekly-review-chat-summary.tsx"));
const crisisPanelSource = readSource(
  join(webSrcDir, "components/wellbeing/crisis-support-panel.tsx"),
);
const metadataPanelSource = readSource(join(webSrcDir, "components/ui/chat-metadata-panel.tsx"));
const chatBubbleSource = readSource(join(webSrcDir, "components/ui/chat-bubble.tsx"));
const stylesSource = readSource(join(webSrcDir, "../app/styles.css"));

const CHAT_USER_VISIBLE_SOURCES = [
  chatWorkspaceSource,
  inlineProposalRouterSource,
  genericInlineProposalSource,
  wellbeingProposalSource,
  nutritionProposalSource,
  weeklyReviewSummarySource,
  crisisPanelSource,
  chatBubbleSource,
  readSource(join(chatDir, "chat-composer-attachments.tsx")),
  readSource(join(chatDir, "chat-attachment-outcome-panel.tsx")),
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

  it("routes inline proposals through specialized or generic cards", () => {
    expect(inlineProposalRouterSource).toContain(
      'props.proposal.intent === "capture_wellbeing_checkin"',
    );
    expect(inlineProposalRouterSource).toContain(
      'props.proposal.intent === "log_nutrition_incident"',
    );
    expect(inlineProposalRouterSource).toContain("WellbeingCheckinProposalCard");
    expect(inlineProposalRouterSource).toContain("NutritionIncidentProposalCard");
    expect(inlineProposalRouterSource).toContain("GenericInlineProposalCard");
  });

  it("avoids raw intent and domain labels in generic inline proposal metadata", () => {
    const metaBlock = genericInlineProposalSource.slice(
      genericInlineProposalSource.indexOf("meta={"),
      genericInlineProposalSource.indexOf("badges={"),
    );

    expect(genericInlineProposalSource).not.toContain("proposal.intent.replaceAll");
    expect(metaBlock).not.toMatch(/\{proposal\.targetDomain\}/);
    expect(genericInlineProposalSource).not.toContain("validationStatus");
    expect(genericInlineProposalSource).not.toContain("accept only if");
    expect(genericInlineProposalSource).not.toContain("Validation issues");
    expect(genericInlineProposalSource).toContain("INLINE_PROPOSAL_VALIDATION_HEADING");
    expect(metaBlock).toContain("{domainLabel}");
    expect(genericInlineProposalSource).toContain("proposal.reason");
    expect(wellbeingProposalSource).not.toContain("proposal.intent.replaceAll");
    expect(nutritionProposalSource).not.toContain("validationStatus");
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

  it("preserves post-accept deep links in generic inline proposals", () => {
    expect(genericInlineProposalSource).toContain("View updated plan →");
    expect(genericInlineProposalSource).toContain("Open Today →");
    expect(genericInlineProposalSource).toContain("getProposalNavigationRoute");
  });

  it("exposes Apply, Modify, and Reject affordances with decision accessibility", () => {
    // The generic card still owns its own affordances directly.
    expect(genericInlineProposalSource).toContain('"Apply"');
    expect(genericInlineProposalSource).toContain("\n              Modify\n");
    expect(genericInlineProposalSource).toContain("\n              Reject\n");
    expect(genericInlineProposalSource).toContain('decisionMutation.mutate("accept")');
    expect(genericInlineProposalSource).toContain('decisionMutation.mutate("reject")');
    expect(genericInlineProposalSource).toContain("aria-busy={isActionPending");
    expect(genericInlineProposalSource).toContain('aria-live="polite"');

    // Wellbeing and nutrition cards use ProposalCardShell, which owns these affordances.
    expect(wellbeingProposalSource).toContain("ProposalCardShell");
    expect(nutritionProposalSource).toContain("ProposalCardShell");
    // "Apply" appears as the acceptLabel prop value in each card file.
    expect(wellbeingProposalSource).toContain('"Apply"');
    expect(nutritionProposalSource).toContain('"Apply"');
    // The shell carries the shared affordances.
    expect(proposalCardShellSource).toContain("\n              Modify\n");
    expect(proposalCardShellSource).toContain("\n              Reject\n");
    expect(proposalCardShellSource).toContain('decisionMutation.mutate("accept")');
    expect(proposalCardShellSource).toContain('decisionMutation.mutate("reject")');
    expect(proposalCardShellSource).toContain("aria-busy={isActionPending");
    expect(proposalCardShellSource).toContain('aria-live="polite"');

    expect(genericInlineProposalSource).toContain("modifyProposal");
    expect(genericInlineProposalSource).toContain("proposal-accept-hint-");
    expect(genericInlineProposalSource).toContain("canDecideProposal");
    expect(genericInlineProposalSource).toContain("canAcceptProposal");
    expect(wellbeingProposalSource).toContain("Nothing is saved until you apply");
    expect(nutritionProposalSource).toContain("nutrition plan targets are unchanged");
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
