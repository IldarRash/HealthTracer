import type {
  CorrelationEvidenceRefType,
  DocumentConsentScope,
  DocumentParseStatus,
  DocumentReviewStatus,
  DocumentSignal,
  DocumentSignalExtractionStatus,
  DocumentSignalReviewStatus,
  DocumentType,
  HealthDocument,
  HealthDocumentDetail,
  WellnessCorrelationInsight,
} from "@health/types";
import { hasDocumentConsentScope, MIN_DOCUMENT_SIGNAL_CONFIDENCE_FOR_CONTEXT } from "@health/types";
import type { BadgeProps } from "../components/ui";
import type { ConsentScopeItem } from "../components/ui";
import { formatDateTimeMedium } from "./date-format";

export const DOCUMENT_CONSENT_VERSION = "v1";

export const SAMPLE_DOCUMENT_TEXT =
  "Sample wellness note for development smoke testing only. " +
  "User prefers low-impact cardio three times per week and stays hydrated during training. " +
  "This text is synthetic and does not contain private health data. " +
  "Discuss any medical details with a qualified professional.";

export const DEFAULT_DOCUMENT_CONSENT_SCOPES: readonly DocumentConsentScope[] = [
  "upload_storage",
  "parse_ocr",
  "ai_summarization",
  "semantic_indexing",
  "coach_chat_context",
];

export type DocumentConsentScopeOption = {
  scope: DocumentConsentScope;
  label: string;
  description: string;
  required?: boolean;
};

export const DOCUMENT_CONSENT_SCOPE_OPTIONS: readonly DocumentConsentScopeOption[] = [
  {
    scope: "upload_storage",
    label: "Upload and storage",
    description: "Store the document reference needed for later review.",
    required: true,
  },
  {
    scope: "parse_ocr",
    label: "Parse text",
    description: "Extract readable text from the uploaded document.",
  },
  {
    scope: "ai_summarization",
    label: "AI summarization",
    description: "Generate a structured wellness-oriented summary for your review.",
  },
  {
    scope: "semantic_indexing",
    label: "Semantic search",
    description: "Index approved summaries so you can search them later.",
  },
  {
    scope: "coach_chat_context",
    label: "Coach chat context",
    description:
      "Use approved summary snippets and reviewed wellness signals in coaching conversations with source references.",
  },
] as const;

export const DOCUMENT_TYPE_OPTIONS: readonly { value: DocumentType; label: string }[] = [
  { value: "lab_report", label: "Lab report" },
  { value: "clinical_note", label: "Clinical note" },
  { value: "imaging_report", label: "Imaging report" },
  { value: "medication_list", label: "Medication list" },
  { value: "discharge_summary", label: "Discharge summary" },
  { value: "other", label: "Other health document" },
];

export function documentTypeLabel(documentType: DocumentType): string {
  return DOCUMENT_TYPE_OPTIONS.find((option) => option.value === documentType)?.label ?? documentType;
}

export function parseStatusLabel(status: DocumentParseStatus): string {
  switch (status) {
    case "uploaded":
      return "Uploaded";
    case "processing":
      return "Processing";
    case "parsed":
      return "Parsed";
    case "summary_ready":
      return "Summary ready";
    case "failed":
      return "Processing failed";
    case "revoked":
      return "Revoked";
  }
}

export function parseStatusBadgeTone(status: DocumentParseStatus): NonNullable<BadgeProps["tone"]> {
  switch (status) {
    case "uploaded":
      return "info";
    case "processing":
      return "pending";
    case "parsed":
    case "summary_ready":
      return "success";
    case "failed":
      return "error";
    case "revoked":
      return "neutral";
  }
}

export function reviewStatusLabel(status: DocumentReviewStatus): string {
  switch (status) {
    case "pending_review":
      return "Pending review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
  }
}

export function reviewStatusBadgeTone(status: DocumentReviewStatus): NonNullable<BadgeProps["tone"]> {
  switch (status) {
    case "pending_review":
      return "pending";
    case "approved":
      return "success";
    case "rejected":
      return "error";
  }
}

export function buildDocumentConsentScopeItems(
  selectedScopes: readonly DocumentConsentScope[],
): ConsentScopeItem[] {
  return DOCUMENT_CONSENT_SCOPE_OPTIONS.map((option) => ({
    id: option.scope,
    label: option.label,
    description: option.description,
    enabled: selectedScopes.includes(option.scope),
    required: option.required,
  }));
}

export function canSubmitDocumentUpload(input: {
  title: string;
  sampleText: string;
  selectedFile: File | null;
  consentScopes: readonly DocumentConsentScope[];
  fileValidationError?: string | null;
}): boolean {
  const hasUploadSource =
    input.sampleText.trim().length > 0 || input.selectedFile !== null;

  return (
    input.title.trim().length > 0 &&
    hasUploadSource &&
    !input.fileValidationError &&
    hasDocumentConsentScope(input.consentScopes, "upload_storage")
  );
}

export function canParseDocument(document: Pick<HealthDocument, "parseStatus" | "consentScopes" | "revokedAt">): boolean {
  if (document.revokedAt) {
    return false;
  }

  return (
    (document.parseStatus === "uploaded" || document.parseStatus === "failed") &&
    hasDocumentConsentScope(document.consentScopes, "parse_ocr") &&
    hasDocumentConsentScope(document.consentScopes, "ai_summarization")
  );
}

