import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

type ChatBubbleProps = HTMLAttributes<HTMLDivElement> & {
  role: "user" | "assistant";
  meta?: ReactNode;
  children: ReactNode;
};

export function ChatBubble({ role, meta, children, className, ...props }: ChatBubbleProps) {
  return (
    <div className={cn("chat-bubble", `chat-bubble--${role}`, className)} {...props}>
      {meta ? <div className="chat-bubble__meta">{meta}</div> : null}
      <div className="chat-bubble__content">{children}</div>
    </div>
  );
}

type ChatTranscriptProps = HTMLAttributes<HTMLUListElement>;

export function ChatTranscript({ className, ...props }: ChatTranscriptProps) {
  return <ul className={cn("chat-transcript", className)} aria-live="polite" {...props} />;
}

type ChatComposerProps = HTMLAttributes<HTMLFormElement>;

export function ChatComposer({ className, ...props }: ChatComposerProps) {
  return <form className={cn("chat-composer", className)} {...props} />;
}
