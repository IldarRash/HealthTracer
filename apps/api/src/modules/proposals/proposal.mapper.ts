import { aiProposalSchema, type AiProposal } from "@health/types";
import type { AiProposalRow } from "../chat/chat.repository.js";

export function toAiProposal(row: AiProposalRow): AiProposal {
  const mapped = {
    id: row.id,
    userId: row.userId,
    threadId: row.threadId,
    sourceMessageId: row.sourceMessageId,
    intent: row.intent,
    targetDomain: row.targetDomain,
    title: row.title,
    reason: row.reason,
    ...(row.evidenceRefs && row.evidenceRefs.length > 0
      ? { evidenceRefs: row.evidenceRefs }
      : {}),
    proposedChanges: row.proposedChanges,
    status: row.status,
    validationStatus: row.validationStatus,
    validationErrors: row.validationErrors,
    userDecisionAt: row.userDecisionAt?.toISOString() ?? null,
    appliedReference: row.appliedReference,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  const parsed = aiProposalSchema.safeParse(mapped);

  // Preserve previously persisted invalid proposals for downstream error rendering.
  if (!parsed.success) {
    return mapped as AiProposal;
  }

  const proposal = parsed.data;
  if (!proposal.evidenceRefs || proposal.evidenceRefs.length === 0) {
    const { evidenceRefs: _ignored, ...withoutEvidence } = proposal;
    return withoutEvidence as AiProposal;
  }

  return proposal;
}

export type { AiProposalRow };
