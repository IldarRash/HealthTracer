import { describe, expect, it } from "vitest";
import type { DocumentConsentScope, HealthDocument } from "@health/types";
import {
  buildDocumentConsentScopeItems,
  canParseDocument,
  canReviewSummary,
  canSearchDocuments,
  canSubmitDocumentUpload,
  coachingDomainLabel,
  canExtractDocumentSignals,
  canReviewDocumentSignal,
  correlationConfidenceLabel,
  documentTypeLabel,
  formatSignalConfidence,
  isDocumentRevoked,
  isSignalLowConfidence,
  parseStatusBadgeTone,
  parseStatusLabel,
  partitionDocumentSignals,
  reviewStatusBadgeTone,
  signalExtractionBadgeTone,
  signalExtractionStatusLabel,
  signalReviewStatusBadgeTone,
  signalReviewStatusLabel,
  evidenceRefTypeLabel,
  correlationDataStatusLabel,
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

  it("requires upload consent and a file or sample text before submit", () => {
    const file = new File(["sample"], "note.txt", { type: "text/plain" });

    expect(
      canSubmitDocumentUpload({
        title: "Sample",
        sampleText: "Synthetic note",
        selectedFile: null,
        consentScopes: ["upload_storage"],
      }),
    ).toBe(true);

    expect(
      canSubmitDocumentUpload({
        title: "Sample",
        sampleText: "",
        selectedFile: file,
        consentScopes: ["upload_storage"],
      }),
    ).toBe(true);

    expect(
      canSubmitDocumentUpload({
        title: "Sample",
        sampleText: "",
        selectedFile: null,
        consentScopes: ["upload_storage"],
      }),
    ).toBe(false);

    expect(
      canSubmitDocumentUpload({
        title: "Sample",
        sampleText: "Synthetic note",
        selectedFile: null,
        consentScopes: ["parse_ocr"],
      }),
    ).toBe(false);

    expect(
      canSubmitDocumentUpload({
        title: "Sample",
        sampleText: "",
        selectedFile: file,
        consentScopes: ["upload_storage"],
        fileValidationError: "This file is larger than 5 MB.",
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

  it("labels signal extraction and review states", () => {
    expect(signalExtractionStatusLabel("not_started")).toBe("Signals not extracted");
    expect(signalExtractionStatusLabel("processing")).toBe("Extracting signals");
    expect(signalExtractionStatusLabel("ready")).toBe("Signals ready");
    expect(signalExtractionBadgeTone("failed")).toBe("error");
    expect(signalExtractionStatusLabel("revoked")).toBe("Signals revoked");
    expect(signalExtractionBadgeTone("revoked")).toBe("neutral");
    expect(signalReviewStatusLabel("approved")).toBe("Approved for coaching");
    expect(signalReviewStatusBadgeTone("ignored")).toBe("neutral");
    expect(formatSignalConfidence(0.85)).toBe("85% extraction confidence");
    expect(correlationDataStatusLabel("partial")).toBe("Limited data — insights may be sparse");
    expect(evidenceRefTypeLabel("document_signal")).toBe("Document signal");
  });

  it("gates signal extraction on consent and lifecycle status", () => {
    const base = {
      revokedAt: null,
      parseStatus: "uploaded" as const,
      consentScopes: ["upload_storage", "parse_ocr", "coach_chat_context"] as DocumentConsentScope[],
      signalExtractionStatus: "not_started" as const,
    };

    expect(canExtractDocumentSignals(base)).toBe(true);
    expect(canExtractDocumentSignals({ ...base, signalExtractionStatus: "processing" })).toBe(
      false,
    );
    expect(canExtractDocumentSignals({ ...base, signalExtractionStatus: "failed" })).toBe(true);
    expect(
      canExtractDocumentSignals({
        ...base,
        consentScopes: ["upload_storage", "parse_ocr"],
      }),
    ).toBe(false);
    expect(
      canExtractDocumentSignals({
        ...base,
        revokedAt: "2026-05-22T12:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      canExtractDocumentSignals({
        ...base,
        parseStatus: "revoked",
      }),
    ).toBe(false);
  });

  it("partitions signals and flags low confidence", () => {
    const signal = {
      reviewStatus: "pending_review",
      confidenceScore: 0.5,
    } as never;

    expect(isSignalLowConfidence(signal)).toBe(true);
    expect(
      canReviewDocumentSignal(
        { revokedAt: null, signalExtractionStatus: "ready" },
        { reviewStatus: "pending_review" },
      ),
    ).toBe(true);
    expect(
      canReviewDocumentSignal(
        { revokedAt: "2026-05-22T12:00:00.000Z", signalExtractionStatus: "ready" },
        { reviewStatus: "pending_review" },
      ),
    ).toBe(false);
    expect(
      canReviewDocumentSignal(
        { revokedAt: null, signalExtractionStatus: "failed" },
        { reviewStatus: "pending_review" },
      ),
    ).toBe(false);

    const partitioned = partitionDocumentSignals([
      { id: "1", reviewStatus: "pending_review" } as never,
      { id: "2", reviewStatus: "approved" } as never,
      { id: "3", reviewStatus: "ignored" } as never,
    ]);

    expect(partitioned.pending).toHaveLength(1);
    expect(partitioned.approved).toHaveLength(1);
    expect(partitioned.hidden).toHaveLength(1);
  });

  it("labels correlation cards and proposal evidence references", () => {
    expect(correlationDataStatusLabel("sufficient")).toBe("Enough data for coaching insights");
    expect(correlationDataStatusLabel("insufficient")).toBe("Not enough approved data yet");
    expect(correlationConfidenceLabel("high")).toBe("Higher confidence pattern");
    expect(correlationConfidenceLabel("low")).toBe("Early pattern — review with care");
    expect(coachingDomainLabel("workout")).toBe("Training");
    expect(evidenceRefTypeLabel("weekly_progress_summary")).toBe("Weekly progress");
    expect(evidenceRefTypeLabel("habit_adherence")).toBe("Habit adherence");
  });
});
