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

  // aiProposalSchema is validation-status aware, so rows persisted as
  // invalid/pending_validation parse cleanly with their raw payload. This
  // fallback guards two cases: (1) rows whose persisted enum values fall
  // outside the current contract (e.g. an intent removed from
  // proposalIntentSchema), and (2) rows that claim validationStatus "valid"
  // but whose payload no longer parses under the current per-intent contract —
  // such a row passes through typed as validated; safety floors hold because
  // accept fully re-validates before applying.
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
