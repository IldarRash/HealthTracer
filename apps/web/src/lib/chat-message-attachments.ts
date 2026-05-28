import { z } from "zod";
import {
  chatMessageAttachmentDisplaySchema,
  isChatAttachmentImageMimeType,
  parseChatMessageAttachmentRefIds,
  type ChatMessage,
} from "@health/types";
import type { OptimisticChatMessage } from "./chat-ui-state.js";

const optimisticAttachmentDisplaySchema = chatMessageAttachmentDisplaySchema.extend({
  previewUrl: z.string().nullable().optional(),
});

export type ChatMessageAttachmentPreview = {
  attachmentRefId: string;
  filename: string;
  mimeType: string;
  previewUrl: string | null;
};

const OPTIMISTIC_ATTACHMENT_DISPLAYS_KEY = "optimisticAttachmentDisplays";

const ATTACHMENT_SUMMARY_LINE_PATTERN =
  /^\[(?:\d+ attachments?:|Attachment:)/i;

const DEFAULT_ATTACHMENT_ONLY_MESSAGE = "Shared attachment(s) for coaching review.";

export function buildChatAttachmentContentPath(attachmentId: string): string {
  return `/chat/attachments/${encodeURIComponent(attachmentId)}/content`;
}

export function resolveChatMessageAttachmentPreviews(
  message: Pick<ChatMessage, "metadata"> | OptimisticChatMessage,
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
        },
      ];
    });
  }

  return parseChatMessageAttachmentRefIds(message.metadata).map((attachmentRefId) => ({
    attachmentRefId,
    filename: "",
    mimeType: "",
    previewUrl: null,
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
