"use client";

import type { ChatAttachmentCategory, DocumentConsentScope, DocumentType } from "@health/types";
import { type ChangeEvent } from "react";
import {
  buildChatAttachmentConsentScopeItems,
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_CATEGORY_HINT,
  CHAT_ATTACHMENT_CATEGORY_OPTIONS,
  CHAT_ATTACHMENT_PRIVACY_NOTICE,
  chatAttachmentStatusBadgeTone,
  chatAttachmentStatusLabel,
  AMBIGUOUS_IMAGE_ATTACHMENT_COPY,
  applyChatAttachmentCategoryChange,
  createChatComposerAttachmentDraft,
  DOCUMENT_CONSENT_VERSION,
  DOCUMENT_TYPE_OPTIONS,
  FOOD_OR_WORKOUT_RECOGNIZE_COPY,
  formatChatAttachmentFileSize,
  getMedicalAttachmentDraftErrors,
  isAmbiguousFoodOrWorkoutImage,
  MAX_CHAT_COMPOSER_ATTACHMENTS,
  MEDICAL_ATTACHMENT_WELLNESS_NOTICE,
  resolveAttachmentDisplayStatus,
  revokeChatAttachmentPreviewUrl,
  shouldAutoProcessChatAttachmentOnSelect,
  toggleChatAttachmentConsentScope,
  type ChatComposerAttachmentDraft,
} from "../../lib/chat-attachment-ui-state";
import {
  AttachmentPreviewThumb,
  AttachmentStatusBadge,
  Button,
  ConsentScopeChecklist,
  FileInputTrigger,
  PrivacyBoundaryNote,
} from "../ui";

type ChatComposerAttachmentsProps = {
  attachments: readonly ChatComposerAttachmentDraft[];
  disabled?: boolean;
  onAttachmentsChange: (attachments: ChatComposerAttachmentDraft[]) => void;
  onProcessDraft: (draft: ChatComposerAttachmentDraft) => void;
  onGrantConsentAndRecognize: (localId: string) => void;
};

