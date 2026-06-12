import { describe, expect, it } from "vitest";
import {
  aiBiomarkerContextSummarySchema,
  biomarkerContextItemSchema,
  MAX_BIOMARKER_CONTEXT_ITEMS,
} from "./biomarker-context.js";

function validItem(overrides: Record<string, unknown> = {}) {
  return {
    biomarkerKey: "vitamin_d",
    displayLabel: "Vitamin D (25-OH)",
    value: 38,
    valueText: null,
    unit: "ng/mL",
    observedAt: "2026-05-20",
    source: "manual",
    ...overrides,
  };
}

describe("aiBiomarkerContextSummarySchema", () => {
  it("accepts a structured catalog-labeled summary", () => {
    const summary = aiBiomarkerContextSummarySchema.parse({
      items: [validItem(), validItem({ biomarkerKey: "ferritin", source: "extraction", value: null, valueText: "detected" })],
      generatedAt: new Date().toISOString(),
    });

    expect(summary.items).toHaveLength(2);
  });

  it("rejects unknown biomarker keys (catalog is the floor)", () => {
    const result = biomarkerContextItemSchema.safeParse(validItem({ biomarkerKey: "mystery_marker" }));

    expect(result.success).toBe(false);
  });

  it("structurally forbids reference ranges and free-text extras", () => {
    for (const forbidden of [
      { referenceRangeText: "70-99 mg/dL" },
      { typicalRange: { low: 70, high: 99, unit: "mg/dL" } },
      { summarySnippet: "Doctor said this is fine." },
    ]) {
      const result = biomarkerContextItemSchema.safeParse(validItem(forbidden));

      expect(result.success, `item must reject ${Object.keys(forbidden)[0]}`).toBe(false);
    }
  });

  it(`caps items at ${MAX_BIOMARKER_CONTEXT_ITEMS}`, () => {
    const result = aiBiomarkerContextSummarySchema.safeParse({
      items: Array.from({ length: MAX_BIOMARKER_CONTEXT_ITEMS + 1 }, () => validItem()),
      generatedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });

  it("allows nullable value, valueText, and observedAt", () => {
    const result = biomarkerContextItemSchema.safeParse(
      validItem({ value: null, valueText: "trace", observedAt: null }),
    );

    expect(result.success).toBe(true);
  });
});
