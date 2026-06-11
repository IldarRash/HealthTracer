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
import {
  Badge,
  DashboardCard,
  DashboardGrid,
  ErrorState,
  IconBadge,
  LoadingScreen,
  OverviewCardLink,
  OverviewHeroCard,
  OverviewInlineEmptyState,
  OverviewReadOnlyNotice,
  OverviewSignalItem,
  OverviewSignalList,
  OverviewSparseHint,
  OverviewTrendSection,
  PartialBanner,
  PromptChipLink,
  PromptChipList,
  MedicalNote,
  SectionError,
  CoachAvatar,
  DsRing,
  DsTrendStrip,
  ProgressBar,
  Icon,
  type IconName,
} from "../ui";
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

// ── DomainSummaryCard (Today/Workouts/Nutrition) ───────────────
function DomainSummaryCard({
  icon,
  color,
  label,
  value,
  sub,
  href,
  linkLabel,
  progress,
  sparse,
}: {
  icon: IconName;
  color: string;
  label: string;
  value?: string;
  sub?: string;
  href: string;
  linkLabel: string;
  progress?: number;
  sparse?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 16,
        padding: "18px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        transition: "border-color 150ms ease",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 14,
        }}
      >
        <IconBadge icon={icon} color={color} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--color-text-secondary)",
            flex: 1,
          }}
        >
          {label}
        </span>
        <Icon name="chevR" size={15} stroke="var(--color-text-muted)" />
      </div>

      {/* Body */}
      {sparse ? (
        <p
          style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.45 }}
        >
          Not enough data yet
        </p>
      ) : (
        <>
          <div
            style={{
              fontSize: 27,
              fontWeight: 700,
              color,
              letterSpacing: -0.6,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.1,
            }}
          >
            {value}
          </div>
          {progress != null ? (
            <div style={{ marginTop: 11 }}>
              <ProgressBar value={progress} color={color} />
            </div>
          ) : null}
          {sub ? (
            <p
              style={{
                fontSize: 12.5,
                color: "var(--color-text-muted)",
                marginTop: progress != null ? 9 : 7,
                lineHeight: 1.4,
              }}
            >
              {sub}
            </p>
          ) : null}
        </>
      )}

      {/* Footer link */}
      <Link
        href={href}
        style={{
          fontSize: 12,
          fontWeight: 600,
          color,
          marginTop: 12,
          textDecoration: "none",
          display: "block",
        }}
      >
        {linkLabel} →
      </Link>
    </div>
  );
}

