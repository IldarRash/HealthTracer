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
