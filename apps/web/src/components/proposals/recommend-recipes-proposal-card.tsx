"use client";

import { useAuth } from "@clerk/nextjs";
import type {
  AiProposal,
  ProposalModifyResponse,
  Recipe,
  RecipeRecommendationItemProposal,
  RecipeRecommendationProposalPayload,
} from "@health/types";
import { recipeRecommendationProposalPayloadSchema } from "@health/types";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import {
  decideProposal,
  modifyProposal,
  apiQueryKeys,
  getProposalDecisionRefreshQueryKeys,
  getRecipe,
} from "../../lib/api";
import {
  canAcceptProposal,
  canDecideProposal,
  formatProposalValidationErrors,
  getAcceptDisabledReason,
  getProposalDomainLabel,
  getProposalDomainPillClass,
  getProposalIntentLabel,
  getProposalNavigationRoute,
  getProposalRejectedMessage,
  getProposalStatusBadgeTone,
  getProposalStatusLabel,
  getProposalSupersededMessage,
  INLINE_PROPOSAL_VALIDATION_HEADING,
  shouldShowInlineProposalIntentLabel,
} from "../../lib/proposal-ui-state";
import {
  formatMacroEstimateSummary,
  formatMealTypeLabel,
  formatRecipeProvenanceMeta,
  formatRecipeProviderLabel,
  RECIPE_CONFIDENCE_LABELS,
  recipeConfidenceNotice,
} from "../../lib/recipes-ui-state";
import { Badge, Button, ProposalConfirmation } from "../ui";

type RecommendRecipesProposalCardProps = {
  proposal: AiProposal;
  onDecision?: (proposal: AiProposal) => void;
  onModifyRequest?: (response: ProposalModifyResponse) => void;
};

function parseRecommendRecipesPayload(
  proposedChanges: unknown,
): RecipeRecommendationProposalPayload | null {
  const parsed = recipeRecommendationProposalPayloadSchema.safeParse(proposedChanges);
  return parsed.success ? parsed.data : null;
}

type ProposalRecipePreviewProps = {
  item: RecipeRecommendationItemProposal;
  recipe: Recipe | undefined;
  isLoading: boolean;
  isError: boolean;
};

function ProposalRecipePreview({
  item,
  recipe,
  isLoading,
  isError,
}: ProposalRecipePreviewProps) {
  const confidenceNotice = recipe ? recipeConfidenceNotice(recipe.confidence) : null;

  return (
    <li className="recipe-recommendation-card nested-card">
      <div className="recipe-card-header">
        <div>
          <strong>{recipe?.name ?? item.fitSummary}</strong>
          {recipe ? <p className="muted-text">{item.fitSummary}</p> : null}
        </div>
      </div>

      <p className="recipe-rationale">{item.reason}</p>

      {isLoading ? <p className="proposal-meta">Loading recipe details…</p> : null}

      {isError ? (
        <p className="proposal-meta">
          Recipe details are unavailable right now. Review the fit summary and reason above before
          saving.
        </p>
      ) : null}

      {recipe ? (
        <>
          <p className="recipe-macro-copy">{formatMacroEstimateSummary(recipe)}</p>

          <dl className="training-meta recipe-meta">
            <dt>Servings</dt>
            <dd>{recipe.servings}</dd>
            <dt>Source</dt>
            <dd>{formatRecipeProviderLabel(recipe)}</dd>
            <dt>Confidence</dt>
            <dd>{RECIPE_CONFIDENCE_LABELS[recipe.confidence]}</dd>
            <dt>Provenance</dt>
            <dd>{formatRecipeProvenanceMeta(recipe)}</dd>
          </dl>

          {recipe.mealTypes.length > 0 ? (
            <div className="recipe-tag-row">
              {recipe.mealTypes.map((mealType) => (
                <span key={mealType} className="badge badge-info">
                  {formatMealTypeLabel(mealType)}
                </span>
              ))}
            </div>
          ) : null}

          {confidenceNotice ? (
            <div className="notice notice-inline" role="status">
              <p className="proposal-meta">{confidenceNotice}</p>
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export function RecommendRecipesProposalCard({
  proposal,
  onDecision,
  onModifyRequest,
}: RecommendRecipesProposalCardProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const modifyFeedbackId = useId();
  const [isModifyMode, setIsModifyMode] = useState(false);
  const [modificationFeedback, setModificationFeedback] = useState("");

  const payload = useMemo(
    () => parseRecommendRecipesPayload(proposal.proposedChanges),
    [proposal.proposedChanges],
  );

  const recipeQueries = useQueries({
    queries: (payload?.recommendations ?? []).map((item) => ({
      queryKey: apiQueryKeys.recipeDetail(item.recipeId),
      queryFn: async () => {
        const token = await getToken();
        if (!token) {
          throw new Error("Clerk session token is unavailable.");
        }

        const result = await getRecipe(token, item.recipeId);
        if (result.error || !result.data) {
          throw new Error(result.error ?? "Recipe details could not be loaded.");
        }

        return result.data;
      },
      enabled: payload != null,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const recipeById = useMemo(() => {
    const map = new Map<string, Recipe>();
    for (const [index, item] of (payload?.recommendations ?? []).entries()) {
      const recipe = recipeQueries[index]?.data;
      if (recipe) {
        map.set(item.recipeId, recipe);
      }
    }
    return map;
  }, [payload?.recommendations, recipeQueries]);

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
  const showValidationNotice = isPending && (!canAccept || validationErrors.length > 0);
  const trimmedModifyFeedback = modificationFeedback.trim();

  if (!payload) {
    return (
      <ProposalConfirmation status={proposal.status} title={proposal.title} inline>
        <p className="proposal-meta">
          Recipe recommendation details could not be loaded. Try refreshing the chat.
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
              title={!canAccept ? (acceptDisabledReason ?? undefined) : undefined}
              onClick={() => decisionMutation.mutate("accept")}
            >
              {decisionMutation.isPending ? "Saving…" : "Save recommendations"}
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

      <p className="proposal-meta">
        Macro values are approximate wellness estimates, not verified nutrition facts. Saving
        recommendations does not change your nutrition targets.
      </p>

      <ul className="recipe-recommendation-list">
        {payload.recommendations.map((item, index) => (
          <ProposalRecipePreview
            key={item.recipeId}
            item={item}
            recipe={recipeById.get(item.recipeId)}
            isLoading={recipeQueries[index]?.isLoading ?? false}
            isError={recipeQueries[index]?.isError ?? false}
          />
        ))}
      </ul>

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
            What would you like to change about these recipe suggestions?
          </label>
          <textarea
            id={modifyFeedbackId}
            className="form-textarea"
            rows={3}
            value={modificationFeedback}
            disabled={modifyMutation.isPending}
            placeholder="For example: suggest vegetarian dinner options instead."
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
          Recipe recommendations saved. Your nutrition targets are unchanged.
          {domainRoute ? (
            <>
              {" "}
              <Link href={domainRoute} className="confirmation-card__link">
                View recommendations on Nutrition →
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
