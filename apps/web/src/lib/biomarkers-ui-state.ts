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
import type { BadgeProps } from "../components/ui";
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

/**
 * Padded-domain projection shared by every range-bar model. Pads a numeric
 * domain by RANGE_BAR_DOMAIN_PADDING_FRACTION on each side and returns a `toPct`
 * that maps a point onto the 0–100 track, plus a `clampedPositionPct` that keeps
 * a value dot inside RANGE_BAR_POSITION_CLAMP. Returns null for a degenerate
 * domain (non-finite or zero span).
 */
function buildRangeBarProjection(
  domainLow: number,
  domainHigh: number,
): {
  toPct: (point: number) => number;
  clampedPositionPct: (value: number) => number;
} | null {
  const span = domainHigh - domainLow;
  if (!Number.isFinite(span) || span <= 0) {
    return null;
  }

  const padding = span * RANGE_BAR_DOMAIN_PADDING_FRACTION;
  const domainMin = domainLow - padding;
  const domainSpan = span + padding * 2;

  const toPct = (point: number): number => ((point - domainMin) / domainSpan) * 100;
  const [clampLow, clampHigh] = RANGE_BAR_POSITION_CLAMP;

  return {
    toPct,
    clampedPositionPct: (value) =>
      Math.min(clampHigh, Math.max(clampLow, toPct(value))),
  };
}

// ── Multi-zone range bar (reference + optimal overlay) ───────────────────────

export type BiomarkerMultiZoneRangeBarModel = {
  /** Dot position along the track, percent, clamped to [2, 98]. */
  positionPct: number;
  /** Reference (in-range) zone boundaries along the track, percent. */
  referenceStartPct: number;
  referenceEndPct: number;
  /** Optimal overlay zone boundaries, clamped inside the track; null when absent. */
  optimalStartPct: number | null;
  optimalEndPct: number | null;
  /** Tick labels under the reference-zone boundaries. */
  lowLabel: string;
  highLabel: string;
};

/**
 * Geometry for the two-zone bar: a reference band plus an optional optimal
 * overlay, projected onto a single padded track whose domain is the union of
 * both ranges. The optimal zone is clamped inside the track. Returns null
 * without a reference-quality range (the optimal band alone cannot anchor the
 * bar — status framing is reference-based).
 */
export function computeMultiZoneRangeBarModel(
  value: number | null | undefined,
  referenceRange: BiomarkerRange | null | undefined,
  optimalRange: BiomarkerRange | null | undefined,
): BiomarkerMultiZoneRangeBarModel | null {
  if (value == null || referenceRange == null || !Number.isFinite(value)) {
    return null;
  }

  // The reference band must itself be a valid span — the status framing and
  // tick labels anchor on it; a degenerate reference cannot carry the bar even
  // if an optimal band would widen the union domain.
  const referenceSpan = referenceRange.high - referenceRange.low;
  if (!Number.isFinite(referenceSpan) || referenceSpan <= 0) {
    return null;
  }

  const domainLow = Math.min(
    referenceRange.low,
    optimalRange?.low ?? referenceRange.low,
  );
  const domainHigh = Math.max(
    referenceRange.high,
    optimalRange?.high ?? referenceRange.high,
  );

  const projection = buildRangeBarProjection(domainLow, domainHigh);
  if (!projection) {
    return null;
  }

  const clampTrack = (pct: number): number => Math.min(100, Math.max(0, pct));

  const optimalUsable =
    optimalRange != null &&
    Number.isFinite(optimalRange.high - optimalRange.low) &&
    optimalRange.high - optimalRange.low > 0;

  return {
    positionPct: projection.clampedPositionPct(value),
    referenceStartPct: projection.toPct(referenceRange.low),
    referenceEndPct: projection.toPct(referenceRange.high),
    optimalStartPct: optimalUsable ? clampTrack(projection.toPct(optimalRange.low)) : null,
    optimalEndPct: optimalUsable ? clampTrack(projection.toPct(optimalRange.high)) : null,
    lowLabel: formatBiomarkerValue(referenceRange.low),
    highLabel: formatBiomarkerValue(referenceRange.high),
  };
}

/**
 * Resolves the reference + optimal ranges to display for a reading. The
 * lab-printed `referenceRange` wins over the catalog `typicalRange` fallback;
 * the wellness `optimalRange` has no fallback. Both are unit-guarded against the
 * reading's own unit exactly like deriveBiomarkerReadingStatus — a range in a
 * different unit is dropped rather than silently compared.
 */
