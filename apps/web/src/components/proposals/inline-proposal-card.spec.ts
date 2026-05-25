import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const proposalsDir = dirname(fileURLToPath(import.meta.url));
const inlineProposalSource = readFileSync(
  join(proposalsDir, "inline-proposal-card.tsx"),
  "utf8",
);
const chatWorkspaceSource = readFileSync(
  join(proposalsDir, "../chat/chat-workspace.tsx"),
  "utf8",
);

describe("InlineProposalCard chat hierarchy", () => {
  it("does not render raw intent, domain, or validation status strings", () => {
    expect(inlineProposalSource).not.toContain("proposal.intent.replaceAll");
    expect(inlineProposalSource).not.toContain("{proposal.targetDomain}");
    expect(inlineProposalSource).not.toContain("validationStatus");
    expect(inlineProposalSource).not.toContain("accept only if");
    expect(inlineProposalSource).not.toContain("Validation issues");
    expect(inlineProposalSource).not.toContain("JSON.stringify");
  });

  it("uses mapped domain and optional intent labels in metadata", () => {
    expect(inlineProposalSource).toContain("getProposalDomainLabel");
    expect(inlineProposalSource).toContain("shouldShowInlineProposalIntentLabel");
    expect(inlineProposalSource).toContain("getProposalIntentLabel");
    expect(inlineProposalSource).toContain("{domainLabel}");
    expect(inlineProposalSource).toContain("INLINE_PROPOSAL_VALIDATION_HEADING");
  });

  it("keeps Apply, Modify, and Reject actions with disabled Apply for invalid proposals", () => {
    expect(inlineProposalSource).toContain("canDecideProposal");
    expect(inlineProposalSource).toContain("canAcceptProposal");
    expect(inlineProposalSource).toContain('"Apply"');
    expect(inlineProposalSource).toContain("\n              Modify\n");
    expect(inlineProposalSource).toContain("\n              Reject\n");
    expect(inlineProposalSource).toContain("getAcceptDisabledReason");
    expect(inlineProposalSource).toContain("modifyProposal");
    expect(inlineProposalSource).not.toContain('"Accept change"');
    expect(inlineProposalSource).not.toContain("Decline");
  });

  it("shows rejected and superseded confirmation copy", () => {
    expect(inlineProposalSource).toContain("getProposalRejectedMessage");
    expect(inlineProposalSource).toContain("getProposalSupersededMessage");
    expect(inlineProposalSource).toContain('proposal.status === "rejected"');
    expect(inlineProposalSource).toContain('proposal.status === "superseded"');
    expect(inlineProposalSource).toContain("Send revision request");
    expect(inlineProposalSource).toContain("isModifyMode");
  });

  it("renders before/after summaries instead of raw proposedChanges", () => {
    expect(inlineProposalSource).toContain("summarizeProposalChanges");
    expect(inlineProposalSource).toContain("ProposalChangeSummaryView");
    expect(inlineProposalSource).toContain("<strong>Before</strong>");
    expect(inlineProposalSource).toContain("<strong>After</strong>");
  });

  it("keeps post-apply navigation links", () => {
    expect(inlineProposalSource).toContain("getProposalNavigationRoute");
    expect(inlineProposalSource).toContain("View updated plan →");
    expect(inlineProposalSource).toContain("Open Today →");
    expect(inlineProposalSource).toContain('className="confirmation-card__link"');
  });
});

describe("ChatWorkspace proposal revision routing", () => {
  it("routes modify responses into structured chat send with retry recovery", () => {
    expect(chatWorkspaceSource).toContain("buildProposalRevisionChatSend");
    expect(chatWorkspaceSource).toContain("onModifyRequest={handleProposalModifyRequest}");
    expect(chatWorkspaceSource).toContain("sendMessageMutation.mutate(revisionSend)");
    expect(chatWorkspaceSource).toContain("pendingRevisionSend");
    expect(chatWorkspaceSource).toContain("shouldShowProposalRevisionSendRetry");
    expect(chatWorkspaceSource).toContain("Retry revision message");
    expect(chatWorkspaceSource).toContain("proposalRevision");
  });
});