// ── Inline pattern card (CrossDomainTrends) ────────────────────
function PatternCard({
  icon,
  color,
  text,
  tag,
}: {
  icon: IconName;
  color: string;
  text: string;
  tag: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: "14px 15px",
        borderRadius: 13,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          marginBottom: 11,
        }}
      >
        <Icon name={icon} size={16} stroke={color} />
      </div>
      <p
        style={{ fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.45, margin: 0 }}
      >
        {text}
      </p>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-muted)",
          marginTop: 9,
          letterSpacing: 0.2,
        }}
      >
        {tag}
      </p>
    </div>
  );
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
    return <LoadingScreen label="Loading your weekly overview" layout="longevity" />;
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

  const heroTrend = buildLongevityHeroTrendStripView(hero.trend, hero.sparse);

  // Determine partial failure scopes
  const isPartial = data.partialErrors.length > 0;
  // Signals section is considered "failed" in partial mode when wellness data is absent
  const signalsFailed = isPartial && wellnessPanel.status !== "ready";
  const crossDomainFailed = isPartial && trendsView.status !== "ready";

  // ── Trend strip data for DsTrendStrip ─────────────────────────
  // Derive today's Monday-based day index (0=Mon…6=Sun) for future/today states.
  const _todayJsDay = new Date().getDay(); // 0=Sun…6=Sat
  const todayWeekIndex = _todayJsDay === 0 ? 6 : _todayJsDay - 1; // convert to Mon=0 base

  const trendStripDays = heroTrend.trend.map((value, i) => ({
    value: Math.round(value),
    label: WEEKDAY_TREND_LABELS[i] ?? "",
    state: i > todayWeekIndex
      ? ("future" as const)
      : i === todayWeekIndex
        ? ("today" as const)
        : ("past" as const),
  }));

  return (
    <div className="page-content longevity-dashboard">
      {/* Partial failure banner */}
      {isPartial ? (
        <div role="status">
          <PartialBanner onRetry={() => longevityQuery.refetch()}>
            Some sections could not refresh just now. Available wellness data is shown below.
          </PartialBanner>
        </div>
      ) : null}

      <DashboardGrid className="dashboard-grid--profile">
        {/* ── Hero: Consistency ring + 7-day plan-by-day bars ── */}
        <OverviewHeroCard fullWidth>
          {/* Visual dark hero layout */}
          {hero.sparse ? (
            /* Sparse invite */
            <div
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 24,
                padding: "24px",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "50%",
                  flexShrink: 0,
                  border: "3px dashed var(--color-border-strong)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="spark" size={30} stroke="var(--color-metric-green)" sw={1.6} />
              </div>
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    fontSize: 19,
                    fontWeight: 700,
                    color: "var(--color-text-primary)",
                    letterSpacing: -0.3,
                    margin: 0,
                  }}
                >
                  Let&apos;s build your week
                </p>
                <p
                  style={{
                    fontSize: 13.5,
                    color: "var(--color-text-muted)",
                    marginTop: 7,
                    lineHeight: 1.5,
                    maxWidth: 440,
                  }}
                >
                  {hero.subtitle}
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                  <Link
                    href={LONGEVITY_CTA_ROUTES.today}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      background: "var(--color-metric-green)",
                      color: "#04130c",
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    Open Today
                  </Link>
                  <Link
                    href={LONGEVITY_CTA_ROUTES.chat}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid var(--color-border-default)",
                      color: "var(--color-text-secondary)",
                      fontSize: 13,
                      fontWeight: 600,
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    Discuss goals
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            /* Done: ring left + trend bars right */
            <div
              style={{
                width: "100%",
                display: "flex",
                gap: 30,
                alignItems: "center",
                padding: "24px",
              }}
            >
              {/* Left: ring + trend + streak */}
              <div
                style={{ flexShrink: 0, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center" }}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    marginBottom: 16,
                  }}
                >
                  Consistency
                </p>
                <DsRing
                  value={hero.percent}
                  size={138}
                  sw={12}
                  color="var(--color-metric-green)"
                  label={`${hero.percent}%`}
                  sub="this week"
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    marginTop: 14,
                  }}
                >
                  <Icon name="bolt" size={13} stroke="var(--color-metric-amber)" fill="var(--color-metric-amber)" />
                  <span style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>
                    {hero.activeDaysLabel}
                  </span>
                </div>
                {habitHint ? (
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6, maxWidth: 160 }}>
                    {habitHint}
                  </p>
                ) : null}
              </div>

              {/* Vertical divider */}
              <div
                aria-hidden="true"
                style={{
                  width: 1,
                  alignSelf: "stretch",
                  background: "var(--color-border-default)",
                  flexShrink: 0,
                }}
              />

              {/* Right: 7-day plan bars */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 18,
                  }}
                >
                  <span
                    style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-text-secondary)" }}
                  >
                    Plan completion by day
                  </span>
                </div>
                <DsTrendStrip
                  days={trendStripDays}
                  maxH={96}
                  ariaLabel={heroTrend.ariaLabel}
                />
              </div>
            </div>
          )}
        </OverviewHeroCard>

        {/* ── Domain row: Today / Workouts / Nutrition ── */}
        <div className="dashboard-card--span-4">
          <DomainSummaryCard
            icon="today"
            color="var(--color-metric-green)"
            label="Today"
            value={todayCard.status === "ready" ? todayCard.scoreLabel : undefined}
            sub={
              todayCard.status === "ready"
                ? [todayCard.summary, todayCard.feedbackNote].filter(Boolean).join(" · ")
                : todayCard.message
            }
            href={LONGEVITY_CTA_ROUTES.today}
            linkLabel="Open Today"
            sparse={todayCard.status === "empty"}
          />
        </div>

        <div className="dashboard-card--span-4">
          <DomainSummaryCard
            icon="dumbbell"
            color="var(--color-metric-blue)"
            label="Workouts"
            value={workoutCard.status === "ready" ? workoutCard.value : undefined}
            sub={workoutCard.status === "ready" ? workoutCard.hint : workoutCard.message}
            href={LONGEVITY_CTA_ROUTES.training}
            linkLabel="View training plan"
            sparse={workoutCard.status !== "ready"}
          />
        </div>

        <div className="dashboard-card--span-4">
          <DomainSummaryCard
            icon="fork"
            color="var(--color-metric-amber)"
            label="Nutrition"
            value={
              nutritionCard.status === "ready"
                ? nutritionCard.detail
                : nutritionCard.status === "plan_only"
                  ? nutritionCard.title
                  : undefined
            }
            sub={
              nutritionCard.status === "ready" || nutritionCard.status === "plan_only"
                ? nutritionCard.summary
                : nutritionCard.message
            }
            href={LONGEVITY_CTA_ROUTES.nutrition}
            linkLabel="View nutrition plan"
            sparse={nutritionCard.status === "empty" || nutritionCard.status === "load_error"}
          />
        </div>

        {/* ── Goals card ── */}
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

        {/* ── Wellbeing card ── */}
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
          <MedicalNote>
            Your check-in history · not a clinical assessment.
          </MedicalNote>
        </DashboardCard>

        {/* ── Wellness signals (consent-gated) ── */}
        <DashboardCard
          className="dashboard-card--span-6"
          label="Wellness"
          title="Logged wellness signals"
          hint="Consent-gated trends from synced data and self-check-ins on Today."
        >
          {signalsFailed ? (
            <SectionError
              label="Wellness signals could not refresh"
              height={96}
              onRetry={() => longevityQuery.refetch()}
            />
          ) : wellnessPanel.status === "ready" ? (
            <>
              <OverviewSignalList>
                {wellnessPanel.signals.map((signal) => (
                  <OverviewSignalItem
                    key={signal.id}
                    title={signal.label}
                    meta={signal.detail}
                  />
                ))}
              </OverviewSignalList>
              <Link
                href={LONGEVITY_CTA_ROUTES.profileConsent}
                style={{ fontSize: 12, fontWeight: 600, color: "var(--color-metric-blue)", marginTop: 8, display: "block", textDecoration: "none" }}
              >
                To Profile →
              </Link>
              <MedicalNote>
                Wellness signals · not a clinical measurement.
              </MedicalNote>
            </>
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

        {/* ── Documents card ── */}
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
            <>
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
              <MedicalNote>
                Metadata only — contents are not analyzed on this screen.
              </MedicalNote>
            </>
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

        {/* ── Cross-domain trends ── */}
        {!hero.sparse ? (
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
            {crossDomainFailed ? (
              <SectionError
                label="Cross-domain review could not refresh"
                height={96}
                onRetry={() => longevityQuery.refetch()}
              />
            ) : trendsView.status === "ready" ? (
              <>
                {/* Pattern cards */}
                {trendsView.trends.length > 0 ? (
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {trendsView.trends.slice(0, 3).map((trend) => (
                      <PatternCard
                        key={trend.id}
                        icon="longevity"
                        color="var(--color-metric-green)"
                        text={trend.message}
                        tag={trend.title}
                      />
                    ))}
                  </div>
                ) : null}

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
        ) : null}

        {/* ── Coach chips ── */}
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
          {/* Coach avatar header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <CoachAvatar size={34} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: 0 }}>
                Talk to your coach
              </p>
              <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: 0 }}>
                Plan changes always go through Chat
              </p>
            </div>
          </div>
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
