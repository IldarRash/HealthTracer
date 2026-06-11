import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { chatMessages, chatThreads } from "./chat.js";
import { healthDocuments } from "./documents.js";
import { users } from "./users.js";

export const chatAttachmentCategoryEnum = pgEnum("chat_attachment_category", [
  "unclassified",
  "food_photo",
  "medical_document",
  "workout_attachment",
  "document_file",
]);

export const chatAttachmentStatusEnum = pgEnum("chat_attachment_status", [
  "queued",
  "uploading",
  "recognizing",
  "needs_consent",
  "needs_review",
  "ready",
  "low_confidence",
  "unsupported",
  "failed",
]);

export const chatAttachmentRetentionPolicyEnum = pgEnum("chat_attachment_retention_policy", [
  "ephemeral_recognition",
  "document_consent_rules",
  "session_linked",
]);

export const chatAttachmentCategorySourceEnum = pgEnum("chat_attachment_category_source", [
  "default_unclassified",
  "mime_inferred",
  "user_selected",
  "ai_classified",
]);

export const chatAttachments = pgTable(
  "chat_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => chatThreads.id, { onDelete: "set null" }),
    messageId: uuid("message_id").references(() => chatMessages.id, { onDelete: "set null" }),
    category: chatAttachmentCategoryEnum("category").notNull(),
    categorySource: chatAttachmentCategorySourceEnum("category_source")
      .notNull()
      .default("default_unclassified"),
    status: chatAttachmentStatusEnum("status").notNull().default("queued"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    storageKey: text("storage_key"),
    linkedDocumentId: uuid("linked_document_id").references(() => healthDocuments.id, {
      onDelete: "set null",
    }),
    linkedImageRefId: uuid("linked_image_ref_id"),
    consent: jsonb("consent").$type<Record<string, unknown> | null>(),
    recognition: jsonb("recognition").$type<Record<string, unknown> | null>(),
    failureReason: text("failure_reason"),
    retentionPolicy: chatAttachmentRetentionPolicyEnum("retention_policy").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("chat_attachments_user_id_idx").on(table.userId),
    threadIdIdx: index("chat_attachments_thread_id_idx").on(table.threadId),
    messageIdIdx: index("chat_attachments_message_id_idx").on(table.messageId),
    userStatusIdx: index("chat_attachments_user_status_idx").on(table.userId, table.status),
  }),
);
