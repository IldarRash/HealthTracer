"use client";

import {
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  createElement,
  useState,
} from "react";
import { canvasStateMessageClass, canvasStateMessageCompactClass } from "../../lib/command-center-ui-state";
import { cn } from "../../lib/utils";
import { EmptyState, ErrorState, LoadingState } from "./state-message-elements";

type CanvasStateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
};

export type CommandCenterSection = {
  id: string;
  label: string;
};

type SectionNavProps = {
  sections: readonly CommandCenterSection[];
  ariaLabel?: string;
  className?: string;
};

export function SectionNav({
  sections,
  ariaLabel = "Page sections",
  className,
}: SectionNavProps): ReactElement | null {
  if (sections.length < 2) {
    return null;
  }

  return (
    <nav className={cn("section-nav", className)} aria-label={ariaLabel}>
      <ul className="section-nav__list">
        {sections.map((section) => (
          <li key={section.id}>
            <a className="section-nav__link" href={`#${section.id}`}>
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

type ActionPriorityCardProps = HTMLAttributes<HTMLElement> & {
  label?: string;
  title: ReactNode;
  metric?: ReactNode;
  hint?: ReactNode;
  footer?: ReactNode;
  headingLevel?: 2 | 3;
};

export function ActionPriorityCard({
  label,
  title,
  metric,
  hint,
  footer,
  headingLevel = 2,
  className,
  children,
  ...props
}: ActionPriorityCardProps): ReactElement {
  const headingTag = headingLevel === 3 ? "h3" : "h2";

  return (
    <article className={cn("action-priority-card", className)} {...props}>
      {label ? <p className="section-label action-priority-card__label">{label}</p> : null}
      <div className="action-priority-card__header">
        {createElement(headingTag, { className: "action-priority-card__title" }, title)}
        {metric ? <div className="action-priority-card__metric">{metric}</div> : null}
      </div>
      {hint ? <p className="muted-text action-priority-card__hint">{hint}</p> : null}
      {children ? <div className="action-priority-card__body">{children}</div> : null}
      {footer ? <footer className="action-priority-card__footer">{footer}</footer> : null}
    </article>
  );
}

type CompactDomainCardProps = HTMLAttributes<HTMLElement> & {
  label?: string;
  title?: ReactNode;
  titleId?: string;
  summary?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  busy?: boolean;
  as?: "section" | "article" | "div";
};

export function CompactDomainCard({
  label,
  title,
  titleId,
  summary,
  badge,
  actions,
  busy,
  as: Tag = "section",
  className,
  children,
  ...props
}: CompactDomainCardProps): ReactElement {
  const labelledBy = title && titleId ? titleId : undefined;

  return (
    <Tag
      className={cn("domain-card", className)}
      aria-labelledby={labelledBy}
      aria-busy={busy || undefined}
      {...props}
    >
      {label ? <p className="section-label domain-card__label">{label}</p> : null}
      {title || summary || badge ? (
        <div className="domain-card__header training-session-header">
          <div className="domain-card__heading">
            {title && titleId ? (
              <h3 id={titleId} className="domain-card__title">
                {title}
              </h3>
            ) : title ? (
              <h3 className="domain-card__title">{title}</h3>
            ) : null}
            {summary ? <p className="muted-text domain-card__summary">{summary}</p> : null}
          </div>
          {badge ? <div className="domain-card__badge">{badge}</div> : null}
        </div>
      ) : null}
      {children ? <div className="domain-card__body">{children}</div> : null}
      {actions ? (
        <div className="domain-card__actions action-row proposal-actions">{actions}</div>
      ) : null}
    </Tag>
  );
}

type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  className: string;
};

export function StatusBadge({ className, children, ...props }: StatusBadgeProps): ReactElement {
  return (
    <span className={className} {...props}>
      {children}
    </span>
  );
}

type ProgressiveDisclosureProps = HTMLAttributes<HTMLDetailsElement> & {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function ProgressiveDisclosure({
  summary,
  children,
  defaultOpen = false,
  className,
  ...props
}: ProgressiveDisclosureProps): ReactElement {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className={cn("disclosure", className)}
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
      {...props}
    >
      <summary className="disclosure__summary">{summary}</summary>
      <div className="disclosure__content">{children}</div>
    </details>
  );
}

type CommandCenterLayoutProps = HTMLAttributes<HTMLDivElement>;

export function CommandCenterLayout({ className, ...props }: CommandCenterLayoutProps): ReactElement {
  return <div className={cn("command-center", className)} {...props} />;
}

export function CanvasEmptyState({
  compact,
  className,
  ...props
}: CanvasStateProps): ReactElement {
  return (
    <EmptyState
      {...props}
      className={cn(compact ? canvasStateMessageCompactClass("empty") : canvasStateMessageClass("empty"), className)}
    />
  );
}

export function CanvasLoadingState({
  compact,
  className,
  ...props
}: CanvasStateProps): ReactElement {
  return (
    <LoadingState
      {...props}
      className={cn(
        compact ? canvasStateMessageCompactClass("loading") : canvasStateMessageClass("loading"),
        className,
      )}
    />
  );
}

export function CanvasErrorState({
  compact,
  className,
  ...props
}: CanvasStateProps): ReactElement {
  return (
    <ErrorState
      {...props}
      className={cn(
        compact ? canvasStateMessageCompactClass("error") : canvasStateMessageClass("error"),
        className,
      )}
    />
  );
}
