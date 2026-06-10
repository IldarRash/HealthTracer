/**
 * Presentation-only tokens for secondary read-only plan views (Training, Nutrition).
 */
import { formatDateMedium } from "./date-format";

/** Date-only timestamp for revision history rows — avoids the dangling comma truncation. */
export function formatPlanRevisionTimestamp(value: string): string {
  return formatDateMedium(value);
}

/**
 * Returns a human-readable reason for a plan revision.
 * Collapses empty/whitespace strings and identical consecutive reasons to a sensible fallback.
 */
export function formatRevisionReason(
  reason: string | null | undefined,
  previousReason: string | null | undefined,
  revisionNumber: number,
): string {
  const trimmed = (reason ?? "").trim();
  if (!trimmed) {
    return revisionNumber === 1 ? "Initial plan" : "Plan updated by your coach";
  }
  const prevTrimmed = (previousReason ?? "").trim();
  if (trimmed === prevTrimmed) {
    return revisionNumber === 1 ? "Initial plan" : "Plan updated by your coach";
  }
  return trimmed;
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
