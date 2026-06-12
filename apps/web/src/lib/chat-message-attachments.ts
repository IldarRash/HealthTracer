import { z } from "zod";
import {
  chatMessageAttachmentDisplaySchema,
  isChatAttachmentImageMimeType,
  parseChatMessageAttachmentRefIds,
  type ChatAttachmentCategory,
  type ChatAttachmentStatus,
  type ChatMessage,
} from "@health/types";
import type { OptimisticChatMessage } from "./chat-ui-state.js";

// Note: chatMessageAttachmentDisplaySchema is .strict(). Using .strip() before
// .extend() so that the optimistic schema accepts (and strips) the extra runtime
// fields (category, status, hasViewableContent) that ChatMessageAttachmentPreview
// carries but the optimistic display persists without.
const optimisticAttachmentDisplaySchema = chatMessageAttachmentDisplaySchema.strip().extend({
  previewUrl: z.string().nullable().optional(),
});

export type ChatMessageAttachmentPreview = {
  attachmentRefId: string;
  filename: string;
  mimeType: string;
  previewUrl: string | null;
  /** Populated for persisted messages from the server-provided display metadata. */
  category: ChatAttachmentCategory | null;
  /** Populated for persisted messages from the server-provided display metadata. */
  status: ChatAttachmentStatus | null;
  /**
   * Server-computed flag: true only when the attachment has viewable content
   * (non-null storageKey, image MIME, not expired). When false, no /content
   * request should be made.
   */
  hasViewableContent: boolean;
};

const OPTIMISTIC_ATTACHMENT_DISPLAYS_KEY = "optimisticAttachmentDisplays";

const ATTACHMENT_SUMMARY_LINE_PATTERN =
  /^\[(?:\d+ attachments?:|Attachment:)/i;

const DEFAULT_ATTACHMENT_ONLY_MESSAGE = "Shared attachment(s) for coaching review.";

/**
 * Web-origin path for an attachment image used directly as an <img src>.
 *
 * A plain <img> cannot attach the Clerk bearer token, so this points at the
 * dedicated server-side proxy route (app/api-proxy/chat/attachments/[attachmentId]/content)
 * which mints the token from the session cookie and forwards to the API's
 * GET /chat/attachments/:id/content. Ownership stays enforced by the API.
 */
export function buildChatAttachmentContentPath(attachmentId: string): string {
  return `/api-proxy/chat/attachments/${encodeURIComponent(attachmentId)}/content`;
}

export function resolveChatMessageAttachmentPreviews(
  message: Pick<ChatMessage, "metadata" | "attachments"> | OptimisticChatMessage,
): ChatMessageAttachmentPreview[] {
  if ("optimistic" in message && message.optimistic) {
    const raw = message.metadata[OPTIMISTIC_ATTACHMENT_DISPLAYS_KEY];

    if (!Array.isArray(raw)) {
      return [];
    }

    return raw.flatMap((entry) => {
      const parsed = optimisticAttachmentDisplaySchema.safeParse(entry);

      if (!parsed.success) {
        return [];
      }

      return [
        {
          attachmentRefId: parsed.data.attachmentRefId,
          filename: parsed.data.filename,
          mimeType: parsed.data.mimeType,
          previewUrl: parsed.data.previewUrl ?? null,
          category: null,
          status: null,
          hasViewableContent: false,
        },
      ];
    });
  }

  // Persisted branch: use the server-provided display metadata on the message.
  // This avoids the per-render N×2 getChatAttachment + fetchChatAttachmentContentBlob
  // fallback. previewUrl is set only when the server confirms the attachment is
  // viewable (hasViewableContent=true) and the MIME type is an image.
  //
  // After the early-return optimistic guard above, `message` is still typed as
  // the full union at the TypeScript level.  We narrow explicitly here.
  const persistedMessage = message as Pick<ChatMessage, "metadata" | "attachments">;
  const serverAttachments = persistedMessage.attachments ?? [];

  if (serverAttachments.length > 0) {
    return serverAttachments.map((att: ChatMessage["attachments"][number]) => ({
      attachmentRefId: att.attachmentRefId,
      filename: att.filename,
      mimeType: att.mimeType,
      category: att.category,
      status: att.status,
      hasViewableContent: att.hasViewableContent,
      previewUrl:
        att.hasViewableContent && isChatAttachmentImageMimeType(att.mimeType)
          ? buildChatAttachmentContentPath(att.attachmentRefId)
          : null,
    }));
  }

  // Fallback: no server metadata yet — derive ref IDs from metadata so the
  // message at least shows attachment chips with no content.
  return parseChatMessageAttachmentRefIds(persistedMessage.metadata).map((attachmentRefId) => ({
    attachmentRefId,
    filename: "",
    mimeType: "",
    previewUrl: null,
    category: null,
    status: null,
    hasViewableContent: false,
  }));
}

export function resolveChatMessageTextContent(
  content: string,
  attachmentPreviews: readonly ChatMessageAttachmentPreview[],
): string {
  const trimmed = content.trim();

  if (attachmentPreviews.length === 0) {
    return trimmed;
  }

  if (trimmed === DEFAULT_ATTACHMENT_ONLY_MESSAGE) {
    return "";
  }

  return trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !ATTACHMENT_SUMMARY_LINE_PATTERN.test(line))
    .join("\n")
    .trim();
}

export function isImageAttachmentPreview(
  preview: Pick<ChatMessageAttachmentPreview, "mimeType">,
): boolean {
  return preview.mimeType.length > 0 && isChatAttachmentImageMimeType(preview.mimeType);
}
