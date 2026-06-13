import { describe, expect, it } from "vitest";
import {
  extractedReadingSchema,
  labExtractionOutputSchema,
} from "./biomarker-extraction.js";

const validReading = {
  biomarkerKey: "ldl_cholesterol",
  valueNumeric: 95,
  valueText: null,
  unit: "mg/dL",
  referenceRangeText: "0-100 mg/dL",
  referenceRangeLow: 0,
  referenceRangeHigh: 100,
  optimalRangeLow: 0,
  optimalRangeHigh: 80,
  observedAt: "2026-05-01",
  confidence: 0.9,
};

describe("extractedReadingSchema", () => {
  it("parses a valid numeric reading", () => {
    expect(() => extractedReadingSchema.parse(validReading)).not.toThrow();
  });

  it("rejects an unknown biomarker key", () => {
    expect(() =>
      extractedReadingSchema.parse({ ...validReading, biomarkerKey: "mystery" }),
    ).toThrow();
  });

  it("rejects confidence above 1", () => {
    expect(() =>
      extractedReadingSchema.parse({ ...validReading, confidence: 1.5 }),
    ).toThrow();
  });

  it("rejects both numeric and text values", () => {
    expect(() =>
      extractedReadingSchema.parse({
        ...validReading,
        valueNumeric: 95,
        valueText: "high",
      }),
    ).toThrow();
  });

  it("rejects neither numeric nor text value", () => {
    expect(() =>
      extractedReadingSchema.parse({
        ...validReading,
        valueNumeric: null,
        valueText: null,
      }),
    ).toThrow();
  });

  describe("structured ranges", () => {
    it("parses valid both-set reference and optimal pairs", () => {
      expect(() =>
        extractedReadingSchema.parse({
          ...validReading,
          referenceRangeLow: 50,
          referenceRangeHigh: 100,
          optimalRangeLow: 50,
          optimalRangeHigh: 80,
        }),
      ).not.toThrow();
    });

    it("accepts all-null ranges", () => {
      expect(() =>
        extractedReadingSchema.parse({
          ...validReading,
          referenceRangeLow: null,
          referenceRangeHigh: null,
          optimalRangeLow: null,
          optimalRangeHigh: null,
        }),
      ).not.toThrow();
    });

    // Malformed pairs (one-sided, or low >= high) are intentionally NOT schema
    // errors — they fail SOFT in the service (the pair is nulled, the reading
    // kept) so one bad band never sinks the whole extraction.
    it("parses a one-sided reference pair (low set, high null) for soft handling", () => {
      expect(() =>
        extractedReadingSchema.parse({
          ...validReading,
          referenceRangeLow: 50,
          referenceRangeHigh: null,
        }),
      ).not.toThrow();
    });

    it("parses a one-sided optimal pair (high set, low null) for soft handling", () => {
      expect(() =>
        extractedReadingSchema.parse({
          ...validReading,
          optimalRangeLow: null,
          optimalRangeHigh: 80,
        }),
      ).not.toThrow();
    });

    it("parses a reference pair where low >= high for soft handling", () => {
      expect(() =>
        extractedReadingSchema.parse({
          ...validReading,
          referenceRangeLow: 100,
          referenceRangeHigh: 100,
        }),
      ).not.toThrow();
    });

    it("parses an optimal pair where low > high for soft handling", () => {
      expect(() =>
        extractedReadingSchema.parse({
          ...validReading,
          optimalRangeLow: 90,
          optimalRangeHigh: 80,
        }),
      ).not.toThrow();
    });
  });
});

describe("labExtractionOutputSchema", () => {
  it("parses a valid extraction output", () => {
    expect(() =>
      labExtractionOutputSchema.parse({
        isLabReport: true,
        observedAt: "2026-05-01",
        readings: [validReading],
        unmappedMarkerCount: 2,
      }),
    ).not.toThrow();
  });

  it("rejects more than 80 readings", () => {
    expect(() =>
      labExtractionOutputSchema.parse({
        isLabReport: true,
        observedAt: null,
        readings: Array.from({ length: 81 }, () => validReading),
        unmappedMarkerCount: 0,
      }),
    ).toThrow();
  });
});
