import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * ProposalFrame — the top-level card wrapper for inline chat proposal cards.
 *
 * Replaces the multi-class soup on ProposalConfirmation with a single semantic
 * primitive. Status variant is applied via a data attribute so CSS can style it
 * without class collision.
 */
export function ProposalFrame({
  status = "pending",
  inline = false,
  children,
  className,
  ...props
}: {
  status?: "pending" | "accepted" | "rejected" | "superseded";
  inline?: boolean;
  children?: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>) {
  return (
    <article
      data-proposal-status={status}
      className={cn(
        "proposal-frame",
        inline && "proposal-frame--inline",
        className,
      )}
      {...props}
    >
      {children}
    </article>
  );
}

/**
 * ProposalFrameHeader — title row with optional meta pill and status badge slot.
 */
export function ProposalFrameHeader({
  title,
  meta,
  badge,
}: {
  title: string;
  meta?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <header className="proposal-frame__header">
      <div className="proposal-frame__title-group">
        <strong className="proposal-frame__title">{title}</strong>
        {meta ? <p className="proposal-frame__meta">{meta}</p> : null}
      </div>
      {badge ? <div className="proposal-frame__badge-slot">{badge}</div> : null}
    </header>
  );
}

/**
 * ProposalWhy — the coach's rationale paragraph ("why" section).
 */
export function ProposalWhy({ children }: { children: ReactNode }) {
  return <p className="proposal-frame__why">{children}</p>;
}

/**
 * ProposalDiffRow — a before/after diff line inside the change summary.
 */
export function ProposalDiffRow({
  label,
  before,
  after,
}: {
  label?: string;
  before?: ReactNode;
  after?: ReactNode;
}) {
  return (
    <div className="proposal-diff-row">
      {label ? <span className="proposal-diff-row__label">{label}</span> : null}
      {before !== undefined ? (
        <span className="proposal-diff-row__before">{before}</span>
      ) : null}
      {after !== undefined ? (
        <span className="proposal-diff-row__after">{after}</span>
      ) : null}
    </div>
  );
}

/**
 * ProposalStateBand — the colored band shown after accept/reject/supersede.
 * Delegates status color to the parent ProposalFrame data-proposal-status attr.
 */
export function ProposalStateBand({
  children,
  role = "status",
}: {
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div className="proposal-state-band" role={role}>
      {children}
    </div>
  );
}
