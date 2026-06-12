"use client";

import { useAuth } from "@clerk/nextjs";
import type { Recipe, RecipeMealType } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiQueryKeys, deleteRecipe, getActiveNutritionPlan, listRecipes } from "../../lib/api";
import {
  buildRecipeTagChips,
  formatIngredientLine,
  formatMacroEstimateSummary,
  formatMealTypeLabel,
  formatPrepTime,
  formatRecipeProvenanceHuman,
  isUserOwnedRecipe,
  recipeConfidenceNotice,
} from "../../lib/recipes-ui-state";
import { EmptyState, ErrorState, LoadingState } from "../ui";
import { RecipeForm } from "./recipe-form";
import { RecipeRecommendationsPanel } from "./recipe-recommendations-panel";

type RecipeCatalogCardProps = {
  recipe: Recipe;
  expanded: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isDeleting?: boolean;
};

function RecipeCatalogCard({
  recipe,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  isDeleting,
}: RecipeCatalogCardProps) {
  const prepTime = formatPrepTime(recipe);
  const confidenceNotice = recipeConfidenceNotice(recipe.confidence);
  const owned = isUserOwnedRecipe(recipe);
  const tagChips = buildRecipeTagChips(recipe);

  return (
    <li className={`recipe-card nested-card${owned ? " recipe-card-owned" : ""}`}>
      <div className="recipe-card-header">
        <div>
          <strong>
            {recipe.name}
            {owned ? (
              <span className="badge badge-amber recipe-owned-badge" aria-label="Your recipe">
                My recipe
              </span>
            ) : null}
          </strong>
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
        {prepTime ? (
          <>
            <dt>Time</dt>
            <dd>{prepTime}</dd>
          </>
        ) : null}
        <dt>Source</dt>
        <dd>{formatRecipeProvenanceHuman(recipe.provenance)}</dd>
      </dl>

      {confidenceNotice ? (
        <div className="notice notice-inline" role="status">
          <p className="proposal-meta">{confidenceNotice}</p>
        </div>
      ) : null}

      {tagChips.length > 0 ? (
        <div className="recipe-tag-row">
          {tagChips.map((chip) => (
            <span
              key={chip.key}
              className={`badge badge-${chip.tone === "red" ? "red" : chip.tone === "amber" ? "amber" : chip.tone === "green" ? "green" : "neutral"}`}
            >
              {chip.fallbackLabel}
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

      {owned && (onEdit || onDelete) ? (
        <div className="action-row recipe-owned-actions">
          {onEdit ? (
            <button
              type="button"
              className="button button-secondary"
              disabled={isDeleting}
              onClick={onEdit}
            >
              Edit
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="button button-secondary recipe-delete-btn"
              disabled={isDeleting}
              onClick={onDelete}
              aria-label={`Delete ${recipe.name}`}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

type RecipeFormMode =
  | { type: "create" }
  | { type: "edit"; recipe: Recipe }
  | null;

export function RecipesWorkspace() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [mealTypeFilter, setMealTypeFilter] = useState<RecipeMealType | "">("");
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<RecipeFormMode>(null);
  const [deletingRecipeId, setDeletingRecipeId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const deleteMutation = useMutation({
    mutationFn: async (recipeId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await deleteRecipe(token, recipeId);
      if (result.error) throw new Error(result.error);
    },
    onMutate: (recipeId) => {
      setDeletingRecipeId(recipeId);
      setDeleteError(null);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.recipesCatalog });
      setDeletingRecipeId(null);
    },
    onError: (error) => {
      setDeleteError(
        error instanceof Error ? error.message : "Recipe could not be deleted.",
      );
      setDeletingRecipeId(null);
    },
  });

  const handleDeleteRecipe = (recipe: Recipe) => {
    if (
      window.confirm(
        `Delete "${recipe.name}"? This cannot be undone.`,
      )
    ) {
      deleteMutation.mutate(recipe.id);
    }
  };

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

  // If form is open, render it instead of the catalog list
  if (formMode) {
    return (
      <div className="training-workspace recipes-workspace">
        <div className="recipes-layout">
          <RecipeForm
            recipe={formMode.type === "edit" ? formMode.recipe : undefined}
            onCancel={() => setFormMode(null)}
            onSuccess={() => {
              void queryClient.invalidateQueries({ queryKey: apiQueryKeys.recipesCatalog });
              setFormMode(null);
            }}
          />
        </div>
      </div>
    );
  }

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

          <div className="action-row recipe-catalog-toolbar">
            <button
              type="button"
              className="button button-primary"
              onClick={() => setFormMode({ type: "create" })}
            >
              Add recipe
            </button>

            <div className="recipe-filter-inline">
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
          </div>

          {deleteError ? (
            <p className="form-error" role="alert">
              {deleteError}
            </p>
          ) : null}

          {recipes.length === 0 ? (
            <EmptyState
              title="No recipes match this filter"
              description="Try another meal type or check back after the catalog is seeded."
            />
          ) : (
            <ul className="recipe-catalog-list">
              {recipes.map((recipe) => {
                const owned = isUserOwnedRecipe(recipe);

                return (
                  <RecipeCatalogCard
                    key={recipe.id}
                    recipe={recipe}
                    expanded={expandedRecipeId === recipe.id}
                    isDeleting={deletingRecipeId === recipe.id}
                    onToggle={() =>
                      setExpandedRecipeId((current) =>
                        current === recipe.id ? null : recipe.id,
                      )
                    }
                    onEdit={owned ? () => setFormMode({ type: "edit", recipe }) : undefined}
                    onDelete={owned ? () => handleDeleteRecipe(recipe) : undefined}
                  />
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
