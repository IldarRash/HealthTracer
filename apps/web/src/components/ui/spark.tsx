/**
 * Spark — lightweight SVG polyline sparkline from kit.jsx.
 * Pure presentational; caller owns the data series.
 */

export type SparkProps = {
  /** Numeric data series (at least 2 points for a meaningful line). */
  data: readonly number[];
  color?: string;
  /** Width in px. */
  w?: number;
  /** Height in px. */
  h?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

export function Spark({
  data,
  color = "currentColor",
  w = 120,
  h = 34,
  className,
  "aria-hidden": ariaHidden = true,
}: SparkProps) {
  if (data.length < 2) {
    return null;
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const rng = max - min || 1;

  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((d - min) / rng) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = data[data.length - 1]!;
  const lx = w;
  const ly = h - ((last - min) / rng) * (h - 4) - 2;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden={ariaHidden}
      className={className}
      style={{ display: "block", overflow: "visible", flexShrink: 0 }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lx} cy={ly} r="2.8" fill={color} />
    </svg>
  );
}

/**
 * TrendArrow — rotated directional arrow from kit.jsx.
 * dir="up"   → green (good) rotated -45°
 * dir="down" → amber (bad)  rotated +45°
 * dir="flat" → muted, unrotated
 */

export type TrendArrowProps = {
  dir?: "up" | "down" | "flat";
  /** When true, up=green; when false, up=amber (e.g. caloric surplus is "up but bad"). */
  good?: boolean;
  size?: number;
  className?: string;
};

const COLOR_GOOD = "var(--color-metric-green)";
const COLOR_BAD = "var(--color-metric-amber)";
const COLOR_FLAT = "var(--color-text-muted)";

export function TrendArrow({ dir = "up", good = true, size = 13, className }: TrendArrowProps) {
  const color = dir === "flat" ? COLOR_FLAT : good ? COLOR_GOOD : COLOR_BAD;
  const rot = dir === "up" ? -45 : dir === "down" ? 45 : 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
      style={{ display: "block", transform: `rotate(${rot}deg)`, flexShrink: 0 }}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
