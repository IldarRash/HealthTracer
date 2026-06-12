import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BiomarkerReading, BiomarkersDashboardResponse, LabReport } from "@health/types";
import { containsUnsafeWellnessInsightLanguage } from "@health/types";
import {
  biomarkerStatusColor,
  biomarkerStatusLabelKey,
  biomarkerStatusTone,
  buildBiomarkersHeroView,
  buildHistoryChartModel,
  buildReadingProvenanceView,
  canRetryLabReportExtraction,
  canSubmitLabReportUpload,
  computeMultiZoneRangeBarModel,
  countTrackedMarkers,
  deriveBiomarkerReadingStatus,
  deriveBiomarkerStatus,
  resolveDisplayRanges,
  failureCodeMessageKey,
  formatBiomarkerValue,
  formatReadingConfidence,
  formatReadingObservedDate,
  formatReadingValue,
  groupDashboardAreas,
  hasCoachContextConsent,
  hasProcessingLabReports,
  labReportStatusBadgeTone,
  labReportStatusLabelKey,
} from "./biomarkers-ui-state.js";

const NOW = "2026-06-01T12:00:00.000Z";

function createReading(overrides: Partial<BiomarkerReading> = {}): BiomarkerReading {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    labReportId: null,
    biomarkerKey: "vitamin_d",
    value: 42,
    valueText: null,
    unit: "ng/mL",
    referenceRangeText: null,
    referenceRange: null,
    optimalRange: null,
    observedAt: "2026-05-01",
    source: "extraction",
    confidence: 0.82,
    userEdited: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function createReport(overrides: Partial<LabReport> = {}): LabReport {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    userId: "22222222-2222-4222-8222-222222222222",
    title: "Spring panel",
    storageReference: "lab-reports/spring.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1024,
    status: "extracted",
    failureCode: null,
    observedAt: "2026-05-01",
    unmappedMarkerCount: 0,
    consentVersion: "v2",
    storeParseConsentAt: NOW,
    coachContextConsentAt: null,
    extractedAt: NOW,
    uploadedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const RANGE = { low: 30, high: 100, unit: "ng/mL" };

describe("deriveBiomarkerStatus", () => {
  // span = 70; well margin = 14.
  it("classifies values against the typical range with a 20% well-outside band", () => {
    expect(deriveBiomarkerStatus(50, RANGE)).toBe("in_range");
    expect(deriveBiomarkerStatus(30, RANGE)).toBe("in_range");
    expect(deriveBiomarkerStatus(100, RANGE)).toBe("in_range");
    expect(deriveBiomarkerStatus(25, RANGE)).toBe("below_range");
    expect(deriveBiomarkerStatus(15.9, RANGE)).toBe("well_below_range");
    expect(deriveBiomarkerStatus(105, RANGE)).toBe("above_range");
    expect(deriveBiomarkerStatus(114.1, RANGE)).toBe("well_above_range");
  });

  it("returns no_reference for missing value, missing range, or degenerate spans", () => {
    expect(deriveBiomarkerStatus(null, RANGE)).toBe("no_reference");
    expect(deriveBiomarkerStatus(50, null)).toBe("no_reference");
    expect(deriveBiomarkerStatus(Number.NaN, RANGE)).toBe("no_reference");
    expect(deriveBiomarkerStatus(50, { low: 10, high: 10 })).toBe("no_reference");
  });
});

describe("deriveBiomarkerReadingStatus", () => {
  it("only compares readings whose as-reported unit matches the range unit", () => {
    expect(deriveBiomarkerReadingStatus(createReading({ value: 20 }), RANGE)).toBe(
      "below_range",
    );
    // Stored as-reported in another unit — never silently converted/compared.
    expect(
      deriveBiomarkerReadingStatus(createReading({ value: 20, unit: "nmol/L" }), RANGE),
    ).toBe("no_reference");
    expect(deriveBiomarkerReadingStatus(null, RANGE)).toBe("no_reference");
    expect(
      deriveBiomarkerReadingStatus(createReading({ value: null, valueText: "trace" }), RANGE),
    ).toBe("no_reference");
  });
});

describe("status tone and label keys", () => {
  it("maps statuses to badge tones (green/amber/amber/red/red/neutral)", () => {
    expect(biomarkerStatusTone("in_range")).toBe("green");
    expect(biomarkerStatusTone("below_range")).toBe("amber");
    expect(biomarkerStatusTone("above_range")).toBe("amber");
    expect(biomarkerStatusTone("well_below_range")).toBe("red");
    expect(biomarkerStatusTone("well_above_range")).toBe("red");
    expect(biomarkerStatusTone("no_reference")).toBe("neutral");
  });

  it("maps statuses to i18n label keys and dot colors", () => {
    expect(biomarkerStatusLabelKey("in_range")).toBe("status.inRange");
    expect(biomarkerStatusLabelKey("well_above_range")).toBe("status.wellAboveRange");
    expect(biomarkerStatusColor("in_range")).toBe("var(--color-metric-green)");
    expect(biomarkerStatusColor("no_reference")).toBe("var(--color-text-muted)");
  });
});

describe("computeMultiZoneRangeBarModel", () => {
  const OPTIMAL = { low: 40, high: 60, unit: "ng/mL" };

  it("matches the single-zone geometry when only the reference range is given", () => {
    // Domain is the reference range itself → zone at 1/6 and 5/6, midpoint dot.
    const model = computeMultiZoneRangeBarModel(65, RANGE, null);
    expect(model).not.toBeNull();
    expect(model!.referenceStartPct).toBeCloseTo(100 / 6, 5);
    expect(model!.referenceEndPct).toBeCloseTo(500 / 6, 5);
    expect(model!.positionPct).toBeCloseTo(50, 5);
    expect(model!.optimalStartPct).toBeNull();
    expect(model!.optimalEndPct).toBeNull();
    expect(model!.lowLabel).toBe("30");
    expect(model!.highLabel).toBe("100");
  });

  it("projects an optimal zone nested inside the reference onto the same union domain", () => {
    // Optimal [40,60] ⊂ reference [30,100] → domain stays the reference's; the
    // optimal zone sits strictly inside the reference zone.
    const model = computeMultiZoneRangeBarModel(50, RANGE, OPTIMAL)!;
    expect(model.referenceStartPct).toBeCloseTo(100 / 6, 5);
    expect(model.referenceEndPct).toBeCloseTo(500 / 6, 5);
    expect(model.optimalStartPct).not.toBeNull();
    expect(model.optimalEndPct).not.toBeNull();
    expect(model.optimalStartPct!).toBeGreaterThan(model.referenceStartPct);
    expect(model.optimalEndPct!).toBeLessThan(model.referenceEndPct);
  });

  it("widens the union domain when the optimal band extends past the reference", () => {
    // Optimal high 120 > reference high 100 → domain union ends at 120, so the
    // reference end no longer sits at 5/6 and the optimal zone clamps to ≤100%.
    const wide = { low: 30, high: 120, unit: "ng/mL" };
    const model = computeMultiZoneRangeBarModel(110, RANGE, wide)!;
    expect(model.referenceEndPct).toBeLessThan(500 / 6);
    expect(model.optimalEndPct!).toBeLessThanOrEqual(100);
    expect(model.optimalStartPct!).toBeGreaterThanOrEqual(0);
  });

  it("returns null without a value or a reference-quality range", () => {
    expect(computeMultiZoneRangeBarModel(null, RANGE, OPTIMAL)).toBeNull();
    expect(computeMultiZoneRangeBarModel(50, null, OPTIMAL)).toBeNull();
    expect(
      computeMultiZoneRangeBarModel(50, { low: 5, high: 5, unit: "ng/mL" }, OPTIMAL),
    ).toBeNull();
  });
});

describe("resolveDisplayRanges", () => {
  const TYPICAL = { low: 30, high: 100, unit: "ng/mL" };

  it("prefers the lab-printed reference range over the catalog typical range", () => {
    const reading = createReading({
      referenceRange: { low: 25, high: 80, unit: "ng/mL" },
    });
    const { reference, optimal } = resolveDisplayRanges(reading, TYPICAL);
    expect(reference).toEqual({ low: 25, high: 80, unit: "ng/mL" });
    expect(optimal).toBeNull();
  });

  it("falls back to the catalog typical range when no lab range exists", () => {
    expect(resolveDisplayRanges(createReading(), TYPICAL).reference).toEqual(TYPICAL);
  });

  it("drops ranges whose unit differs from the reading's own unit", () => {
    const reading = createReading({
      unit: "nmol/L",
      referenceRange: { low: 60, high: 200, unit: "nmol/L" },
      optimalRange: { low: 80, high: 150, unit: "ng/mL" },
    });
    const { reference, optimal } = resolveDisplayRanges(reading, TYPICAL);
    // Reference (nmol/L) matches the reading unit; the catalog (ng/mL) is dropped.
    expect(reference).toEqual({ low: 60, high: 200, unit: "nmol/L" });
    // Optimal is in a mismatched unit → dropped, never silently compared.
    expect(optimal).toBeNull();
  });

  it("surfaces a unit-matched optimal range", () => {
    const reading = createReading({
      optimalRange: { low: 40, high: 60, unit: "ng/mL" },
    });
    expect(resolveDisplayRanges(reading, TYPICAL).optimal).toEqual({
      low: 40,
      high: 60,
      unit: "ng/mL",
    });
  });

  it("returns the typical range and no optimal for a null reading", () => {
    expect(resolveDisplayRanges(null, TYPICAL)).toEqual({
      reference: TYPICAL,
      optimal: null,
    });
  });
});

describe("buildHistoryChartModel", () => {
  it("builds oldest→newest points sharing the latest reading's unit", () => {
    const model = buildHistoryChartModel([
      createReading({ value: 60, observedAt: "2026-06-01" }),
      createReading({ value: 40, observedAt: "2026-05-01" }),
      createReading({ value: 20, observedAt: "2026-04-01" }),
    ]);

    expect(model).not.toBeNull();
    expect(model!.unit).toBe("ng/mL");
    expect(model!.points.map((point) => point.value)).toEqual([20, 40, 60]);
    expect(model!.points[0]!.label).toBe("Apr 1");
    expect(model!.points[2]!.label).toBe("Jun 1");
  });

  it("filters readings whose unit differs from the most recent reading", () => {
    const model = buildHistoryChartModel([
      createReading({ value: 60, observedAt: "2026-06-01" }),
      createReading({ value: 110, unit: "nmol/L", observedAt: "2026-05-01" }),
      createReading({ value: 30, observedAt: "2026-04-01" }),
    ]);

    expect(model!.points.map((point) => point.value)).toEqual([30, 60]);
  });

  it("takes bands from the latest reading and pads the Y domain to contain them", () => {
    const model = buildHistoryChartModel([
      createReading({
        value: 50,
        observedAt: "2026-06-01",
        referenceRange: { low: 30, high: 100, unit: "ng/mL" },
        optimalRange: { low: 40, high: 60, unit: "ng/mL" },
      }),
      createReading({ value: 45, observedAt: "2026-05-01" }),
    ]);

    expect(model!.referenceBand).toEqual({ low: 30, high: 100 });
    expect(model!.optimalBand).toEqual({ low: 40, high: 60 });
    // Domain spans at least [30, 100] (the band extent) plus padding on each side.
    expect(model!.yDomain[0]).toBeLessThan(30);
    expect(model!.yDomain[1]).toBeGreaterThan(100);
  });

  it("falls back to the catalog typical range for the reference band", () => {
    const model = buildHistoryChartModel(
      [
        createReading({ value: 50, observedAt: "2026-06-01" }),
        createReading({ value: 45, observedAt: "2026-05-01" }),
      ],
      { low: 30, high: 100, unit: "ng/mL" },
    );

    expect(model!.referenceBand).toEqual({ low: 30, high: 100 });
    expect(model!.optimalBand).toBeNull();
  });

  it("returns null for fewer than two chartable points", () => {
    expect(buildHistoryChartModel([createReading()])).toBeNull();
    expect(
      buildHistoryChartModel([
        createReading({ value: null, valueText: "trace" }),
        createReading({ value: null, valueText: "trace" }),
      ]),
    ).toBeNull();
  });
});

function createDashboard(): BiomarkersDashboardResponse {
  return {
    generatedAt: NOW,
    areas: [
      {
        area: "nutrients",
        markers: [
          {
            key: "vitamin_d",
            displayLabel: "Vitamin D (25-OH)",
            canonicalUnit: "ng/mL",
            typicalRange: RANGE,
            latestReading: createReading({ value: 20 }),
            readingCount: 3,
          },
          {
            key: "ferritin",
            displayLabel: "Ferritin",
            canonicalUnit: "ng/mL",
            typicalRange: { low: 15, high: 300, unit: "ng/mL" },
            latestReading: null,
            readingCount: 0,
          },
        ],
      },
      {
        area: "metabolic",
        markers: [
          {
            key: "fasting_glucose",
            displayLabel: "Fasting glucose",
            canonicalUnit: "mg/dL",
            typicalRange: { low: 70, high: 99, unit: "mg/dL" },
            latestReading: createReading({
              biomarkerKey: "fasting_glucose",
              value: 90,
              unit: "mg/dL",
            }),
            readingCount: 1,
          },
        ],
      },
      { area: "liver", markers: [] },
    ],
  };
}

describe("dashboard grouping and hero", () => {
  it("orders areas by catalog order and drops empty areas", () => {
    const grouped = groupDashboardAreas(createDashboard());
    expect(grouped.map((area) => area.area)).toEqual(["metabolic", "nutrients"]);
  });

  it("counts tracked markers (markers with a latest reading)", () => {
    expect(countTrackedMarkers(createDashboard())).toBe(2);
  });

  it("builds the hero view with tracked/outside counts and last-report label", () => {
    const hero = buildBiomarkersHeroView(createDashboard(), [
      createReport({ uploadedAt: "2026-05-01T08:00:00.000Z" }),
      createReport({ uploadedAt: "2026-06-01T08:00:00.000Z" }),
    ]);

    expect(hero.trackedCount).toBe(2);
    // vitamin_d at 20 ng/mL is below the 30-100 band; glucose is in range.
    expect(hero.outsideRangeCount).toBe(1);
    expect(hero.lastReportLabel).toBe("Jun 1, 2026");
  });

  it("returns a null last-report label when no reports exist", () => {
    expect(buildBiomarkersHeroView(createDashboard(), []).lastReportLabel).toBeNull();
  });
});

describe("lab report row helpers", () => {
  it("maps report statuses to label keys and badge tones", () => {
    expect(labReportStatusLabelKey("uploaded")).toBe("reports.statusUploaded");
    expect(labReportStatusLabelKey("processing")).toBe("reports.statusProcessing");
    expect(labReportStatusLabelKey("extracted")).toBe("reports.statusExtracted");
    expect(labReportStatusLabelKey("failed")).toBe("reports.statusFailed");
    expect(labReportStatusBadgeTone("uploaded")).toBe("info");
    expect(labReportStatusBadgeTone("processing")).toBe("pending");
    expect(labReportStatusBadgeTone("extracted")).toBe("success");
    expect(labReportStatusBadgeTone("failed")).toBe("error");
  });

  it("maps failure codes to i18n message keys", () => {
    expect(failureCodeMessageKey("pdf_no_text")).toBe("failure.pdf_no_text");
    expect(failureCodeMessageKey("llm_unavailable")).toBe("failure.llm_unavailable");
  });

  it("detects processing reports, retryability, and coach-context consent", () => {
    expect(hasProcessingLabReports([createReport({ status: "processing" })])).toBe(true);
    expect(hasProcessingLabReports([createReport()])).toBe(false);
    expect(canRetryLabReportExtraction(createReport({ status: "failed" }))).toBe(true);
    expect(canRetryLabReportExtraction(createReport({ status: "uploaded" }))).toBe(true);
    expect(canRetryLabReportExtraction(createReport({ status: "processing" }))).toBe(false);
    expect(canRetryLabReportExtraction(createReport({ status: "extracted" }))).toBe(false);
    expect(hasCoachContextConsent(createReport())).toBe(false);
    expect(hasCoachContextConsent(createReport({ coachContextConsentAt: NOW }))).toBe(true);
  });
});

describe("canSubmitLabReportUpload", () => {
  const file = new File(["sample"], "labs.pdf", { type: "application/pdf" });

  it("requires title, file, no validation error, and the store-and-parse consent", () => {
    const valid = {
      title: "Spring panel",
      selectedFile: file,
      fileValidationError: null,
      consentStoreParse: true,
    };

    expect(canSubmitLabReportUpload(valid)).toBe(true);
    expect(canSubmitLabReportUpload({ ...valid, title: "  " })).toBe(false);
    expect(canSubmitLabReportUpload({ ...valid, selectedFile: null })).toBe(false);
    expect(canSubmitLabReportUpload({ ...valid, fileValidationError: "bad" })).toBe(false);
    expect(canSubmitLabReportUpload({ ...valid, consentStoreParse: false })).toBe(false);
  });
});

describe("reading formatting", () => {
  it("formats values, confidence, provenance, and observed dates", () => {
    expect(formatBiomarkerValue(5.6)).toBe("5.6");
    expect(formatBiomarkerValue(5.601)).toBe("5.6");
    expect(formatBiomarkerValue(100)).toBe("100");
    expect(formatReadingValue(createReading({ value: 42.5 }))).toBe("42.5");
    expect(formatReadingValue(createReading({ value: null, valueText: "trace" }))).toBe(
      "trace",
    );
    expect(formatReadingConfidence(0.825)).toBe(83);
    expect(formatReadingObservedDate(createReading())).toBe("May 1, 2026");
    expect(formatReadingObservedDate(createReading({ observedAt: null }))).toBe(
      "Jun 1, 2026",
    );

    expect(buildReadingProvenanceView(createReading())).toEqual({
      kind: "extracted",
      percent: 82,
    });
    expect(
      buildReadingProvenanceView(createReading({ confidence: null })),
    ).toEqual({ kind: "extracted_no_confidence" });
    expect(
      buildReadingProvenanceView(createReading({ userEdited: true })),
    ).toEqual({ kind: "edited" });
    expect(
      buildReadingProvenanceView(createReading({ source: "manual", confidence: null })),
    ).toEqual({ kind: "manual" });
  });
});

// ── Wording guard ───────────────────────────────────────────────────────────
// Every user-visible status/area/failure label in the EN Biomarkers namespace
// must use "typical range" framing and never clinical judgement words. The one
// allowed mention of diagnosis/treatment wording is Biomarkers.wellnessNote.

const enMessages = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../messages/en.json"),
    "utf8",
  ),
) as Record<string, Record<string, unknown>>;

