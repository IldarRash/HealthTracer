import type { ChatAttachmentRecord } from "@health/types";
import {
  chatAttachmentConsentSchema,
  chatAttachmentRecordSchema,
} from "@health/types";
import type { ChatAttachmentRow } from "./chat-attachments.repository.js";

export function toChatAttachmentRecord(row: ChatAttachmentRow): ChatAttachmentRecord {
  // The recognition DB column is readable but excluded from the domain record
  // type (B3 removal, C4 cluster). Attachments never link to persisted health
  // data — the legacy linked_document_id column was dropped with the documents module.
  const consent = row.consent
    ? chatAttachmentConsentSchema.parse(row.consent)
    : null;

  return chatAttachmentRecordSchema.parse({
    id: row.id,
    userId: row.userId,
    threadId: row.threadId,
    messageId: row.messageId,
    category: row.category,
    categorySource: row.categorySource,
    status: row.status,
    filename: row.filename,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    storageKey: row.storageKey,
    linkedImageRefId: row.linkedImageRefId,
    consent,
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
    linkedImageRefId: row.linkedImageRefId,
    retentionPolicy: row.retentionPolicy,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}
