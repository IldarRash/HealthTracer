"use client";

import { useAuth } from "@clerk/nextjs";
import type { AiProposal } from "@health/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { decideProposal, apiQueryKeys, getAcceptedProposalRefreshQueryKeys } from "../../lib/api";
import {
  canAcceptProposal,
  canDecideProposal,
  getAcceptDisabledReason,
  getProposalDomainLabel,
  getProposalDomainPillClass,
  getProposalDomainRoute,
  getProposalIntentLabel,
  getProposalStatusBadgeTone,
  getProposalStatusLabel,
} from "../../lib/proposal-ui-state";
import { summarizeNutritionProposalChanges } from "../../lib/nutrition-ui-state";
import { ProposalEvidenceList } from "./proposal-evidence-list";
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
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.proposals });
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
  const domainLabel = getProposalDomainLabel(proposal.targetDomain);
  const intentLabel = getProposalIntentLabel(proposal.intent);
  const appliedMessage =
    proposal.targetDomain === "recipe"
      ? "Recipe recommendations saved. Your nutrition targets are unchanged."
      : proposal.targetDomain === "workout" || proposal.targetDomain === "nutrition"
      ? `Change applied to your ${domainLabel.toLowerCase()} plan.`
      : proposal.targetDomain === "goal"
        ? "Change applied to your goals."
        : proposal.targetDomain === "profile"
          ? "Change applied to your profile."
          : "Change recorded in your coaching history.";
  const showValidationNotice =
    isPending && (!canAccept || proposal.validationErrors.length > 0);

  const nutritionSummary =
    proposal.targetDomain === "nutrition"
      ? summarizeNutritionProposalChanges(proposal)
      : [];

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
            {domainLabel}
          </span>
          {intentLabel ? (
            <span className="confirmation-card__meta">
              {intentLabel} — accept only if you want this plan revision applied.
            </span>
          ) : null}
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
                View on {domainLabel} →
              </Link>
            ) : null}
          </>
        ) : null
      }
    >
      {nutritionSummary.length > 0 ? (
        <ul>
          {nutritionSummary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {proposal.evidenceRefs && proposal.evidenceRefs.length > 0 ? (
        <ProposalEvidenceList evidenceRefs={proposal.evidenceRefs} />
      ) : null}

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
          {appliedMessage}
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
