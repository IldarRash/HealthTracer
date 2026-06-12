"use client";

import type { UserRecipeRecommendation } from "@health/types";
import {
  buildRecipeTagChips,
  canAcceptRecommendation,
  canCompleteRecommendation,
  canDismissRecommendation,
  canLogRecommendation,
  formatMacroEstimateSummary,
  formatMealTypeLabel,
  formatRecipeProvenanceHuman,
  recommendationStatusBadgeClass,
  recommendationStatusLabel,
  recipeConfidenceNotice,
} from "../../lib/recipes-ui-state";
import { RecipeNutritionLogDraft } from "./recipe-nutrition-log-draft";

type RecipeRecommendationCardProps = {
  recommendation: UserRecipeRecommendation;
  busy: boolean;
  loggingRecommendationId: string | null;
  onAccept: () => void;
  onDismiss: () => void;
  onComplete: () => void;
  onStartLog: () => void;
  onCloseLog: () => void;
};

export function RecipeRecommendationCard({
  recommendation,
  busy,
  loggingRecommendationId,
  onAccept,
  onDismiss,
  onComplete,
  onStartLog,
  onCloseLog,
}: RecipeRecommendationCardProps) {
  const recipe = recommendation.recipe;
  const isLogging = loggingRecommendationId === recommendation.id;
  const confidenceNotice = recipe ? recipeConfidenceNotice(recipe.confidence) : null;
  const tagChips = recipe ? buildRecipeTagChips(recipe) : [];

  return (
    <li className="recipe-recommendation-card nested-card">
      <div className="recipe-card-header">
        <div>
          <strong>{recipe?.name ?? "Recipe recommendation"}</strong>
          <p className="muted-text">{recommendation.fitSummary}</p>
        </div>
        <span className={recommendationStatusBadgeClass(recommendation.status)}>
          {recommendationStatusLabel(recommendation.status)}
        </span>
      </div>

      <p className="recipe-rationale">{recommendation.reason}</p>

      {recipe ? (
        <>
          <p className="recipe-macro-copy">{formatMacroEstimateSummary(recipe)}</p>

          <dl className="training-meta recipe-meta">
            <dt>Source</dt>
            <dd>{formatRecipeProvenanceHuman(recipe.provenance)}</dd>
          </dl>

          <div className="recipe-tag-row">
            {recipe.mealTypes.map((mealType) => (
              <span key={mealType} className="badge badge-info">
                {formatMealTypeLabel(mealType)}
              </span>
            ))}
            {tagChips.map((chip) => (
              <span
                key={chip.key}
                className={`badge badge-${chip.tone === "red" ? "red" : chip.tone === "amber" ? "amber" : chip.tone === "green" ? "green" : "neutral"}`}
              >
                {chip.fallbackLabel}
              </span>
            ))}
          </div>

          {confidenceNotice ? (
            <div className="notice notice-inline" role="status">
              <p className="proposal-meta">{confidenceNotice}</p>
            </div>
          ) : null}
        </>
      ) : null}

      {isLogging ? (
        <RecipeNutritionLogDraft
          recommendationId={recommendation.id}
          recipeName={recipe?.name ?? "Recipe"}
          recipeCalories={recipe?.perServingMacros.caloriesPerServing}
          recipeProtein={recipe?.perServingMacros.proteinGramsPerServing}
          recipeCarbs={recipe?.perServingMacros.carbsGramsPerServing}
          recipeFat={recipe?.perServingMacros.fatGramsPerServing}
          onClose={onCloseLog}
          onAccepted={onCloseLog}
        />
      ) : null}

      <div className="action-row proposal-actions">
        {canAcceptRecommendation(recommendation) ? (
          <button
            type="button"
            className="button button-primary"
            disabled={busy}
            onClick={onAccept}
          >
            Save recipe
          </button>
        ) : null}
        {canDismissRecommendation(recommendation) ? (
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={onDismiss}
          >
            Dismiss
          </button>
        ) : null}
        {canCompleteRecommendation(recommendation) ? (
          <button
            type="button"
            className="button button-primary"
            disabled={busy}
            onClick={onComplete}
          >
            Mark completed
          </button>
        ) : null}
        {canLogRecommendation(recommendation) && !isLogging ? (
          <button
            type="button"
            className="button button-secondary"
            disabled={busy}
            onClick={onStartLog}
          >
            Log this recipe
          </button>
        ) : null}
      </div>
    </li>
  );
}
