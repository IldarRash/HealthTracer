import type {
  DocumentContextReference,
  DocumentSearchResult,
  HealthDocument,
  HealthDocumentDetail,
  HealthDocumentSummary,
} from "@health/types";
import {
  buildDocumentSummarySnippet,
  isDocumentContextEligible,
  isDocumentSearchEligible,
} from "@health/types";
import type { healthDocumentSummaries, healthDocuments } from "@health/db";

type DocumentRow = typeof healthDocuments.$inferSelect;
type SummaryRow = typeof healthDocumentSummaries.$inferSelect;

function toIso(value: Date): string {
  return value.toISOString();
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function toHealthDocument(row: DocumentRow): HealthDocument {
  return {
    id: row.id,
    userId: row.userId,
    documentType: row.documentType,
    title: row.title,
    storageReference: row.storageReference,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    parseStatus: row.parseStatus,
    signalExtractionStatus: row.signalExtractionStatus,
    signalExtractionFailureReason: row.signalExtractionFailureReason,
    signalExtractedAt: row.signalExtractedAt ? toIso(row.signalExtractedAt) : null,
    consentScopes: row.consentScopes,
    consentVersion: row.consentVersion,
    consentGrantedAt: toIso(row.consentGrantedAt),
    parseFailureReason: row.parseFailureReason,
    revokedAt: row.revokedAt ? toIso(row.revokedAt) : null,
    deletedAt: row.deletedAt ? toIso(row.deletedAt) : null,
    uploadedAt: toIso(row.uploadedAt),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toHealthDocumentSummary(row: SummaryRow): HealthDocumentSummary {
  return {
    id: row.id,
    healthDocumentId: row.healthDocumentId,
    userId: row.userId,
    summaryText: row.summaryText,
    extractedConstraints: toStringList(row.extractedConstraints),
    reviewStatus: row.reviewStatus,
    reviewedAt: row.reviewedAt ? toIso(row.reviewedAt) : null,
    generatedAt: toIso(row.generatedAt),
    generatorVersion: row.generatorVersion,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toHealthDocumentDetail(
  row: DocumentRow,
  summary: SummaryRow | null,
): HealthDocumentDetail {
  return {
    ...toHealthDocument(row),
    summary: summary ? toHealthDocumentSummary(summary) : null,
  };
}

export function toDocumentSearchResult(
  document: HealthDocument,
  summary: HealthDocumentSummary,
): DocumentSearchResult {
  return {
    documentId: document.id,
    summaryId: summary.id,
    documentType: document.documentType,
    title: document.title,
    summarySnippet: buildDocumentSummarySnippet(summary.summaryText),
    extractedConstraints: summary.extractedConstraints,
    generatedAt: summary.generatedAt,
  };
}

export function toDocumentContextReference(
  document: HealthDocument,
  summary: HealthDocumentSummary,
): DocumentContextReference {
  return {
    documentId: document.id,
    summaryId: summary.id,
    documentType: document.documentType,
    title: document.title,
    summarySnippet: buildDocumentSummarySnippet(summary.summaryText, 400),
    extractedConstraints: summary.extractedConstraints,
  };
}

export function filterSearchResults(
  rows: Array<{ document: DocumentRow; summary: SummaryRow }>,
): DocumentSearchResult[] {
  return rows
    .map(({ document, summary }) => ({
      document: toHealthDocument(document),
      summary: toHealthDocumentSummary(summary),
    }))
    .filter(({ document, summary }) => isDocumentSearchEligible(document, summary))
    .map(({ document, summary }) => toDocumentSearchResult(document, summary));
}

export function filterContextReferences(
  rows: Array<{ document: DocumentRow; summary: SummaryRow }>,
): DocumentContextReference[] {
  return rows
    .map(({ document, summary }) => ({
      document: toHealthDocument(document),
      summary: toHealthDocumentSummary(summary),
    }))
    .filter(({ document, summary }) => isDocumentContextEligible(document, summary))
    .map(({ document, summary }) => toDocumentContextReference(document, summary));
}
