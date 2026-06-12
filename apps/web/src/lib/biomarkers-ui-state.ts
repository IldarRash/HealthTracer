import type {
  BiomarkerRange,
  BiomarkerReading,
  BiomarkersDashboardArea,
  BiomarkersDashboardMarker,
  BiomarkersDashboardResponse,
  LabReport,
  LabReportFailureCode,
  LabReportStatus,
} from "@health/types";
import { BIOMARKER_AREA_ORDER } from "@health/types";
import type { BadgeProps, DsTrendStripDayData } from "../components/ui";
import { formatDateMedium, formatMonthDayShort } from "./date-format";

// ---------------------------------------------------------------------------
// Pure UI-state helpers for the /biomarkers dashboard and detail pages.
//
// Wording rule (regression-tested): all status framing uses "typical range" —
// never clinical judgement words. The single allowed mention of those words is
// the Biomarkers.wellnessNote disclaimer line.
// ---------------------------------------------------------------------------

export type BiomarkerStatus =
  | "in_range"
  | "below_range"
  | "above_range"
  | "well_below_range"
  | "well_above_range"
  | "no_reference";

/** Fraction of the range span beyond a bound that escalates to a "well_*" status. */
export const BIOMARKER_WELL_OUTSIDE_FRACTION = 0.2;

export function deriveBiomarkerStatus(
  value: number | null | undefined,
  range: Pick<BiomarkerRange, "low" | "high"> | null | undefined,
): BiomarkerStatus {
  if (value == null || range == null || !Number.isFinite(value)) {
    return "no_reference";
  }

  const span = range.high - range.low;
  if (!Number.isFinite(span) || span <= 0) {
    return "no_reference";
  }

  const wellMargin = span * BIOMARKER_WELL_OUTSIDE_FRACTION;

  if (value < range.low - wellMargin) {
    return "well_below_range";
  }
  if (value < range.low) {
    return "below_range";
  }
  if (value > range.high + wellMargin) {
    return "well_above_range";
  }
  if (value > range.high) {
    return "above_range";
  }
  return "in_range";
}

/**
 * Status for a stored reading. Units are stored as-reported and never
 * converted, so a reading is only compared against the typical range when the
 * units match exactly — otherwise the status is honestly "no_reference".
 */
export function deriveBiomarkerReadingStatus(
  reading: Pick<BiomarkerReading, "value" | "unit"> | null | undefined,
  range: BiomarkerRange | null | undefined,
): BiomarkerStatus {
  if (!reading || reading.value == null || !range) {
    return "no_reference";
  }

  if (reading.unit.trim().toLowerCase() !== range.unit.trim().toLowerCase()) {
    return "no_reference";
  }

  return deriveBiomarkerStatus(reading.value, range);
}

export function biomarkerStatusTone(
  status: BiomarkerStatus,
): NonNullable<BadgeProps["tone"]> {
  switch (status) {
    case "in_range":
      return "green";
    case "below_range":
    case "above_range":
      return "amber";
    case "well_below_range":
    case "well_above_range":
      return "red";
    case "no_reference":
      return "neutral";
  }
}

/** CSS color for the range-bar position dot, matching the badge tone. */
export function biomarkerStatusColor(status: BiomarkerStatus): string {
  switch (biomarkerStatusTone(status)) {
    case "green":
      return "var(--color-metric-green)";
    case "amber":
      return "var(--color-metric-amber)";
    case "red":
      return "var(--color-metric-red)";
    default:
      return "var(--color-text-muted)";
  }
}

/** i18n key suffix in the Biomarkers namespace, e.g. t("status.inRange"). */
export function biomarkerStatusLabelKey(status: BiomarkerStatus): string {
  switch (status) {
    case "in_range":
      return "status.inRange";
    case "below_range":
      return "status.belowRange";
    case "above_range":
      return "status.aboveRange";
    case "well_below_range":
      return "status.wellBelowRange";
    case "well_above_range":
      return "status.wellAboveRange";
    case "no_reference":
      return "status.noReference";
  }
}

// ── Range bar geometry ──────────────────────────────────────────────────────

/** Track domain extends the typical range by this fraction of its span on each side. */
export const RANGE_BAR_DOMAIN_PADDING_FRACTION = 0.25;

/** The position dot is clamped into [2, 98]% so it never clips the track edges. */
export const RANGE_BAR_POSITION_CLAMP: readonly [number, number] = [2, 98];

