"use client";

import {
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "../../lib/utils";
import { PrivacyBoundaryNote } from "./privacy";

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

