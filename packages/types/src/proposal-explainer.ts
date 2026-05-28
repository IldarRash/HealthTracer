import { z } from "zod";
import { normalizePreprocessorText } from "./message-preprocessor.js";
import {
  detectProposalExplainerRequest as detectProposalExplainerRequestFromMatcher,
  detectProposalExplainerRequestFromConfig,
  type DetectProposalExplainerRequestOptions,
} from "./proposal-explainer-matcher.js";
import { PROPOSAL_EXPLAINER_NO_PROPOSAL_REPLY } from "./proposal-explainer-default-patterns.js";

export type { DetectProposalExplainerRequestOptions } from "./proposal-explainer-matcher.js";

export const proposalExplainerEvidenceSummarySchema = z.object({
  domain: z.string().min(1).max(80),
  label: z.string().min(1).max(240),
});

export type ProposalExplainerEvidenceSummary = z.infer<
  typeof proposalExplainerEvidenceSummarySchema
>;

export const proposalExplainerTurnContextSchema = z.object({
  proposalId: z.string().uuid(),
  intent: z.string().min(1).max(80),
  targetDomain: z.string().min(1).max(80),
  title: z.string().min(1).max(240),
  reason: z.string().min(1).max(2000),
  status: z.string().min(1).max(40),
  evidenceSummaries: z.array(proposalExplainerEvidenceSummarySchema).max(5),
  createdAt: z.string().datetime(),
});

export type ProposalExplainerTurnContext = z.infer<typeof proposalExplainerTurnContextSchema>;

export { PROPOSAL_EXPLAINER_NO_PROPOSAL_REPLY } from "./proposal-explainer-default-patterns.js";

export {
  compileProposalExplainerMatcher,
  detectProposalExplainerRequest,
  detectProposalExplainerRequestFromConfig,
  detectProposalExplainerRequestWithCompiledMatcher,
  getDefaultCompiledProposalExplainerMatcher,
  type CompiledProposalExplainerMatcher,
} from "./proposal-explainer-matcher.js";

export function detectProposalExplainerRequestFromMessage(
  userMessage: string,
  options: DetectProposalExplainerRequestOptions = {},
): boolean {
  return detectProposalExplainerRequestFromMatcher(
    normalizePreprocessorText(userMessage),
    options,
  );
}

export function buildProposalExplainerTurnContext(input: {
  proposalId: string;
  intent: string;
  targetDomain: string;
  title: string;
  reason: string;
  status: string;
  evidenceRefs?: ReadonlyArray<{ domain?: string; label?: string }> | null;
  createdAt: string;
}): ProposalExplainerTurnContext {
  const evidenceSummaries = (input.evidenceRefs ?? [])
    .slice(0, 5)
    .map((ref) => ({
      domain: ref.domain?.trim() || "context",
      label: ref.label?.trim() || "Supporting context",
    }));

  return proposalExplainerTurnContextSchema.parse({
    proposalId: input.proposalId,
    intent: input.intent,
    targetDomain: input.targetDomain,
    title: input.title,
    reason: input.reason,
    status: input.status,
    evidenceSummaries,
    createdAt: input.createdAt,
  });
}
