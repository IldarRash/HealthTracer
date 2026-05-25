import { containsUnsafeDocumentSummaryLanguage } from "@health/ai";
import { describe, expect, it } from "vitest";
import {
  buildGovernedDocumentSummary,
  containsRawDocumentText,
  DevDocumentSummarizer,
  LabDocumentParser,
} from "./document-processing.js";

const PRIVATE_SAMPLE =
  "CONFIDENTIAL_OCR_MARKER_9f3a: patient resting heart rate 42 bpm with unusual fatigue patterns.";

/** Minimal PDF with extractable lab text for parser tests. */
const MINIMAL_LAB_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 55>>stream
BT /F1 12 Tf 72 720 Td (Vitamin D: 22 ng/mL) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000370 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
441
%%EOF`,
  "binary",
);

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

  it("parses plain text uploads and rejects unsupported mime types", async () => {
    const parser = new LabDocumentParser();

    await expect(
      parser.parse({ mimeType: "application/msword", content: Buffer.from("doc") }),
    ).rejects.toThrow("Unsupported document mime type.");

    const parsed = await parser.parse({
      mimeType: "text/plain",
      content: Buffer.from("Energy level: 4/10 on rest days.", "utf8"),
    });

    expect(parsed.plainText).toContain("Energy level");
  });

  it("parses PDF uploads with extractable lab text", async () => {
    const parser = new LabDocumentParser();

    const parsed = await parser.parse({
      mimeType: "application/pdf",
      content: MINIMAL_LAB_PDF,
    });

    expect(parsed.plainText).toContain("Vitamin D");
    expect(parsed.plainText).not.toContain("%PDF");
  });

  it("rejects PDF uploads without extractable text", async () => {
    const parser = new LabDocumentParser();

    await expect(
      parser.parse({
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-1.4\n% empty\n", "utf8"),
      }),
    ).rejects.toThrow();
  });
});
