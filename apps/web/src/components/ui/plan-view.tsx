"use client";

import Link from "next/link";
import {
  type HTMLAttributes,
  type LiHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  PLAN_CHANGE_VIA_CHAT_CTA,
  PLAN_CHANGE_VIA_CHAT_NOTICE,
  type PlanFactItem,
  type PlanViewCtaVariant,
  type PlanViewPanelVariant,
  formatPlanRevisionTimestamp,
  formatRevisionHistoryCollapsibleSummary,
  planDetailCardClassName,
  planViewCtaClassName,
  planViewPanelClassName,
  revisionBadgeLabel,
} from "../../lib/plan-view-ui-state";
import { cn } from "../../lib/utils";
import { Badge } from "./badge";
import { TrendStrip } from "./overview-cards";

type PlanViewLayoutProps = HTMLAttributes<HTMLDivElement>;

export function PlanViewLayout({ className, children, ...props }: PlanViewLayoutProps): ReactElement {
  return (
    <div className={cn("plan-view training-workspace", className)} {...props}>
      {children}
    </div>
  );
}

type PlanViewGridProps = HTMLAttributes<HTMLDivElement>;

export function PlanViewGrid({ className, children, ...props }: PlanViewGridProps): ReactElement {
  return (
    <div className={cn("plan-view__layout training-layout", className)} {...props}>
      {children}
    </div>
  );
}

type PlanViewPanelProps = HTMLAttributes<HTMLElement> & {
  variant?: PlanViewPanelVariant;
  label?: ReactNode;
  title?: ReactNode;
  titleId?: string;
  intro?: ReactNode;
};

export function PlanViewPanel({
  variant = "secondary",
  label,
  title,
  titleId,
  intro,
  className,
  children,
  ...props
}: PlanViewPanelProps): ReactElement {
  return (
    <section
      className={cn(planViewPanelClassName(variant), className)}
      aria-labelledby={titleId}
      {...props}
    >
      {label ? <p className="section-label">{label}</p> : null}
      {title ? (
        <h2 id={titleId} className="plan-view__panel-title">
          {title}
        </h2>
      ) : null}
      {intro ? <p className="muted-text plan-view__panel-intro">{intro}</p> : null}
      {children}
    </section>
  );
}

type PlanHeaderProps = HTMLAttributes<HTMLElement> & {
  label?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  revisionNumber?: number;
  revisionActive?: boolean;
  weekStrip?: ReactNode;
  headingLevel?: 2 | 3;
};

export function PlanHeader({
  label,
  title,
  summary,
  revisionNumber,
  revisionActive = true,
  weekStrip,
  headingLevel = 2,
  className,
  ...props
}: PlanHeaderProps): ReactElement {
  const Heading = headingLevel === 3 ? "h3" : "h2";

  return (
    <header className={cn("plan-view__header", className)} {...props}>
      {label ? <p className="section-label">{label}</p> : null}
      <div className="plan-view__header-row">
        <Heading className="plan-view__title">{title}</Heading>
        {revisionNumber != null ? (
          <RevisionBadge revisionNumber={revisionNumber} active={revisionActive} />
        ) : null}
      </div>
      {summary ? <p className="plan-view__summary">{summary}</p> : null}
      {weekStrip ? <div className="plan-view__week-strip">{weekStrip}</div> : null}
    </header>
  );
}

type RevisionBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  revisionNumber: number;
  active?: boolean;
};

export function RevisionBadge({
  revisionNumber,
  active = false,
  className,
  ...props
}: RevisionBadgeProps): ReactElement {
  return (
    <Badge
      tone={active ? "success" : "neutral"}
      className={cn("plan-view__revision-badge", className)}
      aria-label={revisionBadgeLabel(revisionNumber, active)}
      {...props}
    >
      #{revisionNumber}
      {active ? " · Active" : null}
    </Badge>
  );
}

type PlanWeekStripProps = {
  dayLabels: readonly string[];
  trend: readonly number[];
  sparse?: boolean;
  ariaLabel: string;
  title?: string;
  className?: string;
};

export function PlanWeekStrip({
  dayLabels,
  trend,
  sparse = false,
  ariaLabel,
  title,
  className,
}: PlanWeekStripProps): ReactElement {
  return (
    <section
      className={cn("plan-view__week-context", className)}
      aria-label={title ?? "Weekly consistency"}
    >
      {title ? <h3 className="section-label plan-view__week-title">{title}</h3> : null}
      <TrendStrip
        trend={trend}
        dayLabels={dayLabels}
        sparse={sparse}
        ariaLabel={ariaLabel}
        className="plan-view__trend-strip"
      />
    </section>
  );
}

type ChangeViaChatNoticeProps = HTMLAttributes<HTMLElement> & {
  message?: string;
  chatHref?: string;
};

export function ChangeViaChatNotice({
  message = PLAN_CHANGE_VIA_CHAT_NOTICE,
  chatHref = "/chat",
  className,
  ...props
}: ChangeViaChatNoticeProps): ReactElement {
  return (
    <aside className={cn("notice notice-inline plan-view__change-notice", className)} role="note" {...props}>
      <p className="plan-view__change-notice-copy">{message}</p>
      <p>
        <Link href={chatHref} className={planViewCtaClassName("secondary")}>
          {PLAN_CHANGE_VIA_CHAT_CTA}
        </Link>
      </p>
    </aside>
  );
}