export function ChatComposerAttachments({
  attachments,
  disabled = false,
  onAttachmentsChange,
  onProcessDraft,
  onGrantConsentAndRecognize,
}: ChatComposerAttachmentsProps) {
  const updateAttachment = (
    localId: string,
    updater: (draft: ChatComposerAttachmentDraft) => ChatComposerAttachmentDraft,
  ) => {
    onAttachmentsChange(
      attachments.map((attachment) =>
        attachment.localId === localId ? updater(attachment) : attachment,
      ),
    );
  };

  const removeAttachment = (localId: string) => {
    const draft = attachments.find((attachment) => attachment.localId === localId);
    if (draft) {
      revokeChatAttachmentPreviewUrl(draft);
    }

    onAttachmentsChange(attachments.filter((attachment) => attachment.localId !== localId));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }

    const remainingSlots = MAX_CHAT_COMPOSER_ATTACHMENTS - attachments.length;
    const selected = [...files].slice(0, Math.max(0, remainingSlots));
    const nextDrafts = selected.map((file) => createChatComposerAttachmentDraft(file));

    onAttachmentsChange([...attachments, ...nextDrafts]);

    for (const draft of nextDrafts) {
      if (shouldAutoProcessChatAttachmentOnSelect(draft)) {
        onProcessDraft(draft);
      }
    }

    event.target.value = "";
  };

  const handleCategoryChange = (localId: string, category: ChatAttachmentCategory) => {
    updateAttachment(localId, (draft) => applyChatAttachmentCategoryChange(draft, category));
  };

  const handleConsentScopeToggle = (localId: string, scope: DocumentConsentScope) => {
    updateAttachment(localId, (draft) => ({
      ...draft,
      consentScopes: toggleChatAttachmentConsentScope(draft.consentScopes, scope),
    }));
  };

  const fileInputDisabled = disabled || attachments.length >= MAX_CHAT_COMPOSER_ATTACHMENTS;

  return (
    <div className="chat-composer-attachments">
      <PrivacyBoundaryNote title="Attachment privacy">
        {CHAT_ATTACHMENT_PRIVACY_NOTICE}
      </PrivacyBoundaryNote>

      <div className="chat-composer-attachments__toolbar">
        <FileInputTrigger
          inputId="chat-attachment-input"
          accept={CHAT_ATTACHMENT_ACCEPT}
          multiple
          disabled={fileInputDisabled}
          labelText="Attach food photo, wellness document, or workout file"
          buttonLabel="Attach file"
          hintText={CHAT_ATTACHMENT_CATEGORY_HINT}
          onChange={handleFileChange}
        />
      </div>

      {attachments.length > 0 ? (
        <ul
          className="chat-composer-attachments__list"
          aria-label="Selected attachments"
          aria-live="polite"
          aria-relevant="additions removals"
        >
          {attachments.map((attachment) => {
            const displayStatus = resolveAttachmentDisplayStatus(attachment);
            const medicalErrors = getMedicalAttachmentDraftErrors(attachment);
            const showMedicalFields = attachment.category === "medical_document";
            const showFoodOrWorkoutFields =
              attachment.category === "food_photo" ||
              attachment.category === "workout_attachment";
            const isAmbiguousImage = isAmbiguousFoodOrWorkoutImage(attachment.file);
            const canProcessLocally =
              attachment.phase === "local" &&
              !attachment.localValidationError &&
              medicalErrors.length === 0;
            const isProcessing =
              attachment.phase === "uploading" || attachment.phase === "recognizing";
            const nameId = `attachment-name-${attachment.localId}`;

            return (
              <li
                key={attachment.localId}
                className="chat-composer-attachments__item"
                role="group"
                aria-labelledby={nameId}
                aria-busy={isProcessing || undefined}
              >
                <div className="chat-composer-attachments__preview-row">
                  <AttachmentPreviewThumb
                    previewUrl={attachment.previewUrl}
                    fileName={attachment.file.name}
                    thumbClassName="chat-composer-attachments__thumb"
                    iconClassName="chat-composer-attachments__file-icon"
                  />

                  <div className="chat-composer-attachments__details">
                    <p id={nameId} className="chat-composer-attachments__filename">
                      {attachment.file.name}
                    </p>
                    <p className="chat-composer-attachments__meta">
                      {formatChatAttachmentFileSize(attachment.file.size)} ·{" "}
                      {attachment.file.type || "unknown type"}
                    </p>
                    <AttachmentStatusBadge
                      label={chatAttachmentStatusLabel(displayStatus)}
                      tone={chatAttachmentStatusBadgeTone(displayStatus)}
                      contextLabel={attachment.file.name}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="secondary"
                    disabled={disabled || attachment.phase === "uploading"}
                    aria-label={`Remove ${attachment.file.name}`}
                    onClick={() => removeAttachment(attachment.localId)}
                  >
                    Remove
                  </Button>
                </div>

                <div className="chat-composer-attachments__controls">
                  <label className="form-label" htmlFor={`attachment-category-${attachment.localId}`}>
                    Category
                  </label>
                  <select
                    id={`attachment-category-${attachment.localId}`}
                    className="form-select"
                    value={attachment.category}
                    disabled={disabled || isProcessing}
                    onChange={(event) =>
                      handleCategoryChange(
                        attachment.localId,
                        event.target.value as ChatAttachmentCategory,
                      )
                    }
                  >
                    {CHAT_ATTACHMENT_CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="form-help" id={`attachment-category-help-${attachment.localId}`}>
                    {
                      CHAT_ATTACHMENT_CATEGORY_OPTIONS.find(
                        (option) => option.value === attachment.category,
                      )?.description
                    }
                  </p>
                </div>

                {attachment.localValidationError ? (
                  <p className="form-error" role="alert">
                    {attachment.localValidationError}
                  </p>
                ) : null}

                {showFoodOrWorkoutFields ? (
                  <PrivacyBoundaryNote title="Choose category before recognition">
                    {isAmbiguousImage
                      ? AMBIGUOUS_IMAGE_ATTACHMENT_COPY
                      : FOOD_OR_WORKOUT_RECOGNIZE_COPY}
                  </PrivacyBoundaryNote>
                ) : null}

                {showMedicalFields ? (
                  <div className="chat-composer-attachments__medical">
                    <PrivacyBoundaryNote title="Wellness documents">
                      {MEDICAL_ATTACHMENT_WELLNESS_NOTICE}
                    </PrivacyBoundaryNote>

                    <label className="form-label" htmlFor={`document-title-${attachment.localId}`}>
                      Document title
                    </label>
                    <input
                      id={`document-title-${attachment.localId}`}
                      className="form-input"
                      value={attachment.documentTitle}
                      disabled={disabled || attachment.phase !== "local"}
                      onChange={(event) =>
                        updateAttachment(attachment.localId, (draft) => ({
                          ...draft,
                          documentTitle: event.target.value,
                        }))
                      }
                    />

                    <label className="form-label" htmlFor={`document-type-${attachment.localId}`}>
                      Document type
                    </label>
                    <select
                      id={`document-type-${attachment.localId}`}
                      className="form-select"
                      value={attachment.documentType}
                      disabled={disabled || attachment.phase !== "local"}
                      onChange={(event) =>
                        updateAttachment(attachment.localId, (draft) => ({
                          ...draft,
                          documentType: event.target.value as DocumentType,
                        }))
                      }
                    >
                      {DOCUMENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>

                    <ConsentScopeChecklist
                      legend="Consent scopes"
                      helpText="Choose what this document may be used for. Upload storage is required."
                      idPrefix={attachment.localId}
                      scopes={buildChatAttachmentConsentScopeItems(attachment.consentScopes)}
                      disabled={disabled || attachment.phase !== "local"}
                      onToggle={(scopeId) =>
                        handleConsentScopeToggle(
                          attachment.localId,
                          scopeId as DocumentConsentScope,
                        )
                      }
                    />

                    {medicalErrors.length > 0 && attachment.phase === "local" ? (
                      <ul className="form-error-list" role="alert">
                        {medicalErrors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                {attachment.error ? (
                  <p className="form-error" role="alert">
                    {attachment.error}
                  </p>
                ) : null}

                {canProcessLocally && showMedicalFields ? (
                  <div className="action-row">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() => onProcessDraft(attachment)}
                    >
                      Upload and recognize
                    </Button>
                  </div>
                ) : null}

                {canProcessLocally && showFoodOrWorkoutFields ? (
                  <div className="action-row">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() => onProcessDraft(attachment)}
                    >
                      Recognize
                    </Button>
                  </div>
                ) : null}

                {attachment.phase === "needs_consent" ? (
                  <div className="action-row">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() => onGrantConsentAndRecognize(attachment.localId)}
                    >
                      Grant consent and recognize
                    </Button>
                  </div>
                ) : null}

                {attachment.record?.failureReason ? (
                  <p className="form-error" role="status">
                    {attachment.record.failureReason}
                  </p>
                ) : null}

                {attachment.proposalCandidateCount > 0 ? (
                  <p className="chat-composer-attachments__meta" role="status">
                    {attachment.proposalCandidateCount} proposal candidate
                    {attachment.proposalCandidateCount === 1 ? "" : "s"} ready for chat review.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export { DOCUMENT_CONSENT_VERSION };
