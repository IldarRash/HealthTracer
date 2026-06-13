"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  apiQueryKeys,
  getPulseOverview,
  getWorkoutHeartRate,
} from "../../lib/api";
import {
  buildAggregateZoneSegments,
  buildHrTrendChartModel,
  buildReadinessRingValue,
  buildWorkoutHrLinePoints,
  buildWorkoutRows,
  formatBpmValue,
  pulseHasData,
  readinessRingColor,
  ZONE_KEYS,
  ZONE_COLORS,
} from "../../lib/pulse-ui-state";
import {
  Button,
  ChartTooltipCard,
  DonutWithLegend,
  EmptyState,
  ErrorState,
  LoadingScreen,
  LoadingState,
  MedicalNote,
  SectionCard,
  Stat,
} from "../ui";
import { DsRing } from "../ui/dark-charts";

const AXIS_COLOR = "var(--color-text-muted)";

// ---------------------------------------------------------------------------
// HR trend chart (mirrors biomarker-history-chart)
// ---------------------------------------------------------------------------

type HrTrendChartProps = {
  points: Array<{ ts: number; value: number; label: string }>;
  unit: string;
  yDomain: [number, number];
  color: string;
  ariaLabel: string;
};

function HrTrendChart({ points, unit, yDomain, color, ariaLabel }: HrTrendChartProps) {
  const xTicks = points.map((p) => p.ts);
  const labelByTs = new Map(points.map((p) => [p.ts, p.label]));
  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          accessibilityLayer
        >
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={xTicks}
            tickFormatter={(ts: number) => labelByTs.get(ts) ?? ""}
            tick={{ fontSize: 10, fill: AXIS_COLOR }}
            stroke={AXIS_COLOR}
            tickLine={false}
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 10, fill: AXIS_COLOR }}
            stroke={AXIS_COLOR}
            tickLine={false}
            width={38}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-border-default)" }}
            content={({ active, payload }) => {
              const point = active ? payload?.[0]?.payload : undefined;
              if (!point || (point as { value?: number }).value == null) return null;
              return (
                <ChartTooltipCard
                  label={(point as { label?: string }).label}
                  value={(point as { value?: number }).value}
                  unit={unit}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-workout HR line (loaded on selection)
// ---------------------------------------------------------------------------

function WorkoutHrLine({
  snapshotId,
}: {
  snapshotId: string;
}) {
  const t = useTranslations("Pulse");
  const tCommon = useTranslations("Common");
  const { getToken } = useAuth();

  const query = useQuery({
    queryKey: apiQueryKeys.workoutHeartRate(snapshotId),
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await getWorkoutHeartRate(token, snapshotId);
      if (result.error || !result.data) {
        throw new Error(result.error ?? t("workouts.hrLine.error"));
      }
      return result.data;
    },
  });

  if (query.isLoading) {
    return <LoadingState title={t("workouts.hrLine.loading")} />;
  }

  if (query.isError || !query.data) {
    return (
      <p role="alert" style={{ fontSize: 12, color: "var(--color-metric-red)", margin: "8px 0 0" }}>
        {t("workouts.hrLine.error")}
        <Button
          type="button"
          variant="secondary"
          style={{ marginLeft: 10 }}
          onClick={() => void query.refetch()}
        >
          {tCommon("retry")}
        </Button>
      </p>
    );
  }

  const points = buildWorkoutHrLinePoints(query.data);

  if (points.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "8px 0 0" }}>
        {t("workouts.hrLine.noData")}
      </p>
    );
  }

  const bpms = points.map((p) => p.bpm);
  const minBpm = Math.min(...bpms);
  const maxBpm = Math.max(...bpms);
  const pad = Math.max((maxBpm - minBpm) * 0.08, 2);
  const yDomain: [number, number] = [Math.floor(minBpm - pad), Math.ceil(maxBpm + pad)];
  const bpmUnit = t("workouts.unitBpm");

  return (
    <div
      role="img"
      aria-label={t("workouts.hrLine.aria")}
      style={{ width: "100%", height: 160, marginTop: 8 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          accessibilityLayer
        >
          <XAxis
            dataKey="offsetLabel"
            tick={{ fontSize: 10, fill: AXIS_COLOR }}
            stroke={AXIS_COLOR}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 10, fill: AXIS_COLOR }}
            stroke={AXIS_COLOR}
            tickLine={false}
            width={38}
          />
          <Tooltip
            cursor={{ stroke: "var(--color-border-default)" }}
            content={({ active, payload }) => {
              const point = active ? payload?.[0]?.payload : undefined;
              if (!(point as { bpm?: number } | undefined)?.bpm) return null;
              return (
                <ChartTooltipCard
                  label={(point as { offsetLabel?: string }).offsetLabel}
                  value={(point as { bpm?: number }).bpm}
                  unit={bpmUnit}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="bpm"
            stroke="var(--color-metric-red)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workout row
// ---------------------------------------------------------------------------

type WorkoutRowDisplayProps = {
  dateLabel: string;
  activityLabel: string;
  durationLabel: string;
  avgBpmLabel: string;
  maxBpmLabel: string;
  selected: boolean;
  onSelect: () => void;
  t: ReturnType<typeof useTranslations<"Pulse">>;
};

function WorkoutRowItem({
  dateLabel,
  activityLabel,
  durationLabel,
  avgBpmLabel,
  maxBpmLabel,
  selected,
  onSelect,
  t,
}: WorkoutRowDisplayProps) {
  return (
    <li
      style={{
        borderTop: "1px solid var(--color-border-default)",
        padding: "10px 0",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
          {activityLabel}
        </div>
        <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
          {dateLabel}
          {" · "}{durationLabel}
          {" · "}{t("workouts.avg")} {avgBpmLabel}
          {" · "}{t("workouts.max")} {maxBpmLabel}
        </div>
      </div>
      <Button
        type="button"
        variant={selected ? "primary" : "secondary"}
        onClick={onSelect}
        aria-pressed={selected}
      >
        {t("workouts.hrButton")}
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main workspace
// ---------------------------------------------------------------------------

export function PulseWorkspace() {
  const t = useTranslations("Pulse");
  const tCommon = useTranslations("Common");
  const { getToken } = useAuth();
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);

  const pulseQuery = useQuery({
    queryKey: apiQueryKeys.pulseOverview,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Clerk session token is unavailable.");
      const result = await getPulseOverview(token);
      if (result.error || !result.data) {
        throw new Error(result.error ?? t("errorTitle"));
      }
      return result.data;
    },
  });

  // ── Loading ──────────────────────────────────────────────────────────────
  if (pulseQuery.isLoading) {
    return <LoadingScreen label={t("loading")} layout="longevity" />;
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (pulseQuery.isError || !pulseQuery.data) {
    return (
      <ErrorState
        title={t("errorTitle")}
        description={
          pulseQuery.error instanceof Error ? pulseQuery.error.message : undefined
        }
        action={
          <Button type="button" variant="secondary" onClick={() => void pulseQuery.refetch()}>
            {tCommon("retry")}
          </Button>
        }
      />
    );
  }

  const overview = pulseQuery.data;

  // ── Empty ────────────────────────────────────────────────────────────────
  if (!pulseHasData(overview)) {
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

  const rhrModel = buildHrTrendChartModel(
    overview.restingHeartRate.trend,
    overview.restingHeartRate.unit,
  );
  const hrvModel = buildHrTrendChartModel(overview.hrv.trend, overview.hrv.unit);
  const readinessValue = buildReadinessRingValue(overview.readiness);

  // Build zone segments with translated labels.
  const rawZoneSegments = buildAggregateZoneSegments(overview.recentWorkouts);
  const zoneSegments = rawZoneSegments
    ? rawZoneSegments.map((seg) => ({
        ...seg,
        label: t(`zones.${seg.key}` as Parameters<typeof t>[0]),
      }))
    : null;

  // Build workout rows with translated strings.
  const workoutRows = buildWorkoutRows(
    overview.recentWorkouts,
    t("workouts.activityFallback"),
    t("workouts.unitBpm"),
  );

  // Build a zone dot map from raw workout data for the row zone indicators.
  const workoutZonesById = new Map(
    overview.recentWorkouts.map((w) => [w.snapshotId, w.zoneSummary]),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* Resting heart rate */}
      <SectionCard title={t("rhr.sectionTitle")}>
        {overview.restingHeartRate.latest ? (
          <Stat
            value={formatBpmValue(overview.restingHeartRate.latest.value)}
            unit={overview.restingHeartRate.latest.unit}
            label={t("rhr.latest")}
          />
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
            {t("rhr.noData")}
          </p>
        )}
        {rhrModel ? (
          <HrTrendChart
            points={rhrModel.points}
            unit={rhrModel.unit}
            yDomain={rhrModel.yDomain}
            color="var(--color-metric-green)"
            ariaLabel={t("rhr.trendAria")}
          />
        ) : (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
            {t("rhr.noTrend")}
          </p>
        )}
      </SectionCard>

      {/* HRV */}
      <SectionCard title={t("hrv.sectionTitle")}>
        {overview.hrv.latest ? (
          <Stat
            value={formatBpmValue(overview.hrv.latest.value)}
            unit={overview.hrv.latest.unit}
            label={t("hrv.latest")}
          />
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
            {t("hrv.noData")}
          </p>
        )}
        {hrvModel ? (
          <HrTrendChart
            points={hrvModel.points}
            unit={hrvModel.unit}
            yDomain={hrvModel.yDomain}
            color="var(--color-metric-blue)"
            ariaLabel={t("hrv.trendAria")}
          />
        ) : (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
            {t("hrv.noTrend")}
          </p>
        )}
      </SectionCard>

      {/* Readiness */}
      <SectionCard title={t("readiness.sectionTitle")}>
        {readinessValue !== null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <DsRing
              value={readinessValue}
              size={92}
              sw={10}
              color={readinessRingColor(readinessValue)}
              sub={t("readiness.sub")}
            />
            <Stat
              value={String(readinessValue)}
              unit="/100"
              label={t("readiness.sectionTitle")}
            />
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
            {t("readiness.noData")}
          </p>
        )}
      </SectionCard>

      {/* Zone distribution */}
      <SectionCard title={t("zones.sectionTitle")}>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
          {t("zones.description")}
        </p>
        {zoneSegments ? (
          <DonutWithLegend segments={zoneSegments} size={100} strokeWidth={14} hideZeroSegments />
        ) : (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
            {t("zones.noData")}
          </p>
        )}
      </SectionCard>

      {/* Recent workouts */}
      <SectionCard title={t("workouts.sectionTitle")}>
        {workoutRows.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
            {t("workouts.noData")}
          </p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
              {t("workouts.selectHint")}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {workoutRows.map((row) => (
                <WorkoutRowItem
                  key={row.snapshotId}
                  dateLabel={row.dateLabel}
                  activityLabel={row.activityLabel}
                  durationLabel={row.durationLabel}
                  avgBpmLabel={row.avgBpmLabel}
                  maxBpmLabel={row.maxBpmLabel}
                  selected={selectedWorkoutId === row.snapshotId}
                  onSelect={() =>
                    setSelectedWorkoutId(
                      selectedWorkoutId === row.snapshotId ? null : row.snapshotId,
                    )
                  }
                  t={t}
                />
              ))}
            </ul>

            {/* Zone dots legend (aggregate across all workouts) */}
            {workoutZonesById.size > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                {ZONE_KEYS.map((zk) => {
                  const hasZone = [...workoutZonesById.values()].some(
                    (z) => z[`${zk}Min` as keyof typeof z] > 0,
                  );
                  if (!hasZone) return null;
                  return (
                    <span
                      key={zk}
                      title={t(`zones.${zk}` as Parameters<typeof t>[0])}
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: ZONE_COLORS[zk],
                        display: "inline-block",
                      }}
                      aria-hidden="true"
                    />
                  );
                })}
              </div>
            )}

            {/* Per-workout HR line */}
            {selectedWorkoutId ? (
              <div
                style={{
                  borderTop: "1px solid var(--color-border-default)",
                  paddingTop: 14,
                  marginTop: 4,
                }}
              >
                <h4
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    color: "var(--color-text-muted)",
                    margin: "0 0 4px",
                  }}
                >
                  {t("workouts.hrLine.sectionTitle")}
                </h4>
                <WorkoutHrLine snapshotId={selectedWorkoutId} />
              </div>
            ) : null}
          </>
        )}
      </SectionCard>

      <MedicalNote>{t("wellnessNote")}</MedicalNote>
    </div>
  );
}
