"use client";

import {
  chatAttachmentStatusLabel,
  resolveAttachmentDisplayStatus,
  revokeChatAttachmentPreviewUrl,
  type ChatComposerAttachmentDraft,
} from "../../lib/chat-attachment-ui-state";
import { AttachmentPreviewThumb } from "../ui";

type ChatComposerAttachmentsProps = {
  attachments: readonly ChatComposerAttachmentDraft[];
  disabled?: boolean;
  onAttachmentsChange: (attachments: ChatComposerAttachmentDraft[]) => void;
};

export function ChatComposerAttachments({
  attachments,
  disabled = false,
  onAttachmentsChange,
}: ChatComposerAttachmentsProps) {
  const removeAttachment = (localId: string) => {
    const draft = attachments.find((attachment) => attachment.localId === localId);
    if (draft) {
      revokeChatAttachmentPreviewUrl(draft);
    }

    onAttachmentsChange(attachments.filter((attachment) => attachment.localId !== localId));
  };

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="chat-composer-attachments">
      <ul
        className="chat-composer-attachments__chips"
        aria-label="Selected attachments"
        aria-live="polite"
        aria-relevant="additions removals"
      >
        {attachments.map((attachment) => {
          const displayStatus = resolveAttachmentDisplayStatus(attachment);
          const isProcessing = attachment.phase === "uploading";
          const nameId = `attachment-name-${attachment.localId}`;

          return (
            <li
              key={attachment.localId}
              className="chat-composer-attachments__chip-item"
              role="group"
              aria-labelledby={nameId}
              aria-busy={isProcessing || undefined}
            >
              <div className="chat-composer-attachments__chip">
                <AttachmentPreviewThumb
                  previewUrl={attachment.previewUrl}
                  fileName={attachment.file.name}
                  thumbClassName="chat-composer-attachments__chip-thumb"
                  iconClassName="chat-composer-attachments__chip-icon"
                />
                <span
                  id={nameId}
                  className="chat-composer-attachments__chip-label"
                  title={attachment.file.name}
                >
                  {attachment.file.name}
                </span>
                {isProcessing ? (
                  <span className="chat-composer-attachments__chip-status" role="status">
                    {chatAttachmentStatusLabel(displayStatus)}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="chat-composer-attachments__chip-remove"
                  disabled={disabled || attachment.phase === "uploading"}
                  aria-label={`Remove ${attachment.file.name}`}
                  onClick={() => removeAttachment(attachment.localId)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>

              {attachment.localValidationError ? (
                <p className="form-error" role="alert">
                  {attachment.localValidationError}
                </p>
              ) : null}

              {attachment.error ? (
                <p className="form-error" role="alert">
                  {attachment.error}
                </p>
              ) : null}

              {attachment.record?.failureReason ? (
                <p className="form-error" role="status">
                  {attachment.record.failureReason}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
