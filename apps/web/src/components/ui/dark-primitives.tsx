/**
 * Dark-world state and layout primitives (states.jsx port).
 *
 * New components:
 *  - CoachNotes         → card: CoachAvatar + label + text
 *  - PartialBanner      → amber-tinted partial-failure banner (Longevity)
 *  - SectionError       → dashed red-tinted box for a single failed section
 *  - MedicalNote        → inline info-icon disclaimer line
 *
 * Restyled/replaced (design-fidelity versions, old CSS classes kept for gradual migration):
 *  - ChangeBanner       → replaces ChangeViaChatNotice on data screens
 *  - DailyExecCard      → colored CTA card → Today (replaces PlanExecutionCallout on data screens)
 *  - RevisionFacts      → replaces the plain PlanFacts layout; accent top-border + why framing
 *  - RevisionHistoryDark → replaces RevisionHistoryCollapsible on dark screens
 *
 * All components are presentational (no data fetching).
 */

"use client";

import Link from "next/link";
import {
  type HTMLAttributes,
  type ReactNode,
  useState,
  type ReactElement,
} from "react";
import { cn } from "../../lib/utils";
import { Icon, Mark, type IconName } from "./icon";

// ── CoachAvatar (shared, exported) ─────────────────────────────
// Already exists privately in chat-bubble.tsx. We expose it here for
// the data screens; chat-bubble.tsx keeps its local copy untouched.

export function CoachAvatar({ size = 30 }: { size?: number }): ReactElement {
  return (
    <div
      className="ds-coach-notes__avatar"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <Mark size={Math.round(size * 0.66)} />
    </div>
  );
}

// ── CoachNotes ────────────────────────────────────────────────

export type CoachNotesProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  label?: string;
};

export function CoachNotes({
  children,
  label = "Coach note",
  className,
  ...props
}: CoachNotesProps): ReactElement {
  return (
    <aside
      className={cn("ds-coach-notes", className)}
      role="note"
      {...props}
    >
      <div className="ds-coach-notes__inner">
        <CoachAvatar size={30} />
        <div style={{ flex: 1 }}>
          <p className="ds-coach-notes__meta">{label}</p>
          <p className="ds-coach-notes__text">{children}</p>
        </div>
      </div>
    </aside>
  );
}

// ── PartialBanner (amber — Longevity partial failure) ────────

export type PartialBannerProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
  onRetry?: () => void;
};

export function PartialBanner({
  children,
  onRetry,
  className,
  ...props
}: PartialBannerProps): ReactElement {
  return (
    <aside
      className={cn("ds-partial-banner", className)}
      role="alert"
      aria-live="polite"
      {...props}
    >
      <Icon name="info" size={18} stroke="var(--color-metric-amber)" aria-hidden />
      <span className="ds-partial-banner__text">
        {children ?? "Some sections failed to load. Showing what we could fetch."}
      </span>
      {onRetry ? (
        <button
          type="button"
          className="ds-partial-banner__action"
          onClick={onRetry}
        >
          Retry →
        </button>
      ) : null}
    </aside>
  );
}

// ── SectionError (dashed box for a single failed section) ─────

export type SectionErrorProps = HTMLAttributes<HTMLElement> & {
  label?: string;
  height?: number;
  onRetry?: () => void;
};

export function SectionError({
  label = "Failed to load",
  height = 90,
  onRetry,
  className,
  ...props
}: SectionErrorProps): ReactElement {
  return (
    <div
      className={cn("ds-section-error", className)}
      role="status"
      aria-label={label}
      style={{ height }}
      {...props}
    >
      <Icon name="info" size={18} stroke="var(--color-metric-red)" aria-hidden />
      <span className="ds-section-error__label">{label}</span>
      {onRetry ? (
        <button type="button" className="ds-section-error__retry" onClick={onRetry}>
          Retry →
        </button>
      ) : null}
    </div>
  );
}

// ── MedicalNote ───────────────────────────────────────────────

export type MedicalNoteProps = HTMLAttributes<HTMLElement> & {
  children?: ReactNode;
};

export function MedicalNote({
  children,
  className,
  ...props
}: MedicalNoteProps): ReactElement {
  return (
    <p
      className={cn("ds-medical-note", className)}
      role="note"
      {...props}
    >
      <Icon name="info" size={13} stroke="var(--color-text-muted)" aria-hidden />
      <span className="ds-medical-note__text">
        {children ?? "Not a clinical assessment — only your self-reported check-ins."}
      </span>
    </p>
  );
}

