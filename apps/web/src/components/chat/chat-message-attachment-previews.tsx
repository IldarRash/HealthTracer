"use client";

import {
  isImageAttachmentPreview,
  type ChatMessageAttachmentPreview,
} from "../../lib/chat-message-attachments";
import { AttachmentPreviewThumb } from "../ui";

type ChatMessageAttachmentPreviewsProps = {
  previews: readonly ChatMessageAttachmentPreview[];
};

/**
 * Renders attachment previews on a persisted or optimistic chat message.
 *
 * Three cases:
 *  1. Image with viewable content (hasViewableContent=true, image MIME):
 *     inline thumbnail via the /content URL supplied in previewUrl.
 *  2. Non-image file (e.g. PDF/text) that is present:
 *     filename + category chip only — no /content request, no status label.
 *  3. Genuinely unavailable (needs_consent / failed / unsupported, or an image
 *     whose content is purged/expired — hasViewableContent=false with image MIME):
 *     a clear, non-error placeholder chip with filename, category, and status label.
 *
 * The dead per-render lazy metadata/blob fallback has been removed. Previews
 * now come from server-provided display metadata (message.attachments) or from
 * the optimistic blob previewUrl, with at most one /content GET per viewable image.
 */
export function ChatMessageAttachmentPreviews({
  previews,
}: ChatMessageAttachmentPreviewsProps) {
  if (previews.length === 0) {
    return null;
  }

  return (
    <ul className="chat-message-attachments" aria-label="Message attachments">
      {previews.map((preview) => (
        <li key={preview.attachmentRefId} className="chat-message-attachments__item">
          <AttachmentPreviewItem preview={preview} />
        </li>
      ))}
    </ul>
  );
}

function AttachmentPreviewItem({ preview }: { preview: ChatMessageAttachmentPreview }) {
  const filename = preview.filename || "Attachment";

  // Case 1: image with viewable content — inline thumbnail via /content URL.
  if (isImageAttachmentPreview(preview) && preview.previewUrl) {
    return (
      <AttachmentPreviewThumb
        previewUrl={preview.previewUrl}
        fileName={filename}
        thumbClassName="chat-message-attachments__thumb"
        iconClassName="chat-message-attachments__file-icon"
      />
    );
  }

  // Case 3: genuinely unavailable — render a non-error status chip.
  // This applies when:
  //   (a) the file has a terminal unavailability status (needs_consent / failed / unsupported), OR
  //   (b) the MIME type is an image but hasViewableContent is false (purged/expired image).
  // A non-image file (e.g. ready PDF) has hasViewableContent=false by design because the
  // /content endpoint is images-only; that is NOT an unavailability condition for non-images.
  if (isGenuinelyUnavailable(preview)) {
    const statusLabel = resolveAttachmentStatusLabel(preview.status);
    const categoryLabel = preview.category
      ? resolveAttachmentCategoryLabel(preview.category)
      : null;

    return (
      <span
        className="chat-message-attachments__chip chat-message-attachments__chip--unavailable"
        aria-label={`${filename}${categoryLabel ? `, ${categoryLabel}` : ""}, ${statusLabel}`}
      >
        <span className="chat-message-attachments__chip-name">{filename}</span>
        {categoryLabel ? (
          <span className="chat-message-attachments__chip-category">{categoryLabel}</span>
        ) : null}
        <span className="chat-message-attachments__chip-status">{statusLabel}</span>
      </span>
    );
  }

  // Case 2: non-image file, or viewable content without a previewUrl
  // (e.g. optimistic preview that cleared). Show filename + category chip only.
  const categoryLabel = preview.category
    ? resolveAttachmentCategoryLabel(preview.category)
    : null;

  return (
    <span
      className="chat-message-attachments__chip"
      aria-label={`${filename}${categoryLabel ? `, ${categoryLabel}` : ""}`}
    >
      <span className="chat-message-attachments__chip-name">{filename}</span>
      {categoryLabel ? (
        <span className="chat-message-attachments__chip-category">{categoryLabel}</span>
      ) : null}
    </span>
  );
}

/**
 * Returns true when an attachment is genuinely unavailable and should show a
 * status-labeled chip rather than a plain file chip.
 *
 * Unavailable means one of:
 *   (a) A status that signals the content is gone or blocked:
 *       needs_consent (purged for consent), failed, or unsupported.
 *   (b) An image file whose server-computed hasViewableContent is false —
 *       meaning the image content has been purged or expired.
 *
 * A NON-image file (e.g. a ready PDF) always has hasViewableContent=false
 * because /content is images-only. That is NOT an unavailability condition;
 * those files fall through to the plain file chip (Case 2).
 */
function isGenuinelyUnavailable(preview: ChatMessageAttachmentPreview): boolean {
  // Terminal status that signals no content regardless of MIME type.
  if (
    preview.status === "needs_consent" ||
    preview.status === "failed" ||
    preview.status === "unsupported"
  ) {
    return true;
  }

  // Image file with no viewable content means it was purged or expired.
  if (isImageAttachmentPreview(preview) && preview.hasViewableContent === false) {
    return true;
  }

  return false;
}

function resolveAttachmentStatusLabel(status: ChatMessageAttachmentPreview["status"]): string {
  // Only genuinely-unavailable statuses (needs_consent, failed, unsupported) and
  // expired/purged images reach this function. ready/low_confidence/needs_review
  // non-image files are handled by the plain chip (Case 2) and never reach here.
  switch (status) {
    case "needs_consent":
      return "Consent required";
    case "failed":
      return "Upload failed";
    case "unsupported":
      return "Unsupported file";
    case "queued":
    case "uploading":
    case "recognizing":
      return "Processing";
    default:
      return "No longer available";
  }
}

function resolveAttachmentCategoryLabel(
  category: ChatMessageAttachmentPreview["category"],
): string | null {
  switch (category) {
    case "food_photo":
      return "Food photo";
    case "medical_document":
      return "Medical document";
    case "workout_attachment":
      return "Workout attachment";
    case "document_file":
      return "Document file";
    case "unclassified":
    case null:
      return null;
    default:
      return null;
  }
}
