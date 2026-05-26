"use client";

import {
  privacyStatusLabel,
  privacyStatusTone,
  type PrivacyStatus,
} from "@health/ui";
import {
  type ChangeEvent,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
  useRef,
} from "react";
import { cn } from "../../lib/utils";
import { Badge } from "./badge";
import { Button } from "./button";

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

type ConsentScopeChecklistProps = HTMLAttributes<HTMLFieldSetElement> & {
  legend: string;
  helpText?: string;
  scopes: ConsentScopeItem[];
  idPrefix: string;
  disabled?: boolean;
  onToggle: (scopeId: string) => void;
  listClassName?: string;
};

export function ConsentScopeChecklist({
  legend,
  helpText,
  scopes,
  idPrefix,
  disabled = false,
  onToggle,
  className,
  listClassName,
  ...props
}: ConsentScopeChecklistProps) {
  return (
    <fieldset className={cn("form-field consent-scope-fieldset", className)} {...props}>
      <legend className="form-label">{legend}</legend>
      {helpText ? <p className="form-help">{helpText}</p> : null}
      <ul className={cn("consent-scope-checklist", listClassName)}>
        {scopes.map((scope) => {
          const inputId = `${idPrefix}-consent-${scope.id}`;
          const isDisabled = disabled || (scope.required ?? false);

          return (
            <li key={scope.id}>
              <label htmlFor={inputId} className="consent-scope-checklist__label">
                <input
                  id={inputId}
                  name={inputId}
                  type="checkbox"
                  checked={scope.enabled ?? false}
                  disabled={isDisabled}
                  onChange={() => onToggle(scope.id)}
                />
                <span>
                  <strong>{scope.label}</strong>
                  {scope.required ? " (required)" : null}
                  {scope.description ? (
                    <span className="form-help">{scope.description}</span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

type FileInputTriggerProps = {
  inputId: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  labelText: string;
  buttonLabel: string;
  hintText?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  buttonVariant?: "primary" | "secondary";
};

export function FileInputTrigger({
  inputId,
  accept,
  multiple = false,
  disabled = false,
  labelText,
  buttonLabel,
  hintText,
  inputRef,
  onChange,
  className,
  buttonVariant = "secondary",
}: FileInputTriggerProps) {
  const hintId = hintText ? `${inputId}-hint` : undefined;
  const internalInputRef = useRef<HTMLInputElement>(null);
  const resolvedInputRef = inputRef ?? internalInputRef;

  return (
    <div className={cn("file-input-trigger", className)}>
      <label className="sr-only" htmlFor={inputId}>
        {labelText}
      </label>
      <input
        ref={resolvedInputRef}
        id={inputId}
        className="sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={onChange}
      />
      <Button
        type="button"
        variant={buttonVariant}
        disabled={disabled}
        aria-controls={inputId}
        aria-describedby={hintId}
        onClick={() => resolvedInputRef.current?.click()}
      >
        {buttonLabel}
      </Button>
      {hintText ? (
        <p id={hintId} className="file-input-trigger__hint">
          {hintText}
        </p>
      ) : null}
    </div>
  );
}

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
