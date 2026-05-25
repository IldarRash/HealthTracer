import { describe, expect, it } from "vitest";
import {
  buildDocumentSummarySnippet,
  createHealthDocumentSchema,
  documentSearchQuerySchema,
  hasDocumentConsentScope,
  healthDocumentSchema,
  healthDocumentSummarySchema,
  isDocumentContextEligible,
  isDocumentSearchEligible,
  isHealthDocumentActive,
  updateDocumentConsentSchema,
} from "./documents.js";

describe("document contracts", () => {
  it("accepts create payloads with explicit consent scopes and sample text", () => {
    expect(() =>
      createHealthDocumentSchema.parse({
        documentType: "other",
        title: "Sample wellness note",
        consentScopes: ["upload_storage", "parse_ocr"],
        sampleText: "Sample text for smoke testing.",
      }),
    ).not.toThrow();

    const created = createHealthDocumentSchema.parse({
      documentType: "lab_report",
      title: "Sample lab note",
      consentScopes: ["upload_storage", "parse_ocr", "ai_summarization"],
      sampleText: "Rest day preference noted.",
    });

    expect(created.mimeType).toBe("text/plain");
  });

  it("validates health document metadata shape", () => {
    expect(() =>
      healthDocumentSchema.parse({
        id: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        documentType: "clinical_note",
        title: "Coaching note",
        storageReference: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81/doc.txt",
        mimeType: "text/plain",
        fileSizeBytes: 120,
        parseStatus: "uploaded",
        signalExtractionStatus: "not_started",
        signalExtractionFailureReason: null,
        signalExtractedAt: null,
        consentScopes: ["upload_storage"],
        consentVersion: "v1",
        consentGrantedAt: "2026-05-22T12:00:00.000Z",
        parseFailureReason: null,
        revokedAt: null,
        deletedAt: null,
        uploadedAt: "2026-05-22T12:00:00.000Z",
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("validates summary and search query contracts", () => {
    expect(() =>
      healthDocumentSummarySchema.parse({
        id: "14a08176-64a7-4a2d-8a44-581807368394",
        healthDocumentId: "3f98f3dd-806d-4386-8c5f-43499626c5d6",
        userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
        summaryText: "User-provided note may include wellness-relevant preferences.",
        extractedConstraints: ["Prefer low-impact cardio"],
        reviewStatus: "pending_review",
        reviewedAt: null,
        generatedAt: "2026-05-22T12:00:00.000Z",
        generatorVersion: "dev-v1",
        createdAt: "2026-05-22T12:00:00.000Z",
        updatedAt: "2026-05-22T12:00:00.000Z",
      }),
    ).not.toThrow();

    expect(documentSearchQuerySchema.parse({ q: "wellness" }).limit).toBe(20);
  });
});

describe("document consent helpers", () => {
  const activeDocument = {
    consentScopes: [
      "upload_storage",
      "parse_ocr",
      "ai_summarization",
      "semantic_indexing",
      "coach_chat_context",
    ] as const,
    revokedAt: null,
    deletedAt: null,
    parseStatus: "summary_ready" as const,
  };

  const approvedSummary = {
    reviewStatus: "approved" as const,
  };

  it("checks individual consent scopes", () => {
    expect(hasDocumentConsentScope(activeDocument.consentScopes, "upload_storage")).toBe(true);
    expect(hasDocumentConsentScope(["upload_storage"], "coach_chat_context")).toBe(false);
  });

  it("excludes revoked or deleted documents from search and context", () => {
    expect(isHealthDocumentActive(activeDocument)).toBe(true);
    expect(isDocumentSearchEligible(activeDocument, approvedSummary)).toBe(true);
    expect(isDocumentContextEligible(activeDocument, approvedSummary)).toBe(true);

    const revoked = {
      ...activeDocument,
      revokedAt: "2026-05-22T12:00:00.000Z",
    };

    expect(isDocumentSearchEligible(revoked, approvedSummary)).toBe(false);
    expect(isDocumentContextEligible(revoked, approvedSummary)).toBe(false);
  });

  it("requires approved summaries and indexing/chat consent scopes", () => {
    expect(
      isDocumentSearchEligible(
        {
          ...activeDocument,
          consentScopes: ["upload_storage", "parse_ocr", "ai_summarization"],
        },
        approvedSummary,
      ),
    ).toBe(false);

    expect(
      isDocumentContextEligible(activeDocument, { reviewStatus: "pending_review" }),
    ).toBe(false);
  });

  it("builds bounded summary snippets", () => {
    const snippet = buildDocumentSummarySnippet("a".repeat(600), 500);
    expect(snippet.length).toBeLessThanOrEqual(500);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("accepts consent revocation updates", () => {
    expect(updateDocumentConsentSchema.parse({ revoke: true }).revoke).toBe(true);
  });
});