function flattenStrings(value: unknown, prefix: string): Array<[string, string]> {
  if (typeof value === "string") {
    return [[prefix, value]];
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      flattenStrings(child, prefix ? `${prefix}.${key}` : key),
    );
  }

  return [];
}

describe("Biomarkers EN copy wording guard", () => {
  const biomarkers = enMessages.Biomarkers as Record<string, unknown>;

  it("has the Biomarkers namespace with status, areas, and failure blocks", () => {
    expect(biomarkers).toBeDefined();
    expect(biomarkers.status).toBeDefined();
    expect(biomarkers.areas).toBeDefined();
    expect(biomarkers.failure).toBeDefined();
  });

  it("keeps every status/area/failure/report label free of unsafe wellness language", () => {
    const guarded = [
      ...flattenStrings(biomarkers.status, "status"),
      ...flattenStrings(biomarkers.areas, "areas"),
      ...flattenStrings(biomarkers.failure, "failure"),
      ...flattenStrings(biomarkers.reports, "reports"),
      ...flattenStrings(biomarkers.hero, "hero"),
    ];

    expect(guarded.length).toBeGreaterThan(20);

    for (const [key, label] of guarded) {
      expect(
        containsUnsafeWellnessInsightLanguage(label),
        `Biomarkers.${key} ("${label}") must not contain unsafe wellness language`,
      ).toBe(false);
    }
  });

  it("frames statuses as typical ranges", () => {
    const statuses = flattenStrings(biomarkers.status, "status").map(([, label]) => label);
    for (const label of statuses.filter((label) => label !== "No reference range")) {
      expect(label.toLowerCase()).toContain("typical range");
    }
  });

  it("allows the wellness note as the single diagnosis/treatment mention", () => {
    expect(biomarkers.wellnessNote).toBe(
      "Wellness context only — not for diagnosis or treatment.",
    );
  });
});
