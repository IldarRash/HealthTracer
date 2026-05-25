import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/utils";

export type ChatMetadataPanelTone = "neutral" | "notice" | "crisis";

type ChatMetadataPanelProps = HTMLAttributes<HTMLElement> & {
  title: string;
  titleId: string;
  tone?: ChatMetadataPanelTone;
  children: ReactNode;
};

export function ChatMetadataPanel({
  title,
  titleId,
  tone = "neutral",
  children,
  className,
  ...props
}: ChatMetadataPanelProps) {
  return (
    <aside
      className={cn(
        "chat-metadata-panel",
        tone !== "neutral" && `chat-metadata-panel--${tone}`,
        className,
      )}
      role="region"
      aria-labelledby={titleId}
      {...props}
    >
      <h3 id={titleId} className="chat-metadata-panel__title section-label">
        {title}
      </h3>
      <div className="chat-metadata-panel__body">{children}</div>
    </aside>
  );
}