export function canReviewSummary(
  detail: Pick<HealthDocumentDetail, "parseStatus" | "summary" | "revokedAt">,
): boolean {
  return (
    detail.revokedAt === null &&
    detail.parseStatus === "summary_ready" &&
    detail.summary?.reviewStatus === "pending_review"
  );
}

export function canSearchDocuments(query: string): boolean {
  return query.trim().length > 0;
}

export function isDocumentRevoked(document: Pick<HealthDocument, "revokedAt" | "parseStatus">): boolean {
  return document.revokedAt !== null || document.parseStatus === "revoked";
}

export function formatDocumentTimestamp(value: string): string {
  return formatDateTimeMedium(value);
}

export function signalExtractionStatusLabel(
  status: DocumentSignalExtractionStatus,
): string {
  switch (status) {
    case "not_started":
      return "Signals not extracted";
    case "processing":
      return "Extracting signals";
    case "ready":
      return "Signals ready";
    case "failed":
      return "Extraction failed";
    case "revoked":
      return "Signals revoked";
  }
}

export function signalExtractionBadgeTone(
  status: DocumentSignalExtractionStatus,
): NonNullable<BadgeProps["tone"]> {
  switch (status) {
    case "not_started":
      return "neutral";
    case "processing":
      return "pending";
    case "ready":
      return "success";
    case "failed":
      return "error";
    case "revoked":
      return "neutral";
  }
}

export function signalReviewStatusLabel(status: DocumentSignalReviewStatus): string {
  switch (status) {
    case "pending_review":
      return "Pending review";
    case "approved":
      return "Approved for coaching";
    case "rejected":
      return "Rejected";
    case "ignored":
      return "Ignored";
  }
}

export function signalReviewStatusBadgeTone(
  status: DocumentSignalReviewStatus,
): NonNullable<BadgeProps["tone"]> {
  switch (status) {
    case "pending_review":
      return "pending";
    case "approved":
      return "success";
    case "rejected":
      return "error";
    case "ignored":
      return "neutral";
  }
}

export function formatSignalConfidence(score: number): string {
  return `${Math.round(score * 100)}% extraction confidence`;
}

export function isSignalLowConfidence(signal: Pick<DocumentSignal, "confidenceScore">): boolean {
  return signal.confidenceScore < MIN_DOCUMENT_SIGNAL_CONFIDENCE_FOR_CONTEXT;
}

export function canExtractDocumentSignals(
  document: Pick<
    HealthDocument,
    "revokedAt" | "consentScopes" | "signalExtractionStatus" | "parseStatus"
  >,
): boolean {
  if (document.revokedAt || document.parseStatus === "revoked") {
    return false;
  }

  if (document.signalExtractionStatus === "processing" || document.signalExtractionStatus === "revoked") {
    return false;
  }

  return (
    hasDocumentConsentScope(document.consentScopes, "parse_ocr") &&
    hasDocumentConsentScope(document.consentScopes, "coach_chat_context")
  );
}

export function canReviewDocumentSignal(
  document: Pick<HealthDocument, "revokedAt" | "signalExtractionStatus">,
  signal: Pick<DocumentSignal, "reviewStatus">,
): boolean {
  return (
    document.revokedAt === null &&
    document.signalExtractionStatus === "ready" &&
    signal.reviewStatus === "pending_review"
  );
}

export function partitionDocumentSignals(signals: readonly DocumentSignal[]): {
  pending: DocumentSignal[];
  approved: DocumentSignal[];
  hidden: DocumentSignal[];
} {
  const pending: DocumentSignal[] = [];
  const approved: DocumentSignal[] = [];
  const hidden: DocumentSignal[] = [];

  for (const signal of signals) {
    if (signal.reviewStatus === "pending_review") {
      pending.push(signal);
    } else if (signal.reviewStatus === "approved") {
      approved.push(signal);
    } else {
      hidden.push(signal);
    }
  }

  return { pending, approved, hidden };
}

export function correlationDataStatusLabel(
  status: "sufficient" | "partial" | "insufficient",
): string {
  switch (status) {
    case "sufficient":
      return "Enough data for coaching insights";
    case "partial":
      return "Limited data — insights may be sparse";
    case "insufficient":
      return "Not enough approved data yet";
  }
}

export function correlationConfidenceLabel(
  confidence: WellnessCorrelationInsight["confidence"],
): string {
  switch (confidence) {
    case "high":
      return "Higher confidence pattern";
    case "medium":
      return "Moderate confidence pattern";
    case "low":
      return "Early pattern — review with care";
  }
}

export function coachingDomainLabel(
  domain: WellnessCorrelationInsight["coachingDomain"],
): string {
  switch (domain) {
    case "recovery":
      return "Recovery";
    case "workout":
      return "Training";
    case "nutrition":
      return "Nutrition";
    case "habits":
      return "Habits";
    case "general":
      return "Coaching";
  }
}

export function evidenceRefTypeLabel(type: CorrelationEvidenceRefType): string {
  switch (type) {
    case "document_signal":
      return "Document signal";
    case "health_metric_aggregate":
      return "Health metric summary";
    case "weekly_progress_summary":
      return "Weekly progress";
    case "habit_adherence":
      return "Habit adherence";
  }
}

export const SAMPLE_LAB_DOCUMENT_TEXT =
  "Lab report (synthetic sample for development only). " +
  "Observed date: 2026-05-01. " +
  "Vitamin D: 28 ng/mL. Reference range: 30-100 ng/mL. " +
  "Ferritin: 45 ng/mL. Fasting glucose: 92 mg/dL. " +
  "Energy level: 6 / 10. " +
  "This sample is for wellness coaching context testing only.";
