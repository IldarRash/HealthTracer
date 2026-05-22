import type { AiProposal } from "@health/types";
import type { AiProposalRow } from "../chat/chat.repository.js";

export function toAiProposal(row: AiProposalRow): AiProposal {
  return {
    id: row.id,
    userId: row.userId,
    threadId: row.threadId,
    sourceMessageId: row.sourceMessageId,
    intent: row.intent,
    targetDomain: row.targetDomain,
    title: row.title,
    reason: row.reason,
    proposedChanges: row.proposedChanges,
    status: row.status,
    validationStatus: row.validationStatus,
    validationErrors: row.validationErrors,
    userDecisionAt: row.userDecisionAt?.toISOString() ?? null,
    appliedReference: row.appliedReference,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type { AiProposalRow };
