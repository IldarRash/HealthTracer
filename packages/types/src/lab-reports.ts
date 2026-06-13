import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import { BIOMARKER_AREAS, biomarkerKeySchema } from "./biomarkers.js";

// ---------------------------------------------------------------------------
// Lab report + biomarker reading API contracts.
//
// A lab report is an explicitly uploaded PDF/plain-text file the user owns.
// Consent is two-level: a structurally-required upload-time "store & parse"
// (z.literal(true)) plus an optional per-report "use in coach chat context".
// Extracted document text is NEVER persisted or logged (handled at the service
// layer); only structured biomarker_readings rows survive a successful parse.
// ---------------------------------------------------------------------------

/** Mirror of the existing health-document upload cap (5MB). */
export const MAX_LAB_REPORT_UPLOAD_BYTES = 5_000_000;

/**
 * Fast-fail parse-time bound for the base64 upload payload: base64 encodes
 * 3 bytes as 4 chars (ceil(bytes/3) * 4), plus a little slack for padding.
 * The authoritative byte-level check stays in the service after decoding.
 */
export const MAX_LAB_REPORT_UPLOAD_BASE64_CHARS =
  Math.ceil(MAX_LAB_REPORT_UPLOAD_BYTES / 3) * 4 + 4;

export const SUPPORTED_LAB_REPORT_MIME_TYPES = [
  "application/pdf",
  "text/plain",
] as const;

export type SupportedLabReportMimeType =
  (typeof SUPPORTED_LAB_REPORT_MIME_TYPES)[number];

export const supportedLabReportMimeTypeSchema = z.enum(
  SUPPORTED_LAB_REPORT_MIME_TYPES,
);

export const labReportStatusSchema = z.enum([
  "uploaded",
  "processing",
  "extracted",
  "failed",
]);

export type LabReportStatus = z.infer<typeof labReportStatusSchema>;

export const labReportFailureCodeSchema = z.enum([
  "file_unreadable",
  "pdf_no_text",
  "content_too_large",
  "not_a_lab_report",
  "llm_unavailable",
  "llm_invalid_output",
  "no_readings_extracted",
]);

export type LabReportFailureCode = z.infer<typeof labReportFailureCodeSchema>;

export const biomarkerReadingSourceSchema = z.enum(["extraction", "manual"]);

export type BiomarkerReadingSource = z.infer<typeof biomarkerReadingSourceSchema>;

// ── Lab report ─────────────────────────────────────────────────────────────

export const labReportSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  title: z.string().min(1).max(160),
  storageReference: z.string().min(1).max(500),
  mimeType: supportedLabReportMimeTypeSchema,
  fileSizeBytes: z.number().int().nonnegative().max(MAX_LAB_REPORT_UPLOAD_BYTES),
  status: labReportStatusSchema,
  failureCode: labReportFailureCodeSchema.nullable(),
  observedAt: isoDateSchema.nullable(),
  unmappedMarkerCount: z.number().int().nonnegative(),
  consentVersion: z.string().min(1).max(40),
  storeParseConsentAt: isoDateTimeSchema,
  coachContextConsentAt: isoDateTimeSchema.nullable(),
  extractedAt: isoDateTimeSchema.nullable(),
  uploadedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type LabReport = z.infer<typeof labReportSchema>;

export const createLabReportSchema = z.object({
  title: z.string().min(1).max(160),
  mimeType: supportedLabReportMimeTypeSchema,
  fileContentBase64: z.string().min(1).max(MAX_LAB_REPORT_UPLOAD_BASE64_CHARS),
  consent: z.object({
    storeAndParse: z.literal(true),
    coachChat: z.boolean().default(false),
  }),
  consentVersion: z.string().min(1).max(40).default("v2"),
});

export type CreateLabReportInput = z.infer<typeof createLabReportSchema>;

export const updateLabReportConsentSchema = z.object({
  coachChat: z.boolean(),
});

export type UpdateLabReportConsentInput = z.infer<
  typeof updateLabReportConsentSchema
>;

// ── Biomarker range (nested, materialized in the reading's own unit) ─────────

/**
 * A structured numeric low/high band carried in the reading's own unit. Both
 * the lab-printed reference band and the wellness optimal band materialize to
 * this shape on read; flat nullable columns store them, so there is no
 * per-range unit and no value↔range unit mismatch.
 */
