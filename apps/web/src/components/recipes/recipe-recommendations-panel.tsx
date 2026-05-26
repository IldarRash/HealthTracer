"use client";

import { useAuth } from "@clerk/nextjs";
import type { NutritionPlanRevision } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  apiQueryKeys,
  generateRecipeRecommendations,
  listRecipeRecommendations,
  updateRecipeRecommendationStatus,
} from "../../lib/api";
import {
  getLimitedReasonCopy,
  isRecommendationVisible,
  sortRecommendationsByShownAt,
} from "../../lib/recipes-ui-state";
import { EmptyState } from "../ui";
import { RecipeRecommendationCard } from "./recipe-recommendation-card";

type RecipeRecommendationsPanelProps = {
  activeRevision: NutritionPlanRevision | null;
  embedded?: boolean;
};

export function RecipeRecommendationsPanel({
  activeRevision,
  embedded = false,
}: RecipeRecommendationsPanelProps) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [generateNotice, setGenerateNotice] = useState<{
    limitedReason: "no_active_nutrition_plan" | "no_compatible_recipes" | null;
  } | null>(null);
  const [loggingRecommendationId, setLoggingRecommendationId] = useState<string | null>(null);

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

  const visibleRecommendations = useMemo(
    () =>
      sortRecommendationsByShownAt(
        (recommendationsQuery.data ?? []).filter(isRecommendationVisible),
      ),
    [recommendationsQuery.data],
  );

  const isBusy = generateMutation.isPending || statusMutation.isPending;
  const limitedNotice =
    generateNotice?.limitedReason != null
      ? getLimitedReasonCopy(generateNotice.limitedReason)
      : null;

  const content = (
    <>
      <p className="muted-text">
        Recommendations are evaluated against your active nutrition revision when available. Saving,
        completing, or logging a recipe updates recommendation or food-log status only — it does not
        change calorie, macro, hydration, or restriction targets.
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
            No active nutrition plan yet.{" "}
            <Link href="/chat" className="confirmation-card__link">
              Accept a nutrition proposal in Chat
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
        {!embedded ? (
          <Link href="/nutrition" className="confirmation-card__link">
            View nutrition targets →
          </Link>
        ) : null}
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

      {recommendationsQuery.isLoading ? (
        <p className="muted-text">Loading recommendations…</p>
      ) : recommendationsQuery.isError ? (
        <p className="form-error" role="alert">
          {recommendationsQuery.error instanceof Error
            ? recommendationsQuery.error.message
            : "Recipe recommendations could not be loaded."}
        </p>
      ) : visibleRecommendations.length === 0 ? (
        <EmptyState
          title="No recommendations yet"
          description="Generate plan-fit suggestions, or accept a recipe proposal in Chat."
        />
      ) : (
        <ul className="recipe-recommendation-list">
          {visibleRecommendations.map((recommendation) => (
            <RecipeRecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              busy={statusMutation.isPending}
              loggingRecommendationId={loggingRecommendationId}
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
              onStartLog={() => setLoggingRecommendationId(recommendation.id)}
              onCloseLog={() => setLoggingRecommendationId(null)}
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
    </>
  );

  if (embedded) {
    return (
      <div className="recipe-recommendations-embedded" aria-busy={isBusy || undefined}>
        {content}
      </div>
    );
  }

  return (
    <section className="panel panel-prominent recipes-recommendations-panel" aria-busy={isBusy || undefined}>
      <p className="section-label">Plan-fit suggestions</p>
      <h2>Recommended for you</h2>
      {content}
    </section>
  );
}
