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
  buildLongevityHeroSubtitles,
  buildLongevityTrendsView,
  buildLongevityHeroTrendStripView,
  buildLongevityWeeklyHero,
  buildNutritionConsistencyCardView,
  buildTodayAdherenceCardView,
  buildWellnessSignalsPanelView,
  buildWorkoutConsistencyCardView,
  formatDeferredDomainsCollapsibleSummary,
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
import { Badge, DashboardCard, DashboardGrid, ErrorState, LoadingState, OverviewCardLink, OverviewHeroCard, OverviewHeroContent, OverviewHeroSubtitle, OverviewInlineEmptyState, OverviewMetricRing, OverviewReadOnlyNotice, OverviewSignalItem, OverviewSignalList, OverviewSparseHint, OverviewTrendSection, PromptChipLink, PromptChipList, TrendStrip } from "../ui";
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
  const heroSubtitles = buildLongevityHeroSubtitles({
    sparse: hero.sparse,
    subtitle: hero.subtitle,
    activeDaysLabel: hero.activeDaysLabel,
    habitHint,
  });

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
        <OverviewHeroCard fullWidth>
          <OverviewHeroContent label="Weekly consistency" value={heroValue}>
            {heroSubtitles.map((line) => (
              <OverviewHeroSubtitle key={line}>{line}</OverviewHeroSubtitle>
            ))}
          </OverviewHeroContent>
          {!hero.sparse ? (
            <OverviewMetricRing progress={hero.percent} label={`${hero.percent}% weekly consistency`} />
          ) : null}
          <TrendStrip
            trend={heroTrend.trend}
            dayLabels={WEEKDAY_TREND_LABELS}
            sparse={heroTrend.sparse}
            ariaLabel={heroTrend.ariaLabel}
          />
        </OverviewHeroCard>

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
            <OverviewCardLink href={LONGEVITY_CTA_ROUTES.today}>
              Open Today →
            </OverviewCardLink>
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
            <OverviewCardLink href={LONGEVITY_CTA_ROUTES.training}>
              View training plan →
            </OverviewCardLink>
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
            <OverviewCardLink href={LONGEVITY_CTA_ROUTES.nutrition}>
              View nutrition plan →
            </OverviewCardLink>
          }
        />

        <DashboardCard
          className="dashboard-card--span-6"
          label="Goals"
          title="Active goals"
          value={goalsCardValue(goalsSection)}
          hint={goalsCardHint(goalsSection)}
          footer={
            <OverviewCardLink href={LONGEVITY_CTA_ROUTES.profileGoals}>
              Manage goals →
            </OverviewCardLink>
          }
        >
          {goalsSection.status === "ready" ? (
            <OverviewSignalList>
              {goalsSection.items.map((goal) => (
                <OverviewSignalItem key={goal.id} title={goal.title} meta={goal.meta} />
              ))}
            </OverviewSignalList>
          ) : (
            <OverviewInlineEmptyState
              title={goalsSection.title}
              description={goalsSection.description}
              action={
                goalsSection.status === "empty" ? (
                  <OverviewCardLink href={LONGEVITY_CTA_ROUTES.chat}>
                    Open Chat →
                  </OverviewCardLink>
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
            <OverviewCardLink href={LONGEVITY_CTA_ROUTES.today}>
              Log today&apos;s check-in →
            </OverviewCardLink>
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
            <OverviewSignalList>
              {wellnessPanel.signals.map((signal) => (
                <OverviewSignalItem
                  key={signal.id}
                  title={signal.label}
                  meta={signal.detail}
                />
              ))}
            </OverviewSignalList>
          ) : (
            <OverviewInlineEmptyState
              title={
                wellnessPanel.status === "revoked"
                  ? "Sync consent revoked"
                  : wellnessPanel.status === "consent_required"
                    ? "Connect wellness data"
                    : "No wellness trends yet"
              }
              description={wellnessPanel.message}
              action={
                <OverviewCardLink href={LONGEVITY_CTA_ROUTES.profileConsent}>
                  Manage consent in Profile →
                </OverviewCardLink>
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
              <OverviewCardLink href={LONGEVITY_CTA_ROUTES.chat}>
                Open Chat to review adaptation proposals →
              </OverviewCardLink>
            ) : undefined
          }
        >
          {trendsView.status === "ready" ? (
            <>
              {trendsView.aggregates.length > 0 ? (
                <OverviewTrendSection title="Included Domains">
                  <OverviewSignalList>
                    {trendsView.aggregates.map((aggregate) => (
                      <OverviewSignalItem
                        key={aggregate.id}
                        title={aggregate.domain}
                        meta={aggregate.sufficiency}
                        detail={`${aggregate.headline} · ${aggregate.detail}`}
                      />
                    ))}
                  </OverviewSignalList>
                </OverviewTrendSection>
              ) : null}
              {trendsView.trends.length > 0 ? (
                <OverviewTrendSection title="Detected Patterns">
                  <OverviewSignalList>
                    {trendsView.trends.map((trend) => (
                      <OverviewSignalItem
                        key={trend.id}
                        title={trend.title}
                        meta={trend.meta}
                        detail={trend.message}
                      />
                    ))}
                  </OverviewSignalList>
                </OverviewTrendSection>
              ) : (
                <OverviewSparseHint>
                  Cross-domain trends will appear after more structured entries are logged.
                </OverviewSparseHint>
              )}
              {trendsView.deferredDomains.length > 0 ? (
                <details className="overview-deferred-domains">
                  <summary>
                    {formatDeferredDomainsCollapsibleSummary(trendsView.deferredDomains)}
                  </summary>
                  <OverviewSignalList>
                    {trendsView.deferredDomains.map((entry) => (
                      <OverviewSignalItem
                        key={`${entry.domain}-${entry.detail}`}
                        title={entry.domain}
                        meta={entry.detail}
                        muted
                      />
                    ))}
                  </OverviewSignalList>
                </details>
              ) : (
                <OverviewSparseHint>{trendsView.deferredSummary}</OverviewSparseHint>
              )}
              <OverviewReadOnlyNotice>{WEEKLY_REVIEW_READ_ONLY_NOTICE}</OverviewReadOnlyNotice>
            </>
          ) : null}
        </DashboardCard>

        <DashboardCard
          className="dashboard-card--span-6"
          label="Documents"
          title="Document context"
          hint="Metadata only — no clinical interpretation on this screen."
          footer={
            <OverviewCardLink href={LONGEVITY_CTA_ROUTES.profileDocuments}>
              Open documents →
            </OverviewCardLink>
          }
        >
          {documentsView.status === "ready" ? (
            <OverviewSignalList>
              {documentsView.items.map((document) => (
                <OverviewSignalItem
                  key={document.id}
                  title={document.title}
                  meta={`${document.uploadedLabel} · ${document.parseStatusLabel}`}
                  badge={<Badge tone="neutral">{document.consentLabel}</Badge>}
                />
              ))}
            </OverviewSignalList>
          ) : (
            <OverviewInlineEmptyState
              title="No documents yet"
              description={documentsView.message}
              action={
                <OverviewCardLink href={LONGEVITY_CTA_ROUTES.profileDocuments}>
                  Upload from Profile →
                </OverviewCardLink>
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
          <PromptChipList label="Suggested prompts for chat">
            {coachPrompts.map((prompt) => (
              <PromptChipLink
                key={prompt.message}
                href={LONGEVITY_CTA_ROUTES.chat}
                promptLabel={prompt.message}
              >
                {prompt.displayLabel}
              </PromptChipLink>
            ))}
          </PromptChipList>
        </DashboardCard>
      </DashboardGrid>
    </div>
  );
}
