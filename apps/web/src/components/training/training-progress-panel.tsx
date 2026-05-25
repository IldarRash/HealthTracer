"use client";

import { useAuth } from "@clerk/nextjs";
import type { WeeklyProgressSummaryResponse } from "@health/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  apiQueryKeys,
  generateWeeklyProgressSummary,
  getCurrentWeeklyProgressSummary,
  getLatestWeeklyProgressSummary,
  getProgressSummaryRefreshQueryKeys,
  postWeeklyReview,
  type ApiResult,
} from "../../lib/api";
import {
  deferredDomainAvailabilityLabel,
  formatProgressTimestamp,
  formatWeekRange,
  isProgressSummaryNotFoundError,
  progressDataStatusBadgeTone,
  progressDataStatusLabel,
  progressDomainLabel,
  PROGRESS_PLAN_CHANGE_NOTICE,
  shouldShowLatestSummarySection,
  sortTrendObservations,
  summarizeDeferredDomains,
  trendDataSufficiencyLabel,
  trendDirectionLabel,
  trendTypeLabel,
} from "../../lib/progress-ui-state";
import {
  buildCrossDomainAggregateViews,
  buildLongevityCrossDomainHeadline,
  buildWeeklyReviewPackView,
} from "../../lib/weekly-review-ui-state";
import { WeeklyReviewAdaptationPreview } from "../progress/weekly-review-adaptation-preview";
import { Badge, Button, DashboardCard, DashboardGrid, EmptyState, ErrorState, LoadingState, ProgressiveDisclosure } from "../ui";

async function loadOptionalWeeklySummary(
  token: string,
  fetcher: (token: string) => Promise<ApiResult<WeeklyProgressSummaryResponse>>,
): Promise<WeeklyProgressSummaryResponse | null> {
  const result = await fetcher(token);

  if (result.data) {
    return result.data;
  }

  if (result.error && isProgressSummaryNotFoundError(result.error)) {
    return null;
  }

  throw new Error(result.error ?? "Weekly summary could not be loaded.");
}

type WeeklySummarySectionProps = {
  heading: string;
  response: WeeklyProgressSummaryResponse;
};

