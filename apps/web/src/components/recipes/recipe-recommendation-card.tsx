"use client";

import type { UserRecipeRecommendation } from "@health/types";
import {
  canAcceptRecommendation,
  canCompleteRecommendation,
  canDismissRecommendation,
  canLogRecommendation,
  formatMacroEstimateSummary,
  formatMealTypeLabel,
  formatRecipeProvenanceMeta,
  formatRecipeProviderLabel,
  RECIPE_CONFIDENCE_LABELS,
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
            <dt>Servings</dt>
            <dd>{recipe.servings}</dd>
            <dt>Source</dt>
            <dd>{formatRecipeProviderLabel(recipe)}</dd>
            <dt>Confidence</dt>
            <dd>{RECIPE_CONFIDENCE_LABELS[recipe.confidence]}</dd>
            <dt>Provenance</dt>
            <dd>{formatRecipeProvenanceMeta(recipe)}</dd>
          </dl>

          {recipe.tags.length > 0 || recipe.restrictionTags.length > 0 || recipe.allergenTags.length > 0 ? (
            <div className="recipe-tag-row">
              {recipe.mealTypes.map((mealType) => (
                <span key={mealType} className="badge badge-info">
                  {formatMealTypeLabel(mealType)}
                </span>
              ))}
              {recipe.tags.map((tag) => (
                <span key={tag} className="badge badge-neutral">
                  {tag}
                </span>
              ))}
              {recipe.restrictionTags.map((tag) => (
                <span key={`restriction-${tag}`} className="badge badge-pending">
                  {tag}
                </span>
              ))}
              {recipe.allergenTags.map((tag) => (
                <span key={`allergen-${tag}`} className="badge badge-invalid">
                  Contains {tag}
                </span>
              ))}
            </div>
          ) : (
            <div className="recipe-tag-row">
              {recipe.mealTypes.map((mealType) => (
                <span key={mealType} className="badge badge-info">
                  {formatMealTypeLabel(mealType)}
                </span>
              ))}
            </div>
          )}

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
          recipeCalories={recipe?.macroEstimates.estimatedCalories}
          recipeProtein={recipe?.macroEstimates.proteinGrams}
          recipeCarbs={recipe?.macroEstimates.carbsGrams}
          recipeFat={recipe?.macroEstimates.fatGrams}
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
