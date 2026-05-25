/**
 * Presentation-only helpers for premium overview cards on structured light canvas.
 * Domain modules keep copy and data shaping; these map to shared class names and labels.
 */

export const OVERVIEW_WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function buildTrendStripClassName(sparse: boolean): string {
  return sparse ? "trend-strip trend-strip--sparse" : "trend-strip";
}

export function buildSevenDayTrendAriaLabel(
  trend: readonly number[],
  dayLabels: readonly string[],
  sparse: boolean,
  unavailableMessage = "Seven day activity trend unavailable. Not enough data yet.",
): string {
  if (sparse) {
    return unavailableMessage;
  }

  return `Seven day activity trend. ${trend
    .map((value, index) => `${dayLabels[index] ?? `Day ${index + 1}`}: ${value}%`)
    .join(", ")}.`;
}

export type TrendStripView = {
  sparse: boolean;
  trend: readonly number[];
  ariaLabel: string;
  className: string;
};

export function buildTrendStripView(
  trend: readonly number[],
  sparse: boolean,
  dayLabels: readonly string[] = OVERVIEW_WEEKDAY_LABELS,
): TrendStripView {
  return {
    sparse,
    trend,
    ariaLabel: buildSevenDayTrendAriaLabel(trend, dayLabels, sparse),
    className: buildTrendStripClassName(sparse),
  };
}

export function overviewCanvasEmptyClassName(): string {
  return "state-message state-message--empty state-message--canvas state-message--canvas-compact";
}