export type BiomarkerRangeBarModel = {
  /** Dot position along the track, percent, clamped to [2, 98]. */
  positionPct: number;
  /** Where the in-range zone starts/ends along the track, percent. */
  rangeStartPct: number;
  rangeEndPct: number;
  /** Tick labels under the zone boundaries. */
  lowLabel: string;
  highLabel: string;
};

export function computeRangeBarModel(
  value: number | null | undefined,
  range: BiomarkerRange | null | undefined,
): BiomarkerRangeBarModel | null {
  if (value == null || range == null || !Number.isFinite(value)) {
    return null;
  }

  const span = range.high - range.low;
  if (!Number.isFinite(span) || span <= 0) {
    return null;
  }

  const padding = span * RANGE_BAR_DOMAIN_PADDING_FRACTION;
  const domainMin = range.low - padding;
  const domainMax = range.high + padding;
  const domainSpan = domainMax - domainMin;

  const toPct = (point: number): number => ((point - domainMin) / domainSpan) * 100;
  const [clampLow, clampHigh] = RANGE_BAR_POSITION_CLAMP;
  const positionPct = Math.min(clampHigh, Math.max(clampLow, toPct(value)));

  return {
    positionPct,
    rangeStartPct: toPct(range.low),
    rangeEndPct: toPct(range.high),
    lowLabel: formatBiomarkerValue(range.low),
    highLabel: formatBiomarkerValue(range.high),
  };
}

// ── Dashboard grouping ──────────────────────────────────────────────────────

/** Areas in catalog display order, keeping only areas that have markers. */
export function groupDashboardAreas(
  dashboard: Pick<BiomarkersDashboardResponse, "areas">,
): BiomarkersDashboardArea[] {
  const byArea = new Map(dashboard.areas.map((area) => [area.area, area]));

  return BIOMARKER_AREA_ORDER.flatMap((area) => {
    const entry = byArea.get(area);
    return entry && entry.markers.length > 0 ? [entry] : [];
  });
}

export function isTrackedMarker(marker: BiomarkersDashboardMarker): boolean {
  return marker.latestReading !== null;
}

