"use client";

import { useAuth } from "@clerk/nextjs";
import type { AiProposal, ProposalModifyResponse } from "@health/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useState } from "react";
import {
  decideProposal,
  modifyProposal,
  apiQueryKeys,
  getProposalDecisionRefreshQueryKeys,
} from "../../lib/api";
import { summarizeProposalChanges } from "../../lib/proposal-change-summary";
import {
  canAcceptProposal,
  canDecideProposal,
  formatProposalValidationErrors,
  getAcceptDisabledReason,
  getHabitProposalAppliedMessage,
  getProposalDomainLabel,
  getProposalDomainPillClass,
  getProposalNavigationRoute,
  getProposalIntentLabel,
  getProposalRejectedMessage,
  getProposalStatusBadgeTone,
  getProposalStatusLabel,
  getProposalSupersededMessage,
  INLINE_PROPOSAL_VALIDATION_HEADING,
  isHabitPlanProposalIntent,
  shouldShowInlineProposalIntentLabel,
} from "../../lib/proposal-ui-state";
import { ProposalEvidenceList } from "./proposal-evidence-list";
import { Badge, Button, ProposalFrame, ProposalFrameHeader, ProposalWhy, ProposalStateBand } from "../ui";

type InlineProposalCardProps = {
  proposal: AiProposal;
  onDecision?: (proposal: AiProposal) => void;
  onModifyRequest?: (response: ProposalModifyResponse) => void;
};

