import { healthDocuments } from "@health/db";
import { describe, expect, it } from "vitest";
import { filterContextReferences, filterSearchResults } from "./document.mapper.js";

const timestamp = new Date("2026-05-22T12:00:00.000Z");

type DocumentRow = typeof healthDocuments.$inferSelect;

const baseDocument: DocumentRow = {
  id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
  userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
  documentType: "other" as const,
  title: "Sample note",
  storageReference: "doc.txt",
  mimeType: "text/plain",
  fileSizeBytes: 42,
  parseStatus: "summary_ready" as const,
  consentScopes: [
    "upload_storage",
    "parse_ocr",
    "ai_summarization",
    "semantic_indexing",
    "coach_chat_context",
  ],
  consentVersion: "v1",
  consentGrantedAt: timestamp,
  parseFailureReason: null,
  signalExtractionStatus: "not_started" as const,
  signalExtractionFailureReason: null,
  signalExtractedAt: null,
  revokedAt: null,
  deletedAt: null,
  uploadedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const baseSummary = {
  id: "14a08176-64a7-4a2d-8a44-581807368394",
  healthDocumentId: baseDocument.id,
  userId: baseDocument.userId,
  summaryText: "Approved wellness summary for review.",
  extractedConstraints: ["Prefer low-impact cardio"],
  searchIndexText: "approved wellness summary",
  reviewStatus: "approved" as const,
  reviewedAt: timestamp,
  generatedAt: timestamp,
  generatorVersion: "dev-v1",
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("document mapper filters", () => {
  it("returns only search-eligible approved summaries", () => {
    const results = filterSearchResults([
      { document: baseDocument, summary: baseSummary },
      {
        document: baseDocument,
        summary: { ...baseSummary, reviewStatus: "pending_review" },
      },
      {
        document: { ...baseDocument, revokedAt: timestamp },
        summary: baseSummary,
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.summaryId).toBe(baseSummary.id);
  });

  it("returns only chat-context-eligible approved summaries", () => {
    const results = filterContextReferences([
      { document: baseDocument, summary: baseSummary },
      {
        document: {
          ...baseDocument,
          consentScopes: ["upload_storage", "parse_ocr", "ai_summarization"],
        },
        summary: baseSummary,
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.summarySnippet.length).toBeGreaterThan(0);
  });
});
