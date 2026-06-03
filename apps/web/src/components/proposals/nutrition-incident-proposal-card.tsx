"use client";

import type { AiProposal, NutritionIncidentItem, ProposalModifyResponse } from "@health/types";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import {
  buildNutritionIncidentAcceptPayload,
  createNutritionIncidentFormState,
  formatNutritionMacroSummary,
  getNutritionIncidentAcceptBlockReason,
  NUTRITION_CONFIDENCE_LABELS,
  NUTRITION_PROVENANCE_LABELS,
  nutritionConfidenceNotice,
  parseNutritionIncidentProposalPayload,
  sumNutritionItemCalories,
  sumNutritionItemMacros,
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
import { useInlineProposalActions } from "../../lib/use-inline-proposal-actions";
import { Badge, Button, ProposalConfirmation } from "../ui";

type NutritionIncidentProposalCardProps = {
  proposal: AiProposal;
  onDecision?: (proposal: AiProposal) => void;
  onModifyRequest?: (response: ProposalModifyResponse) => void;
};

function createEmptyItem(): NutritionIncidentItem {
  return { name: "", quantity: "1 serving" };
}

export function NutritionIncidentProposalCard({
  proposal,
  onDecision,
  onModifyRequest,
}: NutritionIncidentProposalCardProps) {
  const parsedPayload = useMemo(
    () => parseNutritionIncidentProposalPayload(proposal.proposedChanges),
    [proposal.proposedChanges],
  );
  const [form, setForm] = useState(() =>
    parsedPayload ? createNutritionIncidentFormState(parsedPayload) : null,
  );
  const modifyFeedbackId = useId();

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
    getAcceptPayload: () => (form ? buildNutritionIncidentAcceptPayload(form) : null),
  });

  const isPending = proposal.status === "pending";
  const canDecide = canDecideProposal(proposal);
  const acceptBlockReason = form ? getNutritionIncidentAcceptBlockReason(form) : "Nutrition incident details are unavailable.";
  const canAccept = isPending && acceptBlockReason == null;
  const domainRoute = getProposalNavigationRoute(proposal);
  const domainLabel = getProposalDomainLabel(proposal.targetDomain);
  const intentLabel = getProposalIntentLabel(proposal.intent, proposal.proposedChanges);
  const showIntentLabel = shouldShowInlineProposalIntentLabel(
    proposal.intent,
    proposal.proposedChanges,
  );

  const previewCalories = form ? sumNutritionItemCalories(form.items) : 0;
  const previewMacros = form ? sumNutritionItemMacros(form.items) : null;
  const confidenceNotice = form
    ? nutritionConfidenceNotice(form.confidence, form.lowConfidenceNotice)
    : null;

  const updateItem = (index: number, patch: Partial<NutritionIncidentItem>) => {
    setForm((current) => {
      if (!current) {
        return current;
      }

      const items = current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      );

      return {
        ...current,
        items,
        hasUserEdited: true,
      };
    });
  };

  if (!parsedPayload || !form) {
    return (
      <ProposalConfirmation status={proposal.status} title={proposal.title} inline>
        <p className="proposal-meta">
          This nutrition incident estimate could not be loaded. Try refreshing the chat.
        </p>
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
                View on Nutrition →
              </Link>
            ) : null}
          </>
        ) : null
      }
    >
      {proposal.reason ? <p className="proposal-meta">{proposal.reason}</p> : null}

      {form.mealContextLabel ? (
        <p className="proposal-meta" role="status">
          Meal context: {form.mealContextLabel}
        </p>
      ) : null}

      {isPending ? (
        <div className="action-proposal-form nutrition-incident-proposal-form">
          {/* Food photo capture via chat: send a photo in the chat thread to get an
              AI-generated nutrition proposal. Direct photo analysis from this card was
              removed in Phase 8 (POST /nutrition/food-photo/analyze was deleted from the
              backend). Follow-up: re-add food photo capture in the chat message composer. */}

          <div className="nutrition-incident-estimate-meta">
            <p className="proposal-meta">
              {NUTRITION_CONFIDENCE_LABELS[form.confidence]} ·{" "}
              {NUTRITION_PROVENANCE_LABELS[form.provenance.source]}
            </p>
            <p className="proposal-meta">
              Estimated total: {previewCalories > 0 ? `${previewCalories} kcal` : "Add calories per item"}
              {previewMacros ? ` · ${formatNutritionMacroSummary(previewMacros)}` : null}
            </p>
          </div>

          {confidenceNotice ? (
            <div className="notice notice-inline" role="status">
              <p className="proposal-meta">{confidenceNotice}</p>
            </div>
          ) : null}

          <div className="nutrition-incident-items">
            {form.items.map((item, index) => (
              <div key={`${proposal.id}-item-${index}`} className="nutrition-incident-item-row">
                <div className="form-field">
                  <label className="proposal-meta" htmlFor={`item-name-${proposal.id}-${index}`}>
                    Item
                  </label>
                  <input
                    id={`item-name-${proposal.id}-${index}`}
                    className="form-input"
                    value={item.name}
                    disabled={isActionPending}
                    onChange={(event) => updateItem(index, { name: event.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label className="proposal-meta" htmlFor={`item-qty-${proposal.id}-${index}`}>
                    Quantity
                  </label>
                  <input
                    id={`item-qty-${proposal.id}-${index}`}
                    className="form-input"
                    value={item.quantity ?? ""}
                    disabled={isActionPending}
                    onChange={(event) => updateItem(index, { quantity: event.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label className="proposal-meta" htmlFor={`item-cal-${proposal.id}-${index}`}>
                    Calories
                  </label>
                  <input
                    id={`item-cal-${proposal.id}-${index}`}
                    className="form-input"
                    inputMode="numeric"
                    value={item.calories ?? ""}
                    disabled={isActionPending}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      updateItem(index, {
                        calories: value.length > 0 ? Number.parseInt(value, 10) : undefined,
                      });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="action-row">
            <Button
              type="button"
              variant="secondary"
              disabled={isActionPending}
              onClick={() =>
                setForm((current) =>
                  current
                    ? {
                        ...current,
                        items: [...current.items, createEmptyItem()],
                        hasUserEdited: true,
                      }
                    : current,
                )
              }
            >
              Add item
            </Button>
          </div>

          {!canAccept && acceptBlockReason ? (
            <p className="proposal-meta">{acceptBlockReason}</p>
          ) : null}
        </div>
      ) : null}

      {isModifyMode && canDecide ? (
        <div className="proposal-modify-form">
          <label className="proposal-meta" htmlFor={modifyFeedbackId}>
            What would you like to change about this nutrition estimate?
          </label>
          <textarea
            id={modifyFeedbackId}
            className="form-textarea"
            rows={3}
            value={modificationFeedback}
            disabled={modifyMutation.isPending}
            placeholder="For example: split this into two smaller items."
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
          Nutrition incident logged. Your nutrition plan targets are unchanged.
          {domainRoute ? (
            <>
              {" "}
              <Link href={domainRoute} className="confirmation-card__link">
                View nutrition →
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
