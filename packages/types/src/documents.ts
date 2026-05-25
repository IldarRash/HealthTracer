import { z } from "zod";
import { isoDateTimeSchema } from "./dates.js";

export const documentTypeSchema = z.enum([
  "lab_report",
  "clinical_note",
  "imaging_report",
  "medication_list",
  "discharge_summary",
  "other",
]);

export type DocumentType = z.infer<typeof documentTypeSchema>;

export const documentConsentScopeSchema = z.enum([
  "upload_storage",
  "parse_ocr",
  "ai_summarization",
  "semantic_indexing",
  "coach_chat_context",
]);

export type DocumentConsentScope = z.infer<typeof documentConsentScopeSchema>;

export const documentParseStatusSchema = z.enum([
  "uploaded",
  "processing",
  "parsed",
  "summary_ready",
  "failed",
  "revoked",
]);

export type DocumentParseStatus = z.infer<typeof documentParseStatusSchema>;

export const documentReviewStatusSchema = z.enum([
  "pending_review",
  "approved",
  "rejected",
]);

export type DocumentReviewStatus = z.infer<typeof documentReviewStatusSchema>;

export const documentSignalExtractionStatusSchema = z.enum([
  "not_started",
  "processing",
  "ready",
  "failed",
  "revoked",
]);

export type DocumentSignalExtractionStatus = z.infer<
  typeof documentSignalExtractionStatusSchema
>;

export const healthDocumentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  documentType: documentTypeSchema,
  title: z.string().min(1).max(160),
  storageReference: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(120),
  fileSizeBytes: z.number().int().nonnegative().max(25_000_000),
  parseStatus: documentParseStatusSchema,
  signalExtractionStatus: documentSignalExtractionStatusSchema,
  signalExtractionFailureReason: z.string().min(1).max(240).nullable(),
  signalExtractedAt: isoDateTimeSchema.nullable(),
  consentScopes: z.array(documentConsentScopeSchema).min(1),
  consentVersion: z.string().min(1).max(40),
  consentGrantedAt: isoDateTimeSchema,
  parseFailureReason: z.string().min(1).max(240).nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
  deletedAt: isoDateTimeSchema.nullable(),
  uploadedAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type HealthDocument = z.infer<typeof healthDocumentSchema>;