export function resolveDisplayRanges(
  reading: Pick<BiomarkerReading, "unit" | "referenceRange" | "optimalRange"> | null | undefined,
  typicalRange: BiomarkerRange | null | undefined,
): { reference: BiomarkerRange | null; optimal: BiomarkerRange | null } {
  if (!reading) {
    return { reference: typicalRange ?? null, optimal: null };
  }

  const readingUnit = reading.unit.trim().toLowerCase();
  const sameUnit = (range: BiomarkerRange | null | undefined): boolean =>
    range != null && range.unit.trim().toLowerCase() === readingUnit;

  const reference = sameUnit(reading.referenceRange)
    ? reading.referenceRange
    : sameUnit(typicalRange)
      ? (typicalRange as BiomarkerRange)
      : null;

  const optimal = sameUnit(reading.optimalRange) ? reading.optimalRange : null;

  return { reference, optimal };
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
      const { reference } = resolveDisplayRanges(marker.latestReading, marker.typicalRange);
      const status = deriveBiomarkerReadingStatus(marker.latestReading, reference);
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

// ── History chart (recharts, detail page) ────────────────────────────────────

/** A reading guaranteed to carry a finite numeric value. */
type NumericReading<R> = R & { value: number };

/**
 * Numeric readings sharing the most recent reading's unit (values are stored
 * as-reported and never converted), ordered oldest→newest, capped at maxReadings
 * (no cap when omitted). Keeps the same-unit filtering rule in one place.
 */
function selectSameUnitNumericReadings<
  R extends Pick<BiomarkerReading, "value" | "unit">,
>(readings: readonly R[], maxReadings?: number): NumericReading<R>[] {
  const numeric = readings.filter(
    (reading): reading is NumericReading<R> =>
      reading.value != null && Number.isFinite(reading.value),
  );

  const referenceUnit = numeric[0]?.unit.trim().toLowerCase();
  if (referenceUnit === undefined) {
    return [];
  }

  const sameUnit = numeric.filter(
    (reading) => reading.unit.trim().toLowerCase() === referenceUnit,
  );

  return (maxReadings === undefined ? sameUnit : sameUnit.slice(0, maxReadings)).reverse();
}

/** Padded fraction beyond the chart's value/band extent on the Y axis. */
export const HISTORY_CHART_Y_PADDING_FRACTION = 0.08;

export type BiomarkerHistoryChartPoint = {
  /** Epoch ms of observedAt ?? createdAt — the numeric X coordinate. */
  ts: number;
  value: number;
  /** Short "Jun 1" axis/tooltip label. */
  label: string;
};

export type BiomarkerHistoryChartModel = {
  points: BiomarkerHistoryChartPoint[];
  unit: string;
  referenceBand: { low: number; high: number } | null;
  optimalBand: { low: number; high: number } | null;
  yDomain: [number, number];
};

/**
 * Pure model for the recharts history chart. Charts only numeric readings that
 * share the most recent reading's unit (same filter as the trend strip), oldest
 * → newest, with reference/optimal bands taken from the latest reading's ranges
 * (catalog typicalRange as the reference fallback, both unit-guarded). The Y
 * domain is padded to contain every point and visible band. Returns null when
 * fewer than two chartable points exist.
 */
export function buildHistoryChartModel(
  readings: readonly Pick<
    BiomarkerReading,
    "value" | "unit" | "observedAt" | "createdAt" | "referenceRange" | "optimalRange"
  >[],
  typicalRange?: BiomarkerRange | null,
): BiomarkerHistoryChartModel | null {
  const ordered = selectSameUnitNumericReadings(readings);
  if (ordered.length < 2) {
    return null;
  }

  const unit = ordered[0]!.unit;
  const points: BiomarkerHistoryChartPoint[] = ordered.map((reading) => {
    const iso = reading.observedAt ?? reading.createdAt;
    const date = new Date(iso);
    return {
      ts: date.getTime(),
      value: reading.value,
      label: Number.isNaN(date.getTime()) ? "" : formatMonthDayShort(date),
    };
  });

  // Bands come from the most recent reading (the API returns newest-first;
  // `ordered` is oldest→newest, so the latest is the last element).
  const latest = ordered[ordered.length - 1]!;
  const { reference, optimal } = resolveDisplayRanges(latest, typicalRange ?? null);
  const referenceBand = reference ? { low: reference.low, high: reference.high } : null;
  const optimalBand = optimal ? { low: optimal.low, high: optimal.high } : null;

  const extentValues = [
    ...points.map((point) => point.value),
    ...(referenceBand ? [referenceBand.low, referenceBand.high] : []),
    ...(optimalBand ? [optimalBand.low, optimalBand.high] : []),
  ];
  const min = Math.min(...extentValues);
  const max = Math.max(...extentValues);
  const span = max - min;
  const pad = span === 0 ? Math.abs(max) * 0.1 || 1 : span * HISTORY_CHART_Y_PADDING_FRACTION;

  return {
    points,
    unit,
    referenceBand,
    optimalBand,
    yDomain: [min - pad, max + pad],
  };
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