function WeeklySummarySection({ heading, response }: WeeklySummarySectionProps) {
  const { summary, trends } = response;
  const crossDomainHeadline = buildLongevityCrossDomainHeadline(response);
  const aggregateViews = buildCrossDomainAggregateViews(summary.sourceAggregates);
  const sortedTrends = sortTrendObservations(trends);

  return (
    <section className="dashboard-section" aria-labelledby={`${summary.id}-heading`}>
      <div className="progress-summary-header">
        <div>
          <h2 id={`${summary.id}-heading`}>{heading}</h2>
          <p className="dashboard-card__hint">
            {formatWeekRange(summary.weekStart, summary.weekEnd)} · Generated{" "}
            {formatProgressTimestamp(summary.generatedAt)}
          </p>
        </div>
        <Badge tone={progressDataStatusBadgeTone(summary.dataStatus)}>
          {progressDataStatusLabel(summary.dataStatus)}
        </Badge>
      </div>

      <p className="dashboard-card__hint">{summary.userMessage}</p>

      <DashboardGrid className="dashboard-grid--profile">
        <DashboardCard
          className="dashboard-card--span-5"
          label="Cross-domain"
          title="Weekly review headline"
          value={crossDomainHeadline.headline}
          hint={crossDomainHeadline.detail}
        />

        <DashboardCard
          className="dashboard-card--span-4"
          label="Trends"
          title="Cross-domain trends"
          hint="Coaching observations from structured entries. These are not medical assessments."
        >
          {sortedTrends.length > 0 ? (
            <ul className="goals">
              {sortedTrends.map((trend) => (
                <li key={trend.id}>
                  <strong>
                    {trendTypeLabel(trend.trendType)} · {progressDomainLabel(trend.domain)}
                  </strong>
                  <span>
                    {trendDataSufficiencyLabel(trend.dataSufficiency)} ·{" "}
                    {trendDirectionLabel(trend.direction)}
                  </span>
                  <p className="dashboard-card__hint">{trend.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No trends detected yet"
              description="Log workouts, Today checklists, nutrition, or recovery context to build cross-domain patterns."
            />
          )}
        </DashboardCard>

        <DashboardCard
          label="Domains"
          title="Included in this summary"
          hint={summarizeDeferredDomains(summary.deferredDomains)}
        >
          {aggregateViews.length > 0 ? (
            <ul className="goals">
              {aggregateViews.map((entry) => (
                <li key={`${summary.id}-${entry.id}`}>
                  <strong>{entry.domain}</strong>
                  <span>
                    {entry.sufficiency} · {entry.headline}
                  </span>
                  <p className="dashboard-card__hint">{entry.detail}</p>
                </li>
              ))}
            </ul>
          ) : null}
          {summary.deferredDomains.length > 0 ? (
            <ul className="goals">
              {summary.deferredDomains.map((entry) => (
                <li key={`${summary.id}-${entry.domain}-${entry.reason}`}>
                  <strong>{progressDomainLabel(entry.domain)}</strong>
                  <span>
                    {deferredDomainAvailabilityLabel(entry.domain)} · {entry.message}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dashboard-card__hint">
              Deferred domains will appear here when data is sparse or not yet supported.
            </p>
          )}
        </DashboardCard>
      </DashboardGrid>
    </section>
  );
}

export function TrainingProgressPanel() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const currentWeekQuery = useQuery({
    queryKey: apiQueryKeys.progressWeeklyCurrent,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      return loadOptionalWeeklySummary(token, getCurrentWeeklyProgressSummary);
    },
  });

  const latestQuery = useQuery({
    queryKey: apiQueryKeys.progressWeeklyLatest,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      return loadOptionalWeeklySummary(token, getLatestWeeklyProgressSummary);
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (refresh: boolean) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await generateWeeklyProgressSummary(token, { refresh });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Weekly summary could not be generated.");
      }

      return result.data;
    },
    onSuccess: (response) => {
      queryClient.setQueryData(apiQueryKeys.progressWeeklyCurrent, response);
      queryClient.setQueryData(apiQueryKeys.progressWeeklyLatest, response);
      for (const queryKey of getProgressSummaryRefreshQueryKeys()) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (refresh: boolean) => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const result = await postWeeklyReview(token, { refresh });
      if (result.error || !result.data) {
        throw new Error(result.error ?? "Weekly adaptation review could not be generated.");
      }

      return result.data;
    },
    onSuccess: (response) => {
      queryClient.setQueryData(apiQueryKeys.progressWeeklyReview, response);
      queryClient.setQueryData(apiQueryKeys.progressWeeklyCurrent, response.summary);
      queryClient.setQueryData(apiQueryKeys.progressWeeklyLatest, response.summary);
      for (const queryKey of getProgressSummaryRefreshQueryKeys()) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  if (currentWeekQuery.isLoading || latestQuery.isLoading) {
    return <LoadingState title="Loading your weekly progress review…" />;
  }

  if (currentWeekQuery.isError || latestQuery.isError) {
    const error = currentWeekQuery.error ?? latestQuery.error;
    return (
      <ErrorState
        title="Progress review unavailable"
        description={
          error instanceof Error ? error.message : "Your weekly summary could not be loaded."
        }
      />
    );
  }

  const currentWeek = currentWeekQuery.data ?? null;
  const latest = latestQuery.data ?? null;
  const hasAnySummary = Boolean(currentWeek || latest);
  const showLatestSection = shouldShowLatestSummarySection(
    currentWeek?.summary ?? null,
    latest?.summary ?? null,
  );
  const reviewData = reviewMutation.data ?? null;
  const reviewPack = reviewData ? buildWeeklyReviewPackView(reviewData) : null;
  const isGeneratingSummary = generateMutation.isPending;
  const isPackagingReview = reviewMutation.isPending;
  const isActionPending = isGeneratingSummary || isPackagingReview;
  const actionStatusMessage = isGeneratingSummary
    ? "Generating weekly summary."
    : isPackagingReview
      ? "Packaging weekly adaptation preview."
      : null;

  return (
    <div className="page-content training-progress-panel">
      <div className="progress-summary-header">
        <div>
          <p className="section-label">Progress</p>
          <h2>Cross-domain weekly review</h2>
          <p className="dashboard-card__hint">
            Structured summaries and trends across workouts, Today, nutrition, habits, and recovery.
          </p>
          <p className="dashboard-card__hint">
            Read-only on this page. Explore cross-domain patterns on{" "}
            <Link href="/longevity" className="confirmation-card__link">
              Longevity
            </Link>{" "}
            and accept plan changes in{" "}
            <Link href="/chat" className="confirmation-card__link">
              Chat
            </Link>
            .
          </p>
        </div>
      </div>

      {!hasAnySummary ? (
        <EmptyState
          title="No weekly summary yet"
          description="Your latest cross-domain summary will appear here once available. Open Advanced weekly review tools below to generate one from your structured history."
        />
      ) : null}

      {currentWeek ? (
        <WeeklySummarySection heading="Current week" response={currentWeek} />
      ) : latest ? (
        <WeeklySummarySection heading="Latest available week" response={latest} />
      ) : null}

      {showLatestSection && latest ? (
        <WeeklySummarySection heading="Latest saved summary" response={latest} />
      ) : null}

      {reviewPack ? (
        <section
          className="dashboard-section"
          aria-labelledby="weekly-adaptation-pack-heading"
          aria-live="polite"
        >
          <h2 id="weekly-adaptation-pack-heading">Weekly adaptation pack (preview)</h2>
          <WeeklyReviewAdaptationPreview pack={reviewPack} />
        </section>
      ) : null}

      <ProgressiveDisclosure
        className="training-progress-tools-disclosure"
        summary="Advanced weekly review tools"
      >
        <p className="dashboard-card__hint">
          Generate or refresh summaries and preview adaptation packs. These tools do not change your
          plans.
        </p>

        <div
          className="action-row progress-actions"
          role="group"
          aria-label="Weekly review actions"
          aria-busy={isActionPending}
        >
          <Button
            type="button"
            className="button-coach"
            disabled={isActionPending}
            onClick={() => generateMutation.mutate(false)}
          >
            {isGeneratingSummary ? "Working…" : "Generate weekly summary"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!hasAnySummary || isActionPending}
            onClick={() => generateMutation.mutate(true)}
          >
            Refresh current week
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isActionPending}
            onClick={() => reviewMutation.mutate(false)}
          >
            {isPackagingReview ? "Packaging…" : "Preview adaptation pack"}
          </Button>
        </div>
        {actionStatusMessage ? (
          <p className="sr-only" aria-live="polite">
            {actionStatusMessage}
          </p>
        ) : null}

        <div className="notice notice-inline" role="note">
          <p>{PROGRESS_PLAN_CHANGE_NOTICE}</p>
          <p>
            Adaptation previews do not change your plans. Accept formal proposals in{" "}
            <Link href="/chat" className="confirmation-card__link">
              Chat
            </Link>{" "}
            when your coach returns typed suggestions.
          </p>
        </div>

        {generateMutation.isError ? (
          <p className="form-error" role="alert">
            {generateMutation.error instanceof Error
              ? generateMutation.error.message
              : "Weekly summary could not be generated."}
          </p>
        ) : null}

        {reviewMutation.isError ? (
          <p className="form-error" role="alert">
            {reviewMutation.error instanceof Error
              ? reviewMutation.error.message
              : "Weekly adaptation review could not be generated."}
          </p>
        ) : null}
      </ProgressiveDisclosure>
    </div>
  );
}
