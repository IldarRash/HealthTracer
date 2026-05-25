import type {
  DocumentSignal,
  DocumentSignalContextRef,
  DocumentSignalListResponse,
  ExtractedDocumentSignalDraft,
} from "@health/types";
import { buildIgnoredContentExplanation } from "./document-signal-extraction.js";
import {
  isDocumentSignalContextEligible,
  isHealthDocumentActive,
} from "@health/types";
import type { documentSignals, healthDocuments } from "@health/db";

type DocumentRow = typeof healthDocuments.$inferSelect;
type SignalRow = typeof documentSignals.$inferSelect;

function toIso(value: Date): string {
  return value.toISOString();
}

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function toConfidenceScore(value: string): number {
  return Number.parseFloat(value);
}

export function toDocumentSignal(row: SignalRow): DocumentSignal {
  return {
    id: row.id,
    userId: row.userId,
    healthDocumentId: row.healthDocumentId,
    signalKey: row.signalKey,
    displayLabel: row.displayLabel,
    valueText: row.valueText,
    unit: row.unit,
    referenceRangeText: row.referenceRangeText,
    observedAt: toIsoDate(row.observedAt),
    sourceSection: row.sourceSection,
    confidenceScore: toConfidenceScore(row.confidenceScore),
    reviewStatus: row.reviewStatus,
    ignoredReason: row.ignoredReason,
    extractedAt: toIso(row.extractedAt),
    reviewedAt: row.reviewedAt ? toIso(row.reviewedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toDocumentSignalContextRef(
  document: Pick<DocumentRow, "id">,
  signal: DocumentSignal,
): DocumentSignalContextRef {
  return {
    signalId: signal.id,
    documentId: document.id,
    signalKey: signal.signalKey,
    displayLabel: signal.displayLabel,
    valueText: signal.valueText,
    unit: signal.unit,
    observedAt: signal.observedAt,
    confidenceScore: signal.confidenceScore,
  };
}

export function toSignalInsertValues(
  userId: string,
  healthDocumentId: string,
  draft: ExtractedDocumentSignalDraft,
) {
  return {
    userId,
    healthDocumentId,
    signalKey: draft.signalKey,
    displayLabel: draft.displayLabel,
    valueText: draft.valueText,
    unit: draft.unit,
    referenceRangeText: draft.referenceRangeText,
    observedAt: draft.observedAt ? new Date(`${draft.observedAt}T00:00:00.000Z`) : null,
    sourceSection: draft.sourceSection,
    confidenceScore: draft.confidenceScore.toFixed(3),
  };
}

export function toDocumentSignalListResponse(
  document: DocumentRow,
  signals: DocumentSignal[],
): DocumentSignalListResponse {
  return {
    documentId: document.id,
    extractionStatus: document.signalExtractionStatus,
    extractionFailureReason: document.signalExtractionFailureReason,
    extractedAt: document.signalExtractedAt ? toIso(document.signalExtractedAt) : null,
    signals,
    ignoredContentExplanation: buildIgnoredContentExplanation(signals.length),
  };
}

export function filterDocumentSignalContextRefs(
  rows: Array<{ document: DocumentRow; signal: SignalRow }>,
): DocumentSignalContextRef[] {
  return rows
    .map(({ document, signal }) => ({
      document,
      signal: toDocumentSignal(signal),
    }))
    .filter(({ document, signal }) =>
      isDocumentSignalContextEligible(
        {
          consentScopes: document.consentScopes,
          revokedAt: document.revokedAt ? toIso(document.revokedAt) : null,
          deletedAt: document.deletedAt ? toIso(document.deletedAt) : null,
          parseStatus: document.parseStatus,
          signalExtractionStatus: document.signalExtractionStatus,
        },
        signal,
      ),
    )
    .filter(({ document }) => isHealthDocumentActive({
      revokedAt: document.revokedAt ? toIso(document.revokedAt) : null,
      deletedAt: document.deletedAt ? toIso(document.deletedAt) : null,
    }))
    .map(({ document, signal }) => toDocumentSignalContextRef(document, signal));
}
