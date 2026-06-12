import { describe, expect, it } from "vitest";
import {
  BIOMARKER_AREAS,
  BIOMARKER_CATALOG,
  BIOMARKER_KEYS,
  getBiomarkerCatalogEntry,
  validateBiomarkerReadingValue,
} from "./biomarkers.js";

describe("biomarker catalog integrity", () => {
  it("has unique keys matching BIOMARKER_KEYS", () => {
    const catalogKeys = BIOMARKER_CATALOG.map((entry) => entry.key);
    expect(new Set(catalogKeys).size).toBe(catalogKeys.length);
    expect(new Set(catalogKeys)).toEqual(new Set(BIOMARKER_KEYS));
    expect(catalogKeys.length).toBe(BIOMARKER_KEYS.length);
  });

  it("populates every area with at least one marker", () => {
    for (const area of BIOMARKER_AREAS) {
      expect(BIOMARKER_CATALOG.some((entry) => entry.area === area)).toBe(true);
    }
  });

  it("keeps every typicalRange sane and unit-aligned", () => {
    for (const entry of BIOMARKER_CATALOG) {
      expect(entry.aliases.length).toBeGreaterThan(0);
      expect(entry.acceptedUnits).toContain(entry.canonicalUnit);

      if (entry.typicalRange) {
        expect(entry.typicalRange.low).toBeLessThan(entry.typicalRange.high);
        expect(entry.acceptedUnits).toContain(entry.typicalRange.unit);
      }
    }
  });

  it("looks up entries by key", () => {
    expect(getBiomarkerCatalogEntry("fasting_glucose")?.area).toBe("metabolic");
    expect(getBiomarkerCatalogEntry("alt")?.area).toBe("liver");
  });
});

describe("validateBiomarkerReadingValue", () => {
  it("accepts a plausible numeric reading", () => {
    expect(
      validateBiomarkerReadingValue({
        biomarkerKey: "fasting_glucose",
        value: 92,
        unit: "mg/dL",
      }),
    ).toEqual([]);
  });

  it("rejects an unknown biomarker key", () => {
    const errors = validateBiomarkerReadingValue({
      biomarkerKey: "made_up_marker",
      value: 1,
      unit: "mg/dL",
    });
    expect(errors.some((e) => e.startsWith("biomarkerKey"))).toBe(true);
  });

  it("rejects both value and valueText", () => {
    const errors = validateBiomarkerReadingValue({
      biomarkerKey: "fasting_glucose",
      value: 92,
      valueText: "high",
      unit: "mg/dL",
    });
    expect(errors).toContain("value: Provide exactly one of value or valueText.");
  });

  it("rejects neither value nor valueText", () => {
    const errors = validateBiomarkerReadingValue({
      biomarkerKey: "fasting_glucose",
      unit: "mg/dL",
    });
    expect(errors).toContain("value: Provide exactly one of value or valueText.");
  });

  it("rejects free text on a numeric marker", () => {
    const errors = validateBiomarkerReadingValue({
      biomarkerKey: "fasting_glucose",
      valueText: "elevated",
      unit: "mg/dL",
    });
    expect(errors.some((e) => e.startsWith("valueText"))).toBe(true);
  });

  it("drops a numeric value outside the plausibility band", () => {
    const errors = validateBiomarkerReadingValue({
      biomarkerKey: "fasting_glucose",
      value: 9500,
      unit: "mg/dL",
    });
    expect(errors.some((e) => e.includes("plausible band"))).toBe(true);
  });

  it("rejects a unit with disallowed characters", () => {
    const errors = validateBiomarkerReadingValue({
      biomarkerKey: "fasting_glucose",
      value: 92,
      unit: "mg/dL <script>",
    });
    expect(errors).toContain("unit: Contains characters that are not allowed.");
  });

  it("rejects an over-long unit", () => {
    const errors = validateBiomarkerReadingValue({
      biomarkerKey: "fasting_glucose",
      value: 92,
      unit: "m".repeat(41),
    });
    expect(errors.some((e) => e.startsWith("unit") && e.includes("fewer"))).toBe(true);
  });

  it("runs an injected unsafe-language check over free-text fields", () => {
    const errors = validateBiomarkerReadingValue({
      biomarkerKey: "fasting_glucose",
      value: 92,
      unit: "mg/dL",
      unsafeLanguageCheck: (text) => text.includes("mg/dL"),
    });
    expect(errors.some((e) => e.startsWith("unit") && e.includes("diagnosis"))).toBe(
      true,
    );
  });
});
