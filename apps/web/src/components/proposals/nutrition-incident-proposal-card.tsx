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
  getProposalNavigationRoute,
} from "../../lib/proposal-ui-state";
import { useInlineProposalActions } from "../../lib/use-inline-proposal-actions";
import { Button, ProposalConfirmation, Stepper } from "../ui";
import { ProposalCardShell } from "./proposal-card-shell";

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
  const itemNameBaseId = useId();

  const hookValues = useInlineProposalActions({
    proposal,
    onDecision,
    onModifyRequest,
    getAcceptPayload: () => (form ? buildNutritionIncidentAcceptPayload(form) : null),
  });
  const { isActionPending } = hookValues;

  const isPending = proposal.status === "pending";
  const acceptBlockReason = form ? getNutritionIncidentAcceptBlockReason(form) : "Nutrition incident details are unavailable.";
  const canAccept = isPending && acceptBlockReason == null;
  const domainRoute = getProposalNavigationRoute(proposal);

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

  const acceptedSuccessNode = (
    <>
      Nutrition incident logged. Your nutrition plan targets are unchanged.
      {domainRoute ? (
        <>
          {" "}
          <Link href={domainRoute} className="confirmation-card__link">
            View nutrition →
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
      viewOnLinkLabel="View on Nutrition →"
      modifyFormLabel="What would you like to change about this nutrition estimate?"
      modifyFormPlaceholder="For example: split this into two smaller items."
      acceptedSuccessNode={acceptedSuccessNode}
    >
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
                  <label className="proposal-meta" htmlFor={`${itemNameBaseId}-name-${index}`}>
                    Item
                  </label>
                  <input
                    id={`${itemNameBaseId}-name-${index}`}
                    className="form-input"
                    value={item.name}
                    disabled={isActionPending}
                    onChange={(event) => updateItem(index, { name: event.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label className="proposal-meta" htmlFor={`${itemNameBaseId}-qty-${index}`}>
                    Quantity
                  </label>
                  <input
                    id={`${itemNameBaseId}-qty-${index}`}
                    className="form-input"
                    value={item.quantity ?? ""}
                    disabled={isActionPending}
                    onChange={(event) => updateItem(index, { quantity: event.target.value })}
                  />
                </div>
                <div className="form-field">
                  <Stepper
                    label="Calories"
                    value={item.calories ?? 0}
                    step={10}
                    min={0}
                    unit="kcal"
                    disabled={isActionPending}
                    onChange={(v) =>
                      updateItem(index, { calories: v > 0 ? v : undefined })
                    }
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
    </ProposalCardShell>
  );
}
