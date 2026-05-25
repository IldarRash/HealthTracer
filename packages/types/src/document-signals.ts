import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import {
  documentSignalExtractionStatusSchema,
  type DocumentConsentScope,
  type DocumentParseStatus,
  hasDocumentConsentScope,
  isHealthDocumentActive,
} from "./documents.js";

export const ALLOWLISTED_DOCUMENT_SIGNAL_KEYS = [
  "vitamin_d",
  "ferritin",
  "hemoglobin",
  "fasting_glucose",
  "total_cholesterol",
  "resting_heart_rate",
  "energy_level",
] as const;

export const documentSignalKeySchema = z.enum(ALLOWLISTED_DOCUMENT_SIGNAL_KEYS);

export type DocumentSignalKey = z.infer<typeof documentSignalKeySchema>;

export const documentSignalReviewStatusSchema = z.enum([
  "pending_review",
  "approved",
  "rejected",
  "ignored",
]);

export type DocumentSignalReviewStatus = z.infer<typeof documentSignalReviewStatusSchema>;

export const documentSignalConfidenceSchema = z.number().min(0).max(1);

export const documentSignalSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  healthDocumentId: z.string().uuid(),
  signalKey: documentSignalKeySchema,
  displayLabel: z.string().min(1).max(120),
  valueText: z.string().min(1).max(80),
  unit: z.string().min(1).max(40),
  referenceRangeText: z.string().min(1).max(120).nullable(),
  observedAt: isoDateSchema.nullable(),
  sourceSection: z.string().min(1).max(160),
  confidenceScore: documentSignalConfidenceSchema,
  reviewStatus: documentSignalReviewStatusSchema,
  ignoredReason: z.string().min(1).max(240).nullable(),
  extractedAt: isoDateTimeSchema,
  reviewedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type DocumentSignal = z.infer<typeof documentSignalSchema>;

export const extractedDocumentSignalDraftSchema = z.object({
  signalKey: documentSignalKeySchema,
  displayLabel: z.string().min(1).max(120),
  valueText: z.string().min(1).max(80),
  unit: z.string().min(1).max(40),
  referenceRangeText: z.string().min(1).max(120).nullable().default(null),
  observedAt: isoDateSchema.nullable().default(null),
  sourceSection: z.string().min(1).max(160),
  confidenceScore: documentSignalConfidenceSchema,
});

export type ExtractedDocumentSignalDraft = z.infer<
  typeof extractedDocumentSignalDraftSchema
>;

export const documentSignalListResponseSchema = z.object({
  documentId: z.string().uuid(),
  extractionStatus: documentSignalExtractionStatusSchema,
  extractionFailureReason: z.string().min(1).max(240).nullable(),
  extractedAt: isoDateTimeSchema.nullable(),
  signals: z.array(documentSignalSchema),
  ignoredContentExplanation: z.string().min(1).max(500).nullable(),
});

export type DocumentSignalListResponse = z.infer<typeof documentSignalListResponseSchema>;

export const updateDocumentSignalReviewSchema = z.object({
  reviewStatus: documentSignalReviewStatusSchema.extract(["approved", "rejected", "ignored"]),
  ignoredReason: z.string().min(1).max(240).optional(),
});

export type UpdateDocumentSignalReviewInput = z.infer<
  typeof updateDocumentSignalReviewSchema
>;

export const correlationEvidenceRefTypeSchema = z.enum([
  "document_signal",
  "health_metric_aggregate",
  "weekly_progress_summary",
  "habit_adherence",
]);

export type CorrelationEvidenceRefType = z.infer<typeof correlationEvidenceRefTypeSchema>;

export const correlationEvidenceRefSchema = z.object({
  type: correlationEvidenceRefTypeSchema,
  id: z.string().min(1).max(120),
  label: z.string().min(1).max(160),
});

export type CorrelationEvidenceRef = z.infer<typeof correlationEvidenceRefSchema>;

export const VERIFIABLE_CORRELATION_EVIDENCE_REF_TYPES = [
  "document_signal",
  "health_metric_aggregate",
  "weekly_progress_summary",
] as const satisfies readonly CorrelationEvidenceRefType[];

export function buildHealthMetricAggregateEvidenceId(item: {
  metricType: string;
  periodStart: string;
  periodEnd: string;
}): string {
  return `${item.metricType}:${item.periodStart}:${item.periodEnd}`;
}

export function parseHealthMetricAggregateEvidenceId(
  id: string,
): { metricType: string; periodStart: string; periodEnd: string } | null {
  const parts = id.split(":");

  if (parts.length !== 3) {
    return null;
  }

  const [metricType, periodStart, periodEnd] = parts;

  if (!metricType || !periodStart || !periodEnd) {
    return null;
  }

  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!isoDatePattern.test(periodStart) || !isoDatePattern.test(periodEnd)) {
    return null;
  }

  return { metricType, periodStart, periodEnd };
}

export const proposalCorrelationEvidenceRefsSchema = z
  .array(correlationEvidenceRefSchema)
  .max(5)
  .default([]);

export const wellnessCorrelationInsightSchema = z.object({
  id: z.string().min(1).max(120),
  headline: z.string().min(1).max(240),
  summary: z.string().min(1).max(500),
  coachingDomain: z.enum(["recovery", "workout", "nutrition", "habits", "general"]),
  evidenceRefs: z.array(correlationEvidenceRefSchema).min(1).max(5),
  confidence: z.enum(["high", "medium", "low"]),
});

