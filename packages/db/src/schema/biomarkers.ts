import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const labReportStatusEnum = pgEnum("lab_report_status", [
  "uploaded",
  "processing",
  "extracted",
  "failed",
]);

export const labReports = pgTable(
  "lab_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    storageReference: text("storage_reference").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    status: labReportStatusEnum("status").notNull().default("uploaded"),
    failureCode: text("failure_code"),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    unmappedMarkerCount: integer("unmapped_marker_count").notNull().default(0),
    consentVersion: text("consent_version").notNull().default("v2"),
    storeParseConsentAt: timestamp("store_parse_consent_at", { withTimezone: true }).notNull(),
    coachContextConsentAt: timestamp("coach_context_consent_at", { withTimezone: true }),
    extractedAt: timestamp("extracted_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userUploadedIdx: index("lab_reports_user_uploaded_idx").on(
      table.userId,
      table.uploadedAt,
    ),
    userStatusIdx: index("lab_reports_user_status_idx").on(table.userId, table.status),
    userDeletedIdx: index("lab_reports_user_deleted_idx").on(
      table.userId,
      table.deletedAt,
    ),
  }),
);

export const biomarkerReadings = pgTable(
  "biomarker_readings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    labReportId: uuid("lab_report_id").references(() => labReports.id, {
      onDelete: "cascade",
    }),
    biomarkerKey: text("biomarker_key").notNull(),
    value: numeric("value", { precision: 12, scale: 4 }),
    valueText: text("value_text"),
    unit: text("unit").notNull(),
    referenceRangeText: text("reference_range_text"),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    source: text("source").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    userEdited: boolean("user_edited").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userKeyObservedIdx: index("biomarker_readings_user_key_observed_idx").on(
      table.userId,
      table.biomarkerKey,
      table.observedAt,
    ),
    labReportIdx: index("biomarker_readings_lab_report_idx").on(table.labReportId),
    userDeletedIdx: index("biomarker_readings_user_deleted_idx").on(
      table.userId,
      table.deletedAt,
    ),
  }),
);
