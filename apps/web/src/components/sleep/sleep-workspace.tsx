"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiQueryKeys, getSleepOverview } from "../../lib/api";
import {
  buildSleepBarPoints,
  buildSleepHeroView,
  buildSleepNightRows,
  buildSleepStageSegments,
  formatSevenDayAverage,
  SLEEP_TARGET_HIGH_MINUTES,
  SLEEP_TARGET_LOW_MINUTES,
  sleepHasData,
} from "../../lib/sleep-ui-state";
import {
  Button,
  ChartTooltipCard,
  DonutWithLegend,
  EmptyState,
  ErrorState,
  LoadingScreen,
  MedicalNote,
  SectionCard,
  Stat,
} from "../ui";

// ---------------------------------------------------------------------------
// Main workspace
// ---------------------------------------------------------------------------

export function SleepWorkspace() {
  const t = useTranslations("Sleep");
  const tCommon = useTranslations("Common");
  const { getToken } = useAuth();

  const sleepQuery = useQuery({
    queryKey: apiQueryKeys.sleepOverview,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await getSleepOverview(token);
      if (result.error || !result.data) {
        throw new Error(result.error ?? t("errorTitle"));
      }
      return result.data;
    },
  });

  // ── Loading ──────────────────────────────────────────────────────────────
  if (sleepQuery.isLoading) {
    return <LoadingScreen label={t("loading")} layout="longevity" />;
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (sleepQuery.isError || !sleepQuery.data) {
    return (
      <ErrorState
        title={t("errorTitle")}
        description={
          sleepQuery.error instanceof Error ? sleepQuery.error.message : undefined
        }
        action={
          <Button type="button" variant="secondary" onClick={() => void sleepQuery.refetch()}>
            {tCommon("retry")}
          </Button>
        }
      />
    );
  }

  const overview = sleepQuery.data;

  // ── Empty ────────────────────────────────────────────────────────────────
  if (!sleepHasData(overview)) {
    return (
      <>
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
        <MedicalNote style={{ marginTop: 16 }}>{t("wellnessNote")}</MedicalNote>
      </>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────

  const heroView = overview.lastNight ? buildSleepHeroView(overview.lastNight) : null;
  const stageSegments = overview.lastNight?.stageSummary
    ? buildSleepStageSegments(overview.lastNight.stageSummary)
    : null;
  const barPoints = buildSleepBarPoints(overview.trend);
  const nightRows = buildSleepNightRows(overview.recentNights);

  // Map stage segments to DonutWithLegend format with translated labels.
  const donutSegments = stageSegments
    ? stageSegments.map((seg) => ({
        ...seg,
        label: t(`stages.${seg.key}` as Parameters<typeof t>[0]),
      }))
    : null;

  const AXIS_COLOR = "var(--color-text-muted)";
  const BAR_COLOR_MEETS = "var(--color-metric-green)";
  const BAR_COLOR_MISS = "var(--color-metric-amber)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Last-night hero */}
      {heroView ? (
        <SectionCard title={t("hero.sectionTitle")}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Stat
              value={heroView.durationLabel}
              label={t("hero.duration")}
            />
            <Stat
              value={heroView.bedLabel}
              label={t("hero.bedTime")}
            />
            <Stat
              value={heroView.wakeLabel}
              label={t("hero.wakeTime")}
            />
          </div>
        </SectionCard>
      ) : (
        <SectionCard title={t("hero.sectionTitle")}>
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
            {t("hero.noData")}
          </p>
        </SectionCard>
      )}

      {/* Stage breakdown */}
      <SectionCard title={t("stages.sectionTitle")}>
        {donutSegments ? (
          <DonutWithLegend segments={donutSegments} size={120} strokeWidth={16} />
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
            {t("stages.noData")}
          </p>
        )}
      </SectionCard>

      {/* 30-day trend bars */}
      <SectionCard title={t("trend.sectionTitle")}>
        {barPoints.length > 0 ? (
          <>
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
              {t("trend.targetBand")}
            </p>
            <div
              role="img"
              aria-label={t("trend.aria")}
              style={{ width: "100%", height: 200 }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barPoints}
                  margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
                  accessibilityLayer
                >
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: AXIS_COLOR }}
                    stroke={AXIS_COLOR}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: AXIS_COLOR }}
                    stroke={AXIS_COLOR}
                    tickLine={false}
                    tickFormatter={(v: number) => {
                      const h = Math.floor(v / 60);
                      return `${h}h`;
                    }}
                    width={34}
                    domain={[0, "dataMax + 60"]}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    content={({ active, payload }) => {
                      const entry = active ? payload?.[0]?.payload : undefined;
                      if (!(entry as { durationLabel?: string } | undefined)?.durationLabel) return null;
                      return (
                        <ChartTooltipCard
                          label={(entry as { label?: string }).label}
                          value={(entry as { durationLabel?: string }).durationLabel}
                        />
                      );
                    }}
                  />
                  <ReferenceLine
                    y={SLEEP_TARGET_LOW_MINUTES}
                    stroke={BAR_COLOR_MEETS}
                    strokeOpacity={0.35}
                    strokeDasharray="4 3"
                  />
                  <ReferenceLine
                    y={SLEEP_TARGET_HIGH_MINUTES}
                    stroke={BAR_COLOR_MEETS}
                    strokeOpacity={0.35}
                    strokeDasharray="4 3"
                  />
                  <Bar
                    dataKey="minutes"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={16}
                  >
                    {barPoints.map((point) => (
                      <Cell
                        key={point.date}
                        fill={point.meetsTarget ? BAR_COLOR_MEETS : BAR_COLOR_MISS}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
            {t("trend.noData")}
          </p>
        )}
      </SectionCard>

      {/* 7-day average */}
      <SectionCard title={t("average.sectionTitle")}>
        <Stat
          value={formatSevenDayAverage(overview.sevenDayAverageMinutes)}
          label={t("average.sectionTitle")}
        />
      </SectionCard>

      {/* Recent nights table */}
      {nightRows.length > 0 && (
        <SectionCard title={t("recentNights.sectionTitle")}>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                color: "var(--color-text-primary)",
              }}
            >
              <thead>
                <tr style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
                  <th style={{ textAlign: "left", padding: "4px 8px 8px 0", fontWeight: 600 }}>
                    {t("recentNights.date")}
                  </th>
                  <th style={{ textAlign: "right", padding: "4px 8px 8px 0", fontWeight: 600 }}>
                    {t("recentNights.duration")}
                  </th>
                  <th style={{ textAlign: "right", padding: "4px 8px 8px 0", fontWeight: 600 }}>
                    {t("recentNights.bedTime")}
                  </th>
                  <th style={{ textAlign: "right", padding: "4px 0 8px 0", fontWeight: 600 }}>
                    {t("recentNights.wakeTime")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {nightRows.map((row) => (
                  <tr
                    key={row.date}
                    style={{ borderTop: "1px solid var(--color-border-default)" }}
                  >
                    <td style={{ padding: "8px 8px 8px 0" }}>{row.dateLabel}</td>
                    <td
                      style={{
                        padding: "8px 8px 8px 0",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        color: row.meetsTarget
                          ? "var(--color-metric-green)"
                          : "var(--color-text-primary)",
                      }}
                    >
                      {row.durationLabel}
                    </td>
                    <td
                      style={{
                        padding: "8px 8px 8px 0",
                        textAlign: "right",
                        color: "var(--color-text-muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {row.bedLabel}
                    </td>
                    <td
                      style={{
                        padding: "8px 0",
                        textAlign: "right",
                        color: "var(--color-text-muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {row.wakeLabel}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <MedicalNote>{t("wellnessNote")}</MedicalNote>
    </div>
  );
}