export function countTrackedMarkers(
  dashboard: Pick<BiomarkersDashboardResponse, "areas">,
): number {
  return dashboard.areas.reduce(
    (total, area) => total + area.markers.filter(isTrackedMarker).length,
    0,
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

export type BiomarkersHeroView = {
  trackedCount: number;
  outsideRangeCount: number;
  /** Formatted date of the most recent report, or null when no reports exist. */
  lastReportLabel: string | null;
};

export function buildBiomarkersHeroView(
  dashboard: Pick<BiomarkersDashboardResponse, "areas">,
  reports: readonly Pick<LabReport, "uploadedAt">[],
): BiomarkersHeroView {
  let outsideRangeCount = 0;

  for (const area of dashboard.areas) {
    for (const marker of area.markers) {
      const status = deriveBiomarkerReadingStatus(
        marker.latestReading,
        marker.typicalRange ? { ...marker.typicalRange } : null,
      );
      if (status !== "in_range" && status !== "no_reference") {
        outsideRangeCount += 1;
      }
    }
  }

  const latestReport = [...reports].sort((left, right) =>
    right.uploadedAt.localeCompare(left.uploadedAt),
  )[0];

  return {
    trackedCount: countTrackedMarkers(dashboard),
    outsideRangeCount,
    lastReportLabel: latestReport ? formatDateMedium(latestReport.uploadedAt) : null,
  };
}

// ── Trend strip (detail page) ───────────────────────────────────────────────

export const TREND_STRIP_MAX_READINGS = 6;

/**
 * Builds DsTrendStrip days from reading history (most recent first as the API
 * returns it). Only numeric readings sharing the most recent reading's unit
 * are charted (values are stored as-reported and never converted). Values are
 * normalized to 0–100 within the charted set; bars are ordered oldest→newest.
 * Returns [] when fewer than 2 chartable readings exist.
 */
export function buildTrendStripDays(
  readings: readonly Pick<BiomarkerReading, "value" | "unit" | "observedAt" | "createdAt">[],
  maxReadings = TREND_STRIP_MAX_READINGS,
): DsTrendStripDayData[] {
  const numeric = readings.filter(
    (reading): reading is (typeof readings)[number] & { value: number } =>
      reading.value != null && Number.isFinite(reading.value),
  );

  const referenceUnit = numeric[0]?.unit.trim().toLowerCase();
  if (referenceUnit === undefined) {
    return [];
  }

  const sameUnit = numeric
    .filter((reading) => reading.unit.trim().toLowerCase() === referenceUnit)
    .slice(0, maxReadings)
    .reverse();

  if (sameUnit.length < 2) {
    return [];
  }

  const values = sameUnit.map((reading) => reading.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;

  return sameUnit.map((reading) => ({
    value:
      spread === 0 ? 50 : Math.round(((reading.value - min) / spread) * 100),
    label: formatTrendStripDayLabel(reading.observedAt ?? reading.createdAt),
    state: "past" as const,
  }));
}

function formatTrendStripDayLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return formatMonthDayShort(date);
}

// ── Lab report rows ─────────────────────────────────────────────────────────

/** i18n key suffix in the Biomarkers namespace for a report status badge. */
export function labReportStatusLabelKey(status: LabReportStatus): string {
  switch (status) {
    case "uploaded":
      return "reports.statusUploaded";
    case "processing":
      return "reports.statusProcessing";
    case "extracted":
      return "reports.statusExtracted";
    case "failed":
      return "reports.statusFailed";
  }
}

export function labReportStatusBadgeTone(
  status: LabReportStatus,
): NonNullable<BadgeProps["tone"]> {
  switch (status) {
    case "uploaded":
      return "info";
    case "processing":
      return "pending";
    case "extracted":
      return "success";
    case "failed":
      return "error";
  }
}

/** i18n key suffix for the humane per-code failure message. */
export function failureCodeMessageKey(code: LabReportFailureCode): string {
  return `failure.${code}`;
}

export function hasProcessingLabReports(
  reports: readonly Pick<LabReport, "status">[],
): boolean {
  return reports.some((report) => report.status === "processing");
}

/**
 * Retry is offered for failed extractions and for reports stuck in "uploaded"
 * (the post-upload extract call never completed, e.g. a network drop).
 */
export function canRetryLabReportExtraction(
  report: Pick<LabReport, "status">,
): boolean {
  return report.status === "failed" || report.status === "uploaded";
}

export function hasCoachContextConsent(
  report: Pick<LabReport, "coachContextConsentAt">,
): boolean {
  return report.coachContextConsentAt !== null;
}

// ── Upload form ─────────────────────────────────────────────────────────────

export function canSubmitLabReportUpload(input: {
  title: string;
  selectedFile: File | null;
  fileValidationError: string | null;
  consentStoreParse: boolean;
}): boolean {
  return (
    input.title.trim().length > 0 &&
    input.selectedFile !== null &&
    !input.fileValidationError &&
    input.consentStoreParse
  );
}

// ── Reading formatting ──────────────────────────────────────────────────────

export function formatBiomarkerValue(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  // Up to 2 decimals, trailing zeros trimmed ("5.60" → "5.6").
  return String(Number(value.toFixed(2)));
}

export function formatReadingValue(
  reading: Pick<BiomarkerReading, "value" | "valueText">,
): string {
  if (reading.value != null) {
    return formatBiomarkerValue(reading.value);
  }

  return reading.valueText ?? "—";
}

/** "0.82" → 82 (integer percent for the confidence line). */
export function formatReadingConfidence(confidence: number): number {
  return Math.round(confidence * 100);
}

export type ReadingProvenanceView =
  | { kind: "extracted"; percent: number }
  | { kind: "extracted_no_confidence" }
  | { kind: "edited" }
  | { kind: "manual" };

export function buildReadingProvenanceView(
  reading: Pick<BiomarkerReading, "source" | "confidence" | "userEdited">,
): ReadingProvenanceView {
  if (reading.userEdited) {
    return { kind: "edited" };
  }

  if (reading.source === "manual") {
    return { kind: "manual" };
  }

  if (reading.confidence != null) {
    return { kind: "extracted", percent: formatReadingConfidence(reading.confidence) };
  }

  return { kind: "extracted_no_confidence" };
}

export function formatReadingObservedDate(
  reading: Pick<BiomarkerReading, "observedAt" | "createdAt">,
): string {
  return formatDateMedium(reading.observedAt ?? reading.createdAt);
}
