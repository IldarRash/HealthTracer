"use client";

import type { AiProposal } from "@health/types";
import Link from "next/link";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useId } from "react";
import {
  canDecideProposal,
  getProposalDomainLabel,
  getProposalDomainPillClass,
  getProposalIntentLabel,
  getProposalNavigationRoute,
  getProposalRejectedMessage,
  getProposalStatusBadgeTone,
  getProposalStatusLabel,
  getProposalSupersededMessage,
  shouldShowInlineProposalIntentLabel,
} from "../../lib/proposal-ui-state";
import { Badge, Button, ProposalConfirmation } from "../ui";

/**
 * Narrow structural types for the mutation handles the shell needs.
 * Avoids threading complex TanStack Query generics through the shell props.
 */
type DecisionMutationHandle = {
  mutate: (decision: "accept" | "reject") => void;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  reset: () => void;
};

type ModifyMutationHandle = {
  mutate: (feedback: string) => void;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  reset: () => void;
};

export type ProposalCardShellProps = {
  proposal: AiProposal;

  // Values from useInlineProposalActions
  decisionMutation: DecisionMutationHandle;
  modifyMutation: ModifyMutationHandle;
  isActionPending: boolean;
  isModifyMode: boolean;
  setIsModifyMode: Dispatch<SetStateAction<boolean>>;
  modificationFeedback: string;
  setModificationFeedback: Dispatch<SetStateAction<string>>;
  trimmedModifyFeedback: string;

  // Per-card divergences
  /** Label rendered on the accept button (e.g. "Apply", "Save recommendations"). */
  acceptLabel: string;
  /**
   * Whether accept is currently allowed. Defaults to true (contract card omits the gate).
   * When false, the accept button is disabled and acceptDisabledTitle is shown.
   */
  canAccept?: boolean;
  /** title attribute on the accept button when canAccept is false. */
  acceptDisabledTitle?: string;
  /**
   * Text for the "View on …" link in the action row.
   * Defaults to `View on ${domainLabel} →`.
   */
  viewOnLinkLabel?: string;
  /** Label for the modify-form textarea. */
  modifyFormLabel: string;
  /** Placeholder for the modify-form textarea. */
  modifyFormPlaceholder: string;
  /** Content of the accepted-success block. Receives the domainRoute link when relevant. */
  acceptedSuccessNode: ReactNode;
  /** Optional validation notice rendered between the pending body and the modify form. */
  validationNoticeNode?: ReactNode;
  /** Per-card pending body (rendered only while status === "pending"). */
  children?: ReactNode;
};

/**
 * ProposalCardShell — shared confirmation chrome for the four domain-specific proposal cards:
 * nutrition-incident, wellbeing-checkin, contract, and recommend-recipes.
 *
 * Owns: meta pill, status badge, Accept/Modify/Reject actions, modify form,
 * rejected/superseded/error copy, and the accepted-success block.
 * Delegates per-domain pending body to `children`.
 */
export function ProposalCardShell({
  proposal,
  decisionMutation,
  modifyMutation,
  isActionPending,
  isModifyMode,
  setIsModifyMode,
  modificationFeedback,
  setModificationFeedback,
  trimmedModifyFeedback,
  acceptLabel,
  canAccept = true,
  acceptDisabledTitle,
  viewOnLinkLabel,
  modifyFormLabel,
  modifyFormPlaceholder,
  acceptedSuccessNode,
  validationNoticeNode,
  children,
}: ProposalCardShellProps) {
  const modifyFeedbackId = useId();

  const canDecide = canDecideProposal(proposal);
  const domainRoute = getProposalNavigationRoute(proposal);
  const domainLabel = getProposalDomainLabel(proposal.targetDomain);
  const intentLabel = getProposalIntentLabel(proposal.intent, proposal.proposedChanges);
  const showIntentLabel = shouldShowInlineProposalIntentLabel(
    proposal.intent,
    proposal.proposedChanges,
  );

  const resolvedViewOnLabel = viewOnLinkLabel ?? `View on ${domainLabel} →`;

  return (
    <ProposalConfirmation
      status={proposal.status}
      title={proposal.title}
      inline
      aria-busy={isActionPending || undefined}
      aria-live="polite"
      meta={
        <>
          <span
            className={`proposal-domain-pill ${getProposalDomainPillClass(proposal.targetDomain)}`}
          >
            {domainLabel}
          </span>
          {showIntentLabel && intentLabel ? (
            <span className="confirmation-card__meta proposal-meta">{intentLabel}</span>
          ) : null}
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
              disabled={!canAccept || isActionPending || isModifyMode}
              title={!canAccept ? (acceptDisabledTitle ?? undefined) : undefined}
              onClick={() => decisionMutation.mutate("accept")}
            >
              {decisionMutation.isPending ? "Saving…" : acceptLabel}
            </Button>
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
              <Link href={domainRoute} className="confirmation-card__link">
                {resolvedViewOnLabel}
              </Link>
            ) : null}
          </>
        ) : null
      }
    >
      {proposal.reason ? <p className="proposal-meta">{proposal.reason}</p> : null}

      {children}

      {validationNoticeNode ?? null}

      {isModifyMode && canDecide ? (
        <div className="proposal-modify-form">
          <label className="proposal-meta" htmlFor={modifyFeedbackId}>
            {modifyFormLabel}
          </label>
          <textarea
            id={modifyFeedbackId}
            className="form-textarea"
            rows={3}
            value={modificationFeedback}
            disabled={modifyMutation.isPending}
            placeholder={modifyFormPlaceholder}
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
        <div className="confirmation-card__success">{acceptedSuccessNode}</div>
      ) : null}

      {proposal.status === "rejected" ? (
        <div className="confirmation-card__notice" role="status">
          {getProposalRejectedMessage(proposal)}
        </div>
      ) : null}

      {proposal.status === "superseded" ? (
        <div className="confirmation-card__notice" role="status">
          {getProposalSupersededMessage()}
        </div>
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
    </ProposalConfirmation>
  );
}
