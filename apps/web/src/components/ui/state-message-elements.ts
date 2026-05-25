import { createElement, type HTMLAttributes, type ReactElement, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type StateMessageProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

type StateTone = "empty" | "loading" | "error";

export function getStateMessageClassName(tone: StateTone): string {
  return `state-message state-message--${tone}`;
}

export function EmptyState({
  title,
  description,
  action,
  className,
  ...props
}: StateMessageProps): ReactElement {
  return createElement(
    "div",
    { className: cn(getStateMessageClassName("empty"), className), role: "status", ...props },
    createElement("p", { className: "state-message__title" }, title),
    description
      ? createElement("p", { className: "state-message__description" }, description)
      : null,
    action ? createElement("div", { className: "state-message__action" }, action) : null,
  );
}

export function LoadingState({
  title,
  description,
  className,
  ...props
}: StateMessageProps): ReactElement {
  return createElement(
    "div",
    {
      className: cn(getStateMessageClassName("loading"), className),
      role: "status",
      "aria-live": "polite",
      "aria-busy": "true",
      ...props,
    },
    createElement("span", { className: "state-message__spinner", "aria-hidden": "true" }),
    createElement("p", { className: "state-message__title" }, title),
    description
      ? createElement("p", { className: "state-message__description" }, description)
      : null,
  );
}

export function ErrorState({
  title,
  description,
  action,
  className,
  ...props
}: StateMessageProps): ReactElement {
  return createElement(
    "div",
    { className: cn(getStateMessageClassName("error"), className), role: "alert", ...props },
    createElement("p", { className: "state-message__title" }, title),
    description
      ? createElement("p", { className: "state-message__description" }, description)
      : null,
    action ? createElement("div", { className: "state-message__action" }, action) : null,
  );
}