export const healthDocumentSummarySchema = z.object({
  id: z.string().uuid(),
  healthDocumentId: z.string().uuid(),
  userId: z.string().uuid(),
  summaryText: z.string().min(1).max(4000),
  extractedConstraints: z.array(z.string().min(1).max(240)).max(20).default([]),
  reviewStatus: documentReviewStatusSchema,
  reviewedAt: isoDateTimeSchema.nullable(),
  generatedAt: isoDateTimeSchema,
  generatorVersion: z.string().min(1).max(40),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type HealthDocumentSummary = z.infer<typeof healthDocumentSummarySchema>;

export const healthDocumentDetailSchema = healthDocumentSchema.extend({
  summary: healthDocumentSummarySchema.nullable(),
});

export type HealthDocumentDetail = z.infer<typeof healthDocumentDetailSchema>;

export const SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES = [
  "text/plain",
  "application/pdf",
] as const;

export type SupportedHealthDocumentMimeType =
  (typeof SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES)[number];

export const MAX_HEALTH_DOCUMENT_UPLOAD_BYTES = 5_000_000;

export const supportedHealthDocumentMimeTypeSchema = z.enum(
  SUPPORTED_HEALTH_DOCUMENT_MIME_TYPES,
);

export const createHealthDocumentSchema = z
  .object({
    documentType: documentTypeSchema,
    title: z.string().min(1).max(160),
    consentScopes: z.array(documentConsentScopeSchema).min(1).max(5),
    consentVersion: z.string().min(1).max(40).default("v1"),
    mimeType: supportedHealthDocumentMimeTypeSchema.default("text/plain"),
    sampleText: z.string().min(1).max(5000).optional(),
    fileContentBase64: z.string().min(1).optional(),
  })
  .superRefine((input, ctx) => {
    const hasSampleText = Boolean(input.sampleText);
    const hasFileContent = Boolean(input.fileContentBase64);

    if (!hasSampleText && !hasFileContent) {
      ctx.addIssue({
        code: "custom",
        message: "Either sampleText or fileContentBase64 is required.",
        path: ["sampleText"],
      });
    }

    if (hasSampleText && hasFileContent) {
      ctx.addIssue({
        code: "custom",
        message: "Provide sampleText or fileContentBase64, not both.",
        path: ["sampleText"],
      });
    }
  });

export type CreateHealthDocumentInput = z.infer<typeof createHealthDocumentSchema>;

export const updateDocumentConsentSchema = z.object({
  consentScopes: z.array(documentConsentScopeSchema).min(1).max(5).optional(),
  revoke: z.boolean().default(false),
});

export type UpdateDocumentConsentInput = z.infer<typeof updateDocumentConsentSchema>;

export const updateDocumentSummaryReviewSchema = z.object({
  reviewStatus: documentReviewStatusSchema.extract(["approved", "rejected"]),
});

export type UpdateDocumentSummaryReviewInput = z.infer<
  typeof updateDocumentSummaryReviewSchema
>;

export const documentSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type DocumentSearchQuery = z.infer<typeof documentSearchQuerySchema>;

export const documentSearchResultSchema = z.object({
  documentId: z.string().uuid(),
  summaryId: z.string().uuid(),
  documentType: documentTypeSchema,
  title: z.string().min(1).max(160),
  summarySnippet: z.string().min(1).max(500),
  extractedConstraints: z.array(z.string().min(1).max(240)).max(20),
  generatedAt: isoDateTimeSchema,
});

export type DocumentSearchResult = z.infer<typeof documentSearchResultSchema>;

export const documentSearchResponseSchema = z.object({
  results: z.array(documentSearchResultSchema),
});

export type DocumentSearchResponse = z.infer<typeof documentSearchResponseSchema>;

export const documentContextReferenceSchema = z.object({
  documentId: z.string().uuid(),
  summaryId: z.string().uuid(),
  documentType: documentTypeSchema,
  title: z.string().min(1).max(160),
  summarySnippet: z.string().min(1).max(500),
  extractedConstraints: z.array(z.string().min(1).max(240)).max(20),
});

export type DocumentContextReference = z.infer<typeof documentContextReferenceSchema>;

export const aiDocumentContextSummarySchema = z.object({
  items: z.array(documentContextReferenceSchema).max(10),
  generatedAt: isoDateTimeSchema,
});

export type AiDocumentContextSummary = z.infer<typeof aiDocumentContextSummarySchema>;

export const healthDocumentListResponseSchema = z.object({
  documents: z.array(healthDocumentSchema),
});

export type HealthDocumentListResponse = z.infer<typeof healthDocumentListResponseSchema>;

export function hasDocumentConsentScope(
  scopes: readonly DocumentConsentScope[],
  scope: DocumentConsentScope,
): boolean {
  return scopes.includes(scope);
}

export function isHealthDocumentActive(
  document: Pick<HealthDocument, "revokedAt" | "deletedAt">,
): boolean {
  return document.revokedAt === null && document.deletedAt === null;
}

type DocumentEligibilityDocument = {
  consentScopes: readonly DocumentConsentScope[];
  revokedAt: string | null;
  deletedAt: string | null;
  parseStatus: DocumentParseStatus;
};

export function isDocumentSummaryApproved(
  summary: Pick<HealthDocumentSummary, "reviewStatus">,
): boolean {
  return summary.reviewStatus === "approved";
}

export function isDocumentSearchEligible(
  document: DocumentEligibilityDocument,
  summary: Pick<HealthDocumentSummary, "reviewStatus">,
): boolean {
  return (
    isHealthDocumentActive(document) &&
    document.parseStatus === "summary_ready" &&
    isDocumentSummaryApproved(summary) &&
    hasDocumentConsentScope(document.consentScopes, "semantic_indexing")
  );
}

export function isDocumentContextEligible(
  document: DocumentEligibilityDocument,
  summary: Pick<HealthDocumentSummary, "reviewStatus">,
): boolean {
  return (
    isHealthDocumentActive(document) &&
    document.parseStatus === "summary_ready" &&
    isDocumentSummaryApproved(summary) &&
    hasDocumentConsentScope(document.consentScopes, "coach_chat_context")
  );
}

export function buildDocumentSummarySnippet(summaryText: string, maxLength = 500): string {
  const normalized = summaryText.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}
