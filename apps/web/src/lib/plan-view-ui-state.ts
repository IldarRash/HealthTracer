/**
 * Presentation-only tokens for secondary read-only plan views (Training, Nutrition).
 */
import { formatDateTimeMedium } from "./date-format";

export function formatPlanRevisionTimestamp(value: string): string {
  return formatDateTimeMedium(value);
}

const PLAN_REVISION_SOURCE_LABELS: Record<string, string> = {
  ai_proposal: "Coach proposal",
  health_tracer_seed: "Starter plan",
};

export function formatPlanRevisionSource(source: string): string {
  const normalized = source.trim().toLowerCase();
  const known = PLAN_REVISION_SOURCE_LABELS[normalized];
  if (known) {
    return known;
  }

  return source
    .split(/[_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

export function formatRevisionHistoryMeta(source: string, createdAt: string): string {
  return `${formatPlanRevisionSource(source)} · ${formatPlanRevisionTimestamp(createdAt)}`;
}

export type PlanFactItem = {
  term: string;
  description: string;
};
