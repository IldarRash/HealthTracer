"use client";

import { useAuth } from "@clerk/nextjs";
import type { Recipe, RecipeMealType, UserRecipeRecommendation } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  apiQueryKeys,
  generateRecipeRecommendations,
  getActiveNutritionPlan,
  listRecipeRecommendations,
  listRecipes,
  updateRecipeRecommendationStatus,
} from "../../lib/api";
import {
  canAcceptRecommendation,
  canCompleteRecommendation,
  canDismissRecommendation,
  formatIngredientLine,
  formatMacroEstimateSummary,
  formatMealTypeLabel,
  formatPrepTime,
  getLimitedReasonCopy,
  isRecommendationVisible,
  recommendationStatusBadgeClass,
  recommendationStatusLabel,
  sortRecommendationsByShownAt,
} from "../../lib/recipes-ui-state";
import { EmptyState, ErrorState, LoadingState } from "../ui";

function RecipeCatalogCard({
  recipe,
  expanded,
  onToggle,
}: {
  recipe: Recipe;
  expanded: boolean;
  onToggle: () => void;
}) {
  const prepTime = formatPrepTime(recipe);

  return (
    <li className="recipe-card nested-card">
      <div className="recipe-card-header">
        <div>
          <strong>{recipe.name}</strong>
          <p className="muted-text">{recipe.description}</p>
        </div>
        <div className="recipe-card-badges">
          {recipe.mealTypes.map((mealType) => (
            <span key={mealType} className="badge badge-info">
              {formatMealTypeLabel(mealType)}
            </span>
          ))}
        </div>
      </div>

      <p className="recipe-macro-copy">{formatMacroEstimateSummary(recipe)}</p>

      <dl className="training-meta recipe-meta">
        <dt>Servings</dt>
        <dd>{recipe.servings}</dd>
        {prepTime ? (
          <>
            <dt>Time</dt>
            <dd>{prepTime}</dd>
          </>
        ) : null}
        <dt>Source</dt>
        <dd>{recipe.source}</dd>
      </dl>

      {recipe.tags.length > 0 ? (
        <div className="recipe-tag-row">
          {recipe.tags.map((tag) => (
            <span key={tag} className="badge badge-neutral">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {recipe.restrictionTags.length > 0 || recipe.allergenTags.length > 0 ? (
        <div className="recipe-tag-row">
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
      ) : null}

      <button
        type="button"
        className="confirmation-card__link recipe-detail-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        {expanded ? "Hide details" : "View ingredients and steps"}
      </button>

      {expanded ? (
        <div className="recipe-detail">
          <h4>Ingredients</h4>
          <ul className="training-exercise-list">
            {recipe.ingredients.map((ingredient) => (
              <li key={`${ingredient.name}-${ingredient.notes ?? ""}`}>
                {formatIngredientLine(ingredient)}
              </li>
            ))}
          </ul>

          <h4>Preparation</h4>
          <ol className="recipe-step-list">
            {recipe.preparationSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </li>
  );
}

function RecommendationCard({
  recommendation,
  busy,
  onAccept,
  onDismiss,
  onComplete,
}: {
  recommendation: UserRecipeRecommendation;
  busy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
  onComplete: () => void;
}) {
  const recipe = recommendation.recipe;

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
          <div className="recipe-tag-row">
            {recipe.mealTypes.map((mealType) => (
              <span key={mealType} className="badge badge-info">
                {formatMealTypeLabel(mealType)}
              </span>
            ))}
          </div>
        </>
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
      </div>
    </li>
  );
}

export function RecipesWorkspace() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [mealTypeFilter, setMealTypeFilter] = useState<RecipeMealType | "">("");
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [generateNotice, setGenerateNotice] = useState<{
    limitedReason: "no_active_nutrition_plan" | "no_compatible_recipes" | null;
  } | null>(null);

  const nutritionQuery = useQuery({
    queryKey: apiQueryKeys.nutritionActive,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await getActiveNutritionPlan(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data ?? { plan: null, activeRevision: null };
    },
  });

  const catalogQuery = useQuery({
    queryKey: [...apiQueryKeys.recipesCatalog, mealTypeFilter],
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listRecipes(
        token,
        mealTypeFilter ? { mealType: mealTypeFilter } : {},
      );
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data?.recipes ?? [];
    },
  });

  const recommendationsQuery = useQuery({
    queryKey: apiQueryKeys.recipeRecommendations,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await listRecipeRecommendations(token);
      if (result.error) {
        throw new Error(result.error);
      }

      return result.data?.recommendations ?? [];
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await generateRecipeRecommendations(token);
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Recommendations could not be generated.");
      }

      return result.data;
    },
    onSuccess: (response) => {
      setGenerateNotice({ limitedReason: response.limitedReason });
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.recipeRecommendations });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({
      recommendationId,
      status,
    }: {
      recommendationId: string;
      status: "accepted" | "dismissed" | "completed";
    }) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await updateRecipeRecommendationStatus(token, recommendationId, {
        status,
      });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Recommendation status could not be updated.");
      }

      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.recipeRecommendations });
    },
  });

  const activeRevision = nutritionQuery.data?.activeRevision ?? null;
  const visibleRecommendations = useMemo(
    () =>
      sortRecommendationsByShownAt(
        (recommendationsQuery.data ?? []).filter(isRecommendationVisible),
      ),
    [recommendationsQuery.data],
  );
  const isBusy = generateMutation.isPending || statusMutation.isPending;

  if (
    nutritionQuery.isLoading ||
    catalogQuery.isLoading ||
    recommendationsQuery.isLoading
  ) {
    return <LoadingState title="Loading recipes…" />;
  }

  if (nutritionQuery.isError) {
    return (
      <ErrorState
        title="Nutrition context unavailable"
        description={
          nutritionQuery.error instanceof Error
            ? nutritionQuery.error.message
            : "Your nutrition plan could not be loaded."
        }
      />
    );
  }

  if (catalogQuery.isError) {
    return (
      <ErrorState
        title="Recipe catalog unavailable"
        description={
          catalogQuery.error instanceof Error
            ? catalogQuery.error.message
            : "Recipes could not be loaded."
        }
      />
    );
  }

  if (recommendationsQuery.isError) {
    return (
      <ErrorState
        title="Recommendations unavailable"
        description={
          recommendationsQuery.error instanceof Error
            ? recommendationsQuery.error.message
            : "Recipe recommendations could not be loaded."
        }
      />
    );
  }

  const recipes = catalogQuery.data ?? [];
  const limitedNotice =
    generateNotice?.limitedReason != null
      ? getLimitedReasonCopy(generateNotice.limitedReason)
      : null;

  return (
    <div className="training-workspace recipes-workspace" aria-busy={isBusy || undefined}>
      <div className="recipes-layout">
        <section className="panel panel-prominent recipes-recommendations-panel">
          <p className="section-label">Plan-fit suggestions</p>
          <h2>Recommended for you</h2>
          <p className="muted-text">
            Recommendations are evaluated against your active nutrition revision when
            available. Saving or completing a recipe updates recommendation status only —
            it does not change calorie, macro, hydration, or restriction targets.
          </p>

          {activeRevision ? (
            <div className="recipe-plan-context nested-card">
              <p className="section-label">Active nutrition revision</p>
              <strong>{activeRevision.payload.title}</strong>
              <p className="muted-text">
                Revision #{activeRevision.revisionNumber} · {activeRevision.reason}
              </p>
            </div>
          ) : (
            <div className="notice notice-inline">
              <p>
                No active nutrition plan yet. Browse the catalog below, or{" "}
                <Link href="/chat" className="confirmation-card__link">
                  accept a nutrition proposal in Chat
                </Link>{" "}
                to unlock plan-fit recommendations.
              </p>
            </div>
          )}

          <div className="action-row proposal-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending ? "Generating…" : "Generate recommendations"}
            </button>
            <Link href="/nutrition" className="confirmation-card__link">
              View nutrition targets →
            </Link>
          </div>

          {limitedNotice ? (
            <div className="notice notice-inline" role="status">
              <strong>{limitedNotice.title}</strong>
              <p>{limitedNotice.description}</p>
            </div>
          ) : null}

          {generateMutation.isError ? (
            <p className="form-error" role="alert">
              {generateMutation.error instanceof Error
                ? generateMutation.error.message
                : "Recommendations could not be generated."}
            </p>
          ) : null}

          {visibleRecommendations.length === 0 ? (
            <EmptyState
              title="No recommendations yet"
              description="Generate plan-fit suggestions, or accept a recipe proposal in Chat."
            />
          ) : (
            <ul className="recipe-recommendation-list">
              {visibleRecommendations.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  busy={statusMutation.isPending}
                  onAccept={() =>
                    statusMutation.mutate({
                      recommendationId: recommendation.id,
                      status: "accepted",
                    })
                  }
                  onDismiss={() =>
                    statusMutation.mutate({
                      recommendationId: recommendation.id,
                      status: "dismissed",
                    })
                  }
                  onComplete={() =>
                    statusMutation.mutate({
                      recommendationId: recommendation.id,
                      status: "completed",
                    })
                  }
                />
              ))}
            </ul>
          )}

          {statusMutation.isError ? (
            <p className="form-error" role="alert">
              {statusMutation.error instanceof Error
                ? statusMutation.error.message
                : "Recommendation could not be updated."}
            </p>
          ) : null}
        </section>

        <section className="panel panel-secondary panel-wide recipes-catalog-panel">
          <p className="section-label">Catalog</p>
          <h2>Browse recipes</h2>
          <p className="muted-text">
            Macro values are estimates for wellness planning, not guaranteed nutrition facts.
          </p>

          <div className="recipe-filter-row">
            <label htmlFor="recipe-meal-filter">Meal type</label>
            <select
              id="recipe-meal-filter"
              className="training-schedule-input"
              value={mealTypeFilter}
              onChange={(event) =>
                setMealTypeFilter(event.target.value as RecipeMealType | "")
              }
            >
              <option value="">All meals</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snack</option>
            </select>
          </div>

          {recipes.length === 0 ? (
            <EmptyState
              title="No recipes match this filter"
              description="Try another meal type or check back after the catalog is seeded."
            />
          ) : (
            <ul className="recipe-catalog-list">
              {recipes.map((recipe) => (
                <RecipeCatalogCard
                  key={recipe.id}
                  recipe={recipe}
                  expanded={expandedRecipeId === recipe.id}
                  onToggle={() =>
                    setExpandedRecipeId((current) =>
                      current === recipe.id ? null : recipe.id,
                    )
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
