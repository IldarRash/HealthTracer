/**
 * Dark-world chart primitives.
 *
 * DsRing     — donut metric ring for the hero spec (value/size/sw/color/label/sub).
 *              Use this for the dark ConsistencyHero ring (138px, sw=12, green).
 *
 * DsTrendStrip — 7-day bar strip with per-bar color by level (green ≥70, amber 30–69,
 *               red <30) and opacity 0.55 for bars < 30.
 *               Bar value label shown above, day label below.
 *
 * Both are presentational and have no data fetching.
 */

import { type HTMLAttributes, type ReactElement } from "react";
import { cn } from "../../lib/utils";

// ── DsRing (hero donut) ────────────────────────────────────────

export type DsRingProps = HTMLAttributes<HTMLDivElement> & {
  /** Completion value 0–100. */
  value: number;
  /** Diameter in px (defaults to 92). */
  size?: number;
  /** Stroke width in px (defaults to 9). */
  sw?: number;
  /** Stroke color (defaults to var(--color-metric-green)). */
  color?: string;
  /** Track color (defaults to rgba(255,255,255,0.08)). */
  track?: string;
  /** Center text label — defaults to `value`. */
  label?: string | number;
  /** Small uppercase sub-label below the center value. */
  sub?: string;
};

export function DsRing({
  value,
  size = 92,
  sw = 9,
  color = "var(--color-metric-green)",
  track = "rgba(255,255,255,0.08)",
  label,
  sub,
  className,
  ...props
}: DsRingProps): ReactElement {
  const r = (size - sw) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, value));
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <div
      className={cn("ds-ring", className)}
      style={{ width: size, height: size }}
      aria-label={`${clamped}%${sub ? ` ${sub}` : ""}`}
      role="img"
      {...props}
    >
      <svg
        className="ds-ring__svg"
        width={size}
        height={size}
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={sw}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <div className="ds-ring__label" aria-hidden="true">
        <span
          className="ds-ring__value"
          style={{ fontSize: size * 0.27, color }}
        >
          {label != null ? label : value}
        </span>
        {sub ? <span className="ds-ring__sub">{sub}</span> : null}
      </div>
    </div>
  );
}

// ── DsTrendStrip (7-day colored bars) ─────────────────────────

export type DsTrendStripDayData = {
  /** Percentage 0–100. */
  value: number;
  /** Day label (e.g. "Mon"). */
  label: string;
  /**
   * Temporal state of this day relative to today:
   * - "past"   → standard threshold-based color
   * - "today"  → today, value=0 means in-progress (neutral; not red/green)
   * - "future" → upcoming day; dim neutral track, no value label
   * Omitting this prop preserves the original threshold-based behavior.
   */
  state?: "past" | "today" | "future";
};

export type DsTrendStripProps = HTMLAttributes<HTMLDivElement> & {
  days: readonly DsTrendStripDayData[];
  /** Max bar height in px (defaults to 44). */
  maxH?: number;
  ariaLabel?: string;
  /**
   * When set, every bar uses this color (e.g. tokens.color.metric.amber for
   * the fat% trend) and opacity is fixed at 1. Skips the threshold-based
   * barColor() logic and the value<30 opacity dimming. Existing callers that
   * omit this prop keep the current threshold behavior exactly.
   */
  barColor?: string;
};

function barColor(value: number): string {
  if (value >= 70) return "var(--color-metric-green)";
  if (value >= 30) return "var(--color-metric-amber)";
  return "var(--color-metric-red)";
}

export function DsTrendStrip({
  days,
  maxH = 44,
  ariaLabel = "Weekly consistency",
  barColor: barColorOverride,
  className,
  ...props
}: DsTrendStripProps): ReactElement {
  const maxVal = Math.max(...days.map((d) => d.value), 1);

  const NEUTRAL_DIM = "rgba(255,255,255,0.12)";
  const NEUTRAL_TODAY = "rgba(255,255,255,0.25)";

  return (
    <div
      className={cn("ds-trend-strip", className)}
      role="img"
      aria-label={ariaLabel}
      {...props}
    >
      {days.map((day, i) => {
        const isFuture = day.state === "future";
        const isToday = day.state === "today";

        // Future days: neutral dim track at minimal height, no label
        if (isFuture) {
          return (
            <div
              key={day.label ?? i}
              className="ds-trend-strip__col"
              aria-label={`${day.label}: upcoming`}
            >
              <span className="ds-trend-strip__val" aria-hidden="true" />
              <div
                className="ds-trend-strip__bar-fill"
                aria-hidden="true"
                style={{ height: 4, background: NEUTRAL_DIM, opacity: 1 }}
              />
              <span className="ds-trend-strip__day" aria-hidden="true">
                {day.label}
              </span>
            </div>
          );
        }

        // Today with value=0: neutral "in progress" tone (not red, not green)
        if (isToday && day.value === 0) {
          return (
            <div
              key={day.label ?? i}
              className="ds-trend-strip__col"
              aria-label={`${day.label}: in progress`}
            >
              <span className="ds-trend-strip__val" aria-hidden="true" />
              <div
                className="ds-trend-strip__bar-fill"
                aria-hidden="true"
                style={{ height: 8, background: NEUTRAL_TODAY, opacity: 1 }}
              />
              <span className="ds-trend-strip__day" aria-hidden="true">
                {day.label}
              </span>
            </div>
          );
        }

        const height = Math.max(4, (day.value / maxVal) * maxH);
        // When barColorOverride is set, use it uniformly at opacity 1;
        // otherwise fall back to the threshold-based color + dimming.
        const color = barColorOverride ?? barColor(day.value);
        const opacity = barColorOverride != null ? 1 : day.value < 30 ? 0.55 : 1;

        return (
          <div
            key={day.label ?? i}
            className="ds-trend-strip__col"
            aria-label={`${day.label}: ${day.value}%`}
          >
            {/* Value label above bar */}
            <span className="ds-trend-strip__val" aria-hidden="true">
              {day.value > 0 ? day.value : ""}
            </span>
            {/* Bar */}
            <div
              className="ds-trend-strip__bar-fill"
              aria-hidden="true"
              style={{ height, background: color, opacity }}
            />
            {/* Day label */}
            <span className="ds-trend-strip__day" aria-hidden="true">
              {day.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
