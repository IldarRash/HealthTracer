import type { ChatAttachmentOutcomeDisplay } from "../../lib/chat-attachment-ui-state";
import {
  chatAttachmentCategoryLabel,
  chatAttachmentStatusBadgeTone,
  chatAttachmentStatusLabel,
  MEDICAL_ATTACHMENT_WELLNESS_NOTICE,
  resolveAttachmentOutcomeConfidenceLabel,
  resolveAttachmentOutcomeFallbackCopy,
  resolveMedicalDocumentProfileHref,
} from "../../lib/chat-attachment-ui-state";
import Link from "next/link";
import { AttachmentStatusBadge, ChatMetadataPanel, PrivacyBoundaryNote } from "../ui";

type ChatAttachmentOutcomePanelProps = {
  outcomes: readonly ChatAttachmentOutcomeDisplay[];
  titleId: string;
};

export function ChatAttachmentOutcomePanel({
  outcomes,
  titleId,
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

              {outcome.category === "medical_document" ? (
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
