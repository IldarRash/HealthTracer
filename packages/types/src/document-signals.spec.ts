import { describe, expect, it } from "vitest";
import {
  containsUnsafeWellnessInsightLanguage,
  correlationInsightPreviewResponseSchema,
  isDocumentSignalCorrelationEligible,
  isDocumentSignalContextEligible,
  validateExtractedDocumentSignalDrafts,
  validateWellnessCorrelationInsight,
  wellnessCorrelationInsightSchema,
} from "./document-signals.js";

describe("document signal contracts", () => {
  it("rejects invalid extracted signal payloads", () => {
    const result = validateExtractedDocumentSignalDrafts([
      {
        signalKey: "not_allowlisted",
        displayLabel: "Bad",
        valueText: "1",
        unit: "x",
        sourceSection: "Lab",
        confidenceScore: 2,
      },
    ]);

    expect(result.valid).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("accepts allowlisted extracted signal payloads", () => {
    const result = validateExtractedDocumentSignalDrafts([
      {
        signalKey: "vitamin_d",
        displayLabel: "Vitamin D",
        valueText: "25",
        unit: "ng/mL",
        referenceRangeText: "30-100 ng/mL",
        observedAt: "2026-05-01",
        sourceSection: "Lab results",
        confidenceScore: 0.85,
      },
    ]);

    expect(result.errors).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
  });

  it("excludes low-confidence and unapproved signals from coaching context", () => {
    expect(
      isDocumentSignalContextEligible(
        {
          consentScopes: ["upload_storage", "parse_ocr", "coach_chat_context"],
          revokedAt: null,
          deletedAt: null,
          parseStatus: "summary_ready",
          signalExtractionStatus: "ready",
        },
        {
          reviewStatus: "pending_review",
          confidenceScore: 0.9,
        },
      ),
    ).toBe(false);

    expect(
      isDocumentSignalContextEligible(
        {
          consentScopes: ["upload_storage", "parse_ocr", "coach_chat_context"],
          revokedAt: null,
          deletedAt: null,
          parseStatus: "summary_ready",
          signalExtractionStatus: "ready",
        },
        {
          reviewStatus: "approved",
          confidenceScore: 0.4,
        },
      ),
    ).toBe(false);
  });

  it("requires active consented documents before signal context or correlation use", () => {
    const eligibleDocument = {
      consentScopes: ["upload_storage", "parse_ocr", "coach_chat_context"] as const,
      revokedAt: null,
      deletedAt: null,
      parseStatus: "summary_ready" as const,
      signalExtractionStatus: "ready" as const,
    };
    const approvedSignal = {
      reviewStatus: "approved" as const,
      confidenceScore: 0.85,
    };

    expect(isDocumentSignalContextEligible(eligibleDocument, approvedSignal)).toBe(true);
    expect(isDocumentSignalCorrelationEligible(eligibleDocument, approvedSignal)).toBe(true);

    expect(
      isDocumentSignalContextEligible(
        {
          ...eligibleDocument,
          consentScopes: ["upload_storage", "parse_ocr"],
        },
        approvedSignal,
      ),
    ).toBe(false);
    expect(
      isDocumentSignalCorrelationEligible(
        {
          ...eligibleDocument,
          revokedAt: "2026-05-22T12:00:00.000Z",
        },
        approvedSignal,
      ),
    ).toBe(false);
    expect(
      isDocumentSignalCorrelationEligible(
        {
          ...eligibleDocument,
          signalExtractionStatus: "failed",
        },
        approvedSignal,
      ),
    ).toBe(false);
  });

  it("rejects unsafe wellness insight wording", () => {
    expect(containsUnsafeWellnessInsightLanguage("This confirms a diagnosis.")).toBe(true);

    const errors = validateWellnessCorrelationInsight({
      id: "insight-1",
      headline: "Sleep and training completion may be linked",
      summary: "Recent sleep summaries and lower training completion appeared together.",
      coachingDomain: "recovery",
      evidenceRefs: [
        {
          type: "document_signal",
          id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
          label: "Vitamin D from uploaded document",
        },
      ],
      confidence: "medium",
    });

    expect(errors).toHaveLength(0);
  });

  it("rejects unsafe or incomplete correlation payloads", () => {
    expect(() =>
      wellnessCorrelationInsightSchema.parse({
        id: "insight-1",
        headline: "Sleep and training completion may be linked",
        summary: "Recent sleep summaries and lower training completion appeared together.",
        coachingDomain: "recovery",
        evidenceRefs: [],
        confidence: "medium",
      }),
    ).toThrow();

    const errors = validateWellnessCorrelationInsight({
      id: "insight-2",
      headline: "Energy pattern",
      summary: "This confirms a deficient clinical result.",
      coachingDomain: "habits",
      evidenceRefs: [
        {
          type: "document_signal",
          id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
          label: "Abnormal lab marker",
        },
      ],
      confidence: "low",
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        "summary: Insight summary contains unsafe medical wording.",
        "evidenceRefs[0].label: Evidence label contains unsafe medical wording.",
      ]),
    );

    expect(() =>
      correlationInsightPreviewResponseSchema.parse({
        insights: Array.from({ length: 6 }, (_, index) => ({
          id: `insight-${index}`,
          headline: "Sleep and training completion may be linked",
          summary: "Recent sleep summaries and lower training completion appeared together.",
          coachingDomain: "recovery",
          evidenceRefs: [
            {
              type: "health_metric_aggregate",
              id: `sleep-${index}`,
              label: "Recent sleep summary",
            },
          ],
          confidence: "medium",
        })),
        generatedAt: "2026-05-22T12:00:00.000Z",
        dataStatus: "sufficient",
      }),
    ).toThrow();
  });
});
