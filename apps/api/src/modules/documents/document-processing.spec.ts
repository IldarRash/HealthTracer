import { containsUnsafeDocumentSummaryLanguage } from "@health/ai";
import { describe, expect, it } from "vitest";
import {
  buildGovernedDocumentSummary,
  containsRawDocumentText,
  DevDocumentSummarizer,
} from "./document-processing.js";

const PRIVATE_SAMPLE =
  "CONFIDENTIAL_OCR_MARKER_9f3a: patient resting heart rate 42 bpm with unusual fatigue patterns.";

describe("document processing", () => {
  it("does not persist raw sample text in summary or search fields", async () => {
    const summarizer = new DevDocumentSummarizer();
    const generated = await summarizer.summarize({
      documentType: "other",
      title: "Wellness journal",
      plainText: PRIVATE_SAMPLE,
    });

    expect(containsRawDocumentText(generated, PRIVATE_SAMPLE)).toBe(false);
    expect(generated.summaryText).not.toContain("CONFIDENTIAL_OCR_MARKER_9f3a");
    expect(generated.searchIndexText).not.toContain("CONFIDENTIAL_OCR_MARKER_9f3a");
    expect(generated.summaryText).toContain("not raw document text");
  });

  it("derives searchIndexText from safe summary labels and constraints only", () => {
    const generated = buildGovernedDocumentSummary({
      documentType: "lab_report",
      title: "Annual panel",
      plainText: PRIVATE_SAMPLE,
    });

    expect(generated.searchIndexText).toBe(
      "annual panel lab report review uploaded document details with a qualified professional when needed.",
    );
  });

  it("extracts bounded wellness hints without persisting OCR excerpts", () => {
    const generated = buildGovernedDocumentSummary({
      documentType: "other",
      title: "Activity notes",
      plainText: "Schedule includes low-impact cardio on rest days.",
    });

    expect(generated.extractedConstraints).toContain("May prefer low-impact activity choices.");
    expect(generated.extractedConstraints).toContain("May prefer scheduled rest days.");
    expect(generated.extractedConstraints.join(" ")).not.toContain("Schedule includes");
  });

  it.each(["clinical_note", "medication_list"] as const)(
    "allows approval for safe %s governed summaries",
    (documentType) => {
      const generated = buildGovernedDocumentSummary({
        documentType,
        title: "Follow-up packet",
        plainText: "Prefer low-impact activity.",
      });

      expect(containsUnsafeDocumentSummaryLanguage(generated.summaryText)).toBe(false);
      expect(
        generated.extractedConstraints.every(
          (constraint) => !containsUnsafeDocumentSummaryLanguage(constraint),
        ),
      ).toBe(true);
    },
  );

  it("still blocks unsafe wording in governed summaries", () => {
    expect(
      containsUnsafeDocumentSummaryLanguage(
        "This summary confirms a diagnosis and prescribes treatment.",
      ),
    ).toBe(true);
  });
});
