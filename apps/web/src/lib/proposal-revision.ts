import type {
  AiProposal,
  ChatProposalRevision,
  ChatProposalRevisionOriginal,
  ProposalModifyResponse,
} from "@health/types";

/** Chat send payload after a proposal Modify decision. */
export type ProposalRevisionChatSend = {
  message: string;
  proposalRevision: ChatProposalRevision;
};

export const PROPOSAL_REVISION_CHAT_SEND_FAILED_MESSAGE =
  "Your revision was saved, but the coach message could not be sent.";

export function toChatProposalOriginal(proposal: AiProposal): ChatProposalRevisionOriginal {
  const { intent, targetDomain, title, reason, proposedChanges, evidenceRefs } = proposal;

  if (evidenceRefs && evidenceRefs.length > 0) {
    return {
      intent,
      targetDomain,
      title,
      reason,
      proposedChanges,
      evidenceRefs,
    };
  }

  return {
    intent,
    targetDomain,
    title,
    reason,
    proposedChanges,
  };
}

export function buildProposalRevisionChatSend(
  response: ProposalModifyResponse,
): ProposalRevisionChatSend {
  const { revisionContext, proposal } = response;

  return {
    message: revisionContext.suggestedUserMessage,
    proposalRevision: {
      supersededProposalId: revisionContext.supersededProposalId,
      modificationFeedback: revisionContext.modificationFeedback,
      originalProposal: toChatProposalOriginal(proposal),
    },
  };
}

export function isProposalRevisionChatSend(
  input: string | ProposalRevisionChatSend,
): input is ProposalRevisionChatSend {
  return typeof input === "object" && input !== null && "proposalRevision" in input;
}

export function shouldShowProposalRevisionSendRetry(input: {
  pendingRevisionSend: ProposalRevisionChatSend | null;
  isSendError: boolean;
  isSendPending: boolean;
}): boolean {
  return (
    input.pendingRevisionSend !== null &&
    input.isSendError &&
    !input.isSendPending
  );
}
