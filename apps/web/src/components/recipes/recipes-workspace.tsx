"use client";

import { useAuth } from "@clerk/nextjs";
import type { Recipe, RecipeMealType } from "@health/types";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiQueryKeys, getActiveNutritionPlan, listRecipes } from "../../lib/api";
import {
  formatIngredientLine,
  formatMacroEstimateSummary,
  formatMealTypeLabel,
  formatPrepTime,
  formatRecipeProvenanceMeta,
  formatRecipeProviderLabel,
  RECIPE_CONFIDENCE_LABELS,
  recipeConfidenceNotice,
} from "../../lib/recipes-ui-state";
import { EmptyState, ErrorState, LoadingState } from "../ui";
import { RecipeRecommendationsPanel } from "./recipe-recommendations-panel";

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
  const confidenceNotice = recipeConfidenceNotice(recipe.confidence);

  return (
    <li className="recipe-card nested-card">
      <div className="recipe-card-header">
        <div>
          <strong>{recipe.name}</strong>
          <p className="muted-text">{recipe.description}</p>
        </div>
        <div className="recipe-card-badges">
          {recipe.mealTypes.map((mealType) => (
            <span key={mealType} className="badge badge-green">
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
        <dd>{formatRecipeProviderLabel(recipe)}</dd>
        <dt>Confidence</dt>
        <dd>{RECIPE_CONFIDENCE_LABELS[recipe.confidence]}</dd>
        <dt>Provenance</dt>
        <dd>{formatRecipeProvenanceMeta(recipe)}</dd>
      </dl>

      {confidenceNotice ? (
        <div className="notice notice-inline" role="status">
          <p className="proposal-meta">{confidenceNotice}</p>
        </div>
      ) : null}

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
            <span key={`restriction-${tag}`} className="badge badge-amber">
              {tag}
            </span>
          ))}
          {recipe.allergenTags.map((tag) => (
            <span key={`allergen-${tag}`} className="badge badge-red">
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

export function RecipesWorkspace() {
  const { getToken } = useAuth();
  const [mealTypeFilter, setMealTypeFilter] = useState<RecipeMealType | "">("");
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);

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

  const activeRevision = nutritionQuery.data?.activeRevision ?? null;

  if (nutritionQuery.isLoading || catalogQuery.isLoading) {
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

  const recipes = catalogQuery.data ?? [];

  return (
    <div className="training-workspace recipes-workspace">
      <div className="recipes-layout">
        <RecipeRecommendationsPanel activeRevision={activeRevision} />

        <section className="panel panel-secondary panel-wide recipes-catalog-panel">
          <p className="section-label">Catalog</p>
          <h2>Browse recipes</h2>
          <p className="muted-text">
            Macro values are approximate wellness estimates, not guaranteed nutrition facts.
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
