"use client";

import type { ChangeEvent } from "react";
import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_CATEGORY_HINT,
  createChatComposerAttachmentDraft,
  MAX_CHAT_COMPOSER_ATTACHMENTS,
  type ChatComposerAttachmentDraft,
} from "../../lib/chat-attachment-ui-state";
import { FileInputTrigger } from "../ui";

type ChatComposerAttachmentInputProps = {
  attachments: readonly ChatComposerAttachmentDraft[];
  disabled?: boolean;
  onAttachmentsChange: (attachments: ChatComposerAttachmentDraft[]) => void;
  onProcessDraft: (draft: ChatComposerAttachmentDraft) => void;
};

export function ChatComposerAttachmentInput({
  attachments,
  disabled = false,
  onAttachmentsChange,
  onProcessDraft,
}: ChatComposerAttachmentInputProps) {
  const fileInputDisabled = disabled || attachments.length >= MAX_CHAT_COMPOSER_ATTACHMENTS;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }

    const remainingSlots = MAX_CHAT_COMPOSER_ATTACHMENTS - attachments.length;
    const selected = [...files].slice(0, Math.max(0, remainingSlots));
    const nextDrafts = selected.map((file) => createChatComposerAttachmentDraft(file));

    onAttachmentsChange([...attachments, ...nextDrafts]);

    // Always auto-upload: images upload immediately on select with no gating.
    for (const draft of nextDrafts) {
      if (!draft.localValidationError) {
        onProcessDraft(draft);
      }
    }

    event.target.value = "";
  };

  return (
    <FileInputTrigger
      inputId="chat-attachment-input"
      accept={CHAT_ATTACHMENT_ACCEPT}
      multiple
      disabled={fileInputDisabled}
      labelText="Attach image for coaching context"
      buttonLabel="Attach"
      hintText={CHAT_ATTACHMENT_CATEGORY_HINT}
      className="chat-composer-attachment-input"
      onChange={handleFileChange}
    />
  );
}
