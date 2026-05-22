import {
  privacyStatusLabel,
  privacyStatusTone,
  type PrivacyStatus,
} from "@health/ui";
import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Badge } from "./badge";

type ConsentStatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  status: PrivacyStatus;
  label?: string;
};

export function ConsentStatusBadge({
  status,
  label,
  className,
  ...props
}: ConsentStatusBadgeProps) {
  return (
    <Badge
      tone={privacyStatusTone[status]}
      className={cn("privacy-status-badge", className)}
      {...props}
    >
      {label ?? privacyStatusLabel[status]}
    </Badge>
  );
}

export type ConsentScopeItem = {
  id: string;
  label: string;
  description?: ReactNode;
  enabled?: boolean;
  required?: boolean;
};

type ConsentScopeListProps = HTMLAttributes<HTMLUListElement> & {
  scopes: ConsentScopeItem[];
  emptyMessage?: string;
};

export function ConsentScopeList({
  scopes,
  emptyMessage = "No device data scopes selected.",
  className,
  ...props
}: ConsentScopeListProps) {
  if (scopes.length === 0) {
    return <p className="privacy-scope-list__empty">{emptyMessage}</p>;
  }

  return (
    <ul className={cn("privacy-scope-list", className)} {...props}>
      {scopes.map((scope) => {
        const enabled = scope.enabled ?? true;

        return (
          <li
            key={scope.id}
            className={cn("privacy-scope-list__item", !enabled && "privacy-scope-list__item--off")}
          >
            <span className="privacy-scope-list__indicator" aria-hidden="true" />
            <span className="privacy-scope-list__content">
              <span className="privacy-scope-list__title">
                {scope.label}
                {scope.required ? (
                  <span className="privacy-scope-list__meta">Required</span>
                ) : null}
              </span>
              {scope.description ? (
                <span className="privacy-scope-list__description">{scope.description}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

type PrivacyBoundaryNoteProps = HTMLAttributes<HTMLElement> & {
  title?: string;
  children?: ReactNode;
};

export function PrivacyBoundaryNote({
  title = "Privacy boundary",
  children,
  className,
  ...props
}: PrivacyBoundaryNoteProps) {
  return (
    <aside className={cn("privacy-boundary-note", className)} role="note" {...props}>
      <p className="privacy-boundary-note__title">{title}</p>
      <p className="privacy-boundary-note__body">
        {children ??
          "Coach AI can use consented aggregates and selected normalized snapshots. Raw provider logs stay outside default AI context."}
      </p>
    </aside>
  );
}

type RevocationStateProps = HTMLAttributes<HTMLElement> & {
  providerName?: string;
  revokedAt?: string;
  action?: ReactNode;
  children?: ReactNode;
};

export function RevocationState({
  providerName = "Device sync",
  revokedAt,
  action,
  children,
  className,
  ...props
}: RevocationStateProps) {
  return (
    <section className={cn("revocation-state", className)} role="status" {...props}>
      <div>
        <p className="revocation-state__eyebrow">Access revoked</p>
        <h3 className="revocation-state__title">{providerName}</h3>
        <p className="revocation-state__body">
          {children ??
            "Future sync is stopped. Revoked scopes are not used in new AI coaching context."}
        </p>
        {revokedAt ? <p className="revocation-state__meta">Revoked {revokedAt}</p> : null}
      </div>
      {action ? <div className="revocation-state__action">{action}</div> : null}
    </section>
  );
}
