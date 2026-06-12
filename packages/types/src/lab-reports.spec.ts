import { describe, expect, it } from "vitest";
import {
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

describe("updateBiomarkerReadingSchema", () => {
  it("requires at least one field", () => {
    expect(() => updateBiomarkerReadingSchema.parse({})).toThrow();
  });

  it("accepts a single-field update", () => {
    expect(() => updateBiomarkerReadingSchema.parse({ unit: "mmol/L" })).not.toThrow();
  });
});
