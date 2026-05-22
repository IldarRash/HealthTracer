"use client";

import { useAuth } from "@clerk/nextjs";
import type { AiProposal } from "@health/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { decideProposal, getAcceptedProposalRefreshQueryKeys } from "../../lib/api";
import {
  canAcceptProposal,
  canDecideProposal,
  getAcceptDisabledReason,
  getProposalDomainLabel,
  getProposalDomainPillClass,
  getProposalDomainRoute,
  getProposalStatusBadgeTone,
  getProposalStatusLabel,
} from "../../lib/proposal-ui-state";
import { Badge, Button, ProposalConfirmation } from "../ui";

type InlineProposalCardProps = {
  proposal: AiProposal;
  onDecision?: (proposal: AiProposal) => void;
};

export function InlineProposalCard({ proposal, onDecision }: InlineProposalCardProps) {
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
      void queryClient.invalidateQueries({ queryKey: ["proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["chat-thread", proposal.threadId] });
      for (const queryKey of getAcceptedProposalRefreshQueryKeys(updated)) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onDecision?.(updated);
    },
  });

  const isPending = proposal.status === "pending";
  const canAccept = canAcceptProposal(proposal);
  const canDecide = canDecideProposal(proposal);
  const acceptDisabledReason = getAcceptDisabledReason(proposal);
  const domainRoute = getProposalDomainRoute(proposal.targetDomain);
  const showValidationNotice =
    isPending && (!canAccept || proposal.validationErrors.length > 0);

  return (
    <ProposalConfirmation
      status={proposal.status}
      title={proposal.title}
      className="confirmation-card--inline"
      aria-busy={decisionMutation.isPending || undefined}
      aria-live="polite"
      meta={
        <>
          <span
            className={`proposal-domain-pill ${getProposalDomainPillClass(proposal.targetDomain)}`}
          >
            {getProposalDomainLabel(proposal.targetDomain)}
          </span>
          <span className="confirmation-card__meta">{proposal.reason}</span>
        </>
      }
      badges={
        <Badge tone={getProposalStatusBadgeTone(proposal.status)}>
          {getProposalStatusLabel(proposal.status)}
        </Badge>
      }
      actions={
        canDecide ? (
          <>
            <Button
              type="button"
              className="button-coach"
              disabled={!canAccept || decisionMutation.isPending}
              title={!canAccept ? (acceptDisabledReason ?? undefined) : undefined}
              aria-describedby={
                !canAccept && acceptDisabledReason
                  ? `proposal-accept-hint-${proposal.id}`
                  : undefined
              }
              onClick={() => decisionMutation.mutate("accept")}
            >
              {decisionMutation.isPending ? "Saving…" : "Accept change"}
            </Button>
            {!canAccept && acceptDisabledReason ? (
              <p id={`proposal-accept-hint-${proposal.id}`} className="sr-only">
                {acceptDisabledReason}
              </p>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={decisionMutation.isPending}
              onClick={() => decisionMutation.mutate("reject")}
            >
              Decline
            </Button>
            {domainRoute ? (
              <Link href={domainRoute} className="confirmation-card__link">
                View on {getProposalDomainLabel(proposal.targetDomain)} →
              </Link>
            ) : null}
          </>
        ) : null
      }
    >
      {showValidationNotice ? (
        <div className="notice notice-inline">
          {acceptDisabledReason ? <p className="proposal-meta">{acceptDisabledReason}</p> : null}
          {proposal.validationErrors.length > 0 ? (
            <ul>
              {proposal.validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {proposal.status === "accepted" ? (
        <div className="confirmation-card__success">
          Change applied to your {getProposalDomainLabel(proposal.targetDomain).toLowerCase()}{" "}
          plan.
          {domainRoute ? (
            <>
              {" "}
              <Link href={domainRoute} className="confirmation-card__link">
                View updated plan →
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {decisionMutation.isError ? (
        <p className="form-error" role="alert">
          {decisionMutation.error instanceof Error
            ? decisionMutation.error.message
            : "Could not record proposal decision."}
        </p>
      ) : null}
    </ProposalConfirmation>
  );
}
