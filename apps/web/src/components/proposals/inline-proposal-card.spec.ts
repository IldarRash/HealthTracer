import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const proposalsDir = dirname(fileURLToPath(import.meta.url));
const inlineProposalSource = readFileSync(
  join(proposalsDir, "inline-proposal-card.tsx"),
  "utf8");

describe("InlineProposalCard chat hierarchy", () => {
  it("does not render raw intent, domain, or validation status strings", () => {
    expect(inlineProposalSource).not.toContain("proposal.intent.replaceAll");
    expect(inlineProposalSource).not.toContain("{proposal.targetDomain}");
    expect(inlineProposalSource).not.toContain("validationStatus");
    expect(inlineProposalSource).not.toContain("accept only if");
    expect(inlineProposalSource).not.toContain("Validation issues");
  });

  it("uses mapped domain and optional intent labels in metadata", () => {
    expect(inlineProposalSource).toContain("getProposalDomainLabel");
    expect(inlineProposalSource).toContain("shouldShowInlineProposalIntentLabel");
    expect(inlineProposalSource).toContain("getProposalIntentLabel");
    expect(inlineProposalSource).toContain("{domainLabel}");
    expect(inlineProposalSource).toContain("INLINE_PROPOSAL_VALIDATION_HEADING");
  });

  it("keeps pending decision actions and post-accept navigation links", () => {
    expect(inlineProposalSource).toContain("canDecideProposal");
    expect(inlineProposalSource).toContain("canAcceptProposal");
    expect(inlineProposalSource).toContain('"Accept change"');
    expect(inlineProposalSource).toContain("Decline");
    expect(inlineProposalSource).toContain("getProposalNavigationRoute");
    expect(inlineProposalSource).toContain("View updated plan →");
    expect(inlineProposalSource).toContain("Open Today →");
    expect(inlineProposalSource).toContain('className="confirmation-card__link"');
  });
});
