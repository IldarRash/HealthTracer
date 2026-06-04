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
  getProposalNavigationRoute,
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
import { ProposalConfirmation } from "../ui";
import { ProposalCardShell } from "./proposal-card-shell";

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
  const noteId = useId();

  const hookValues = useInlineProposalActions({
    proposal,
    onDecision,
    onModifyRequest,
    getAcceptPayload: () => (form ? buildWellbeingCheckinAcceptPayload(form) : null),
  });
  const { isActionPending } = hookValues;

  const isPending = proposal.status === "pending";
  const acceptBlockReason = form ? getWellbeingCheckinAcceptBlockReason(form) : "Check-in details are unavailable.";
  const canAccept = isPending && acceptBlockReason == null;
  const domainRoute = getProposalNavigationRoute(proposal);

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

  const acceptedSuccessNode = (
    <>
      Wellbeing check-in saved for today. Your nutrition and workout targets are unchanged.
      {domainRoute ? (
        <>
          {" "}
          <Link href={domainRoute} className="confirmation-card__link">
            Open Today →
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <ProposalCardShell
      {...hookValues}
      proposal={proposal}
      acceptLabel="Apply"
      canAccept={canAccept}
      acceptDisabledTitle={acceptBlockReason ?? undefined}
      viewOnLinkLabel="View on Today →"
      modifyFormLabel="What would you like to change about this check-in suggestion?"
      modifyFormPlaceholder="For example: ask me about sleep quality too."
      acceptedSuccessNode={acceptedSuccessNode}
    >
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
    </ProposalCardShell>
  );
}
