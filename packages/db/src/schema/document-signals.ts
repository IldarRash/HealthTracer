import {
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { healthDocuments } from "./documents.js";
import { users } from "./users.js";

export const documentSignalReviewStatusEnum = pgEnum("document_signal_review_status", [
  "pending_review",
  "approved",
  "rejected",
  "ignored",
]);

export const documentSignalKeyEnum = pgEnum("document_signal_key", [
  "vitamin_d",
  "ferritin",
  "hemoglobin",
  "fasting_glucose",
  "total_cholesterol",
  "resting_heart_rate",
  "energy_level",
]);

export const documentSignals = pgTable(
  "document_signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    healthDocumentId: uuid("health_document_id")
      .notNull()
      .references(() => healthDocuments.id, { onDelete: "cascade" }),
    signalKey: documentSignalKeyEnum("signal_key").notNull(),
    displayLabel: text("display_label").notNull(),
    valueText: text("value_text").notNull(),
    unit: text("unit").notNull(),
    referenceRangeText: text("reference_range_text"),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" }),
    sourceSection: text("source_section").notNull(),
    confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }).notNull(),
    reviewStatus: documentSignalReviewStatusEnum("review_status")
      .notNull()
      .default("pending_review"),
    ignoredReason: text("ignored_reason"),
    extractedAt: timestamp("extracted_at", { withTimezone: true }).defaultNow().notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    documentIdx: index("document_signals_document_idx").on(table.healthDocumentId),
    userReviewIdx: index("document_signals_user_review_idx").on(
      table.userId,
      table.reviewStatus,
    ),
    userDocumentIdx: index("document_signals_user_document_idx").on(
      table.userId,
      table.healthDocumentId,
    ),
  }),
);
