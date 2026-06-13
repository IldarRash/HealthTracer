"use client";

import type { ReactElement } from "react";
import {
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BiomarkerHistoryChartModel } from "../../lib/biomarkers-ui-state";

const REFERENCE_BAND_OPACITY = 0.12;
const OPTIMAL_BAND_OPACITY = 0.28;
const AXIS_COLOR = "var(--color-text-muted)";

export type BiomarkerHistoryChartProps = {
  /** Pure model from buildHistoryChartModel (callers render their own empty state when null). */
  model: BiomarkerHistoryChartModel;
  /** Pre-translated descriptive alternative for the whole chart. */
  ariaLabel: string;
};

type TooltipPayloadEntry = { payload?: { label?: string; value?: number } };

function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  unit: string;
}): ReactElement | null {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point || point.value == null) {
    return null;
  }

  return (
    <div
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-border-default)",
        borderRadius: 8,
        padding: "6px 9px",
        fontSize: 12,
        color: "var(--color-text-primary)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span style={{ color: "var(--color-text-muted)" }}>{point.label} · </span>
      {point.value} {unit}
    </div>
  );
}

/**
 * Recharts history-over-time chart for one biomarker: reference + optimal bands
 * as shaded background, a green line over the readings, and a minimal tooltip.
 * Presentational only — the workspace owns loading/empty/error and renders the
 * empty caption when buildHistoryChartModel returns null.
 */
export function BiomarkerHistoryChart({
  model,
  ariaLabel,
}: BiomarkerHistoryChartProps): ReactElement {
  const xTicks = model.points.map((point) => point.ts);
  const labelByTs = new Map(model.points.map((point) => [point.ts, point.label]));

  return (
    <div role="img" aria-label={ariaLabel} style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={model.points}
          margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
          accessibilityLayer
        >
          {model.referenceBand ? (
            <ReferenceArea
              y1={model.referenceBand.low}
              y2={model.referenceBand.high}
              fill="var(--color-metric-green)"
              fillOpacity={REFERENCE_BAND_OPACITY}
              stroke="none"
              ifOverflow="hidden"
            />
          ) : null}
          {model.optimalBand ? (
            <ReferenceArea
              y1={model.optimalBand.low}
              y2={model.optimalBand.high}
              fill="var(--color-metric-green)"
              fillOpacity={OPTIMAL_BAND_OPACITY}
              stroke="none"
              ifOverflow="hidden"
            />
          ) : null}
          <XAxis
            dataKey="ts"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={xTicks}
            tickFormatter={(ts: number) => labelByTs.get(ts) ?? ""}
            tick={{ fontSize: 11, fill: AXIS_COLOR }}
            stroke={AXIS_COLOR}
            tickLine={false}
          />
          <YAxis
            domain={model.yDomain}
            tick={{ fontSize: 11, fill: AXIS_COLOR }}
            stroke={AXIS_COLOR}
            tickLine={false}
            width={40}
            allowDecimals
          />
          <Tooltip
            cursor={{ stroke: "var(--color-border-default)" }}
            content={<ChartTooltip unit={model.unit} />}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--color-metric-green)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--color-metric-green)", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
