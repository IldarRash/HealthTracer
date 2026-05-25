import { describe, expect, it } from "vitest";
import { CorrelationsService } from "./correlations.service.js";

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

const now = new Date("2026-05-22T12:00:00.000Z");

const documentRow = {
  id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
  userId: user.id,
  documentType: "lab_report" as const,
  title: "Sample lab",
  storageReference: `${user.id}/doc.txt`,
  mimeType: "text/plain",
  fileSizeBytes: 42,
  parseStatus: "summary_ready" as const,
  signalExtractionStatus: "ready" as const,
  signalExtractionFailureReason: null,
  signalExtractedAt: now,
  consentScopes: ["upload_storage", "parse_ocr", "coach_chat_context"] as const,
  consentVersion: "v1",
  consentGrantedAt: now,
  parseFailureReason: null,
  revokedAt: null,
  deletedAt: null,
  uploadedAt: now,
  createdAt: now,
  updatedAt: now,
};

const signalRow = {
  id: "14a08176-64a7-4a2d-8a44-581807368394",
  userId: user.id,
  healthDocumentId: documentRow.id,
  signalKey: "energy_level" as const,
  displayLabel: "Energy level",
  valueText: "4",
  unit: "score",
  referenceRangeText: null,
  observedAt: null,
  sourceSection: "Self-reported",
  confidenceScore: "0.850",
  reviewStatus: "approved" as const,
  ignoredReason: null,
  extractedAt: now,
  reviewedAt: now,
  createdAt: now,
  updatedAt: now,
};

function createService(
  candidates: Array<{ document: Record<string, unknown>; signal: Record<string, unknown> }>,
  metricsItems: Array<{
    metricType: string;
    label: string;
    summary: string;
    periodStart: string;
    periodEnd: string;
    freshness: string;
    sourceProvider: string;
  }> = [
    {
      metricType: "sleep",
      label: "Sleep",
      summary: "Average sleep recently moved lower.",
      periodStart: "2026-05-15",
      periodEnd: "2026-05-21",
      freshness: "2026-05-22T12:00:00.000Z",
      sourceProvider: "wearable",
    },
  ],
) {
  return new CorrelationsService(
    {
      listCorrelationCandidates: async () => candidates,
    } as never,
    {
      buildSummaryForUser: async () => ({
        items: metricsItems,
        generatedAt: "2026-05-22T12:00:00.000Z",
      }),
    } as never,
    {
      resolveFromAuth: async () => user,
    } as never,
  );
}

describe("CorrelationsService", () => {
  it("uses only approved consented document signals in correlation evidence", async () => {
    const service = createService([{ document: documentRow, signal: signalRow }]);

    const preview = await service.previewInsights(auth);

    expect(preview.dataStatus).toBe("sufficient");
    expect(preview.insights).toHaveLength(1);
    expect(preview.insights[0]?.evidenceRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "document_signal",
          id: signalRow.id,
          label: "Energy level from uploaded document",
        }),
      ]),
    );
  });

  it("does not return metrics-only insights without approved document signals", async () => {
    const service = createService([]);

    const preview = await service.previewInsights(auth);

    expect(preview.insights).toHaveLength(0);
    expect(preview.dataStatus).toBe("partial");
  });

  it("excludes revoked, unapproved, and low-confidence signals from correlation previews", async () => {
    const service = createService([
      {
        document: {
          ...documentRow,
          revokedAt: new Date("2026-05-22T13:00:00.000Z"),
        },
        signal: signalRow,
      },
      {
        document: documentRow,
        signal: {
          ...signalRow,
          id: "24a08176-64a7-4a2d-8a44-581807368394",
          reviewStatus: "pending_review",
        },
      },
      {
        document: documentRow,
        signal: {
          ...signalRow,
          id: "34a08176-64a7-4a2d-8a44-581807368394",
          confidenceScore: "0.400",
        },
      },
    ]);

    const preview = await service.previewInsights(auth);

    expect(preview.dataStatus).toBe("partial");
    expect(preview.insights).toHaveLength(0);
  });
});
