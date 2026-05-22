import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type StateMessageProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

type StateTone = "empty" | "loading" | "error";

function stateClass(tone: StateTone): string {
  return `state-message state-message--${tone}`;
}

export function EmptyState({ title, description, action, className, ...props }: StateMessageProps) {
  return (
    <div className={cn(stateClass("empty"), className)} role="status" {...props}>
      <p className="state-message__title">{title}</p>
      {description ? <p className="state-message__description">{description}</p> : null}
      {action ? <div className="state-message__action">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ title, description, className, ...props }: StateMessageProps) {
  return (
    <div
      className={cn(stateClass("loading"), className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      {...props}
    >
      <span className="state-message__spinner" aria-hidden="true" />
      <p className="state-message__title">{title}</p>
      {description ? <p className="state-message__description">{description}</p> : null}
    </div>
  );
}

export function ErrorState({ title, description, action, className, ...props }: StateMessageProps) {
  return (
    <div className={cn(stateClass("error"), className)} role="alert" {...props}>
      <p className="state-message__title">{title}</p>
      {description ? <p className="state-message__description">{description}</p> : null}
      {action ? <div className="state-message__action">{action}</div> : null}
    </div>
  );
}
