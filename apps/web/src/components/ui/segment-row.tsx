/**
 * SegmentRow — N flex segments, filled vs empty.
 * Used for water row (8-segment, blue) and stress (3-segment).
 */

export type SegmentRowProps = {
  filled: number; // 0..total
  total: number;
  color?: string;
  label?: string;
  countLabel?: string;
  className?: string;
};

export function SegmentRow({
  filled,
  total,
  color = "#3a8dff",
  label,
  countLabel,
  className,
}: SegmentRowProps) {
  return (
    <div
      className={className}
      style={{ display: "flex", alignItems: "center", gap: 8 }}
    >
      {label ? (
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.5,
            color: "#cfd4d7",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      ) : null}

      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 9,
              borderRadius: 3,
              background: i < filled ? color : "rgba(255,255,255,0.08)",
              transition: "background 200ms ease",
            }}
          />
        ))}
      </div>

      {countLabel ? (
        <span
          style={{
            fontSize: 12.5,
            color: "#878d92",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {countLabel}
        </span>
      ) : null}
    </div>
  );
}
