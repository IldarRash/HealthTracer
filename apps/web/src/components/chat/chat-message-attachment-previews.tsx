"use client";

import { useAuth } from "@clerk/nextjs";
import { isChatAttachmentImageMimeType } from "@health/types";
import { useEffect, useMemo, useState } from "react";
import { fetchChatAttachmentContentBlob, getChatAttachment } from "../../lib/api";
import {
  isImageAttachmentPreview,
  type ChatMessageAttachmentPreview,
} from "../../lib/chat-message-attachments";
import { AttachmentPreviewThumb } from "../ui";

type LoadedPreview = ChatMessageAttachmentPreview & {
  resolvedPreviewUrl: string | null;
};

type ChatMessageAttachmentPreviewsProps = {
  previews: readonly ChatMessageAttachmentPreview[];
};

export function ChatMessageAttachmentPreviews({
  previews,
}: ChatMessageAttachmentPreviewsProps) {
  const { getToken } = useAuth();
  const [loadedPreviews, setLoadedPreviews] = useState<LoadedPreview[]>([]);

  const previewKey = useMemo(
    () =>
      previews
        .map((preview) => `${preview.attachmentRefId}:${preview.previewUrl ?? ""}`)
        .join("|"),
    [previews],
  );

  useEffect(() => {
    if (previews.length === 0) {
      setLoadedPreviews([]);
      return;
    }

    let cancelled = false;
    const objectUrls: string[] = [];

    const loadPreviews = async () => {
      const token = await getToken();
      if (!token) {
        return;
      }

      const resolved = await Promise.all(
        previews.map(async (preview): Promise<LoadedPreview> => {
          if (preview.previewUrl) {
            return { ...preview, resolvedPreviewUrl: preview.previewUrl };
          }

          let filename = preview.filename;
          let mimeType = preview.mimeType;

          if (!filename || !mimeType) {
            const recordResult = await getChatAttachment(token, preview.attachmentRefId);
            if (recordResult.data) {
              filename = recordResult.data.filename;
              mimeType = recordResult.data.mimeType;
            }
          }

          if (!mimeType || !isChatAttachmentImageMimeType(mimeType)) {
            return {
              ...preview,
              filename: filename || "Attachment",
              mimeType: mimeType || "application/octet-stream",
              resolvedPreviewUrl: null,
            };
          }

          const contentResult = await fetchChatAttachmentContentBlob(
            token,
            preview.attachmentRefId,
          );

          if (!contentResult.data) {
            return {
              ...preview,
              filename: filename || "Attachment",
              mimeType,
              resolvedPreviewUrl: null,
            };
          }

          const objectUrl = URL.createObjectURL(contentResult.data);
          objectUrls.push(objectUrl);

          return {
            ...preview,
            filename: filename || "Attachment",
            mimeType,
            resolvedPreviewUrl: objectUrl,
          };
        }),
      );

      if (!cancelled) {
        setLoadedPreviews(resolved);
      } else {
        for (const objectUrl of objectUrls) {
          URL.revokeObjectURL(objectUrl);
        }
      }
    };

    void loadPreviews();

    return () => {
      cancelled = true;
      for (const objectUrl of objectUrls) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [getToken, previewKey, previews]);

  if (previews.length === 0) {
    return null;
  }

  const items =
    loadedPreviews.length > 0
      ? loadedPreviews
      : previews.map((preview) => ({ ...preview, resolvedPreviewUrl: preview.previewUrl }));

  return (
    <ul className="chat-message-attachments" aria-label="Message attachments">
      {items.map((preview) => {
        const previewUrl = preview.resolvedPreviewUrl;
        const filename = preview.filename || "Attachment";
        const showImage =
          isImageAttachmentPreview(preview) && Boolean(previewUrl);

        return (
          <li key={preview.attachmentRefId} className="chat-message-attachments__item">
            {showImage ? (
              <AttachmentPreviewThumb
                previewUrl={previewUrl}
                fileName={filename}
                thumbClassName="chat-message-attachments__thumb"
                iconClassName="chat-message-attachments__file-icon"
              />
            ) : (
              <span className="chat-message-attachments__chip">{filename}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
