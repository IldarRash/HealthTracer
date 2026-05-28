"use client";

import type { ChangeEvent } from "react";
import type { DocumentConsentScope, DocumentType } from "@health/types";
import {
  MEDICAL_ATTACHMENT_NEEDS_CONSENT_OUTCOME_COPY,
  MEDICAL_ATTACHMENT_RESELECT_FILE_COPY,
  type PendingMedicalAttachmentConsent,
} from "../../lib/chat-attachment-medical-consent";
import type { ChatAttachmentOutcomeDisplay } from "../../lib/chat-attachment-ui-state";
import {
  buildChatAttachmentConsentScopeItems,
  chatAttachmentCategoryLabel,
  chatAttachmentStatusBadgeTone,
  chatAttachmentStatusLabel,
  DOCUMENT_TYPE_OPTIONS,
  MEDICAL_ATTACHMENT_WELLNESS_NOTICE,
  resolveAttachmentOutcomeConfidenceLabel,
  resolveAttachmentOutcomeFallbackCopy,
  resolveMedicalDocumentProfileHref,
  toggleChatAttachmentConsentScope,
} from "../../lib/chat-attachment-ui-state";
import { CHAT_ATTACHMENT_ACCEPT } from "../../lib/chat-attachment-ui-state";
import Link from "next/link";
import {
  AttachmentStatusBadge,
  Button,
  ChatMetadataPanel,
  ConsentScopeChecklist,
  FileInputTrigger,
  PrivacyBoundaryNote,
} from "../ui";

type ChatAttachmentOutcomePanelProps = {
  outcomes: readonly ChatAttachmentOutcomeDisplay[];
  titleId: string;
  pendingMedicalConsentByAttachmentId?: Readonly<
    Record<string, PendingMedicalAttachmentConsent>
  >;
  onPendingMedicalConsentChange?: (
    attachmentRefId: string,
    updater: (
      current: PendingMedicalAttachmentConsent,
    ) => PendingMedicalAttachmentConsent,
  ) => void;
  onGrantMedicalConsent?: (attachmentRefId: string) => void;
};

