"use client";

import type { AiProposal, ProposalModifyResponse, WellbeingScore } from "@health/types";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import {
  ENERGY_SCORE_LABELS,
  buildWellbeingCheckinAcceptPayload,
  createWellbeingCheckinFormState,
  getWellbeingCheckinAcceptBlockReason,
  parseWellbeingCheckinProposalPayload,
} from "../../lib/action-proposal-ui-state";
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
import {
  MOOD_SCORE_LABELS,
  STRESS_SCORE_LABELS,
  resolveWellbeingCrisisDisplay,
  resolveWellbeingCrisisPreview,
} from "../../lib/wellbeing-ui-state";
import { useInlineProposalActions } from "../../lib/use-inline-proposal-actions";
import { CrisisSupportPanel } from "../wellbeing/crisis-support-panel";
import { WellbeingScaleInput } from "../wellbeing/wellbeing-scale-input";
import { Badge, Button, ProposalConfirmation } from "../ui";

type WellbeingCheckinProposalCardProps = {
  proposal: AiProposal;
  onDecision?: (proposal: AiProposal) => void;
  onModifyRequest?: (response: ProposalModifyResponse) => void;
};

export function WellbeingCheckinProposalCard({
  proposal,
  onDecision,
  onModifyRequest,
}: WellbeingCheckinProposalCardProps) {
  const parsedPayload = useMemo(
    () => parseWellbeingCheckinProposalPayload(proposal.proposedChanges),
    [proposal.proposedChanges],
  );
  const [form, setForm] = useState(() =>
    parsedPayload ? createWellbeingCheckinFormState(parsedPayload) : null,
  );
  const modifyFeedbackId = useId();
  const noteId = useId();

  const {
    decisionMutation,
    modifyMutation,
    isActionPending,
    isModifyMode,
    setIsModifyMode,
    modificationFeedback,
    setModificationFeedback,
    trimmedModifyFeedback,
  } = useInlineProposalActions({
    proposal,
    onDecision,
    onModifyRequest,
    getAcceptPayload: () => (form ? buildWellbeingCheckinAcceptPayload(form) : null),
  });

  const isPending = proposal.status === "pending";
  const canDecide = canDecideProposal(proposal);
  const acceptBlockReason = form ? getWellbeingCheckinAcceptBlockReason(form) : "Check-in details are unavailable.";
  const canAccept = isPending && acceptBlockReason == null;
  const domainRoute = getProposalNavigationRoute(proposal);
  const domainLabel = getProposalDomainLabel(proposal.targetDomain);
  const intentLabel = getProposalIntentLabel(proposal.intent, proposal.proposedChanges);
  const showIntentLabel = shouldShowInlineProposalIntentLabel(
    proposal.intent,
    proposal.proposedChanges,
  );

  const crisisPreview =
    form != null
      ? resolveWellbeingCrisisPreview({
          moodScore: form.moodScore,
          note: form.note,
        })
      : { shouldShowCrisisSupport: false, reasons: [], copy: null };

  const crisisDisplay = resolveWellbeingCrisisDisplay(crisisPreview, null);

  if (!parsedPayload || !form) {
    return (
      <ProposalConfirmation status={proposal.status} title={proposal.title} inline>
        <p className="proposal-meta">This wellbeing check-in could not be loaded. Try refreshing the chat.</p>
      </ProposalConfirmation>
    );
  }

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
              title={!canAccept ? (acceptBlockReason ?? undefined) : undefined}
              onClick={() => decisionMutation.mutate("accept")}
            >
              {decisionMutation.isPending ? "Saving…" : "Apply"}
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
                View on Today →
              </Link>
            ) : null}
          </>
        ) : null
      }
    >
      {proposal.reason ? <p className="proposal-meta">{proposal.reason}</p> : null}

      {isPending ? (
        <div className="wellbeing-check-in-form action-proposal-form">
          <p className="proposal-meta">
            Review your mood, stress, and energy for {form.date}. Nothing is saved until you apply.
          </p>
          <WellbeingScaleInput
            id={`wellbeing-proposal-mood-${proposal.id}`}
            label="Mood"
            value={form.moodScore}
            optionLabels={MOOD_SCORE_LABELS}
            disabled={isActionPending}
            onChange={(score) => setForm((current) => ({ ...current!, moodScore: score }))}
          />
          <WellbeingScaleInput
            id={`wellbeing-proposal-stress-${proposal.id}`}
            label="Stress"
            value={form.stressScore}
            optionLabels={STRESS_SCORE_LABELS}
            disabled={isActionPending}
            onChange={(score) => setForm((current) => ({ ...current!, stressScore: score }))}
          />
          <WellbeingScaleInput
            id={`wellbeing-proposal-energy-${proposal.id}`}
            label="Energy (optional)"
            value={form.energyLevel}
            optionLabels={ENERGY_SCORE_LABELS}
            disabled={isActionPending}
            onChange={(score: WellbeingScore) =>
              setForm((current) => ({ ...current!, energyLevel: score }))
            }
          />
          <div className="form-field">
            <label className="proposal-meta" htmlFor={noteId}>
              Optional note
            </label>
            <textarea
              id={noteId}
              className="form-textarea"
              rows={3}
              maxLength={280}
              value={form.note}
              disabled={isActionPending}
              placeholder="A short note about how you feel today."
              onChange={(event) =>
                setForm((current) => ({ ...current!, note: event.target.value }))
              }
            />
          </div>
          {!canAccept && acceptBlockReason ? (
            <p className="proposal-meta">{acceptBlockReason}</p>
          ) : null}
          {crisisDisplay.shouldShowCrisisSupport && crisisDisplay.copy ? (
            <CrisisSupportPanel copy={crisisDisplay.copy} />
          ) : null}
        </div>
      ) : null}

      {isModifyMode && canDecide ? (
        <div className="proposal-modify-form">
          <label className="proposal-meta" htmlFor={modifyFeedbackId}>
            What would you like to change about this check-in suggestion?
          </label>
          <textarea
            id={modifyFeedbackId}
            className="form-textarea"
            rows={3}
            value={modificationFeedback}
            disabled={modifyMutation.isPending}
            placeholder="For example: ask me about sleep quality too."
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
        <div className="confirmation-card__success">
          Wellbeing check-in saved for today. Your nutrition and workout targets are unchanged.
          {domainRoute ? (
            <>
              {" "}
              <Link href={domainRoute} className="confirmation-card__link">
                Open Today →
              </Link>
            </>
          ) : null}
        </div>
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