function ProposalChangeSummaryView({
  summary,
}: {
  summary: ReturnType<typeof summarizeProposalChanges>;
}) {
  if (summary.before.length === 0 && summary.after.length === 0) {
    return null;
  }

  return (
    <div className="proposal-change-summary">
      {summary.before.length > 0 ? (
        <div>
          <strong>Before</strong>
          <ul>
            {summary.before.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {summary.after.length > 0 ? (
        <div>
          <strong>After</strong>
          <ul>
            {summary.after.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function InlineProposalCard({
  proposal,
  onDecision,
  onModifyRequest,
}: InlineProposalCardProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const modifyFeedbackId = useId();
  const [isModifyMode, setIsModifyMode] = useState(false);
  const [modificationFeedback, setModificationFeedback] = useState("");

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
      setIsModifyMode(false);
      setModificationFeedback("");
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.proposals });
      void queryClient.invalidateQueries({ queryKey: ["chat-thread", proposal.threadId] });
      for (const queryKey of getProposalDecisionRefreshQueryKeys(updated)) {
        void queryClient.invalidateQueries({ queryKey });
      }
      onDecision?.(updated);
    },
  });

  const modifyMutation = useMutation({
    mutationFn: async (feedback: string) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await modifyProposal(token, proposal.id, feedback);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Proposal revision request failed.");
      }

      return result.data;
    },
    onSuccess: (response) => {
      setIsModifyMode(false);
      setModificationFeedback("");
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.proposals });
      void queryClient.invalidateQueries({ queryKey: ["chat-thread", proposal.threadId] });
      void queryClient.invalidateQueries({ queryKey: ["proposals", proposal.threadId] });
      onDecision?.(response.proposal);
      onModifyRequest?.(response);
    },
  });

  const isActionPending = decisionMutation.isPending || modifyMutation.isPending;
  const isPending = proposal.status === "pending";
  const canAccept = canAcceptProposal(proposal);
  const canDecide = canDecideProposal(proposal);
  const acceptDisabledReason = getAcceptDisabledReason(proposal);
  const domainRoute = getProposalNavigationRoute(proposal);
  const domainLabel = getProposalDomainLabel(proposal.targetDomain);
  const intentLabel = getProposalIntentLabel(proposal.intent, proposal.proposedChanges);
  const showIntentLabel = shouldShowInlineProposalIntentLabel(
    proposal.intent,
    proposal.proposedChanges,
  );
  const validationErrors = formatProposalValidationErrors(proposal);
  const changeSummary = summarizeProposalChanges(proposal);
  const appliedMessage =
    proposal.targetDomain === "recipe"
      ? "Recipe recommendations saved. Your nutrition targets are unchanged."
      : isHabitPlanProposalIntent(proposal.intent)
        ? getHabitProposalAppliedMessage(proposal.intent)
        : proposal.targetDomain === "workout" || proposal.targetDomain === "nutrition"
          ? `Change applied to your ${domainLabel.toLowerCase()} plan.`
          : proposal.targetDomain === "goal"
            ? "Change applied to your goals."
            : proposal.targetDomain === "profile"
              ? "Change applied to your profile."
              : proposal.targetDomain === "today"
                ? "Today checklist updated."
                : "Change recorded in your coaching history.";
  const showValidationNotice =
    isPending && (!canAccept || validationErrors.length > 0);
  const trimmedModifyFeedback = modificationFeedback.trim();

  return (
    <ProposalFrame
      status={proposal.status}
      inline
      aria-busy={isActionPending || undefined}
      aria-live="polite"
    >
      <ProposalFrameHeader
        title={proposal.title}
        meta={
          <>
            <span
              className={`proposal-domain-pill ${getProposalDomainPillClass(proposal.targetDomain)}`}
            >
              {domainLabel}
            </span>
            {showIntentLabel && intentLabel ? (
              <span className="proposal-frame__meta-label">{intentLabel}</span>
            ) : null}
          </>
        }
        badge={
          <Badge tone={getProposalStatusBadgeTone(proposal.status)}>
            {getProposalStatusLabel(proposal.status)}
          </Badge>
        }
      />

      <div className="proposal-frame__body">
        {proposal.reason ? <ProposalWhy>{proposal.reason}</ProposalWhy> : null}

        <ProposalChangeSummaryView summary={changeSummary} />

        {proposal.evidenceRefs && proposal.evidenceRefs.length > 0 ? (
          <ProposalEvidenceList evidenceRefs={proposal.evidenceRefs} />
        ) : null}

        {showValidationNotice ? (
          <div className="notice notice-inline">
            {acceptDisabledReason ? <p className="proposal-meta">{acceptDisabledReason}</p> : null}
            {validationErrors.length > 0 ? (
              <>
                <strong>{INLINE_PROPOSAL_VALIDATION_HEADING}</strong>
                <ul>
                  {validationErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}

        {isModifyMode && canDecide ? (
          <div className="proposal-modify-form">
            <label className="proposal-meta" htmlFor={modifyFeedbackId}>
              What would you like to change about this suggestion?
            </label>
            <textarea
              id={modifyFeedbackId}
              className="form-textarea"
              rows={3}
              value={modificationFeedback}
              disabled={modifyMutation.isPending}
              placeholder="For example: keep one strength exercise but make it shorter."
              onChange={(event) => setModificationFeedback(event.target.value)}
            />
            <div className="action-row proposal-modify-actions">
              <Button
                type="button"
                className="button-coach"
                disabled={!trimmedModifyFeedback || modifyMutation.isPending}
                onClick={() => modifyMutation.mutate(trimmedModifyFeedback)}
              >
                {modifyMutation.isPending ? "Sending…" : "Send revision request"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={modifyMutation.isPending}
                onClick={() => {
                  setIsModifyMode(false);
                  setModificationFeedback("");
                  modifyMutation.reset();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {proposal.status === "accepted" ? (
          <ProposalStateBand>
            {appliedMessage}
            {domainRoute ? (
              <>
                {" "}
                <Link href={domainRoute} className="proposal-frame__link">
                  {isHabitPlanProposalIntent(proposal.intent)
                    ? "Open Today →"
                    : "View updated plan →"}
                </Link>
              </>
            ) : null}
          </ProposalStateBand>
        ) : null}

        {proposal.status === "rejected" ? (
          <ProposalStateBand>{getProposalRejectedMessage(proposal)}</ProposalStateBand>
        ) : null}

        {proposal.status === "superseded" ? (
          <ProposalStateBand>{getProposalSupersededMessage()}</ProposalStateBand>
        ) : null}

        {decisionMutation.isError ? (
          <p className="form-error" role="alert">
            {decisionMutation.error instanceof Error
              ? decisionMutation.error.message
              : "Could not record proposal decision."}
          </p>
        ) : null}

        {modifyMutation.isError ? (
          <p className="form-error" role="alert">
            {modifyMutation.error instanceof Error
              ? modifyMutation.error.message
              : "Could not request a proposal revision."}
          </p>
        ) : null}
      </div>

      {canDecide ? (
        <div className="proposal-frame__actions action-row">
          <Button
            type="button"
            className="button-coach"
            disabled={!canAccept || isActionPending || isModifyMode}
            title={!canAccept ? (acceptDisabledReason ?? undefined) : undefined}
            aria-describedby={
              !canAccept && acceptDisabledReason
                ? `proposal-accept-hint-${proposal.id}`
                : undefined
            }
            onClick={() => decisionMutation.mutate("accept")}
          >
            {decisionMutation.isPending ? "Saving…" : "Apply"}
          </Button>
          {!canAccept && acceptDisabledReason ? (
            <p id={`proposal-accept-hint-${proposal.id}`} className="sr-only">
              {acceptDisabledReason}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={isActionPending}
            aria-expanded={isModifyMode}
            onClick={() => {
              setIsModifyMode((current) => !current);
              modifyMutation.reset();
            }}
          >
            Modify
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isActionPending || isModifyMode}
            onClick={() => decisionMutation.mutate("reject")}
          >
            Reject
          </Button>
          {domainRoute ? (
            <Link href={domainRoute} className="proposal-frame__link">
              {isHabitPlanProposalIntent(proposal.intent)
                ? "View on Today →"
                : `View on ${domainLabel} →`}
            </Link>
          ) : null}
        </div>
      ) : null}
    </ProposalFrame>
  );
}
