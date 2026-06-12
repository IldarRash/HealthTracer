"use client";

import { useAuth } from "@clerk/nextjs";
import type { AiProposal, NutritionIncidentItem } from "@health/types";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
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
  apiQueryKeys,
  buildRecipeNutritionIncidentProposal,
} from "../../lib/api";
import { formatMacroConfidenceHint, rescaleMacros } from "../../lib/recipes-ui-state";
import { useInlineProposalActions } from "../../lib/use-inline-proposal-actions";
import { Button, LoadingState } from "../ui";

type RecipeNutritionLogDraftProps = {
  recommendationId: string;
  recipeName: string;
  /** Per-serving baseline macros — calories/protein/carbs/fat are each one serving. */
  recipeCalories?: number;
  recipeProtein?: number;
  recipeCarbs?: number;
  recipeFat?: number;
  onClose: () => void;
  onAccepted?: () => void;
};

function createEmptyItem(): NutritionIncidentItem {
  return { name: "", quantity: "1 serving" };
}

type RecipeNutritionLogDraftContentProps = {
  proposal: AiProposal;
  recommendationId: string;
  recipeName: string;
  recipeCalories?: number;
  recipeProtein?: number;
  recipeCarbs?: number;
  recipeFat?: number;
  onClose: () => void;
  onAccepted?: () => void;
};

