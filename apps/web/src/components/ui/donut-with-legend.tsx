/**
 * Shared SVG donut chart with a legend list.
 * Used by /sleep (stage breakdown) and /pulse (zone distribution).
 *
 * Each segment supplies: key, minutes, pct (0-100), color, label (already
 * localised by the caller).
 */

export type DonutSegment = {
  key: string;
  label: string;
  minutes: number;
  pct: number;
  color: string;
};

type DonutWithLegendProps = {
  segments: DonutSegment[];
  /** Outer diameter in px. */
  size?: number;
  /** Ring stroke width in px. */
  strokeWidth?: number;
  /** When true, segments with pct === 0 are hidden from the legend too. */
  hideZeroSegments?: boolean;
};

export function DonutWithLegend({
  segments,
  size = 120,
  strokeWidth = 16,
  hideZeroSegments = false,
}: DonutWithLegendProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * r;

  let runningOffset = 0;

  const visibleSegments = hideZeroSegments ? segments.filter((s) => s.pct > 0) : segments;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        {segments.map((seg) => {
          if (seg.pct === 0) return null;
          const dashLength = (seg.pct / 100) * circumference;
          const dashOffset = -runningOffset * (circumference / 100);
          runningOffset += seg.pct;
          return (
            <circle
              key={seg.key}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {visibleSegments.map((seg) => (
          <li
            key={seg.key}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: seg.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: "var(--color-text-muted)" }}>{seg.label}</span>
            <span
              style={{
                marginLeft: "auto",
                fontVariantNumeric: "tabular-nums",
                color: "var(--color-text-primary)",
              }}
            >
              {seg.minutes}m · {seg.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
