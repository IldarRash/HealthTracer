import type { ChatAttachmentRecord } from "@health/types";
import {
  chatAttachmentConsentSchema,
  chatAttachmentRecognitionEnvelopeSchema,
  chatAttachmentRecordSchema,
  sanitizeMedicalRecognitionForClient,
} from "@health/types";
import type { ChatAttachmentRow } from "./chat-attachments.repository.js";

function sanitizeStoredRecognition(
  recognition: NonNullable<ChatAttachmentRecord["recognition"]>,
): NonNullable<ChatAttachmentRecord["recognition"]> {
  if (recognition.category === "medical_document" && recognition.reviewStatus !== "approved") {
    return sanitizeMedicalRecognitionForClient(recognition);
  }

  return recognition;
}

export function toChatAttachmentRecord(row: ChatAttachmentRow): ChatAttachmentRecord {
  const consent = row.consent
    ? chatAttachmentConsentSchema.parse(row.consent)
    : null;
  const recognition = row.recognition
    ? sanitizeStoredRecognition(chatAttachmentRecognitionEnvelopeSchema.parse(row.recognition))
    : null;

  return chatAttachmentRecordSchema.parse({
    id: row.id,
    userId: row.userId,
    threadId: row.threadId,
    messageId: row.messageId,
    category: row.category,
    status: row.status,
    filename: row.filename,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    storageKey: row.storageKey,
    linkedDocumentId: row.linkedDocumentId,
    linkedImageRefId: row.linkedImageRefId,
    consent,
    recognition,
    failureReason: row.failureReason,
    retentionPolicy: row.retentionPolicy,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function toOwnedChatAttachmentRef(row: ChatAttachmentRow) {
  return {
    id: row.id,
    userId: row.userId,
    category: row.category,
    status: row.status,
    linkedDocumentId: row.linkedDocumentId,
    linkedImageRefId: row.linkedImageRefId,
    retentionPolicy: row.retentionPolicy,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}
