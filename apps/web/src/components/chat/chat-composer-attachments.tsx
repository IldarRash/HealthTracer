"use client";

import type { ChatAttachmentCategory, DocumentConsentScope, DocumentType } from "@health/types";
import {
  buildChatAttachmentConsentScopeItems,
  CHAT_ATTACHMENT_CATEGORY_OPTIONS,
  chatAttachmentStatusLabel,
  applyChatAttachmentCategoryChange,
  canPreviewRecognizeChatAttachmentDraft,
  DOCUMENT_CONSENT_VERSION,
  DOCUMENT_TYPE_OPTIONS,
  FOOD_OR_WORKOUT_RECOGNIZE_COPY,
  getMedicalAttachmentDraftErrors,
  isAmbiguousFoodOrWorkoutImage,
  isLikelyMedicalDocumentFile,
  isUnclassifiedLikelyMedicalDocumentDraft,
  isUserSelectedChatAttachmentDraft,
  MEDICAL_ATTACHMENT_WELLNESS_NOTICE,
  OPTIONAL_CATEGORY_CORRECTION_COPY,
  resolveAttachmentDisplayStatus,
  revokeChatAttachmentPreviewUrl,
  toggleChatAttachmentConsentScope,
  type ChatComposerAttachmentDraft,
} from "../../lib/chat-attachment-ui-state";
import { AttachmentPreviewThumb, Button, ConsentScopeChecklist } from "../ui";

type ChatComposerAttachmentsProps = {
  attachments: readonly ChatComposerAttachmentDraft[];
  disabled?: boolean;
  onAttachmentsChange: (attachments: ChatComposerAttachmentDraft[]) => void;
  onProcessDraft: (draft: ChatComposerAttachmentDraft) => void;
  onGrantConsentAndRecognize: (localId: string) => void;
  onRecognizeDraft?: (draft: ChatComposerAttachmentDraft) => void;
};

function attachmentNeedsComposerExtras(
  attachment: ChatComposerAttachmentDraft,
  onRecognizeDraft?: (draft: ChatComposerAttachmentDraft) => void,
): boolean {
  const medicalErrors = getMedicalAttachmentDraftErrors(attachment);
  const showMedicalFields = isUserSelectedChatAttachmentDraft(attachment);
  const isAmbiguousImage =
    isAmbiguousFoodOrWorkoutImage(attachment.file) &&
    !isLikelyMedicalDocumentFile(attachment.file);
  const isUnclassifiedDocument = isUnclassifiedLikelyMedicalDocumentDraft(attachment);
  const showCategoryCorrection = isAmbiguousImage || isUnclassifiedDocument;
  const canUploadMedicalLocally =
    attachment.phase === "local" &&
    !attachment.localValidationError &&
    medicalErrors.length === 0 &&
    showMedicalFields;
  const canRecognizeOptional =
    canPreviewRecognizeChatAttachmentDraft(attachment) && onRecognizeDraft != null;

  return (
    Boolean(attachment.localValidationError) ||
    Boolean(attachment.error) ||
    Boolean(attachment.record?.failureReason) ||
    showMedicalFields ||
    showCategoryCorrection ||
    canUploadMedicalLocally ||
    attachment.phase === "needs_consent" ||
    canRecognizeOptional
  );
}

