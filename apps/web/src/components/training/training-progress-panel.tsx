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
  summarizeWorkoutAggregate,
  trendDataSufficiencyLabel,
  trendDirectionLabel,
  trendTypeLabel,
} from "../../lib/progress-ui-state";
import { Badge, Button, DashboardCard, DashboardGrid, EmptyState, ErrorState, LoadingState } from "../ui";

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
  const workoutSummary = summarizeWorkoutAggregate(summary.sourceAggregates.workout);
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
          label="Workouts"
          title="Weekly workout summary"
          value={workoutSummary.headline}
          hint={workoutSummary.detail}
        />

        <DashboardCard
          className="dashboard-card--span-4"
          label="Trends"
          title="Workout trends"
          hint="Simple patterns based on the workout entries available. These are coaching observations, not medical assessments."
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
              description="Complete a few planned workouts to start seeing simple weekly patterns."
            />
          )}
        </DashboardCard>

        <DashboardCard
          label="Coverage"
          title="Domains included in this summary"
          hint={summarizeDeferredDomains(summary.deferredDomains)}
        >
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
              Workout data is included. Other domains will appear here when they are supported.
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

  return (
    <div className="page-content training-progress-panel">
      <div className="progress-summary-header">
        <div>
          <p className="section-label">Progress</p>
          <h2>Weekly training review</h2>
          <p className="dashboard-card__hint">
            Workout summaries and simple trends from your structured session history.
          </p>
        </div>
      </div>

      <div className="action-row progress-actions">
        <Button
          type="button"
          className="button-coach"
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate(false)}
        >
          {generateMutation.isPending ? "Working…" : "Generate weekly summary"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!hasAnySummary || generateMutation.isPending}
          onClick={() => generateMutation.mutate(true)}
        >
          Refresh current week
        </Button>
      </div>

      <div className="notice notice-inline" role="note">
        <p>{PROGRESS_PLAN_CHANGE_NOTICE}</p>
        <p>
          Ask your coach in{" "}
          <Link href="/chat" className="confirmation-card__link">
            Chat
          </Link>{" "}
          if you want to discuss adapting your plan from this review.
        </p>
      </div>

      {generateMutation.isError ? (
        <p className="form-error" role="alert">
          {generateMutation.error instanceof Error
            ? generateMutation.error.message
            : "Weekly summary could not be generated."}
        </p>
      ) : null}

      {!hasAnySummary ? (
        <EmptyState
          title="No weekly summary yet"
          description="Generate a summary from your structured workout history. Nutrition, recipes, recovery, and Today adherence are shown as deferred until those domains are included."
          action={
            <Button
              type="button"
              className="button-coach"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate(false)}
            >
              Generate weekly summary
            </Button>
          }
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
    </div>
  );
}
