import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type ProposalConfirmationProps = HTMLAttributes<HTMLElement> & {
  status?: "pending" | "accepted" | "rejected" | "valid" | "invalid" | "superseded";
  title: string;
  /** Compact inline card styling for chat transcript proposal summaries. */
  inline?: boolean;
  meta?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export function ProposalConfirmation({
  status = "pending",
  title,
  inline = false,
  meta,
  badges,
  actions,
  children,
  className,
  ...props
}: ProposalConfirmationProps) {
  return (
    <article
      className={cn(
        "confirmation-card",
        "proposal-card",
        "proposal-summary-card",
        `status-${status}`,
        inline && "confirmation-card--inline",
        className,
      )}
      {...props}
    >
      <header className="confirmation-card__header proposal-header">
        <div>
          <strong className="confirmation-card__title">{title}</strong>
          {meta ? <p className="confirmation-card__meta proposal-meta">{meta}</p> : null}
        </div>
        {badges ? <div className="badge-group">{badges}</div> : null}
      </header>
      {children ? <div className="confirmation-card__body">{children}</div> : null}
      {actions ? <div className="confirmation-card__actions action-row proposal-actions">{actions}</div> : null}
    </article>
  );
}
