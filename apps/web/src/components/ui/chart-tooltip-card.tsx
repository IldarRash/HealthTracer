/**
 * Shared tooltip card for Recharts charts on /sleep and /pulse.
 * Renders "date/label · value unit" in the dark-world card style.
 */

type ChartTooltipCardProps = {
  /** Primary label (e.g. date string). */
  label?: string;
  /** Formatted numeric value. */
  value?: string | number;
  /** Unit suffix appended after a space. */
  unit?: string;
};

export function ChartTooltipCard({ label, value, unit }: ChartTooltipCardProps) {
  if (value == null) return null;
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
      {label ? (
        <span style={{ color: "var(--color-text-muted)" }}>{label} · </span>
      ) : null}
      {value}
      {unit ? ` ${unit}` : null}
    </div>
  );
}
