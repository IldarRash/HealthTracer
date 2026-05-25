"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  apiQueryKeys,
  getActiveNutritionPlan,
  getActiveWorkoutPlan,
  getCurrentWeeklyProgressSummary,
  getHabitAdherence,
  getTodayDay,
  getTodayHistory,
  getTodayNutritionAdherence,
  getWellbeingAggregates,
  listDeviceConnections,
  listDocuments,
  listGoals,
  listHealthMetricAggregates,
  listHealthMetricSnapshots,
} from "../../lib/api";
import {
  buildDocumentsContextView,
  buildGoalsSectionView,
  buildLongevityCoachPrompts,
  buildLongevityTrendsView,
  buildLongevityWeeklyHero,
  buildNutritionConsistencyCardView,
  buildTodayAdherenceCardView,
  buildWellnessSignalsPanelView,
  isOptionalProgressNotFound,
  summarizeHabitConsistencyHint,
  todayIsoDate,
} from "../../lib/longevity-ui-state";
import { summarizeWorkoutAdherence } from "../../lib/dashboard-ui-state";
import type { WeeklyProgressSummaryResponse } from "@health/types";
import { Badge, DashboardCard, DashboardGrid, EmptyState, ErrorState, LoadingState } from "../ui";
import { WellbeingHistoryPanel } from "./wellbeing-history-panel";

async function loadOptionalWeeklyProgress(
  token: string,
): Promise<{ data: WeeklyProgressSummaryResponse | null; error?: string }> {
  const result = await getCurrentWeeklyProgressSummary(token);

  if (result.data) {
    return { data: result.data };
  }

  if (result.error && isOptionalProgressNotFound(result.error)) {
    return { data: null };
  }

  return { data: null, error: result.error };
}

