import { describe, expect, it } from "vitest";
import {
  buildHealthMetricAggregateEvidenceId,
  correlationEvidenceRefSchema,
  parseHealthMetricAggregateEvidenceId,
  proposalCorrelationEvidenceRefsSchema,
  VERIFIABLE_CORRELATION_EVIDENCE_REF_TYPES,
} from "./proposal-evidence.js";

describe("correlation evidence refs", () => {
  it("accepts the new biomarker_reading evidence type", () => {
    expect(() =>
      correlationEvidenceRefSchema.parse({
        type: "biomarker_reading",
        id: "reading-1",
        label: "Vitamin D reading",
      }),
    ).not.toThrow();
  });

  it("rejects the removed document_signal evidence type", () => {
    expect(() =>
      correlationEvidenceRefSchema.parse({
        type: "document_signal",
        id: "sig-1",
        label: "Vitamin D from document",
      }),
    ).toThrow();
  });

  it("defaults the proposal evidence-ref array to empty", () => {
    expect(proposalCorrelationEvidenceRefsSchema.parse(undefined)).toEqual([]);
  });

  it("treats biomarker_reading as verifiable (S4 proposals rewire)", () => {
    expect(VERIFIABLE_CORRELATION_EVIDENCE_REF_TYPES).toContain("biomarker_reading");
  });
});

describe("health metric aggregate evidence id", () => {
  it("round-trips a build/parse", () => {
    const id = buildHealthMetricAggregateEvidenceId({
      metricType: "sleep",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-07",
    });
    expect(parseHealthMetricAggregateEvidenceId(id)).toEqual({
      metricType: "sleep",
      periodStart: "2026-05-01",
      periodEnd: "2026-05-07",
    });
  });

  it("returns null for a malformed id", () => {
    expect(parseHealthMetricAggregateEvidenceId("nope")).toBeNull();
  });
});
