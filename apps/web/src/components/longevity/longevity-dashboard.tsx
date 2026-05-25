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
  buildLongevityHeroTrendStripView,
  buildLongevityWeeklyHero,
  buildNutritionConsistencyCardView,
  buildTodayAdherenceCardView,
  buildWellnessSignalsPanelView,
  buildWorkoutConsistencyCardView,
  goalsCardHint,
  goalsCardValue,
  isOptionalProgressNotFound,
  LONGEVITY_CTA_ROUTES,
  summarizeHabitConsistencyHint,
  todayIsoDate,
  WEEKDAY_TREND_LABELS,
} from "../../lib/longevity-ui-state";
import { WEEKLY_REVIEW_READ_ONLY_NOTICE } from "../../lib/weekly-review-ui-state";
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
        workoutFetchFailed: Boolean(workoutResult.error && !workoutResult.data),
        nutritionFetchFailed: Boolean(nutritionResult.error && !nutritionResult.data),
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
    habitAdherence: data.habitAdherence,
  });
  const todayCard = buildTodayAdherenceCardView(data.todayDay);
  const workoutCard = buildWorkoutConsistencyCardView({
    sessions: data.workout.sessions,
    fetchFailed: data.workoutFetchFailed,
  });
  const nutritionRevision = data.nutrition.activeRevision;
  const nutritionCard = buildNutritionConsistencyCardView({
    planTitle: nutritionRevision?.payload.title ?? null,
    planSummary: nutritionRevision?.payload.summary ?? null,
    adherence: data.nutritionAdherence,
    fetchFailed: data.nutritionFetchFailed,
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
    hasWeeklyProgress: trendsView.status === "ready",
  });

  const heroValue = hero.sparse ? hero.emptyMessage : `${hero.percent}%`;
  const heroTrend = buildLongevityHeroTrendStripView(hero.trend, hero.sparse);

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
        <section className="dashboard-hero dashboard-hero--full">
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
          <div className={heroTrend.className} role="img" aria-label={heroTrend.ariaLabel}>
            {heroTrend.trend.map((value, index) => (
              <div key={WEEKDAY_TREND_LABELS[index]} className="trend-strip__day">
                <p className="trend-strip__label" aria-hidden="true">
                  {WEEKDAY_TREND_LABELS[index]}
                </p>
                <div className="trend-strip__bar">
                  {!heroTrend.sparse ? (
                    <span className="trend-strip__fill" style={{ width: `${value}%` }} />
                  ) : null}
                </div>
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
            <Link href={LONGEVITY_CTA_ROUTES.today} className="confirmation-card__link">
              Open Today →
            </Link>
          }
        />

        <DashboardCard
          className="dashboard-card--span-4"
          label="Workouts"
          title="Workout consistency"
          value={
            workoutCard.status === "ready"
              ? workoutCard.value
              : workoutCard.status === "load_error"
                ? "Unavailable"
                : "Not enough data yet"
          }
          hint={
            workoutCard.status === "ready" ? workoutCard.hint : workoutCard.message
          }
          footer={
            <Link href={LONGEVITY_CTA_ROUTES.training} className="confirmation-card__link">
              View training plan →
            </Link>
          }
        />

        <DashboardCard
          className="dashboard-card--span-4"
          label="Nutrition"
          title="Nutrition consistency"
          value={
            nutritionCard.status === "empty" || nutritionCard.status === "load_error"
              ? nutritionCard.status === "load_error"
                ? "Unavailable"
                : "Not enough data yet"
              : nutritionCard.status === "ready"
                ? nutritionCard.detail
                : nutritionCard.title
          }
          hint={
            nutritionCard.status === "ready" || nutritionCard.status === "plan_only"
              ? nutritionCard.summary
              : nutritionCard.message
          }
          footer={
            <Link href={LONGEVITY_CTA_ROUTES.nutrition} className="confirmation-card__link">
              View nutrition plan →
            </Link>
          }
        />

        <DashboardCard
          className="dashboard-card--span-6"
          label="Goals"
          title="Active goals"
          value={goalsCardValue(goalsSection)}
          hint={goalsCardHint(goalsSection)}
          footer={
            <Link href={LONGEVITY_CTA_ROUTES.profileGoals} className="confirmation-card__link">
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
                  <Link href={LONGEVITY_CTA_ROUTES.chat} className="confirmation-card__link">
                    Open Chat →
                  </Link>
                ) : undefined
              }
            />
          )}
        </DashboardCard>

        <DashboardCard
          className="dashboard-card--span-6"
          label="Wellbeing"
          title="7-day mood & stress"
          hint="Daily check-ins from Today — wellness context only, not a clinical assessment."
          footer={
            <Link href={LONGEVITY_CTA_ROUTES.today} className="confirmation-card__link">
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
          className="dashboard-card--span-6"
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
                <Link href={LONGEVITY_CTA_ROUTES.profileConsent} className="confirmation-card__link">
                  Manage consent in Profile →
                </Link>
              }
            />
          )}
        </DashboardCard>

        <DashboardCard
          className="dashboard-card--span-6"
          label="Trends"
          title="Cross-domain weekly review"
          value={trendsView.status === "ready" ? trendsView.headline : "Not enough data yet"}
          hint={
            trendsView.status === "ready"
              ? trendsView.detail
              : trendsView.message
          }
          footer={
            trendsView.status === "ready" ? (
              <Link href={LONGEVITY_CTA_ROUTES.chat} className="confirmation-card__link">
                Open Chat to review adaptation proposals →
              </Link>
            ) : undefined
          }
        >
          {trendsView.status === "ready" ? (
            <>
              {trendsView.aggregates.length > 0 ? (
                <>
                  <h4 className="section-label" style={{ marginTop: "var(--space-2)", marginBottom: "var(--space-2)", display: "block" }}>
                    Included Domains
                  </h4>
                  <ul className="goals">
                    {trendsView.aggregates.map((aggregate) => (
                      <li key={aggregate.id}>
                        <strong>{aggregate.domain}</strong>
                        <span>{aggregate.sufficiency}</span>
                        <p className="dashboard-card__hint">
                          {aggregate.headline} · {aggregate.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {trendsView.trends.length > 0 ? (
                <>
                  <h4 className="section-label" style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)", display: "block" }}>
                    Detected Patterns
                  </h4>
                  <ul className="goals">
                    {trendsView.trends.map((trend) => (
                      <li key={trend.id}>
                        <strong>{trend.title}</strong>
                        <span>{trend.meta}</span>
                        <p className="dashboard-card__hint">{trend.message}</p>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="dashboard-card__hint" style={{ marginTop: "var(--space-4)" }}>
                  Cross-domain trends will appear after more structured entries are logged.
                </p>
              )}
              {trendsView.deferredDomains.length > 0 ? (
                <>
                  <h4 className="section-label" style={{ marginTop: "var(--space-4)", marginBottom: "var(--space-2)", display: "block" }}>
                    Deferred Domains
                  </h4>
                  <ul className="goals" style={{ opacity: 0.75 }}>
                    {trendsView.deferredDomains.map((entry) => (
                      <li key={`${entry.domain}-${entry.detail}`}>
                        <strong>{entry.domain}</strong>
                        <span>{entry.detail}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="dashboard-card__hint" style={{ marginTop: "var(--space-4)" }}>{trendsView.deferredSummary}</p>
              )}
              <p className="dashboard-card__hint" style={{ marginTop: "var(--space-4)" }}>{WEEKLY_REVIEW_READ_ONLY_NOTICE}</p>
            </>
          ) : null}
        </DashboardCard>

        <DashboardCard
          className="dashboard-card--span-6"
          label="Documents"
          title="Document context"
          hint="Metadata only — no clinical interpretation on this screen."
          footer={
            <Link href={LONGEVITY_CTA_ROUTES.profileDocuments} className="confirmation-card__link">
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
                <Link href={LONGEVITY_CTA_ROUTES.profileDocuments} className="confirmation-card__link">
                  Upload from Profile →
                </Link>
              }
            />
          )}
        </DashboardCard>

        <DashboardCard
          className="dashboard-card--span-6 dashboard-card--coach"
          label="Coach"
          title="Discuss this week with your coach"
          hint="Static prompts based on what is visible here — open Chat to continue the conversation."
          footer={
            <Link href={LONGEVITY_CTA_ROUTES.chat} className="button button-coach button-sm">
              Message your coach about this week
            </Link>
          }
        >
          <div className="chat-prompt-chips" role="list" aria-label="Suggested prompts for chat">
            {coachPrompts.map((prompt) => (
              <Link
                key={prompt}
                href={LONGEVITY_CTA_ROUTES.chat}
                role="listitem"
                className="chat-prompt-chip"
                aria-label={`Open Chat and discuss: ${prompt}`}
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