export function ChatAttachmentOutcomePanel({
  outcomes,
  titleId,
  pendingMedicalConsentByAttachmentId = {},
  onPendingMedicalConsentChange,
  onGrantMedicalConsent,
}: ChatAttachmentOutcomePanelProps) {
  if (outcomes.length === 0) {
    return null;
  }

  return (
    <ChatMetadataPanel
      title="Attachment results"
      titleId={titleId}
      tone="notice"
      className="chat-attachment-outcomes"
    >
      <ul className="chat-attachment-outcomes__list" aria-label="Attachment recognition results">
        {outcomes.map((outcome) => {
          const fallbackCopy = resolveAttachmentOutcomeFallbackCopy(outcome);
          const statusLabel = chatAttachmentStatusLabel(outcome.status);
          const confidenceLabel = resolveAttachmentOutcomeConfidenceLabel(outcome);
          const documentId =
            outcome.recognition?.category === "medical_document"
              ? outcome.recognition.documentId
              : null;
          const outcomeLabel = chatAttachmentCategoryLabel(outcome.category);
          const pendingConsent = pendingMedicalConsentByAttachmentId[outcome.attachmentRefId];
          const showMedicalConsentForm =
            outcome.category === "medical_document" &&
            outcome.status === "needs_consent" &&
            pendingConsent != null &&
            onPendingMedicalConsentChange != null &&
            onGrantMedicalConsent != null;

          return (
            <li
              key={outcome.attachmentRefId}
              className="chat-attachment-outcomes__item"
              role="group"
              aria-label={`${outcomeLabel} attachment result`}
            >
              <div className="chat-attachment-outcomes__header">
                <span className="chat-attachment-outcomes__category">{outcomeLabel}</span>
                <AttachmentStatusBadge
                  label={statusLabel}
                  tone={chatAttachmentStatusBadgeTone(outcome.status)}
                  contextLabel={outcomeLabel}
                />
              </div>

              {confidenceLabel ? (
                <p className="chat-attachment-outcomes__meta" role="status">
                  Classification confidence: {confidenceLabel}
                </p>
              ) : null}

              {outcome.mealContextLabel ? (
                <p className="chat-attachment-outcomes__meta" role="status">
                  Meal context: {outcome.mealContextLabel}
                </p>
              ) : null}

              {outcome.proposalCandidateCount > 0 ? (
                <p className="chat-attachment-outcomes__meta">
                  {outcome.proposalCandidateCount} proposal
                  {outcome.proposalCandidateCount === 1 ? "" : "s"} available below for your
                  review. Nothing changes until you apply.
                </p>
              ) : null}

              {outcome.category === "medical_document" ? (
                <PrivacyBoundaryNote title="Wellness context only">
                  {MEDICAL_ATTACHMENT_WELLNESS_NOTICE}
                </PrivacyBoundaryNote>
              ) : null}

              {outcome.status === "needs_consent" && outcome.category === "medical_document" ? (
                <p className="chat-attachment-outcomes__meta" role="status">
                  {MEDICAL_ATTACHMENT_NEEDS_CONSENT_OUTCOME_COPY}
                </p>
              ) : null}

              {outcome.category === "medical_document" && outcome.status !== "needs_consent" ? (
                <p className="chat-attachment-outcomes__meta">
                  {outcome.status === "needs_review" ? (
                    <Link
                      className="confirmation-card__link"
                      href={resolveMedicalDocumentProfileHref(documentId)}
                    >
                      Review document in Profile →
                    </Link>
                  ) : (
                    <>
                      Document processing status: {statusLabel}. Summaries and signals are
                      available in Profile after review.
                    </>
                  )}
                </p>
              ) : null}

              {showMedicalConsentForm ? (
                <div
                  className="chat-attachment-outcomes__consent"
                  aria-label="Wellness document consent"
                >
                  <label
                    className="form-label"
                    htmlFor={`outcome-document-title-${outcome.attachmentRefId}`}
                  >
                    Document title
                  </label>
                  <input
                    id={`outcome-document-title-${outcome.attachmentRefId}`}
                    className="form-input"
                    value={pendingConsent.documentTitle}
                    disabled={pendingConsent.isGranting}
                    onChange={(event) =>
                      onPendingMedicalConsentChange(outcome.attachmentRefId, (current) => ({
                        ...current,
                        documentTitle: event.target.value,
                        error: null,
                      }))
                    }
                  />

                  <label
                    className="form-label"
                    htmlFor={`outcome-document-type-${outcome.attachmentRefId}`}
                  >
                    Document type
                  </label>
                  <select
                    id={`outcome-document-type-${outcome.attachmentRefId}`}
                    className="form-select"
                    value={pendingConsent.documentType}
                    disabled={pendingConsent.isGranting}
                    onChange={(event) =>
                      onPendingMedicalConsentChange(outcome.attachmentRefId, (current) => ({
                        ...current,
                        documentType: event.target.value as DocumentType,
                        error: null,
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
                    idPrefix={`outcome-${outcome.attachmentRefId}`}
                    scopes={buildChatAttachmentConsentScopeItems(pendingConsent.consentScopes)}
                    disabled={pendingConsent.isGranting}
                    onToggle={(scopeId) =>
                      onPendingMedicalConsentChange(outcome.attachmentRefId, (current) => ({
                        ...current,
                        consentScopes: toggleChatAttachmentConsentScope(
                          current.consentScopes,
                          scopeId as DocumentConsentScope,
                        ),
                        error: null,
                      }))
                    }
                  />

                  {pendingConsent.file ? (
                    <p className="chat-attachment-outcomes__meta" role="status">
                      Selected file: {pendingConsent.filename || pendingConsent.file.name}
                    </p>
                  ) : (
                    <>
                      <p className="form-help" role="status">
                        {MEDICAL_ATTACHMENT_RESELECT_FILE_COPY}
                      </p>
                      <FileInputTrigger
                        inputId={`outcome-medical-file-${outcome.attachmentRefId}`}
                        accept={CHAT_ATTACHMENT_ACCEPT}
                        disabled={pendingConsent.isGranting}
                        labelText="Choose wellness document file"
                        buttonLabel="Choose file"
                        className="chat-attachment-outcomes__file-input"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          const file = event.target.files?.[0];
                          if (!file) {
                            return;
                          }

                          onPendingMedicalConsentChange(outcome.attachmentRefId, (current) => ({
                            ...current,
                            file,
                            filename: file.name,
                            documentTitle:
                              current.documentTitle.trim() ||
                              file.name.replace(/\.[^.]+$/, "").slice(0, 160),
                            error: null,
                          }));
                          event.target.value = "";
                        }}
                      />
                    </>
                  )}

                  {pendingConsent.error ? (
                    <p className="form-error" role="alert">
                      {pendingConsent.error}
                    </p>
                  ) : null}

                  <div className="action-row">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pendingConsent.isGranting}
                      onClick={() => onGrantMedicalConsent(outcome.attachmentRefId)}
                    >
                      {pendingConsent.isGranting ? "Granting consent…" : "Grant consent and process"}
                    </Button>
                  </div>
                </div>
              ) : null}

              {fallbackCopy ? (
                <p className="chat-attachment-outcomes__fallback" role="status">
                  {fallbackCopy}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </ChatMetadataPanel>
  );
}
