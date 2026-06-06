/**
 * Progress — thin horizontal bar atom.
 * Port of kit.jsx:260-267
 */

export type ProgressBarProps = {
  value: number; // 0–100
  color?: string;
  height?: number;
  className?: string;
};

export function ProgressBar({
  value,
  color = "#19c37d",
  height = 7,
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={className}
      style={{
        height,
        borderRadius: height,
        background: "rgba(255,255,255,0.08)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          background: color,
          borderRadius: height,
          transition: "width 300ms ease",
        }}
      />
    </div>
  );
}
