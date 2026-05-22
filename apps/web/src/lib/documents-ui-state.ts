import type {
  DocumentConsentScope,
  DocumentParseStatus,
  DocumentReviewStatus,
  DocumentType,
  HealthDocument,
  HealthDocumentDetail,
} from "@health/types";
import { hasDocumentConsentScope } from "@health/types";
import type { BadgeProps } from "../components/ui";
import type { ConsentScopeItem } from "../components/ui";

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
    description: "Use approved summary snippets in coaching conversations with source references.",
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
  consentScopes: readonly DocumentConsentScope[];
}): boolean {
  return (
    input.title.trim().length > 0 &&
    input.sampleText.trim().length > 0 &&
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
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