// ── ChangeBanner (indigo "change via chat") ──────────────────

export type ChangeBannerProps = HTMLAttributes<HTMLElement> & {
  chatHref?: string;
  ctaLabel?: string;
};

export function ChangeBanner({
  chatHref = "/chat",
  ctaLabel = "Open chat",
  className,
  ...props
}: ChangeBannerProps): ReactElement {
  return (
    <aside
      className={cn("ds-change-banner", className)}
      role="note"
      aria-label="View-only plan"
      {...props}
    >
      <div className="ds-change-banner__icon-box" aria-hidden="true">
        <Icon name="lock" size={15} stroke="var(--color-metric-indigo)" />
      </div>
      <p className="ds-change-banner__text">
        <span className="ds-change-banner__title">View-only plan. </span>
        <span className="ds-change-banner__sub">
          Your coach makes changes — tell them in chat what you want to adjust.
        </span>
      </p>
      <Link href={chatHref} className="ds-change-banner__cta">
        {ctaLabel}
      </Link>
    </aside>
  );
}

// ── DailyExecCard (colored CTA → Today) ──────────────────────

export type DailyExecCardColor = "blue" | "green" | "amber" | "indigo" | "red";

const COLOR_MAP: Record<DailyExecCardColor, string> = {
  blue: "var(--color-metric-blue)",
  green: "var(--color-metric-green)",
  amber: "var(--color-metric-amber)",
  indigo: "var(--color-metric-indigo)",
  red: "var(--color-metric-red)",
};

const COLOR_RAW: Record<DailyExecCardColor, { bg: string; border: string; iconBg: string; ctaBg: string; ctaBorder: string }> = {
  blue: {
    bg: "rgba(58,141,255,0.05)",
    border: "rgba(58,141,255,0.2)",
    iconBg: "rgba(58,141,255,0.12)",
    ctaBg: "rgba(58,141,255,0.10)",
    ctaBorder: "rgba(58,141,255,0.28)",
  },
  green: {
    bg: "rgba(25,195,125,0.05)",
    border: "rgba(25,195,125,0.2)",
    iconBg: "rgba(25,195,125,0.12)",
    ctaBg: "rgba(25,195,125,0.10)",
    ctaBorder: "rgba(25,195,125,0.28)",
  },
  amber: {
    bg: "rgba(245,165,36,0.05)",
    border: "rgba(245,165,36,0.2)",
    iconBg: "rgba(245,165,36,0.12)",
    ctaBg: "rgba(245,165,36,0.10)",
    ctaBorder: "rgba(245,165,36,0.28)",
  },
  indigo: {
    bg: "rgba(123,123,255,0.05)",
    border: "rgba(123,123,255,0.2)",
    iconBg: "rgba(123,123,255,0.12)",
    ctaBg: "rgba(123,123,255,0.10)",
    ctaBorder: "rgba(123,123,255,0.28)",
  },
  red: {
    bg: "rgba(240,80,106,0.05)",
    border: "rgba(240,80,106,0.2)",
    iconBg: "rgba(240,80,106,0.12)",
    ctaBg: "rgba(240,80,106,0.10)",
    ctaBorder: "rgba(240,80,106,0.28)",
  },
};

export type DailyExecCardProps = HTMLAttributes<HTMLElement> & {
  icon: IconName;
  color: DailyExecCardColor;
  title: string;
  text?: string;
  cta?: string;
  todayHref?: string;
};

export function DailyExecCard({
  icon,
  color,
  title,
  text,
  cta = "Go to Today",
  todayHref = "/today",
  className,
  ...props
}: DailyExecCardProps): ReactElement {
  const colorVar = COLOR_MAP[color];
  const raw = COLOR_RAW[color];

  return (
    <aside
      className={cn("ds-exec-card", className)}
      role="note"
      style={{ background: raw.bg, borderColor: raw.border }}
      {...props}
    >
      <div
        className="ds-exec-card__icon-box"
        aria-hidden="true"
        style={{ background: raw.iconBg }}
      >
        <Icon name={icon} size={20} stroke={colorVar} />
      </div>
      <div className="ds-exec-card__body">
        <p className="ds-exec-card__title">{title}</p>
        {text ? <p className="ds-exec-card__text">{text}</p> : null}
      </div>
      <Link
        href={todayHref}
        className="ds-exec-card__cta"
        style={{ color: colorVar, background: raw.ctaBg, borderColor: raw.ctaBorder }}
      >
        {cta}
      </Link>
    </aside>
  );
}