export const biomarkerRangeSchema = z.object({
  low: z.number(),
  high: z.number(),
  unit: z.string().min(1).max(40),
});

export type BiomarkerRangeContract = z.infer<typeof biomarkerRangeSchema>;

// ── Biomarker reading ────────────────────────────────────────────────────────

export const biomarkerReadingSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  labReportId: z.string().uuid().nullable(),
  biomarkerKey: biomarkerKeySchema,
  value: z.number().nullable(),
  valueText: z.string().min(1).max(40).nullable(),
  unit: z.string().min(1).max(40),
  referenceRangeText: z.string().min(1).max(120).nullable(),
  referenceRange: biomarkerRangeSchema.nullable(),
  optimalRange: biomarkerRangeSchema.nullable(),
  observedAt: isoDateSchema.nullable(),
  source: biomarkerReadingSourceSchema,
  confidence: z.number().min(0).max(1).nullable(),
  userEdited: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type BiomarkerReading = z.infer<typeof biomarkerReadingSchema>;

export const createBiomarkerReadingSchema = z
  .object({
    biomarkerKey: biomarkerKeySchema,
    value: z.number().optional(),
    valueText: z.string().min(1).max(40).optional(),
    unit: z.string().min(1).max(40),
    observedAt: isoDateSchema.optional(),
  })
  .superRefine((input, ctx) => {
    const hasValue = input.value !== undefined;
    const hasValueText = input.valueText !== undefined;

    if (hasValue === hasValueText) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of value or valueText.",
        path: ["value"],
      });
    }
  });

export type CreateBiomarkerReadingInput = z.infer<
  typeof createBiomarkerReadingSchema
>;

export const updateBiomarkerReadingSchema = z
  .object({
    value: z.number().optional(),
    valueText: z.string().min(1).max(40).optional(),
    unit: z.string().min(1).max(40).optional(),
    observedAt: isoDateSchema.nullable().optional(),
  })
  .refine(
    (input) =>
      input.value !== undefined ||
      input.valueText !== undefined ||
      input.unit !== undefined ||
      input.observedAt !== undefined,
    { message: "At least one field must be provided." },
  );

export type UpdateBiomarkerReadingInput = z.infer<
  typeof updateBiomarkerReadingSchema
>;

// ── Response shapes ──────────────────────────────────────────────────────────

export const labReportListResponseSchema = z.object({
  reports: z.array(labReportSchema),
});

export type LabReportListResponse = z.infer<typeof labReportListResponseSchema>;

export const labReportDetailSchema = z.object({
  report: labReportSchema,
  readings: z.array(biomarkerReadingSchema),
});

export type LabReportDetail = z.infer<typeof labReportDetailSchema>;

export const biomarkersDashboardMarkerSchema = z.object({
  key: biomarkerKeySchema,
  displayLabel: z.string().min(1).max(120),
  canonicalUnit: z.string().min(1).max(40),
  typicalRange: biomarkerRangeSchema.nullable(),
  latestReading: biomarkerReadingSchema.nullable(),
  readingCount: z.number().int().nonnegative(),
});

export type BiomarkersDashboardMarker = z.infer<
  typeof biomarkersDashboardMarkerSchema
>;

export const biomarkerAreaSchema = z.enum(BIOMARKER_AREAS);

export const biomarkersDashboardAreaSchema = z.object({
  area: biomarkerAreaSchema,
  markers: z.array(biomarkersDashboardMarkerSchema),
});

export type BiomarkersDashboardArea = z.infer<
  typeof biomarkersDashboardAreaSchema
>;

export const biomarkersDashboardResponseSchema = z.object({
  areas: z.array(biomarkersDashboardAreaSchema),
  generatedAt: isoDateTimeSchema,
});

export type BiomarkersDashboardResponse = z.infer<
  typeof biomarkersDashboardResponseSchema
>;

export const biomarkerHistoryResponseSchema = z.object({
  biomarkerKey: biomarkerKeySchema,
  area: biomarkerAreaSchema,
  displayLabel: z.string().min(1).max(120),
  canonicalUnit: z.string().min(1).max(40),
  typicalRange: biomarkerRangeSchema.nullable(),
  readings: z.array(biomarkerReadingSchema).max(50),
});

export type BiomarkerHistoryResponse = z.infer<
  typeof biomarkerHistoryResponseSchema
>;