type PlanViewCtaLinkProps = {
  href: string;
  variant?: PlanViewCtaVariant;
  children: ReactNode;
  className?: string;
};

export function PlanViewCtaLink({
  href,
  variant = "primary",
  children,
  className,
}: PlanViewCtaLinkProps): ReactElement {
  return (
    <Link href={href} className={cn(planViewCtaClassName(variant), className)}>
      {children}
    </Link>
  );
}

type PlanDetailListProps = HTMLAttributes<HTMLUListElement>;

export function PlanDetailList({ className, children, ...props }: PlanDetailListProps): ReactElement {
  return (
    <ul className={cn("plan-view__detail-list training-day-list", className)} {...props}>
      {children}
    </ul>
  );
}

type PlanDetailCardProps = LiHTMLAttributes<HTMLLIElement> & {
  active?: boolean;
};

export function PlanDetailCard({
  active = false,
  className,
  children,
  ...props
}: PlanDetailCardProps): ReactElement {
  return (
    <li className={cn(planDetailCardClassName(active), className)} {...props}>
      {children}
    </li>
  );
}

type PlanDetailCardHeaderProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
};

export function PlanDetailCardHeader({
  title,
  meta,
  badge,
  className,
  ...props
}: PlanDetailCardHeaderProps): ReactElement {
  return (
    <div className={cn("plan-view__detail-header training-day-header", className)} {...props}>
      <strong>{title}</strong>
      {meta ? <span>{meta}</span> : null}
      {badge}
    </div>
  );
}

type PlanFactsProps = HTMLAttributes<HTMLDListElement> & {
  items: readonly PlanFactItem[];
};

export function PlanFacts({ items, className, ...props }: PlanFactsProps): ReactElement {
  return (
    <dl className={cn("plan-view__facts training-meta", className)} {...props}>
      {items.map((item) => (
        <div key={item.term} className="plan-view__fact">
          <dt>{item.term}</dt>
          <dd>{item.description}</dd>
        </div>
      ))}
    </dl>
  );
}

type PlanSectionProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  headingLevel?: 3 | 4;
};

export function PlanSection({
  title,
  headingLevel = 3,
  className,
  children,
  ...props
}: PlanSectionProps): ReactElement {
  const Heading = headingLevel === 4 ? "h4" : "h3";

  return (
    <section className={cn("plan-view__section training-notes", className)} {...props}>
      <Heading>{title}</Heading>
      {children}
    </section>
  );
}

type PlanExecutionCalloutProps = HTMLAttributes<HTMLElement> & {
  label?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function PlanExecutionCallout({
  label,
  title,
  description,
  action,
  className,
  ...props
}: PlanExecutionCalloutProps): ReactElement {
  return (
    <aside className={cn("plan-view__execution-callout training-execution-callout nested-card", className)} {...props}>
      {label ? <p className="section-label">{label}</p> : null}
      <h3>{title}</h3>
      {description ? <p className="muted-text">{description}</p> : null}
      {action}
    </aside>
  );
}

type RevisionHistoryListProps = HTMLAttributes<HTMLUListElement>;

export function RevisionHistoryList({
  className,
  children,
  ...props
}: RevisionHistoryListProps): ReactElement {
  return (
    <ul className={cn("plan-view__revision-list training-revision-list", className)} {...props}>
      {children}
    </ul>
  );
}

type RevisionHistoryCollapsibleProps = HTMLAttributes<HTMLDetailsElement> & {
  count: number;
  activeRevisionNumber?: number;
  emptyState?: ReactNode;
  children: ReactNode;
};

export function RevisionHistoryCollapsible({
  count,
  activeRevisionNumber,
  emptyState,
  className,
  children,
  ...props
}: RevisionHistoryCollapsibleProps): ReactElement {
  if (count <= 0) {
    return <>{emptyState ?? null}</>;
  }

  return (
    <details className={cn("plan-view__revision-history", className)} {...props}>
      <summary className="plan-view__revision-history-summary">
        {formatRevisionHistoryCollapsibleSummary(count, activeRevisionNumber)}
      </summary>
      <div className="plan-view__revision-history-content">{children}</div>
    </details>
  );
}

type RevisionHistoryItemProps = LiHTMLAttributes<HTMLLIElement> & {
  revisionNumber: number;
  title: ReactNode;
  reason?: ReactNode;
  meta?: ReactNode;
  active?: boolean;
};

export function RevisionHistoryItem({
  revisionNumber,
  title,
  reason,
  meta,
  active = false,
  className,
  children,
  ...props
}: RevisionHistoryItemProps): ReactElement {
  return (
    <li className={cn(planDetailCardClassName(active), className)} {...props}>
      <div className="plan-view__detail-header training-revision-header">
        <strong>
          #{revisionNumber} · {title}
        </strong>
        {active ? <Badge tone="success">Active</Badge> : null}
      </div>
      {reason ? <p className="muted-text">{reason}</p> : null}
      {meta ? <p className="muted-text">{meta}</p> : null}
      {children}
    </li>
  );
}

export { formatPlanRevisionTimestamp, PLAN_CHANGE_VIA_CHAT_NOTICE };
