"use client";

/**
 * PhotoStripMsg — 3-tile photo strip shown on the user's body-analysis photo message.
 *
 * Design spec: body-analysis-chat-flow.md § "ChatBodyUpload — PhotoStripMsg"
 * Shows labelled thumbnails for the three body-photo angles (Спереди / Сбоку / Сзади).
 * Reuses the existing ChatMessageAttachmentPreviews render for the actual thumb content.
 */

import type { ChatMessageAttachmentPreview } from "../../lib/chat-message-attachments";

/** Ordered angle labels for 1→3 photos. */
const ANGLE_LABELS = ["спереди.jpg", "сбоку.jpg", "сзади.jpg"] as const;

type PhotoStripMsgProps = {
  previews: readonly ChatMessageAttachmentPreview[];
  /** Optional caption shown beneath the strip (e.g. "Вот, со всех сторон"). */
  caption?: string;
};

/**
 * Renders a row of up to 3 labelled photo thumbnails for the body-analysis flow.
 * Each tile gets an angle label (Спереди / Сбоку / Сзади) in order.
 * Images that have a previewUrl render as inline thumbnails; others render as chips.
 */
export function PhotoStripMsg({ previews, caption }: PhotoStripMsgProps) {
  if (previews.length === 0) {
    return null;
  }

  return (
    <div className="photo-strip-msg" role="group" aria-label="Body analysis photos">
      <ul className="photo-strip-msg__tiles" aria-label="Photo angles">
        {previews.slice(0, 3).map((preview, index) => {
          const angleLabel = ANGLE_LABELS[index] ?? `photo-${index + 1}.jpg`;
          const displayName = preview.filename || angleLabel;

          return (
            <li key={preview.attachmentRefId} className="photo-strip-msg__tile">
              {preview.previewUrl ? (
                <img
                  src={preview.previewUrl}
                  alt={angleLabel}
                  className="photo-strip-msg__thumb"
                  width={132}
                  height={168}
                />
              ) : (
                <span
                  className="photo-strip-msg__placeholder"
                  aria-label={displayName}
                >
                  <span className="photo-strip-msg__placeholder-icon" aria-hidden="true">
                    &#128247;
                  </span>
                </span>
              )}
              <span className="photo-strip-msg__label">{angleLabel}</span>
            </li>
          );
        })}
      </ul>
      {caption ? <p className="photo-strip-msg__caption">{caption}</p> : null}
    </div>
  );
}