export type WellnessCorrelationInsight = z.infer<typeof wellnessCorrelationInsightSchema>;

export const correlationInsightPreviewResponseSchema = z.object({
  insights: z.array(wellnessCorrelationInsightSchema).max(5),
  generatedAt: isoDateTimeSchema,
  dataStatus: z.enum(["sufficient", "partial", "insufficient"]),
});

export type CorrelationInsightPreviewResponse = z.infer<
  typeof correlationInsightPreviewResponseSchema
>;

export const documentSignalContextRefSchema = z.object({
  signalId: z.string().uuid(),
  documentId: z.string().uuid(),
  signalKey: documentSignalKeySchema,
  displayLabel: z.string().min(1).max(120),
  valueText: z.string().min(1).max(80),
  unit: z.string().min(1).max(40),
  observedAt: isoDateSchema.nullable(),
  confidenceScore: documentSignalConfidenceSchema,
});

export type DocumentSignalContextRef = z.infer<typeof documentSignalContextRefSchema>;

export const aiDocumentSignalContextSummarySchema = z.object({
  signals: z.array(documentSignalContextRefSchema).max(20),
  generatedAt: isoDateTimeSchema,
});

export type AiDocumentSignalContextSummary = z.infer<
  typeof aiDocumentSignalContextSummarySchema
>;

export const MIN_DOCUMENT_SIGNAL_CONFIDENCE_FOR_CONTEXT = 0.6;

type DocumentSignalEligibilityDocument = {
  consentScopes: readonly DocumentConsentScope[];
  revokedAt: string | null;
  deletedAt: string | null;
  parseStatus: DocumentParseStatus;
  signalExtractionStatus: z.infer<typeof documentSignalExtractionStatusSchema>;
};

type DocumentSignalEligibilitySignal = Pick<
  DocumentSignal,
  "reviewStatus" | "confidenceScore"
>;

export function isDocumentSignalApproved(
  signal: Pick<DocumentSignal, "reviewStatus">,
): boolean {
  return signal.reviewStatus === "approved";
}

export function isDocumentSignalContextEligible(
  document: DocumentSignalEligibilityDocument,
  signal: DocumentSignalEligibilitySignal,
): boolean {
  return (
    isHealthDocumentActive(document) &&
    document.signalExtractionStatus === "ready" &&
    hasDocumentConsentScope(document.consentScopes, "coach_chat_context") &&
    isDocumentSignalApproved(signal) &&
    signal.confidenceScore >= MIN_DOCUMENT_SIGNAL_CONFIDENCE_FOR_CONTEXT
  );
}

export function isDocumentSignalCorrelationEligible(
  document: DocumentSignalEligibilityDocument,
  signal: DocumentSignalEligibilitySignal,
): boolean {
  return (
    isHealthDocumentActive(document) &&
    document.signalExtractionStatus === "ready" &&
    hasDocumentConsentScope(document.consentScopes, "coach_chat_context") &&
    isDocumentSignalApproved(signal) &&
    signal.confidenceScore >= MIN_DOCUMENT_SIGNAL_CONFIDENCE_FOR_CONTEXT
  );
}

export function validateExtractedDocumentSignalDrafts(
  drafts: unknown[],
): { valid: ExtractedDocumentSignalDraft[]; errors: string[] } {
  const valid: ExtractedDocumentSignalDraft[] = [];
  const errors: string[] = [];

  for (const [index, draft] of drafts.entries()) {
    const parsed = extractedDocumentSignalDraftSchema.safeParse(draft);

    if (!parsed.success) {
      errors.push(
        ...parsed.error.issues.map(
          (issue) =>
            `signals[${index}].${issue.path.join(".") || "value"}: ${issue.message}`,
        ),
      );
      continue;
    }

    valid.push(parsed.data);
  }

  return { valid, errors };
}

const WELLNESS_INSIGHT_UNSAFE_PATTERNS = [
  /\bdiagnos(e|is|ed|ing)\b/i,
  /\bprescri(be|ption|bed|bing)\b/i,
  /\btreat(ment|ing|ed)\b/i,
  /\bmedication\b/i,
  /\bdosage\b/i,
  /\bdose\b/i,
  /\bclinical(?:ly)?\b/i,
  /\bpatholog(y|ical)\b/i,
  /\bdisorder\b/i,
  /\bcure\b/i,
  /\babnormal\b/i,
  /\bdeficient\b/i,
  /\bnormal range\b/i,
];

export function containsUnsafeWellnessInsightLanguage(text: string): boolean {
  return WELLNESS_INSIGHT_UNSAFE_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateWellnessCorrelationInsight(
  insight: WellnessCorrelationInsight,
): string[] {
  const errors: string[] = [];

  if (containsUnsafeWellnessInsightLanguage(insight.headline)) {
    errors.push("headline: Insight headline contains unsafe medical wording.");
  }

  if (containsUnsafeWellnessInsightLanguage(insight.summary)) {
    errors.push("summary: Insight summary contains unsafe medical wording.");
  }

  for (const [index, ref] of insight.evidenceRefs.entries()) {
    if (containsUnsafeWellnessInsightLanguage(ref.label)) {
      errors.push(`evidenceRefs[${index}].label: Evidence label contains unsafe medical wording.`);
    }
  }

  return errors;
}
