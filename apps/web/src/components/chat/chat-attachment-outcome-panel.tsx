"use client";

import type { ChatAttachmentOutcomeDisplay } from "../../lib/chat-attachment-ui-state";
import {
  chatAttachmentCategoryLabel,
  chatAttachmentStatusBadgeTone,
  chatAttachmentStatusLabel,
  resolveAttachmentOutcomeFallbackCopy,
} from "../../lib/chat-attachment-ui-state";
import {
  AttachmentStatusBadge,
  ChatMetadataPanel,
} from "../ui";

type ChatAttachmentOutcomePanelProps = {
  outcomes: readonly ChatAttachmentOutcomeDisplay[];
  titleId: string;
};

export function ChatAttachmentOutcomePanel({
  outcomes,
  titleId,
}: ChatAttachmentOutcomePanelProps) {
  if (outcomes.length === 0) {
    return null;
  }

  return (
    <ChatMetadataPanel
      title="Attachment results"
      titleId={titleId}
      tone="notice"
      className="chat-attachment-outcomes"
    >
      <ul className="chat-attachment-outcomes__list" aria-label="Attachment results">
        {outcomes.map((outcome) => {
          const fallbackCopy = resolveAttachmentOutcomeFallbackCopy(outcome);
          const statusLabel = chatAttachmentStatusLabel(outcome.status);
          const outcomeLabel = chatAttachmentCategoryLabel(outcome.category);

          return (
            <li
              key={outcome.attachmentRefId}
              className="chat-attachment-outcomes__item"
              role="group"
              aria-label={`${outcomeLabel} attachment result`}
            >
              <div className="chat-attachment-outcomes__header">
                <span className="chat-attachment-outcomes__category">{outcomeLabel}</span>
                <AttachmentStatusBadge
                  label={statusLabel}
                  tone={chatAttachmentStatusBadgeTone(outcome.status)}
                  contextLabel={outcomeLabel}
                />
              </div>

              {fallbackCopy ? (
                <p className="chat-attachment-outcomes__fallback" role="status">
                  {fallbackCopy}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </ChatMetadataPanel>
  );
}
