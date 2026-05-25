import Link from "next/link";
import {
  type ButtonHTMLAttributes,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { buildPromptChipLinkAriaLabel } from "../../lib/prompt-chip-ui-state";
import { cn } from "../../lib/utils";

type PromptChipProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function PromptChip({ className, type = "button", ...props }: PromptChipProps) {
  return (
    <button
      type={type}
      role="listitem"
      className={cn("chat-prompt-chip", className)}
      {...props}
    />
  );
}

type PromptChipLinkProps = ComponentProps<typeof Link> & {
  /** Used for `aria-label` when children are not plain text. */
  promptLabel?: string;
};

export function PromptChipLink({
  className,
  children,
  promptLabel,
  href,
  ...props
}: PromptChipLinkProps) {
  const ariaLabel = buildPromptChipLinkAriaLabel({ href, promptLabel, children });

  return (
    <Link
      role="listitem"
      className={cn("chat-prompt-chip", className)}
      href={href}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </Link>
  );
}

type PromptChipListProps = HTMLAttributes<HTMLDivElement> & {
  label?: string;
  children: ReactNode;
};

export function PromptChipList({
  label = "Suggested prompts",
  className,
  children,
  ...props
}: PromptChipListProps) {
  return (
    <div
      className={cn("chat-prompt-chips", className)}
      role="list"
      aria-label={label}
      {...props}
    >
      {children}
    </div>
  );
}
