/**
 * LabReportsService extraction-pipeline tests (S3) — the LLM stage is mocked
 * via the LabExtractionProvider DI seam (@health/ai/testing).
 *
 * Covers: happy-path persistence, every typed failure mode, per-reading
 * validation drops (unsafe language, plausibility band), replace-not-append
 * re-extraction, and document-text hygiene (a sentinel planted in the document
 * never reaches any persisted field, in any outcome).
 */

import type { LabExtractionProvider } from "@health/ai";
import {
  createLabExtractionProviderMock,
  wrapLabExtractionOutput,
} from "@health/ai/testing";
import type { LabExtractionOutputInput } from "@health/types";
import { describe, expect, it, vi } from "vitest";
import type {
  LabReportStatusUpdate,
  NewBiomarkerReadingValues,
} from "./biomarkers.repository.js";
import { LabReportsService } from "./lab-reports.service.js";

const SENTINEL = "SENTINEL_DOC_TEXT_9f3e";
const DOCUMENT_TEXT = `Lab results ${SENTINEL}\nGlucose: 92 mg/dL`;

const auth = {
  clerkUserId: "user_123",
  displayName: "Test User",
  email: "test@example.com",
};

const user = {
  id: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  displayName: "Test User",
  email: "test@example.com",
  timezone: "UTC",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const reportRow = {
  id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
  userId: user.id,
  title: "Annual panel",
  storageReference: `${user.id}/report.txt`,
  mimeType: "text/plain",
  fileSizeBytes: 42,
  status: "uploaded" as const,
  failureCode: null,
  observedAt: null,
  unmappedMarkerCount: 0,
  consentVersion: "v2",
  storeParseConsentAt: new Date("2026-06-01T12:00:00.000Z"),
  coachContextConsentAt: null,
  extractedAt: null,
  deletedAt: null,
  uploadedAt: new Date("2026-06-01T12:00:00.000Z"),
  createdAt: new Date("2026-06-01T12:00:00.000Z"),
  updatedAt: new Date("2026-06-01T12:00:00.000Z"),
};

const usersServiceMock = { resolveFromAuth: async () => user };

const validReading = {
  biomarkerKey: "fasting_glucose",
  valueNumeric: 92,
  valueText: null,
  unit: "mg/dL",
  referenceRangeText: "70 - 99",
  referenceRangeLow: 70,
  referenceRangeHigh: 99,
  optimalRangeLow: 75,
  optimalRangeHigh: 90,
  observedAt: null,
  confidence: 0.93,
} as const;

const validOutput: LabExtractionOutputInput = {
  isLabReport: true,
  observedAt: "2026-05-20",
  readings: [
    validReading,
    {
      biomarkerKey: "hba1c",
      valueNumeric: 5.2,
      valueText: null,
      unit: "%",
      referenceRangeText: null,
      referenceRangeLow: null,
      referenceRangeHigh: null,
      optimalRangeLow: null,
      optimalRangeHigh: null,
      observedAt: "2026-05-19",
      confidence: 0.8,
    },
  ],
  unmappedMarkerCount: 3,
};

interface ExtractionHarness {
  service: LabReportsService;
  statusUpdates: LabReportStatusUpdate[];
  readingsBatches: NewBiomarkerReadingValues[][];
  /** Everything handed to the repository, for sentinel-hygiene assertions. */
  persistedJson: () => string;
}

function createHarness(provider: LabExtractionProvider | null): ExtractionHarness {
  const statusUpdates: LabReportStatusUpdate[] = [];
  const readingsBatches: NewBiomarkerReadingValues[][] = [];
  let reportState: Record<string, unknown> = { ...reportRow };

  const repository = {
    findActiveReportById: async () => ({ ...reportRow }),
    updateReportStatus: async (
      _userId: string,
      _reportId: string,
      values: LabReportStatusUpdate,
    ) => {
      statusUpdates.push(values);
      reportState = {
        ...reportState,
        status: values.status,
        failureCode: values.failureCode,
        ...(values.observedAt !== undefined ? { observedAt: values.observedAt } : {}),
        ...(values.unmappedMarkerCount !== undefined
          ? { unmappedMarkerCount: values.unmappedMarkerCount }
          : {}),
        ...(values.extractedAt !== undefined ? { extractedAt: values.extractedAt } : {}),
      };
      return { ...reportState };
    },
    createReadingsForReport: async (
      _userId: string,
      labReportId: string,
      values: NewBiomarkerReadingValues[],
    ) => {
      readingsBatches.push(values);
      return values.map((reading, index) => ({
        id: `00000000-0000-4000-8000-00000000000${index}`,
        userId: user.id,
        labReportId,
        ...reading,
        userEdited: false,
        deletedAt: null,
        createdAt: new Date("2026-06-01T12:00:00.000Z"),
        updatedAt: new Date("2026-06-01T12:00:00.000Z"),
      }));
    },
    listReadingsByReportId: async () => [],
  };

  const service = new LabReportsService(
    repository as never,
    usersServiceMock as never,
    provider,
  );

  (service as unknown as { storage: unknown }).storage = {
    read: async () => Buffer.from(DOCUMENT_TEXT, "utf8"),
  };

  return {
    service,
    statusUpdates,
    readingsBatches,
    persistedJson: () => JSON.stringify({ statusUpdates, readingsBatches }),
  };
}

function providerReturning(output: unknown): LabExtractionProvider {
  return createLabExtractionProviderMock({
    extractBiomarkers: vi
      .fn()
      .mockResolvedValue(wrapLabExtractionOutput(output as LabExtractionOutputInput)),
  });
}

describe("LabReportsService extraction pipeline", () => {
  it("persists validated readings and marks the report extracted (happy path)", async () => {
    const harness = createHarness(providerReturning(validOutput));

    const detail = await harness.service.extract(auth, reportRow.id);

    expect(harness.readingsBatches).toHaveLength(1);
    const batch = harness.readingsBatches[0] ?? [];
    expect(batch).toHaveLength(2);
    expect(batch[0]).toMatchObject({
      biomarkerKey: "fasting_glucose",
      value: "92",
      valueText: null,
      unit: "mg/dL",
      referenceRangeText: "70 - 99",
      // Structured ranges persist as drizzle-numeric strings.
      referenceRangeLow: "70",
      referenceRangeHigh: "99",
      optimalRangeLow: "75",
      optimalRangeHigh: "90",
      source: "extraction",
      confidence: "0.930",
    });
    // A reading whose ranges are all null flows through with null columns,
    // leaving referenceRangeText untouched.
    expect(batch[1]).toMatchObject({
      biomarkerKey: "hba1c",
      referenceRangeText: null,
      referenceRangeLow: null,
      referenceRangeHigh: null,
      optimalRangeLow: null,
      optimalRangeHigh: null,
    });
    // The materialized read contract exposes the nested ranges in the reading unit.
    expect(detail.readings[0]?.referenceRange).toEqual({ low: 70, high: 99, unit: "mg/dL" });
    expect(detail.readings[0]?.optimalRange).toEqual({ low: 75, high: 90, unit: "mg/dL" });
    expect(detail.readings[1]?.referenceRange).toBeNull();
    expect(detail.readings[1]?.optimalRange).toBeNull();
    // Per-reading observedAt falls back to the document-level date…
    expect(batch[0]?.observedAt).toEqual(new Date("2026-05-20T00:00:00.000Z"));
    // …but an explicit per-reading date wins.
    expect(batch[1]?.observedAt).toEqual(new Date("2026-05-19T00:00:00.000Z"));

    expect(harness.statusUpdates.at(-1)).toMatchObject({
      status: "extracted",
      failureCode: null,
      unmappedMarkerCount: 3,
      observedAt: new Date("2026-05-20T00:00:00.000Z"),
    });
    expect(harness.statusUpdates.at(-1)?.extractedAt).toBeInstanceOf(Date);

    expect(detail.report.status).toBe("extracted");
    expect(detail.report.observedAt).toBe("2026-05-20");
    expect(detail.report.unmappedMarkerCount).toBe(3);
    expect(detail.readings).toHaveLength(2);
    expect(detail.readings[0]?.value).toBe(92);
  });

  it("fails with not_a_lab_report and persists zero readings when isLabReport is false", async () => {
    const harness = createHarness(
      providerReturning({
        isLabReport: false,
        observedAt: null,
        readings: [],
        unmappedMarkerCount: 0,
      }),
    );

    const detail = await harness.service.extract(auth, reportRow.id);

    expect(detail.report.status).toBe("failed");
    expect(detail.report.failureCode).toBe("not_a_lab_report");
    expect(harness.readingsBatches).toHaveLength(0);
  });

  it("fails with llm_invalid_output and persists zero readings on a contract-violating payload", async () => {
    const harness = createHarness(
      providerReturning({ totally: "wrong shape", echo: SENTINEL }),
    );

    const detail = await harness.service.extract(auth, reportRow.id);

    expect(detail.report.failureCode).toBe("llm_invalid_output");
    expect(harness.readingsBatches).toHaveLength(0);
  });

  it("fails with llm_unavailable when the provider throws", async () => {
    const harness = createHarness(
      createLabExtractionProviderMock({
        extractBiomarkers: vi
          .fn()
          .mockRejectedValue(new Error(`provider exploded with ${SENTINEL}`)),
      }),
    );

    const detail = await harness.service.extract(auth, reportRow.id);

    expect(detail.report.failureCode).toBe("llm_unavailable");
    expect(harness.readingsBatches).toHaveLength(0);
  });

  it("drops unsafe-language readings individually, keeps the rest, and adds drops to the unmapped count", async () => {
    const harness = createHarness(
      providerReturning({
        isLabReport: true,
        observedAt: "2026-05-20",
        readings: [
          validReading,
          // Unsafe wording in the unit — caught by the injected EN/RU check.
          { ...validReading, biomarkerKey: "hba1c", unit: "% treatment dose" },
          // Unsafe wording in the reference range text.
          {
            ...validReading,
            biomarkerKey: "tsh",
            unit: "µIU/mL",
            valueNumeric: 2.1,
            referenceRangeText: "diagnosis: hypothyroid below 0.4",
          },
        ],
        unmappedMarkerCount: 1,
      }),
    );

    const detail = await harness.service.extract(auth, reportRow.id);

    expect(detail.report.status).toBe("extracted");
    expect(harness.readingsBatches[0]).toHaveLength(1);
    expect(harness.readingsBatches[0]?.[0]?.biomarkerKey).toBe("fasting_glucose");
    // 1 unmapped from the LLM + 2 dropped readings.
    expect(harness.statusUpdates.at(-1)?.unmappedMarkerCount).toBe(3);
    // The unsafe content itself is discarded, never persisted.
    expect(harness.persistedJson()).not.toContain("treatment");
    expect(harness.persistedJson()).not.toContain("diagnosis");
  });

  it("drops a plausibility-band violation (decimal-shifted glucose 9500) and keeps valid readings", async () => {
    const harness = createHarness(
      providerReturning({
        isLabReport: true,
        observedAt: null,
        readings: [validReading, { ...validReading, valueNumeric: 9500 }],
        unmappedMarkerCount: 0,
      }),
    );

    const detail = await harness.service.extract(auth, reportRow.id);

    expect(detail.report.status).toBe("extracted");
    expect(harness.readingsBatches[0]).toHaveLength(1);
    expect(harness.readingsBatches[0]?.[0]?.value).toBe("92");
    expect(harness.statusUpdates.at(-1)?.unmappedMarkerCount).toBe(1);
  });

  it("nulls an implausible optimal band (catalog clamp) but keeps the reading and its plausible reference", async () => {
    const harness = createHarness(
      providerReturning({
        isLabReport: true,
        observedAt: null,
        readings: [
          {
            ...validReading,
            // glucose typical {70,99} mg/dL → clamp band [3.5, 1980]; an optimal
            // band an order of magnitude high is implausible and soft-nulled,
            // while the in-band reference survives.
            referenceRangeLow: 70,
            referenceRangeHigh: 99,
            optimalRangeLow: 5000,
            optimalRangeHigh: 6000,
          },
        ],
        unmappedMarkerCount: 0,
      }),
    );

    const detail = await harness.service.extract(auth, reportRow.id);

    expect(detail.report.status).toBe("extracted");
    const batch = harness.readingsBatches[0] ?? [];
    expect(batch).toHaveLength(1);
    expect(batch[0]?.referenceRangeLow).toBe("70");
    expect(batch[0]?.referenceRangeHigh).toBe("99");
    // The offending optimal pair is nulled; the reading itself is NOT dropped.
    expect(batch[0]?.optimalRangeLow).toBeNull();
    expect(batch[0]?.optimalRangeHigh).toBeNull();
    expect(harness.statusUpdates.at(-1)?.unmappedMarkerCount).toBe(0);
    expect(detail.readings[0]?.optimalRange).toBeNull();
    expect(detail.readings[0]?.referenceRange).toEqual({ low: 70, high: 99, unit: "mg/dL" });
  });

  it("nulls a malformed range pair (one-sided / low >= high) but keeps the reading", async () => {
    const harness = createHarness(
      providerReturning({
        isLabReport: true,
        observedAt: null,
        readings: [
          {
            ...validReading,
            // A one-sided reference pair and an inverted optimal pair both fail
            // SOFT — each is nulled, the reading survives and the whole report
            // is not sunk by the malformed bands.
            referenceRangeLow: 70,
            referenceRangeHigh: null,
            optimalRangeLow: 99,
            optimalRangeHigh: 80,
          },
        ],
        unmappedMarkerCount: 0,
      }),
    );

    const detail = await harness.service.extract(auth, reportRow.id);

    expect(detail.report.status).toBe("extracted");
    const batch = harness.readingsBatches[0] ?? [];
    expect(batch).toHaveLength(1);
    expect(batch[0]?.referenceRangeLow).toBeNull();
    expect(batch[0]?.referenceRangeHigh).toBeNull();
    expect(batch[0]?.optimalRangeLow).toBeNull();
    expect(batch[0]?.optimalRangeHigh).toBeNull();
    expect(harness.statusUpdates.at(-1)?.unmappedMarkerCount).toBe(0);
  });

  it("accepts ranges as-is when the reading unit does not match the catalog unit", async () => {
    const harness = createHarness(
      providerReturning({
        isLabReport: true,
        observedAt: null,
        readings: [
          {
            ...validReading,
            // mmol/L is an accepted glucose unit but differs from the catalog
            // typicalRange unit (mg/dL), so no catalog clamp applies.
            unit: "mmol/L",
            valueNumeric: 5.1,
            referenceRangeLow: 3.9,
            referenceRangeHigh: 5.5,
            optimalRangeLow: 4.4,
            optimalRangeHigh: 5.0,
          },
        ],
        unmappedMarkerCount: 0,
      }),
    );

    const detail = await harness.service.extract(auth, reportRow.id);

    expect(detail.report.status).toBe("extracted");
    expect(detail.readings[0]?.referenceRange).toEqual({ low: 3.9, high: 5.5, unit: "mmol/L" });
    expect(detail.readings[0]?.optimalRange).toEqual({ low: 4.4, high: 5.0, unit: "mmol/L" });
  });

  it("fails with no_readings_extracted when every reading is dropped by validation", async () => {
    const harness = createHarness(
      providerReturning({
        isLabReport: true,
        observedAt: null,
        readings: [{ ...validReading, valueNumeric: 9500 }],
        unmappedMarkerCount: 0,
      }),
    );

    const detail = await harness.service.extract(auth, reportRow.id);

    expect(detail.report.status).toBe("failed");
    expect(detail.report.failureCode).toBe("no_readings_extracted");
    expect(harness.readingsBatches).toHaveLength(0);
  });

  it("re-extraction replaces readings via the transactional replace method, never appends", async () => {
    const harness = createHarness(providerReturning(validOutput));

    await harness.service.extract(auth, reportRow.id);
    await harness.service.extract(auth, reportRow.id);

    // Each run hands the FULL batch to createReadingsForReport, whose contract
    // (covered by the repository spec) soft-deletes prior rows in the same
    // transaction — so two runs mean two replacements, not four rows.
    expect(harness.readingsBatches).toHaveLength(2);
    expect(harness.readingsBatches[0]).toHaveLength(2);
    expect(harness.readingsBatches[1]).toHaveLength(2);
  });

  describe("document-text hygiene", () => {
    const failureProviders: Array<{ name: string; provider: LabExtractionProvider }> = [
      {
        name: "llm_unavailable (provider throw carrying document text)",
        provider: createLabExtractionProviderMock({
          extractBiomarkers: vi.fn().mockRejectedValue(new Error(SENTINEL)),
        }),
      },
      {
        name: "llm_invalid_output (payload echoing document text)",
        provider: providerReturning({ garbage: SENTINEL }),
      },
      {
        name: "not_a_lab_report",
        provider: providerReturning({
          isLabReport: false,
          observedAt: null,
          readings: [],
          unmappedMarkerCount: 0,
        }),
      },
      {
        name: "no_readings_extracted",
        provider: providerReturning({
          isLabReport: true,
          observedAt: null,
          readings: [{ ...validReading, valueNumeric: 9500 }],
          unmappedMarkerCount: 0,
        }),
      },
    ];

    for (const { name, provider } of failureProviders) {
      it(`never persists any document-text fragment on ${name}`, async () => {
        const harness = createHarness(provider);

        const detail = await harness.service.extract(auth, reportRow.id);

        expect(detail.report.status).toBe("failed");
        // No persisted field — status updates, failure codes, or readings —
        // may carry the sentinel planted in the document text.
        expect(harness.persistedJson()).not.toContain(SENTINEL);
        expect(JSON.stringify(detail)).not.toContain(SENTINEL);
      });
    }

    it("never persists any document-text fragment on success either", async () => {
      const harness = createHarness(providerReturning(validOutput));

      const detail = await harness.service.extract(auth, reportRow.id);

      expect(detail.report.status).toBe("extracted");
      expect(harness.persistedJson()).not.toContain(SENTINEL);
      expect(JSON.stringify(detail)).not.toContain(SENTINEL);
    });
  });
});
