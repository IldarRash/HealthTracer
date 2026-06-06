import Link from "next/link";
import {
  type ComponentProps,
  type HTMLAttributes,
  type LiHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { overviewCanvasEmptyClassName } from "../../lib/overview-ui-state";
import { cn } from "../../lib/utils";
import { EmptyState } from "./state-message-elements";

type OverviewHeroCardProps = HTMLAttributes<HTMLElement> & {
  fullWidth?: boolean;
};

export function OverviewHeroCard({
  fullWidth = false,
  className,
  children,
  ...props
}: OverviewHeroCardProps): ReactElement {
  return (
    <section
      className={cn("dashboard-hero", fullWidth && "dashboard-hero--full", className)}
      {...props}
    >
      {children}
    </section>
  );
}

type OverviewSignalListProps = HTMLAttributes<HTMLUListElement>;

export function OverviewSignalList({
  className,
  children,
  ...props
}: OverviewSignalListProps): ReactElement {
  return (
    <ul className={cn("overview-signal-list", className)} {...props}>
      {children}
    </ul>
  );
}

type OverviewSignalItemProps = LiHTMLAttributes<HTMLLIElement> & {
  title: ReactNode;
  meta?: ReactNode;
  detail?: ReactNode;
  badge?: ReactNode;
  muted?: boolean;
};

export function OverviewSignalItem({
  title,
  meta,
  detail,
  badge,
  muted = false,
  className,
  ...props
}: OverviewSignalItemProps): ReactElement {
  return (
    <li className={cn(muted && "overview-signal-item--muted", className)} {...props}>
      <strong>{title}</strong>
      {meta ? <span>{meta}</span> : null}
      {detail ? <p className="dashboard-card__hint">{detail}</p> : null}
      {badge}
    </li>
  );
}

type OverviewTrendSectionProps = HTMLAttributes<HTMLElement> & {
  title: string;
};

export function OverviewTrendSection({
  title,
  className,
  children,
  ...props
}: OverviewTrendSectionProps): ReactElement {
  return (
    <section className={cn("overview-trend-section", className)} aria-label={title} {...props}>
      <h4 className="section-label overview-trend-section__title">{title}</h4>
      {children}
    </section>
  );
}

type OverviewSparseHintProps = HTMLAttributes<HTMLParagraphElement>;

export function OverviewSparseHint({
  className,
  children,
  ...props
}: OverviewSparseHintProps): ReactElement {
  return (
    <p className={cn("overview-sparse-hint dashboard-card__hint", className)} role="status" {...props}>
      {children}
    </p>
  );
}

type OverviewReadOnlyNoticeProps = HTMLAttributes<HTMLParagraphElement>;

export function OverviewReadOnlyNotice({
  className,
  children,
  ...props
}: OverviewReadOnlyNoticeProps): ReactElement {
  return (
    <p
      className={cn("overview-readonly-notice dashboard-card__hint", className)}
      role="note"
      {...props}
    >
      {children}
    </p>
  );
}

type OverviewCardLinkProps = ComponentProps<typeof Link>;

export function OverviewCardLink({ className, children, ...props }: OverviewCardLinkProps): ReactElement {
  return (
    <Link className={cn("confirmation-card__link", className)} {...props}>
      {children}
    </Link>
  );
}

type OverviewInlineEmptyStateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function OverviewInlineEmptyState({
  title,
  description,
  action,
  className,
}: OverviewInlineEmptyStateProps): ReactElement {
  return (
    <EmptyState
      title={title}
      description={description}
      action={action}
      className={cn(overviewCanvasEmptyClassName(), className)}
    />
  );
}
