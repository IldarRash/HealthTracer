import { type HTMLAttributes, type ReactNode, type RefObject } from "react";
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

/** Minimal coach avatar — dark circle with a green brand mark dot. */
function CoachAvatar() {
  return (
    <div className="chat-bubble__avatar" aria-hidden="true">
      {/* brand mark: outer ring fragment + center dot */}
      <svg width="20" height="20" viewBox="0 0 28 28" style={{ display: "block" }}>
        <circle cx="14" cy="14" r="11" fill="none" stroke="#19c37d" strokeWidth="2.4" opacity="0.28" />
        <path d="M14 3a11 11 0 0 1 9.5 5.5" fill="none" stroke="#19c37d" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="14" cy="14" r="3.4" fill="#19c37d" />
      </svg>
    </div>
  );
}

export function ChatBubble({
  role,
  variant = role === "assistant" ? "coach" : "default",
  meta,
  children,
  className,
  ...props
}: ChatBubbleProps) {
  const isAssistant = role === "assistant";

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
      {isAssistant ? (
        <>
          <CoachAvatar />
          <div className="chat-bubble__coach-column">
            {meta ? <div className="chat-bubble__meta">{meta}</div> : null}
            <div className="chat-bubble__content">{children}</div>
          </div>
        </>
      ) : (
        <>
          {meta ? <div className="chat-bubble__meta">{meta}</div> : null}
          <div className="chat-bubble__content">{children}</div>
        </>
      )}
    </div>
  );
}

type ChatTranscriptProps = HTMLAttributes<HTMLUListElement> & {
  live?: "off" | "polite" | "assertive";
  label?: string;
  ref?: RefObject<HTMLUListElement | null>;
};

export function ChatTranscript({
  className,
  live = "polite",
  label = "Coaching conversation",
  ref,
  ...props
}: ChatTranscriptProps) {
  return (
    <ul
      ref={ref}
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
      <span className="chat-thinking__dots" aria-hidden="true">
        <span className="chat-thinking__dot" />
        <span className="chat-thinking__dot chat-thinking__dot--mid" />
        <span className="chat-thinking__dot" />
      </span>
      <span>Your coach is thinking…</span>
    </div>
  );
}
