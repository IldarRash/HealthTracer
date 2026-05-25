"use client";

import {
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  createElement,
} from "react";
import { cn } from "../../lib/utils";
import { ProgressiveDisclosure, SectionNav, type CommandCenterSection } from "./command-center";
import { PrivacyBoundaryNote } from "./privacy";

export { SectionNav };
export type { CommandCenterSection as ContextHubSection };

type ContextHubLayoutProps = HTMLAttributes<HTMLDivElement>;

export function ContextHubLayout({
  className,
  children,
  ...props
}: ContextHubLayoutProps): ReactElement {
  return (
    <div className={cn("context-hub page-content profile-hub", className)} {...props}>
      {children}
    </div>
  );
}

type ProfileSummaryCardProps = HTMLAttributes<HTMLElement> & {
  label?: string;
  title: ReactNode;
  hint?: ReactNode;
  headingLevel?: 2 | 3;
  details?: ReactNode;
};

export function ProfileSummaryCard({
  label = "Account",
  title,
  hint,
  headingLevel = 2,
  details,
  className,
  children,
  ...props
}: ProfileSummaryCardProps): ReactElement {
  const headingTag = headingLevel === 3 ? "h3" : "h2";

  return (
    <section
      id="account"
      className={cn("context-summary-card dashboard-section profile-account", className)}
      aria-labelledby="profile-account-heading"
      {...props}
    >
      {label ? <p className="section-label">{label}</p> : null}
      {createElement(
        headingTag,
        { id: "profile-account-heading", className: "context-summary-card__title" },
        title,
      )}
      {details ? <div className="context-summary-card__details profile-account__details">{details}</div> : null}
      {hint ? <p className="dashboard-card__hint context-summary-card__hint">{hint}</p> : null}
      {children}
    </section>
  );
}

type ContextSectionCardProps = HTMLAttributes<HTMLElement> & {
  sectionId: string;
  label?: string;
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
};

export function ContextSectionCard({
  sectionId,
  label,
  title,
  hint,
  actions,
  headingLevel = 2,
  className,
  children,
  ...props
}: ContextSectionCardProps): ReactElement {
  const headingId = `${sectionId}-heading`;
  const headingTag = headingLevel === 3 ? "h3" : "h2";

  return (
    <section
      id={sectionId}
      className={cn("dashboard-section context-section-card profile-section", className)}
      aria-labelledby={headingId}
      {...props}
    >
      <div className="context-section-card__header profile-section__header">
        <div>
          {label ? <p className="section-label">{label}</p> : null}
          {createElement(headingTag, { id: headingId, className: "context-section-card__title" }, title)}
          {hint ? <p className="dashboard-card__hint context-section-card__hint">{hint}</p> : null}
        </div>
        {actions ? <div className="context-section-card__actions">{actions}</div> : null}
      </div>
      {children ? <div className="context-section-card__body">{children}</div> : null}
    </section>
  );
}

type ConsentManagementCardProps = HTMLAttributes<HTMLElement> & {
  sectionId?: string;
  label?: string;
  title: ReactNode;
  description?: ReactNode;
  boundaryTitle?: string;
  boundaryBody?: ReactNode;
  showBoundary?: boolean;
};

export function ConsentManagementCard({
  sectionId = "consent",
  label = "Consent-first handling",
  title,
  description,
  boundaryTitle,
  boundaryBody,
  showBoundary = true,
  className,
  children,
  ...props
}: ConsentManagementCardProps): ReactElement {
  const headingId = `${sectionId}-heading`;

  return (
    <article
      id={sectionId}
      className={cn("consent-management-card notice", className)}
      aria-labelledby={headingId}
      {...props}
    >
      {label ? <p className="section-label">{label}</p> : null}
      <h2 id={headingId} className="consent-management-card__title">
        {title}
      </h2>
      {description ? <p className="consent-management-card__description">{description}</p> : null}
      {showBoundary ? (
        <PrivacyBoundaryNote title={boundaryTitle}>{boundaryBody}</PrivacyBoundaryNote>
      ) : null}
      {children}
    </article>
  );
}

type CompactGoalHierarchyPanelProps = HTMLAttributes<HTMLDivElement> & {
  label?: string;
  title?: ReactNode;
  hint?: ReactNode;
};

export function CompactGoalHierarchyPanel({
  label = "Coaching direction",
  title = "Goal hierarchy",
  hint,
  className,
  children,
  ...props
}: CompactGoalHierarchyPanelProps): ReactElement {
  return (
    <div className={cn("compact-goal-hierarchy coaching-hierarchy", className)} {...props}>
      <div className="compact-goal-hierarchy__intro">
        {label ? <p className="section-label">{label}</p> : null}
        {title ? <h3 className="compact-goal-hierarchy__title">{title}</h3> : null}
        {hint ? <p className="dashboard-card__hint compact-goal-hierarchy__hint">{hint}</p> : null}
      </div>
      <div className="compact-goal-hierarchy__body coaching-hierarchy__card">{children}</div>
    </div>
  );
}

type ContextHubDisclosureProps = HTMLAttributes<HTMLDetailsElement> & {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function ContextHubDisclosure({
  summary,
  children,
  defaultOpen = false,
  className,
  ...props
}: ContextHubDisclosureProps): ReactElement {
  return (
    <ProgressiveDisclosure
      summary={summary}
      defaultOpen={defaultOpen}
      className={cn("context-hub-disclosure", className)}
      {...props}
    >
      {children}
    </ProgressiveDisclosure>
  );
}
