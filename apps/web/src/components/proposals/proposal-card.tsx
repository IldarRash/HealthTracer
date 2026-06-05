"use client";

import { useAuth } from "@clerk/nextjs";
import type { AiProposal } from "@health/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { decideProposal, apiQueryKeys, getProposalDecisionRefreshQueryKeys } from "../../lib/api";
import {
  canAcceptProposal,
  canDecideProposal,
  formatProposalValidationErrors,
  getAcceptDisabledReason,
  getProposalDomainLabel,
  getProposalIntentLabel,
} from "../../lib/proposal-ui-state";

type ProposalCardProps = {
  proposal: AiProposal;
  compact?: boolean;
  onDecision?: (proposal: AiProposal) => void;
};

export function ProposalCard({ proposal, compact = false, onDecision }: ProposalCardProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const decisionMutation = useMutation({
    mutationFn: async (decision: "accept" | "reject") => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await decideProposal(token, proposal.id, decision);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Proposal decision failed.");
      }

      return result.data;
    },
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.proposals });
      void queryClient.invalidateQueries({ queryKey: ["chat-thread", proposal.threadId] });
      for (const queryKey of getProposalDecisionRefreshQueryKeys(updated)) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onDecision?.(updated);
    },
  });

  const isPending = proposal.status === "pending";
  const canAccept = canAcceptProposal(proposal);
  const canDecide = canDecideProposal(proposal);
  const acceptDisabledReason = getAcceptDisabledReason(proposal);
  const validationErrors = formatProposalValidationErrors(proposal);
  const showCompactValidation =
    compact && isPending && (!canAccept || validationErrors.length > 0);

  return (
    <article className={`proposal-card status-${proposal.status} domain-${proposal.targetDomain}`}>
      <header className="proposal-header">
        <div>
          <strong>{proposal.title}</strong>
          <p className="proposal-meta">
            {getProposalIntentLabel(proposal.intent, proposal.proposedChanges) ?? proposal.intent.replaceAll("_", " ")} · {getProposalDomainLabel(proposal.targetDomain)}
          </p>
        </div>
        <div className="badge-group">
          <span className={`badge badge-${proposal.status}`}>{proposal.status}</span>
          <span className={`badge badge-${proposal.validationStatus}`}>
            {proposal.validationStatus}
          </span>
        </div>
      </header>

      <p className="proposal-reason">{proposal.reason}</p>

      {!compact ? (
        <>
          <details className="proposal-details">
            <summary>Proposed changes</summary>
            <pre>{JSON.stringify(proposal.proposedChanges, null, 2)}</pre>
          </details>

          {proposal.appliedReference ? (
            <p className="proposal-applied">
              Applied reference: <code>{proposal.appliedReference}</code>
            </p>
          ) : null}

          {proposal.userDecisionAt ? (
            <p className="proposal-meta">Decision at {proposal.userDecisionAt}</p>
          ) : null}
        </>
      ) : null}

      {showCompactValidation ? (
        <div className="notice notice-inline">
          {acceptDisabledReason ? (
            <p className="proposal-meta">{acceptDisabledReason}</p>
          ) : null}
          {validationErrors.length > 0 ? (
            <>
              <strong>Validation issues</strong>
              <ul>
                {validationErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {!compact && validationErrors.length > 0 ? (
        <div className="notice notice-inline">
          <strong>Validation issues</strong>
          <ul>
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {canDecide ? (
        <div className="action-row proposal-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={!canAccept || decisionMutation.isPending}
            title={!canAccept ? (acceptDisabledReason ?? undefined) : undefined}
            aria-describedby={
              !canAccept && acceptDisabledReason ? `proposal-accept-hint-${proposal.id}` : undefined
            }
            onClick={() => decisionMutation.mutate("accept")}
          >
            Accept
          </button>
          {!canAccept && acceptDisabledReason ? (
            <p id={`proposal-accept-hint-${proposal.id}`} className="sr-only">
              {acceptDisabledReason}
            </p>
          ) : null}
          <button
            type="button"
            className="button button-secondary"
            disabled={decisionMutation.isPending}
            onClick={() => decisionMutation.mutate("reject")}
          >
            Decline
          </button>
        </div>
      ) : null}

      {decisionMutation.isError ? (
        <p className="form-error" role="alert">
          {decisionMutation.error instanceof Error
            ? decisionMutation.error.message
            : "Could not record proposal decision."}
        </p>
      ) : null}
    </article>
  );
}
