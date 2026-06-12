import { describe, expect, it } from "vitest";
import {
  biomarkerReadingSchema,
  createBiomarkerReadingSchema,
  createLabReportSchema,
  MAX_LAB_REPORT_UPLOAD_BASE64_CHARS,
  updateBiomarkerReadingSchema,
} from "./lab-reports.js";

describe("createLabReportSchema", () => {
  const base = {
    title: "Annual panel",
    mimeType: "application/pdf" as const,
    fileContentBase64: "ZmFrZQ==",
  };

  it("accepts a valid upload with explicit store & parse consent", () => {
    const parsed = createLabReportSchema.parse({
      ...base,
      consent: { storeAndParse: true },
    });
    expect(parsed.consent.storeAndParse).toBe(true);
    expect(parsed.consent.coachChat).toBe(false);
    expect(parsed.consentVersion).toBe("v2");
  });

  it("rejects store & parse consent set to false", () => {
    expect(() =>
      createLabReportSchema.parse({ ...base, consent: { storeAndParse: false } }),
    ).toThrow();
  });

  it("rejects a missing consent block", () => {
    expect(() => createLabReportSchema.parse(base)).toThrow();
  });

  it("rejects an oversize base64 payload at parse time", () => {
    expect(() =>
      createLabReportSchema.parse({
        ...base,
        fileContentBase64: "a".repeat(MAX_LAB_REPORT_UPLOAD_BASE64_CHARS + 1),
        consent: { storeAndParse: true },
      }),
    ).toThrow();
  });

  it("accepts a base64 payload at exactly the parse-time bound", () => {
    expect(() =>
      createLabReportSchema.parse({
        ...base,
        fileContentBase64: "a".repeat(MAX_LAB_REPORT_UPLOAD_BASE64_CHARS),
        consent: { storeAndParse: true },
      }),
    ).not.toThrow();
  });

  it("rejects an unsupported mime type", () => {
    expect(() =>
      createLabReportSchema.parse({
        ...base,
        mimeType: "image/png",
        consent: { storeAndParse: true },
      }),
    ).toThrow();
  });
});

describe("createBiomarkerReadingSchema", () => {
  it("accepts a numeric manual reading", () => {
    expect(() =>
      createBiomarkerReadingSchema.parse({
        biomarkerKey: "vitamin_d",
        value: 42,
        unit: "ng/mL",
      }),
    ).not.toThrow();
  });

  it("rejects both value and valueText", () => {
    expect(() =>
      createBiomarkerReadingSchema.parse({
        biomarkerKey: "vitamin_d",
        value: 42,
        valueText: "ok",
        unit: "ng/mL",
      }),
    ).toThrow();
  });

  it("rejects neither value nor valueText", () => {
    expect(() =>
      createBiomarkerReadingSchema.parse({
        biomarkerKey: "vitamin_d",
        unit: "ng/mL",
      }),
    ).toThrow();
  });
});

describe("biomarkerReadingSchema nested ranges", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    userId: "22222222-2222-4222-8222-222222222222",
    labReportId: null,
    biomarkerKey: "vitamin_d" as const,
    value: 42,
    valueText: null,
    unit: "ng/mL",
    referenceRangeText: "30-100 ng/mL",
    referenceRange: null,
    optimalRange: null,
    observedAt: null,
    source: "extraction" as const,
    confidence: 0.9,
    userEdited: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };

  it("accepts a reading with null nested ranges", () => {
    expect(() => biomarkerReadingSchema.parse(base)).not.toThrow();
  });

  it("accepts a reading carrying both nested ranges in the reading unit", () => {
    const parsed = biomarkerReadingSchema.parse({
      ...base,
      referenceRange: { low: 30, high: 100, unit: "ng/mL" },
      optimalRange: { low: 40, high: 60, unit: "ng/mL" },
    });
    expect(parsed.referenceRange).toEqual({ low: 30, high: 100, unit: "ng/mL" });
    expect(parsed.optimalRange).toEqual({ low: 40, high: 60, unit: "ng/mL" });
  });

  it("rejects a reading missing the nested-range keys entirely", () => {
    const { referenceRange: _r, optimalRange: _o, ...withoutRanges } = base;
    expect(() => biomarkerReadingSchema.parse(withoutRanges)).toThrow();
  });
});

describe("updateBiomarkerReadingSchema", () => {
  it("requires at least one field", () => {
    expect(() => updateBiomarkerReadingSchema.parse({})).toThrow();
  });

  it("accepts a single-field update", () => {
    expect(() => updateBiomarkerReadingSchema.parse({ unit: "mmol/L" })).not.toThrow();
  });
});
