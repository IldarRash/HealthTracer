import type { biomarkerReadings, labReports } from "@health/db";
import type {
  BiomarkerKey,
  BiomarkerRangeContract,
  BiomarkerReading,
  BiomarkerReadingSource,
  LabReport,
  LabReportDetail,
  LabReportFailureCode,
  SupportedLabReportMimeType,
} from "@health/types";

export type LabReportRow = typeof labReports.$inferSelect;
export type BiomarkerReadingRow = typeof biomarkerReadings.$inferSelect;

function toIsoDateTime(value: Date): string {
  return value.toISOString();
}

/** DB timestamps for observation dates carry no meaningful time — expose the UTC date. */
function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Parse a contract-level YYYY-MM-DD observation date into a UTC timestamp. */
export function isoDateToTimestamp(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toLabReport(row: LabReportRow): LabReport {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    storageReference: row.storageReference,
    mimeType: row.mimeType as SupportedLabReportMimeType,
    fileSizeBytes: row.fileSizeBytes,
    status: row.status,
    failureCode: row.failureCode as LabReportFailureCode | null,
    observedAt: row.observedAt ? toIsoDate(row.observedAt) : null,
    unmappedMarkerCount: row.unmappedMarkerCount,
    consentVersion: row.consentVersion,
    storeParseConsentAt: toIsoDateTime(row.storeParseConsentAt),
    coachContextConsentAt: row.coachContextConsentAt
      ? toIsoDateTime(row.coachContextConsentAt)
      : null,
    extractedAt: row.extractedAt ? toIsoDateTime(row.extractedAt) : null,
    uploadedAt: toIsoDateTime(row.uploadedAt),
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  };
}

/**
 * Materialize a structured range from its flat low/high columns in the reading's
 * own unit. Returns null unless BOTH bounds are present (the DB invariant the
 * extraction/Zod layer guarantees), so a half-populated pair never surfaces.
 */
function toBiomarkerRange(
  low: string | null,
  high: string | null,
  unit: string,
): BiomarkerRangeContract | null {
  if (low === null || high === null) {
    return null;
  }

  return { low: Number(low), high: Number(high), unit };
}

export function toBiomarkerReading(row: BiomarkerReadingRow): BiomarkerReading {
  return {
    id: row.id,
    userId: row.userId,
    labReportId: row.labReportId,
    biomarkerKey: row.biomarkerKey as BiomarkerKey,
    value: row.value === null ? null : Number(row.value),
    valueText: row.valueText,
    unit: row.unit,
    referenceRangeText: row.referenceRangeText,
    referenceRange: toBiomarkerRange(
      row.referenceRangeLow,
      row.referenceRangeHigh,
      row.unit,
    ),
    optimalRange: toBiomarkerRange(row.optimalRangeLow, row.optimalRangeHigh, row.unit),
    observedAt: row.observedAt ? toIsoDate(row.observedAt) : null,
    source: row.source as BiomarkerReadingSource,
    confidence: row.confidence === null ? null : Number(row.confidence),
    userEdited: row.userEdited,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
  };
}

export function toLabReportDetail(
  report: LabReportRow,
  readings: BiomarkerReadingRow[],
): LabReportDetail {
  return {
    report: toLabReport(report),
    readings: readings.map(toBiomarkerReading),
  };
}
