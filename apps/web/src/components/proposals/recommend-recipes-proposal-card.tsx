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
import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import {
  apiQueryKeys,
  getRecipe,
} from "../../lib/api";
import {
  canAcceptProposal,
  formatProposalValidationErrors,
  getAcceptDisabledReason,
  getProposalNavigationRoute,
  INLINE_PROPOSAL_VALIDATION_HEADING,
} from "../../lib/proposal-ui-state";
import { useInlineProposalActions } from "../../lib/use-inline-proposal-actions";
import {
  formatMacroEstimateSummary,
  formatMealTypeLabel,
  formatRecipeProvenanceMeta,
  formatRecipeProviderLabel,
  RECIPE_CONFIDENCE_LABELS,
  recipeConfidenceNotice,
} from "../../lib/recipes-ui-state";
import { ProposalConfirmation } from "../ui";
import { ProposalCardShell } from "./proposal-card-shell";

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

  const hookValues = useInlineProposalActions({ proposal, onDecision, onModifyRequest });

  const isPending = proposal.status === "pending";
  const canAccept = canAcceptProposal(proposal);
  const acceptDisabledReason = getAcceptDisabledReason(proposal);
  const domainRoute = getProposalNavigationRoute(proposal);
  const validationErrors = formatProposalValidationErrors(proposal);
  const showValidationNotice = isPending && (!canAccept || validationErrors.length > 0);

  if (!payload) {
    return (
      <ProposalConfirmation status={proposal.status} title={proposal.title} inline>
        <p className="proposal-meta">
          Recipe recommendation details could not be loaded. Try refreshing the chat.
        </p>
      </ProposalConfirmation>
    );
  }

  const acceptedSuccessNode = (
    <>
      Recipe recommendations saved. Your nutrition targets are unchanged.
      {domainRoute ? (
        <>
          {" "}
          <Link href={domainRoute} className="confirmation-card__link">
            View recommendations on Nutrition →
          </Link>
        </>
      ) : null}
    </>
  );

  const validationNoticeNode = showValidationNotice ? (
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
  ) : undefined;

  return (
    <ProposalCardShell
      {...hookValues}
      proposal={proposal}
      acceptLabel="Save recommendations"
      canAccept={canAccept}
      acceptDisabledTitle={acceptDisabledReason ?? undefined}
      viewOnLinkLabel="View on Nutrition →"
      modifyFormLabel="What would you like to change about these recipe suggestions?"
      modifyFormPlaceholder="For example: suggest vegetarian dinner options instead."
      acceptedSuccessNode={acceptedSuccessNode}
      validationNoticeNode={validationNoticeNode}
    >
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
    </ProposalCardShell>
  );
}
