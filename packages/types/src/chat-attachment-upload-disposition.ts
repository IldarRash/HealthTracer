import type {
  ChatAttachmentClassificationResult,
  ClassifiedChatAttachmentCategory,
} from "./chat-attachment-classification.js";
import {
  getChatAttachmentRetentionPolicy,
  type ChatAttachmentCategory,
  type ChatAttachmentRetentionPolicy,
  type ChatAttachmentStatus,
} from "./chat-attachments.js";

export const MEDICAL_ATTACHMENT_CONSENT_REQUIRED_REASON =
  "Explicit consent is required before processing medical documents in chat.";

export type ProvisionalUploadDisposition = {
  category: ChatAttachmentCategory;
  status: ChatAttachmentStatus;
  shouldPersistContent: boolean;
  failureReason: string | null;
  linkedImageRefId: string | null;
  retentionPolicy: ChatAttachmentRetentionPolicy;
};

export function formatUploadClassificationFailureReason(
  classification: ChatAttachmentClassificationResult,
): string {
  const meta = formatClassificationMethodLabel(classification);
  const rationale = classification.rationale.trim().slice(0, 220);

  return meta ? `${meta} ${rationale}`.trim().slice(0, 240) : rationale.slice(0, 240);
}

export function formatClassificationMethodLabel(
  classification: Pick<
    ChatAttachmentClassificationResult,
    "classificationProviderId" | "classificationMethod"
  >,
): string | null {
  if (!classification.classificationProviderId && !classification.classificationMethod) {
    return null;
  }

  const provider = classification.classificationProviderId ?? "unknown";
  const method = classification.classificationMethod ?? "unknown";

  return `[classifier:${provider}/${method}]`;
}

export function resolveProvisionalUploadDisposition(input: {
  classification: ChatAttachmentClassificationResult;
  attachmentId: string;
}): ProvisionalUploadDisposition {
  const { classification, attachmentId } = input;

  if (
    classification.suggestedAction === "manual_fallback" ||
    classification.suggestedAction === "unsupported"
  ) {
    return {
      category: "unclassified",
      status: "needs_review",
      shouldPersistContent: false,
      failureReason: formatUploadClassificationFailureReason(classification),
      linkedImageRefId: null,
      retentionPolicy: getChatAttachmentRetentionPolicy("unclassified"),
    };
  }

  if (
    classification.category === "medical_document" &&
    classification.suggestedAction === "request_medical_consent"
  ) {
    const meta = formatClassificationMethodLabel(classification);
    const failureReason = meta
      ? `${meta} ${MEDICAL_ATTACHMENT_CONSENT_REQUIRED_REASON}`.trim().slice(0, 240)
      : MEDICAL_ATTACHMENT_CONSENT_REQUIRED_REASON;

    return {
      category: "medical_document",
      status: "needs_consent",
      shouldPersistContent: false,
      failureReason,
      linkedImageRefId: null,
      retentionPolicy: getChatAttachmentRetentionPolicy("medical_document"),
    };
  }

  const category = classification.category as ClassifiedChatAttachmentCategory;

  return {
    category,
    status: "queued",
    shouldPersistContent: true,
    failureReason: null,
    linkedImageRefId: category === "food_photo" ? attachmentId : null,
    retentionPolicy: getChatAttachmentRetentionPolicy(category),
  };
}
