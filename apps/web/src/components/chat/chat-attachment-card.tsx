"use client";

import { useTranslations } from "next-intl";
import type { ChatMessageAttachmentPreview } from "../../lib/chat-message-attachments";

/**
 * ChatAttachmentCard — visual card for a single attachment in a chat message.
 *
 * Three visual variants:
 *  - "image": inline thumbnail wrapped in a rounded card frame.
 *  - "file": file icon + filename + optional category badge.
 *  - "unavailable": muted status card with filename and reason label.
 *
 * The component is a pure presentation leaf — all classification logic stays
 * in the caller (chat-message-attachment-previews.tsx).
 */

type ImageCardProps = {
  variant: "image";
  previewUrl: string;
  fileName: string;
};

type FileCardProps = {
  variant: "file";
  fileName: string;
  categoryLabel?: string | null;
};

type UnavailableCardProps = {
  variant: "unavailable";
  fileName: string;
  categoryLabel?: string | null;
  statusLabel: string;
};

export type ChatAttachmentCardProps =
  | ImageCardProps
  | FileCardProps
  | UnavailableCardProps;

export function ChatAttachmentCard(props: ChatAttachmentCardProps) {
  if (props.variant === "image") {
    return (
      <span className="chat-attachment-card chat-attachment-card--image">
        <img
          src={props.previewUrl}
          alt={props.fileName}
          className="chat-attachment-card__thumb"
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }

  if (props.variant === "unavailable") {
    const { fileName, categoryLabel, statusLabel } = props;
    return (
      <span
        className="chat-attachment-card chat-attachment-card--unavailable"
        aria-label={`${fileName}${categoryLabel ? `, ${categoryLabel}` : ""}, ${statusLabel}`}
      >
        <UnavailableIcon />
        <span className="chat-attachment-card__name">{fileName}</span>
        {categoryLabel ? (
          <span className="chat-attachment-card__category">{categoryLabel}</span>
        ) : null}
        <span className="chat-attachment-card__status">{statusLabel}</span>
      </span>
    );
  }

  // variant === "file"
  const { fileName, categoryLabel } = props;
  return (
    <span
      className="chat-attachment-card chat-attachment-card--file"
      aria-label={`${fileName}${categoryLabel ? `, ${categoryLabel}` : ""}`}
    >
      <FileIcon />
      <span className="chat-attachment-card__name">{fileName}</span>
      {categoryLabel ? (
        <span className="chat-attachment-card__category">{categoryLabel}</span>
      ) : null}
    </span>
  );
}

function FileIcon() {
  return (
    <svg
      className="chat-attachment-card__icon"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function UnavailableIcon() {
  return (
    <svg
      className="chat-attachment-card__icon chat-attachment-card__icon--unavailable"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/**
 * ChatUnavailableAttachmentCard — convenience wrapper that auto-renders the
 * "unavailable" variant with the i18n label from the Chat namespace.
 *
 * Used by chat-message-attachment-previews when the attachment is in a
 * genuinely-unavailable state and no custom status label is provided.
 */
export function ChatUnavailableAttachmentCard({
  preview,
}: {
  preview: ChatMessageAttachmentPreview;
}) {
  const t = useTranslations("Chat");
  const fileName = preview.filename || "Attachment";
  return (
    <ChatAttachmentCard
      variant="unavailable"
      fileName={fileName}
      statusLabel={t("attachmentUnavailable")}
    />
  );
}