export function ChatComposerAttachments({
  attachments,
  disabled = false,
  onAttachmentsChange,
  onProcessDraft,
  onGrantConsentAndRecognize,
  onRecognizeDraft,
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

  const handleCategoryChange = (localId: string, category: ChatAttachmentCategory) => {
    updateAttachment(localId, (draft) => applyChatAttachmentCategoryChange(draft, category));
  };

  const handleConsentScopeToggle = (localId: string, scope: DocumentConsentScope) => {
    updateAttachment(localId, (draft) => ({
      ...draft,
      consentScopes: toggleChatAttachmentConsentScope(draft.consentScopes, scope),
    }));
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
          const isProcessing =
            attachment.phase === "uploading" || attachment.phase === "recognizing";
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
            </li>
          );
        })}
      </ul>

      {attachments.some((attachment) => attachmentNeedsComposerExtras(attachment, onRecognizeDraft)) ? (
        <div className="chat-composer-attachments__extras">
          {attachments.map((attachment) => {
            if (!attachmentNeedsComposerExtras(attachment, onRecognizeDraft)) {
              return null;
            }

            const medicalErrors = getMedicalAttachmentDraftErrors(attachment);
            const showMedicalFields = isUserSelectedChatAttachmentDraft(attachment);
            const isAmbiguousImage =
              isAmbiguousFoodOrWorkoutImage(attachment.file) &&
              !isLikelyMedicalDocumentFile(attachment.file);
            const isUnclassifiedDocument = isUnclassifiedLikelyMedicalDocumentDraft(attachment);
            const showCategoryCorrection = isAmbiguousImage || isUnclassifiedDocument;
            const categoryCorrectionOptions = CHAT_ATTACHMENT_CATEGORY_OPTIONS.filter((option) =>
              isUnclassifiedDocument ? true : option.value !== "medical_document",
            );
            const canUploadMedicalLocally =
              attachment.phase === "local" &&
              !attachment.localValidationError &&
              medicalErrors.length === 0 &&
              showMedicalFields;
            const canRecognizeOptional =
              canPreviewRecognizeChatAttachmentDraft(attachment) && onRecognizeDraft != null;
            const isProcessing =
              attachment.phase === "uploading" || attachment.phase === "recognizing";

            return (
              <div
                key={`${attachment.localId}-extras`}
                className="chat-composer-attachments__extra"
                aria-label={`Options for ${attachment.file.name}`}
              >
                {attachment.localValidationError ? (
                  <p className="form-error" role="alert">
                    {attachment.localValidationError}
                  </p>
                ) : null}

                {showMedicalFields ? (
                  <details className="chat-composer-attachments__medical-details">
                    <summary className="chat-composer-attachments__details-summary">
                      Wellness document setup
                    </summary>
                    <div className="chat-composer-attachments__medical">
                      <p className="form-help">{MEDICAL_ATTACHMENT_WELLNESS_NOTICE}</p>

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
                  </details>
                ) : null}

                {showCategoryCorrection ? (
                  <details className="chat-composer-attachments__category-correction">
                    <summary className="chat-composer-attachments__details-summary">
                      {OPTIONAL_CATEGORY_CORRECTION_COPY}
                    </summary>
                    <div className="chat-composer-attachments__controls">
                      <label
                        className="form-label"
                        htmlFor={`attachment-category-${attachment.localId}`}
                      >
                        Category correction
                      </label>
                      <select
                        id={`attachment-category-${attachment.localId}`}
                        className="form-select"
                        value={attachment.category === "unclassified" ? "" : attachment.category}
                        disabled={disabled || isProcessing || attachment.phase === "uploaded"}
                        onChange={(event) => {
                          const value = event.target.value as ChatAttachmentCategory;
                          if (!value) {
                            return;
                          }
                          handleCategoryChange(attachment.localId, value);
                        }}
                      >
                        <option value="">Auto-detect on send</option>
                        {categoryCorrectionOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p
                        className="form-help"
                        id={`attachment-category-help-${attachment.localId}`}
                      >
                        {isUnclassifiedDocument
                          ? "Optional: pick Wellness document if you already know this file needs consent before send."
                          : FOOD_OR_WORKOUT_RECOGNIZE_COPY}
                      </p>
                    </div>
                  </details>
                ) : null}

                {attachment.error ? (
                  <p className="form-error" role="alert">
                    {attachment.error}
                  </p>
                ) : null}

                {canUploadMedicalLocally ? (
                  <div className="action-row">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() => onProcessDraft(attachment)}
                    >
                      Upload document
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
                      Grant consent and retry upload
                    </Button>
                  </div>
                ) : null}

                {canRecognizeOptional ? (
                  <div className="action-row">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={disabled}
                      onClick={() => onRecognizeDraft?.(attachment)}
                    >
                      Preview recognition (optional)
                    </Button>
                  </div>
                ) : null}

                {attachment.record?.failureReason ? (
                  <p className="form-error" role="status">
                    {attachment.record.failureReason}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export { DOCUMENT_CONSENT_VERSION };
