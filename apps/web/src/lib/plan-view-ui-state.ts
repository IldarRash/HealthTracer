/**
 * Presentation-only tokens for secondary read-only plan views (Training, Nutrition).
 */

export const PLAN_CHANGE_VIA_CHAT_NOTICE =
  "This plan is read-only here. Request changes in Chat when your coach returns a proposal you can review and accept.";

export const PLAN_CHANGE_VIA_CHAT_CTA = "Change this plan in Chat →";

export type PlanViewCtaVariant = "primary" | "secondary";

export type PlanViewPanelVariant = "prominent" | "secondary" | "wide";

export function planViewCtaClassName(variant: PlanViewCtaVariant = "primary"): string {
  return variant === "primary"
    ? "plan-view__cta plan-view__cta--primary confirmation-card__link"
    : "plan-view__cta plan-view__cta--secondary confirmation-card__link";
}

export function formatRevisionHistoryCollapsibleSummary(
  count: number,
  activeRevisionNumber?: number,
): string {
  if (count <= 0) {
    return "No earlier revisions";
  }

  const revisionLabel = count === 1 ? "1 plan revision" : `${count} plan revisions`;
  if (activeRevisionNumber != null) {
    return `${revisionLabel} · #${activeRevisionNumber} active`;
  }

  return revisionLabel;
}

export function planViewPanelClassName(variant: PlanViewPanelVariant = "secondary"): string {
  const classes = ["panel", "plan-view__panel"];

  if (variant === "prominent") {
    classes.push("panel-prominent", "plan-view__panel--plan", "training-plan-panel");
  } else {
    classes.push("panel-secondary", "plan-view__panel--history", "training-history-panel");
  }

  if (variant === "wide") {
    classes.push("panel-wide");
  }

  return classes.join(" ");
}

export function planDetailCardClassName(active = false): string {
  return active
    ? "plan-view__detail-card plan-view__detail-card--active training-revision-card nested-card active"
    : "plan-view__detail-card training-revision-card nested-card";
}

export function revisionBadgeLabel(revisionNumber: number, active = false): string {
  return active ? `Revision #${revisionNumber} · Active` : `Revision #${revisionNumber}`;
}

export function formatPlanRevisionTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
