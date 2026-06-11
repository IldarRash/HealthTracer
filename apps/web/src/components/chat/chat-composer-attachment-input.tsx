"use client";

import { useRef, type ChangeEvent } from "react";
import {
  CHAT_ATTACHMENT_ACCEPT,
  createChatComposerAttachmentDraft,
  MAX_CHAT_COMPOSER_ATTACHMENTS,
  type ChatComposerAttachmentDraft,
} from "../../lib/chat-attachment-ui-state";
import { Icon } from "../ui";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isDisabled = disabled || attachments.length >= MAX_CHAT_COMPOSER_ATTACHMENTS;

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
    <div className="chat-composer-attachment-input">
      {/* Hidden file input — triggered by clip icon button */}
      <input
        ref={fileInputRef}
        id="chat-attachment-input"
        className="sr-only"
        type="file"
        accept={CHAT_ATTACHMENT_ACCEPT}
        multiple
        disabled={isDisabled}
        onChange={handleFileChange}
      />
      {/* Hidden camera input — triggers capture on mobile */}
      <input
        ref={cameraInputRef}
        id="chat-camera-input"
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        disabled={isDisabled}
        onChange={handleFileChange}
      />
      <button
        type="button"
        className="chat-composer-icon-btn"
        disabled={isDisabled}
        aria-label="Attach file"
        onClick={() => fileInputRef.current?.click()}
      >
        <Icon name="clip" size={18} aria-hidden />
      </button>
      <button
        type="button"
        className="chat-composer-icon-btn"
        disabled={isDisabled}
        aria-label="Take photo"
        onClick={() => cameraInputRef.current?.click()}
      >
        <Icon name="camera" size={18} aria-hidden />
      </button>
    </div>
  );
}
