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
import { users } from "./users.js";

export const documentTypeEnum = pgEnum("document_type", [
  "lab_report",
  "clinical_note",
  "imaging_report",
  "medication_list",
  "discharge_summary",
  "other",
]);

export const documentParseStatusEnum = pgEnum("document_parse_status", [
  "uploaded",
  "processing",
  "parsed",
  "summary_ready",
  "failed",
  "revoked",
]);

export const documentReviewStatusEnum = pgEnum("document_review_status", [
  "pending_review",
  "approved",
  "rejected",
]);

export const documentSignalExtractionStatusEnum = pgEnum("document_signal_extraction_status", [
  "not_started",
  "processing",
  "ready",
  "failed",
  "revoked",
]);

export const healthDocuments = pgTable(
  "health_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentType: documentTypeEnum("document_type").notNull(),
    title: text("title").notNull(),
    storageReference: text("storage_reference").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    parseStatus: documentParseStatusEnum("parse_status").notNull().default("uploaded"),
    consentScopes: jsonb("consent_scopes")
      .$type<
        (
          | "upload_storage"
          | "parse_ocr"
          | "ai_summarization"
          | "semantic_indexing"
          | "coach_chat_context"
        )[]
      >()
      .notNull()
      .default([]),
    consentVersion: text("consent_version").notNull().default("v1"),
    consentGrantedAt: timestamp("consent_granted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    parseFailureReason: text("parse_failure_reason"),
    signalExtractionStatus: documentSignalExtractionStatusEnum("signal_extraction_status")
      .notNull()
      .default("not_started"),
    signalExtractionFailureReason: text("signal_extraction_failure_reason"),
    signalExtractedAt: timestamp("signal_extracted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userUploadedIdx: index("health_documents_user_uploaded_idx").on(
      table.userId,
      table.uploadedAt,
    ),
    userStatusIdx: index("health_documents_user_status_idx").on(
      table.userId,
      table.parseStatus,
    ),
    userDeletedIdx: index("health_documents_user_deleted_idx").on(
      table.userId,
      table.deletedAt,
    ),
  }),
);

export const healthDocumentSummaries = pgTable(
  "health_document_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    healthDocumentId: uuid("health_document_id")
      .notNull()
      .references(() => healthDocuments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    summaryText: text("summary_text").notNull(),
    extractedConstraints: jsonb("extracted_constraints").$type<string[]>().notNull().default([]),
    searchIndexText: text("search_index_text").notNull(),
    reviewStatus: documentReviewStatusEnum("review_status")
      .notNull()
      .default("pending_review"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    generatorVersion: text("generator_version").notNull().default("dev-v1"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    documentIdx: index("health_document_summaries_document_idx").on(table.healthDocumentId),
    userReviewIdx: index("health_document_summaries_user_review_idx").on(
      table.userId,
      table.reviewStatus,
    ),
    searchIdx: index("health_document_summaries_search_idx").on(table.searchIndexText),
  }),
);