export function LongevityDashboard() {
  const { getToken } = useAuth();
  const todayDate = todayIsoDate();

  const longevityQuery = useQuery({
    queryKey: apiQueryKeys.longevityState,
    queryFn: async () => {
      const token = await getToken();
      if (!token) {
        throw new Error("Clerk session token is unavailable.");
      }

      const [
        goalsResult,
        workoutResult,
        nutritionResult,
        todayDayResult,
        todayHistoryResult,
        habitAdherenceResult,
        nutritionAdherenceResult,
        progressResult,
        deviceConnectionsResult,
        metricAggregatesResult,
        metricSnapshotsResult,
        documentsResult,
        wellbeingAggregatesResult,
      ] = await Promise.all([
        listGoals(token),
        getActiveWorkoutPlan(token),
        getActiveNutritionPlan(token),
        getTodayDay(token, todayDate),
        getTodayHistory(token, 7),
        getHabitAdherence(token, 7),
        getTodayNutritionAdherence(token),
        loadOptionalWeeklyProgress(token),
        listDeviceConnections(token),
        listHealthMetricAggregates(token, { limit: 20 }),
        listHealthMetricSnapshots(token, { limit: 20 }),
        listDocuments(token),
        getWellbeingAggregates(token, 7),
      ]);

      const partialErrors = [
        goalsResult.error,
        workoutResult.error,
        nutritionResult.error,
        todayDayResult.error,
        todayHistoryResult.error,
        habitAdherenceResult.error,
        nutritionAdherenceResult.error,
        progressResult.error,
        deviceConnectionsResult.error,
        metricAggregatesResult.error,
        metricSnapshotsResult.error,
        documentsResult.error,
        wellbeingAggregatesResult.error,
      ].filter((error): error is string => Boolean(error));

      return {
        goals: goalsResult.data ?? [],
        workout: workoutResult.data ?? { plan: null, activeRevision: null, sessions: [] },
        nutrition: nutritionResult.data ?? { plan: null, activeRevision: null },
        todayDay: todayDayResult.data ?? null,
        todayHistory: todayHistoryResult.data?.entries ?? [],
        habitAdherence: habitAdherenceResult.data ?? null,
        nutritionAdherence: nutritionAdherenceResult.data?.adherence ?? null,
        progress: progressResult.data,
        deviceConnections: deviceConnectionsResult.data ?? [],
        metricAggregates: metricAggregatesResult.data ?? [],
        metricSnapshots: metricSnapshotsResult.data ?? [],
        documents: documentsResult.data ?? [],
        wellbeingAggregates: wellbeingAggregatesResult.data ?? null,
        wellbeingAggregatesError: wellbeingAggregatesResult.error,
        goalsFetchFailed: Boolean(goalsResult.error && !goalsResult.data),
        partialErrors,
      };
    },
  });

  if (longevityQuery.isLoading) {
    return <LoadingState title="Loading your weekly overview…" />;
  }

  if (longevityQuery.isError) {
    return (
      <ErrorState
        title="Longevity overview unavailable"
        description={
          longevityQuery.error instanceof Error
            ? longevityQuery.error.message
            : "Your weekly overview could not be loaded."
        }
      />
    );
  }

  const data = longevityQuery.data;
  if (!data) {
    return null;
  }

  const hero = buildLongevityWeeklyHero({
    sessions: data.workout.sessions,
    goals: data.goals,
    todayHistory: data.todayHistory,
    todayDay: data.todayDay,
  });
  const todayCard = buildTodayAdherenceCardView(data.todayDay);
  const workoutAdherence = summarizeWorkoutAdherence(data.workout.sessions);
  const nutritionRevision = data.nutrition.activeRevision;
  const nutritionCard = buildNutritionConsistencyCardView({
    planTitle: nutritionRevision?.payload.title ?? null,
    planSummary: nutritionRevision?.payload.summary ?? null,
    adherence: data.nutritionAdherence,
  });
  const goalsSection = buildGoalsSectionView({
    goals: data.goals,
    fetchFailed: data.goalsFetchFailed,
  });
  const wellnessPanel = buildWellnessSignalsPanelView({
    connections: data.deviceConnections,
    aggregates: data.metricAggregates,
    snapshots: data.metricSnapshots,
    todayDay: data.todayDay,
  });
  const documentsView = buildDocumentsContextView(data.documents);
  const trendsView = buildLongevityTrendsView(data.progress);
  const habitHint = summarizeHabitConsistencyHint(data.habitAdherence);
  const coachPrompts = buildLongevityCoachPrompts({
    sparseHero: hero.sparse,
    wellnessStatus: wellnessPanel.status,
    activeGoalCount: goalsSection.status === "ready" ? goalsSection.count : 0,
    goalsFetchFailed: goalsSection.status === "load_error",
  });

  const heroValue = hero.sparse ? hero.emptyMessage : `${hero.percent}%`;

  return (
    <div className="page-content longevity-dashboard">
      {data.partialErrors.length > 0 ? (
        <section className="notice notice-inline" role="status">
          <p>
            Some sections could not refresh just now. Available wellness data is shown below.
          </p>
        </section>
      ) : null}

      <DashboardGrid className="dashboard-grid--profile">
        <section className="dashboard-hero">
          <div>
            <p className="dashboard-hero__label">Weekly consistency</p>
            <p className="dashboard-hero__value">{heroValue}</p>
            <p className="dashboard-hero__subtitle">{hero.subtitle}</p>
            {!hero.sparse ? (
              <p className="dashboard-hero__subtitle">{hero.activeDaysLabel}</p>
            ) : null}
            {habitHint ? <p className="dashboard-hero__subtitle">{habitHint}</p> : null}
          </div>
          {!hero.sparse ? (
            <div
              className="metric-ring"
              style={{ ["--ring-progress" as string]: hero.percent }}
            >
              <span className="sr-only">{hero.percent}% weekly consistency</span>
            </div>
          ) : null}
          <div className="trend-strip" aria-label="Seven day activity trend">
            {hero.trend.map((value, index) => (
              <div key={index} className="trend-strip__bar">
                <span className="trend-strip__fill" style={{ width: `${value}%` }} />
              </div>
            ))}
          </div>
        </section>

        <DashboardCard
          className="dashboard-card--span-4"
          label="Today"
          title="Today adherence"
          value={todayCard.status === "ready" ? todayCard.scoreLabel : "Not enough data yet"}
          hint={
            todayCard.status === "ready"
              ? [todayCard.summary, todayCard.feedbackNote].filter(Boolean).join(" · ")
              : todayCard.message
          }
          footer={
            <Link href="/today" className="confirmation-card__link">
              Open Today →
            </Link>
          }
        />

        <DashboardCard
          className="dashboard-card--span-4"
          label="Workouts"
          title="Workout consistency"
          value={
            workoutAdherence.planned > 0
              ? workoutAdherence.label
              : "No sessions scheduled this week"
          }
          hint="Based on your logged workout sessions this week."
          footer={
            <Link href="/training" className="confirmation-card__link">
              View training plan →
            </Link>
          }
        />

        <DashboardCard
          className="dashboard-card--span-4"
          label="Nutrition"
          title="Nutrition consistency"
          value={
            nutritionCard.status === "empty"
              ? "Not enough data yet"
              : nutritionCard.status === "ready"
                ? nutritionCard.detail
                : nutritionCard.title
          }
          hint={
            nutritionCard.status === "empty"
              ? nutritionCard.message
              : nutritionCard.status === "ready"
                ? nutritionCard.summary
                : nutritionCard.summary
          }
          footer={
            <Link href="/nutrition" className="confirmation-card__link">
              View nutrition plan →
            </Link>
          }
        />

        <DashboardCard
          className="dashboard-card--span-5"
          label="Goals"
          title="Active goals"
          value={
            goalsSection.status === "ready"
              ? `${goalsSection.count} in progress`
              : goalsSection.status === "load_error"
                ? "Unavailable"
                : "None yet"
          }
          hint="Goals your coach helps you refine over time."
          footer={
            <Link href="/profile#goals" className="confirmation-card__link">
              Manage goals →
            </Link>
          }
        >
          {goalsSection.status === "ready" ? (
            <ul className="goals">
              {goalsSection.items.map((goal) => (
                <li key={goal.id}>
                  <strong>{goal.title}</strong>
                  <span>{goal.meta}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={goalsSection.title}
              description={goalsSection.description}
              action={
                goalsSection.status === "empty" ? (
                  <Link href="/chat" className="confirmation-card__link">
                    Open Chat →
                  </Link>
                ) : undefined
              }
            />
          )}
        </DashboardCard>

        <DashboardCard
          className="dashboard-card--span-5"
          label="Wellbeing"
          title="7-day mood & stress"
          hint="Daily check-ins from Today — wellness context only, not a clinical assessment."
          footer={
            <Link href="/today" className="confirmation-card__link">
              Log today&apos;s check-in →
            </Link>
          }
        >
          <WellbeingHistoryPanel
            aggregates={data.wellbeingAggregates}
            anchorDate={todayDate}
            errorMessage={data.wellbeingAggregatesError ?? null}
          />
        </DashboardCard>

        <DashboardCard
          className="dashboard-card--span-5"
          label="Wellness"
          title="Logged wellness signals"
          hint="Consent-gated trends from synced data and self-check-ins on Today."
        >
          {wellnessPanel.status === "ready" ? (
            <ul className="goals">
              {wellnessPanel.signals.map((signal) => (
                <li key={signal.id}>
                  <strong>{signal.label}</strong>
                  <span>{signal.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={
                wellnessPanel.status === "revoked"
                  ? "Sync consent revoked"
                  : wellnessPanel.status === "consent_required"
                    ? "Connect wellness data"
                    : "No wellness trends yet"
              }
              description={wellnessPanel.message}
              action={
                <Link href="/profile" className="confirmation-card__link">
                  Manage consent in Profile →
                </Link>
              }
            />
          )}
        </DashboardCard>

        <DashboardCard
          className="dashboard-card--span-5"
          label="Trends"
          title="Weekly progress"
          value={trendsView.status === "ready" ? trendsView.headline : "Not enough data yet"}
          hint={
            trendsView.status === "ready"
              ? trendsView.detail
              : trendsView.message
          }
        >
          {trendsView.status === "ready" ? (
            <>
              {trendsView.trends.length > 0 ? (
                <ul className="goals">
                  {trendsView.trends.map((trend) => (
                    <li key={trend.id}>
                      <strong>{trend.title}</strong>
                      <span>{trend.meta}</span>
                      <p className="dashboard-card__hint">{trend.message}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dashboard-card__hint">
                  Workout trends will appear after more sessions are logged.
                </p>
              )}
              {trendsView.deferredDomains.length > 0 ? (
                <ul className="goals">
                  {trendsView.deferredDomains.map((entry) => (
                    <li key={`${entry.domain}-${entry.detail}`}>
                      <strong>{entry.domain}</strong>
                      <span>{entry.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dashboard-card__hint">{trendsView.deferredSummary}</p>
              )}
            </>
          ) : null}
        </DashboardCard>

        <DashboardCard
          className="dashboard-card--span-4"
          label="Documents"
          title="Document context"
          hint="Metadata only — no clinical interpretation on this screen."
          footer={
            <Link href="/profile#documents" className="confirmation-card__link">
              Open documents →
            </Link>
          }
        >
          {documentsView.status === "ready" ? (
            <ul className="goals">
              {documentsView.items.map((document) => (
                <li key={document.id}>
                  <strong>{document.title}</strong>
                  <span>
                    {document.uploadedLabel} · {document.parseStatusLabel}
                  </span>
                  <Badge tone="neutral">{document.consentLabel}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No documents yet"
              description={documentsView.message}
              action={
                <Link href="/profile#documents" className="confirmation-card__link">
                  Upload from Profile →
                </Link>
              }
            />
          )}
        </DashboardCard>

        <DashboardCard
          className="dashboard-card--span-5 dashboard-card--coach"
          label="Coach"
          title="Discuss this week with your coach"
          hint="Static prompts based on what is visible here — open Chat to continue the conversation."
          footer={
            <Link href="/chat" className="button button-coach button-sm">
              Message your coach about this week
            </Link>
          }
        >
          <div className="chat-prompt-chips" role="list">
            {coachPrompts.map((prompt) => (
              <Link
                key={prompt}
                href="/chat"
                role="listitem"
                className="chat-prompt-chip"
              >
                {prompt}
              </Link>
            ))}
          </div>
        </DashboardCard>
      </DashboardGrid>
    </div>
  );
}