function RecipeNutritionLogDraftContent({
  proposal,
  recommendationId,
  recipeName,
  recipeCalories,
  recipeProtein,
  recipeCarbs,
  recipeFat,
  onClose,
  onAccepted,
}: RecipeNutritionLogDraftContentProps) {
  const draftId = useId();
  const parsedPayload = useMemo(
    () => parseNutritionIncidentProposalPayload(proposal.proposedChanges),
    [proposal.proposedChanges],
  );
  const [form, setForm] = useState(() =>
    parsedPayload ? createNutritionIncidentFormState(parsedPayload) : null,
  );
  const [portionServings, setPortionServings] = useState<string>("1");

  useEffect(() => {
    if (parsedPayload) {
      setForm(createNutritionIncidentFormState(parsedPayload));
    }
  }, [parsedPayload, proposal.id]);

  const { decisionMutation, isActionPending } = useInlineProposalActions({
    proposal,
    onDecision: (updated) => {
      if (updated.status === "accepted") {
        onAccepted?.();
      }
    },
    getAcceptPayload: () => (form ? buildNutritionIncidentAcceptPayload(form) : null),
  });

  if (!parsedPayload || !form) {
    return (
      <div className="recipe-log-draft nested-card">
        <p className="form-error" role="alert">
          Recipe log estimate could not be loaded.
        </p>
        <button type="button" className="button button-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  const acceptBlockReason = getNutritionIncidentAcceptBlockReason(form);
  const canConfirm = acceptBlockReason == null;
  const previewCalories = sumNutritionItemCalories(form.items);
  const previewMacros = sumNutritionItemMacros(form.items);
  const confidenceNotice = nutritionConfidenceNotice(form.confidence, form.lowConfidenceNotice);
  const macroConfidenceHint = formatMacroConfidenceHint(form.confidence);
  const isInvalidPending =
    proposal.status === "pending" && proposal.validationStatus === "invalid";
  const chatThreadHref = proposal.threadId
    ? `/chat?threadId=${encodeURIComponent(proposal.threadId)}`
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

  /**
   * When the user changes portion size, proportionally rescale macros from the
   * per-recipe baseline. Falls back to the current item values if no baseline is available.
   * This is a client-side estimate — the user can still hand-edit all fields.
   */
  const applyPortionRescale = (targetServingsStr: string) => {
    setPortionServings(targetServingsStr);
    const target = Number.parseFloat(targetServingsStr);
    if (!isFinite(target) || target <= 0) return;
    if (!recipeCalories) return;

    // Baseline is always 1 serving — the per-serving values passed in from the recipe.
    const baseMacros = {
      estimatedCalories: recipeCalories,
      proteinGrams: recipeProtein ?? 0,
      carbsGrams: recipeCarbs ?? 0,
      fatGrams: recipeFat ?? 0,
    };

    const scaled = rescaleMacros(baseMacros, 1, target);

    setForm((current) => {
      if (!current || current.items.length === 0) return current;
      // Update the first item (recipe item) with rescaled values;
      // additional user-added items are left as-is.
      const items = current.items.map((item, idx) =>
        idx === 0
          ? {
              ...item,
              quantity: `${target} serving${target === 1 ? "" : "s"}`,
              calories: scaled.estimatedCalories,
              proteinGrams: scaled.proteinGrams,
              carbsGrams: scaled.carbsGrams,
              fatGrams: scaled.fatGrams,
            }
          : item,
      );
      return { ...current, items, hasUserEdited: true };
    });
  };

  return (
    <div className="recipe-log-draft nested-card" aria-labelledby={draftId}>
      <p id={draftId} className="section-label">
        Confirm food log for {recipeName}
      </p>
      <p className="muted-text">
        Review this approximate estimate, then log the food entry. Nothing is saved until you
        confirm — your nutrition targets stay unchanged.
      </p>

      {isInvalidPending && proposal.validationErrors.length > 0 ? (
        <div className="notice notice-inline" role="status">
          {proposal.validationErrors.map((error) => (
            <p key={error} className="proposal-meta">
              {error}
            </p>
          ))}
        </div>
      ) : null}

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

      {recipeCalories != null ? (
        <div className="recipe-portion-control">
          <div className="form-field">
            <label className="proposal-meta" htmlFor={`${draftId}-portion`}>
              Portion (servings)
            </label>
            <input
              id={`${draftId}-portion`}
              className="form-input"
              inputMode="decimal"
              value={portionServings}
              disabled={isActionPending}
              onChange={(e) => applyPortionRescale(e.target.value)}
            />
          </div>
          <p className="proposal-meta recipe-portion-hint">
            {macroConfidenceHint}
          </p>
        </div>
      ) : null}

      <div className="nutrition-incident-items">
        {form.items.map((item, index) => (
          <div key={`${recommendationId}-item-${index}`} className="nutrition-incident-item-row">
            <div className="form-field">
              <label className="proposal-meta" htmlFor={`recipe-item-name-${recommendationId}-${index}`}>
                Item
              </label>
              <input
                id={`recipe-item-name-${recommendationId}-${index}`}
                className="form-input"
                value={item.name}
                disabled={isActionPending}
                onChange={(event) => updateItem(index, { name: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label className="proposal-meta" htmlFor={`recipe-item-qty-${recommendationId}-${index}`}>
                Quantity
              </label>
              <input
                id={`recipe-item-qty-${recommendationId}-${index}`}
                className="form-input"
                value={item.quantity ?? ""}
                disabled={isActionPending}
                onChange={(event) => updateItem(index, { quantity: event.target.value })}
              />
            </div>
            <div className="form-field">
              <label className="proposal-meta" htmlFor={`recipe-item-cal-${recommendationId}-${index}`}>
                Calories (kcal)
              </label>
              <input
                id={`recipe-item-cal-${recommendationId}-${index}`}
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
            <div className="form-field">
              <label className="proposal-meta" htmlFor={`recipe-item-prot-${recommendationId}-${index}`}>
                Protein (g)
              </label>
              <input
                id={`recipe-item-prot-${recommendationId}-${index}`}
                className="form-input"
                inputMode="numeric"
                value={item.proteinGrams ?? ""}
                disabled={isActionPending}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  updateItem(index, {
                    proteinGrams: value.length > 0 ? Number.parseInt(value, 10) : undefined,
                  });
                }}
              />
            </div>
            <div className="form-field">
              <label className="proposal-meta" htmlFor={`recipe-item-carbs-${recommendationId}-${index}`}>
                Carbs (g)
              </label>
              <input
                id={`recipe-item-carbs-${recommendationId}-${index}`}
                className="form-input"
                inputMode="numeric"
                value={item.carbsGrams ?? ""}
                disabled={isActionPending}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  updateItem(index, {
                    carbsGrams: value.length > 0 ? Number.parseInt(value, 10) : undefined,
                  });
                }}
              />
            </div>
            <div className="form-field">
              <label className="proposal-meta" htmlFor={`recipe-item-fat-${recommendationId}-${index}`}>
                Fat (g)
              </label>
              <input
                id={`recipe-item-fat-${recommendationId}-${index}`}
                className="form-input"
                inputMode="numeric"
                value={item.fatGrams ?? ""}
                disabled={isActionPending}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  updateItem(index, {
                    fatGrams: value.length > 0 ? Number.parseInt(value, 10) : undefined,
                  });
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="action-row">
        <button
          type="button"
          className="button button-secondary"
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
        </button>
      </div>

      {!canConfirm && acceptBlockReason ? (
        <p className="proposal-meta">{acceptBlockReason}</p>
      ) : null}

      <div className="action-row proposal-actions">
        <Button
          type="button"
          className="button-coach"
          disabled={!canConfirm || isActionPending}
          title={!canConfirm ? (acceptBlockReason ?? undefined) : undefined}
          onClick={() => decisionMutation.mutate("accept")}
        >
          {decisionMutation.isPending ? "Logging…" : "Log food entry"}
        </Button>
        {chatThreadHref ? (
          <Link href={chatThreadHref} className="confirmation-card__link">
            Open in Chat →
          </Link>
        ) : null}
        <button type="button" className="button button-secondary" disabled={isActionPending} onClick={onClose}>
          Close
        </button>
      </div>

      {decisionMutation.isError ? (
        <p className="form-error" role="alert">
          {decisionMutation.error instanceof Error
            ? decisionMutation.error.message
            : "Food log could not be saved."}
        </p>
      ) : null}

    </div>
  );
}

export function RecipeNutritionLogDraft({
  recommendationId,
  recipeName,
  recipeCalories,
  recipeProtein,
  recipeCarbs,
  recipeFat,
  onClose,
  onAccepted,
}: RecipeNutritionLogDraftProps) {
  const { getToken } = useAuth();

  const proposalQuery = useQuery({
    queryKey: [...apiQueryKeys.recipeRecommendations, "log-draft", recommendationId],
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await buildRecipeNutritionIncidentProposal(token, recommendationId);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Recipe log estimate could not be loaded.");
      }

      if (result.data.intent !== "log_nutrition_incident") {
        throw new Error("Recipe log proposal has an unexpected intent.");
      }

      return result.data;
    },
  });

  if (proposalQuery.isLoading) {
    return (
      <div className="recipe-log-draft nested-card">
        <LoadingState title="Preparing food log estimate…" />
      </div>
    );
  }

  if (proposalQuery.isError) {
    return (
      <div className="recipe-log-draft nested-card">
        <p className="form-error" role="alert">
          {proposalQuery.error instanceof Error
            ? proposalQuery.error.message
            : "Recipe log estimate could not be loaded."}
        </p>
        <button type="button" className="button button-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  if (!proposalQuery.data) {
    return null;
  }

  return (
    <RecipeNutritionLogDraftContent
      proposal={proposalQuery.data}
      recommendationId={recommendationId}
      recipeName={recipeName}
      recipeCalories={recipeCalories}
      recipeProtein={recipeProtein}
      recipeCarbs={recipeCarbs}
      recipeFat={recipeFat}
      onClose={onClose}
      onAccepted={onAccepted}
    />
  );
}
