import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type ChatBubbleRole = "user" | "assistant";
type ChatBubbleVariant = "default" | "coach" | "crisis";

type ChatBubbleProps = HTMLAttributes<HTMLDivElement> & {
  role: ChatBubbleRole;
  variant?: ChatBubbleVariant;
  meta?: ReactNode;
  children: ReactNode;
};

const variantClassName: Record<ChatBubbleVariant, string | undefined> = {
  default: undefined,
  coach: "chat-bubble--coach",
  crisis: "chat-bubble--coach chat-bubble--crisis",
};

export function ChatBubble({
  role,
  variant = role === "assistant" ? "coach" : "default",
  meta,
  children,
  className,
  ...props
}: ChatBubbleProps) {
  return (
    <div
      className={cn(
        "chat-bubble",
        `chat-bubble--${role}`,
        variantClassName[variant],
        className,
      )}
      {...props}
    >
      {meta ? <div className="chat-bubble__meta">{meta}</div> : null}
      <div className="chat-bubble__content">{children}</div>
    </div>
  );
}

type ChatTranscriptProps = HTMLAttributes<HTMLUListElement> & {
  live?: "off" | "polite" | "assertive";
  label?: string;
};

export function ChatTranscript({
  className,
  live = "polite",
  label = "Coaching conversation",
  ...props
}: ChatTranscriptProps) {
  return (
    <ul
      className={cn("chat-transcript", className)}
      aria-live={live}
      aria-label={label}
      {...props}
    />
  );
}

type ChatComposerProps = HTMLAttributes<HTMLFormElement> & {
  label?: string;
};

export function ChatComposer({
  className,
  label = "Message composer",
  ...props
}: ChatComposerProps) {
  return (
    <form className={cn("chat-composer", className)} aria-label={label} {...props} />
  );
}

type ChatThinkingIndicatorProps = HTMLAttributes<HTMLDivElement>;

export function ChatThinkingIndicator({ className, ...props }: ChatThinkingIndicatorProps) {
  return (
    <div
      className={cn("chat-thinking", className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      {...props}
    >
      <span className="state-message__spinner" aria-hidden="true" />
      <span>Your coach is thinking…</span>
    </div>
  );
}