// ── RevisionFacts (accent top-border, "why this version") ────

export type RevisionFactItem = {
  label: string;
  value: string;
};

export type RevisionFactsProps = HTMLAttributes<HTMLElement> & {
  rev?: string;
  when?: string;
  source?: string;
  why?: string;
  accent?: string;
  facts?: readonly RevisionFactItem[];
};

export function RevisionFacts({
  rev = "v1",
  when,
  source,
  why,
  accent = "var(--color-metric-blue)",
  facts,
  className,
  ...props
}: RevisionFactsProps): ReactElement {
  const defaultFacts: RevisionFactItem[] = [
    ...(when ? [{ label: "Updated", value: when }] : []),
    ...(source ? [{ label: "Source", value: source }] : []),
    { label: "Version", value: rev },
  ];
  const displayFacts = facts ?? defaultFacts;

  return (
    <div
      className={cn("ds-revision-facts", className)}
      style={{ borderTopColor: accent }}
      role="region"
      aria-label="Why this version"
      {...props}
    >
      <div className="ds-revision-facts__header">
        <Icon name="info" size={16} stroke={accent} aria-hidden />
        <span className="ds-revision-facts__label">Why this version</span>
        <span className="ds-revision-facts__chip" style={{ background: `${accent}22`, color: accent }}>
          {rev} · active
        </span>
      </div>
      <div className="ds-revision-facts__body">
        {why ? <p className="ds-revision-facts__why">{why}</p> : null}
        {displayFacts.length > 0 ? (
          <dl className="ds-revision-facts__row">
            {displayFacts.map(({ label, value }) => (
              <div key={label}>
                <dt className="ds-revision-facts__item-label">{label}</dt>
                <dd className="ds-revision-facts__item-value">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </div>
  );
}

// ── RevisionHistoryDark (collapsible, active row highlighted) ──

export type RevisionHistoryRow = {
  rev: string;
  when: string;
  note: string;
  active?: boolean;
};

export type RevisionHistoryDarkProps = HTMLAttributes<HTMLDetailsElement> & {
  rows: readonly RevisionHistoryRow[];
  defaultOpen?: boolean;
  footerNote?: string;
};

export function RevisionHistoryDark({
  rows,
  defaultOpen = false,
  footerNote = "Past sessions remain tied to the plan version that was active at the time.",
  className,
  ...props
}: RevisionHistoryDarkProps): ReactElement {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className={cn("ds-revision-history", className)}
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      {...props}
    >
      <summary className="ds-revision-history__summary">
        <Icon name="doc" size={16} stroke="var(--color-text-muted)" aria-hidden />
        <span className="ds-revision-history__summary-title">Plan version history</span>
        <span className="ds-revision-history__summary-count">{rows.length} versions</span>
        <Icon
          name="chevR"
          size={16}
          stroke="var(--color-text-muted)"
          className="ds-revision-history__chevron"
          aria-hidden
        />
      </summary>

      {open ? (
        <div>
          <hr className="ds-revision-history__divider" />
          {rows.map((row) => (
            <div
              key={row.rev}
              className={cn(
                "ds-revision-history__row",
                row.active && "ds-revision-history__row--active",
              )}
            >
              <span
                className={cn(
                  "ds-revision-history__rev-chip",
                  row.active
                    ? "ds-revision-history__rev-chip--active"
                    : "ds-revision-history__rev-chip--inactive",
                )}
              >
                {row.rev}
              </span>
              <span
                className={cn(
                  "ds-revision-history__note",
                  row.active && "ds-revision-history__note--active",
                )}
              >
                {row.note}
              </span>
              {row.active ? (
                <span className="ds-revision-history__active-chip" aria-label="active version">
                  active
                </span>
              ) : null}
              <span className="ds-revision-history__when">{row.when}</span>
            </div>
          ))}
          {footerNote ? (
            <p className="ds-revision-history__footer">{footerNote}</p>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
