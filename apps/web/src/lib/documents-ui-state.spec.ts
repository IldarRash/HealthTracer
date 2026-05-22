import { describe, expect, it } from "vitest";
import type { DocumentConsentScope, HealthDocument } from "@health/types";
import {
  buildDocumentConsentScopeItems,
  canParseDocument,
  canReviewSummary,
  canSearchDocuments,
  canSubmitDocumentUpload,
  documentTypeLabel,
  isDocumentRevoked,
  parseStatusBadgeTone,
  parseStatusLabel,
  reviewStatusBadgeTone,
} from "./documents-ui-state.js";

describe("documents UI state", () => {
  it("labels document types and parse statuses", () => {
    expect(documentTypeLabel("lab_report")).toBe("Lab report");
    expect(parseStatusLabel("summary_ready")).toBe("Summary ready");
    expect(parseStatusBadgeTone("failed")).toBe("error");
    expect(reviewStatusBadgeTone("pending_review")).toBe("pending");
  });

  it("builds consent scope items from selected scopes", () => {
    const scopes: DocumentConsentScope[] = ["upload_storage", "parse_ocr"];
    const items = buildDocumentConsentScopeItems(scopes);

    expect(items.find((item) => item.id === "upload_storage")?.enabled).toBe(true);
    expect(items.find((item) => item.id === "coach_chat_context")?.enabled).toBe(false);
  });

  it("requires upload consent and sample text before submit", () => {
    expect(
      canSubmitDocumentUpload({
        title: "Sample",
        sampleText: "Synthetic note",
        consentScopes: ["upload_storage"],
      }),
    ).toBe(true);

    expect(
      canSubmitDocumentUpload({
        title: "Sample",
        sampleText: "",
        consentScopes: ["upload_storage"],
      }),
    ).toBe(false);

    expect(
      canSubmitDocumentUpload({
        title: "Sample",
        sampleText: "Synthetic note",
        consentScopes: ["parse_ocr"],
      }),
    ).toBe(false);
  });

  it("allows parse only with required consent and retryable statuses", () => {
    const base: Pick<HealthDocument, "parseStatus" | "consentScopes" | "revokedAt"> = {
      parseStatus: "uploaded",
      consentScopes: ["upload_storage", "parse_ocr", "ai_summarization"],
      revokedAt: null,
    };

    expect(canParseDocument(base)).toBe(true);
    expect(canParseDocument({ ...base, parseStatus: "summary_ready" })).toBe(false);
    expect(
      canParseDocument({
        ...base,
        consentScopes: ["upload_storage", "parse_ocr"],
      }),
    ).toBe(false);
    expect(canParseDocument({ ...base, revokedAt: "2026-05-22T12:00:00.000Z" })).toBe(false);
  });

  it("allows summary review only for pending summary_ready documents", () => {
    expect(
      canReviewSummary({
        parseStatus: "summary_ready",
        revokedAt: null,
        summary: {
          reviewStatus: "pending_review",
        } as never,
      }),
    ).toBe(true);

    expect(
      canReviewSummary({
        parseStatus: "summary_ready",
        revokedAt: null,
        summary: {
          reviewStatus: "approved",
        } as never,
      }),
    ).toBe(false);

    expect(
      canReviewSummary({
        parseStatus: "summary_ready",
        revokedAt: null,
        summary: {
          reviewStatus: "rejected",
        } as never,
      }),
    ).toBe(false);

    expect(
      canReviewSummary({
        parseStatus: "summary_ready",
        revokedAt: "2026-05-22T12:00:00.000Z",
        summary: {
          reviewStatus: "pending_review",
        } as never,
      }),
    ).toBe(false);
  });

  it("detects revoked documents and non-empty search queries", () => {
    expect(
      isDocumentRevoked({
        revokedAt: "2026-05-22T12:00:00.000Z",
        parseStatus: "uploaded",
      }),
    ).toBe(true);
    expect(
      isDocumentRevoked({
        revokedAt: null,
        parseStatus: "revoked",
      }),
    ).toBe(true);
    expect(canSearchDocuments("  wellness  ")).toBe(true);
    expect(canSearchDocuments("   ")).toBe(false);
  });
});
