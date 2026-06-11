/**
 * AttachmentTextExtractionService unit tests.
 *
 * Tests cover:
 *  - Happy paths: text/plain, text/markdown, application/pdf
 *  - Empty text layer → status "empty", no throw
 *  - Corrupt / parse error → status "failed", no throw
 *  - 12 000-char truncation flag
 *  - Per-attachment timeout degrades gracefully
 *  - Storage-read failure degrades gracefully
 *  - Image MIMEs are skipped (not in result map)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ATTACHMENT_TEXT_CONTENT_CHARS } from "@health/types";
import { AttachmentTextExtractionService } from "./attachment-text-extraction.service.js";
import * as documentProcessing from "../documents/document-processing.js";

// Hoist the PDF extraction mock so it intercepts the ESM import inside the service.
vi.mock("../documents/document-processing.js", () => ({
  extractPdfPlainText: vi.fn().mockResolvedValue({ plainText: "Extracted PDF content here." }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService(readFn: (storageRef: string) => Promise<Buffer>): AttachmentTextExtractionService {
  const chatAttachmentsService = {
    readStoredContent: vi.fn((ref: string) => readFn(ref)),
  };

  return new AttachmentTextExtractionService(chatAttachmentsService as never);
}

const PLAIN_TEXT_STORAGE_REF = "local://attachments/notes.txt";
const MARKDOWN_STORAGE_REF = "local://attachments/plan.md";
const PDF_STORAGE_REF = "local://attachments/training.pdf";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AttachmentTextExtractionService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("happy path — text/* MIMEs", () => {
    it("extracts text from text/plain attachment", async () => {
      const content = "This is my training plan.\nDay 1: Squat 3x5.";
      const service = makeService(async () => Buffer.from(content, "utf8"));

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-txt-001",
          mimeType: "text/plain",
          storageRef: PLAIN_TEXT_STORAGE_REF,
        },
      ]);

      const entry = result.get("ref-txt-001");
      expect(entry).toBeDefined();
      expect(entry?.status).toBe("ok");
      expect(entry?.text).toContain("training plan");
      expect(entry?.truncated).toBe(false);
    });

    it("extracts text from text/markdown attachment", async () => {
      const content = "# Workout Plan\n\n- Day 1: Pull day\n- Day 2: Push day";
      const service = makeService(async () => Buffer.from(content, "utf8"));

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-md-001",
          mimeType: "text/markdown",
          storageRef: MARKDOWN_STORAGE_REF,
        },
      ]);

      const entry = result.get("ref-md-001");
      expect(entry?.status).toBe("ok");
      expect(entry?.text).toContain("Workout Plan");
      expect(entry?.truncated).toBe(false);
    });

    it("extracts text from text/x-markdown attachment", async () => {
      const content = "## Meal Plan\nBreakfast: oatmeal";
      const service = makeService(async () => Buffer.from(content, "utf8"));

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-xmd-001",
          mimeType: "text/x-markdown",
          storageRef: MARKDOWN_STORAGE_REF,
        },
      ]);

      const entry = result.get("ref-xmd-001");
      expect(entry?.status).toBe("ok");
      expect(entry?.text).toContain("Meal Plan");
    });
  });

  describe("happy path — application/pdf", () => {
    it("extracts text from a valid PDF using extractPdfPlainText", async () => {
      // The extractPdfPlainText module is mocked at the top level.
      // The service routes application/pdf buffers through that function.
      const fakePdfBytes = Buffer.from("%PDF-1.4 fake content");
      const service = makeService(async () => fakePdfBytes);

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-pdf-001",
          mimeType: "application/pdf",
          storageRef: PDF_STORAGE_REF,
        },
      ]);

      const entry = result.get("ref-pdf-001");
      expect(entry).toBeDefined();
      expect(entry?.status).toBe("ok");
      expect(entry?.text).toBe("Extracted PDF content here.");
      expect(entry?.truncated).toBe(false);
    });

    it("n3: PDF with no text layer (extractPdfPlainText throws 'did not contain extractable text') → status 'empty', not 'failed'", async () => {
      // Image-only PDFs or scanned PDFs without an OCR layer cause extractPdfPlainText
      // to throw a well-known error. The service maps this specific error to "empty"
      // (absence of content) rather than "failed" (processing error).
      vi.spyOn(documentProcessing, "extractPdfPlainText").mockRejectedValueOnce(
        new Error("PDF did not contain extractable text."),
      );

      const service = makeService(async () => Buffer.from("%PDF-1.4 image-only"));

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-pdf-no-text",
          mimeType: "application/pdf",
          storageRef: PDF_STORAGE_REF,
        },
      ]);

      const entry = result.get("ref-pdf-no-text");
      expect(entry?.status).toBe("empty");
      expect(entry?.text).toBeUndefined();
      expect(entry?.truncated).toBe(false);
    });

    it("n3: PDF parse errors other than empty-text-layer surface as status 'failed'", async () => {
      // A corrupt or unreadable PDF throws a different error — should remain "failed".
      vi.spyOn(documentProcessing, "extractPdfPlainText").mockRejectedValueOnce(
        new Error("Corrupt PDF stream."),
      );

      const service = makeService(async () => Buffer.from("not-a-pdf"));

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-pdf-corrupt",
          mimeType: "application/pdf",
          storageRef: PDF_STORAGE_REF,
        },
      ]);

      const entry = result.get("ref-pdf-corrupt");
      expect(entry?.status).toBe("failed");
    });
  });

  describe("empty text layer", () => {
    it("returns status 'empty' (not 'ok') when extracted text is blank, does not throw", async () => {
      const service = makeService(async () => Buffer.from("   \n\t  ", "utf8"));

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-empty-001",
          mimeType: "text/plain",
          storageRef: PLAIN_TEXT_STORAGE_REF,
        },
      ]);

      const entry = result.get("ref-empty-001");
      expect(entry?.status).toBe("empty");
      expect(entry?.text).toBeUndefined();
      expect(entry?.truncated).toBe(false);
    });
  });

  describe("truncation at MAX_ATTACHMENT_TEXT_CONTENT_CHARS", () => {
    it(`truncates text at ${MAX_ATTACHMENT_TEXT_CONTENT_CHARS} chars and sets truncated=true`, async () => {
      const longText = "x".repeat(MAX_ATTACHMENT_TEXT_CONTENT_CHARS + 500);
      const service = makeService(async () => Buffer.from(longText, "utf8"));

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-long-001",
          mimeType: "text/plain",
          storageRef: PLAIN_TEXT_STORAGE_REF,
        },
      ]);

      const entry = result.get("ref-long-001");
      expect(entry?.status).toBe("ok");
      expect(entry?.truncated).toBe(true);
      expect(entry?.text).toHaveLength(MAX_ATTACHMENT_TEXT_CONTENT_CHARS);
    });

    it("does not truncate text exactly at the limit", async () => {
      const exactText = "y".repeat(MAX_ATTACHMENT_TEXT_CONTENT_CHARS);
      const service = makeService(async () => Buffer.from(exactText, "utf8"));

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-exact-001",
          mimeType: "text/plain",
          storageRef: PLAIN_TEXT_STORAGE_REF,
        },
      ]);

      const entry = result.get("ref-exact-001");
      expect(entry?.status).toBe("ok");
      expect(entry?.truncated).toBe(false);
      expect(entry?.text).toHaveLength(MAX_ATTACHMENT_TEXT_CONTENT_CHARS);
    });
  });

  describe("storage-read failure", () => {
    it("returns status 'failed' when storage read throws, does not rethrow", async () => {
      const service = makeService(async () => {
        throw new Error("Disk read error");
      });

      await expect(
        service.extractTurnAttachmentTexts([
          {
            attachmentRefId: "ref-fail-001",
            mimeType: "text/plain",
            storageRef: PLAIN_TEXT_STORAGE_REF,
          },
        ]),
      ).resolves.toBeDefined();

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-fail-002",
          mimeType: "text/plain",
          storageRef: PLAIN_TEXT_STORAGE_REF,
        },
      ]);

      const entry = result.get("ref-fail-002");
      expect(entry?.status).toBe("failed");
      expect(entry?.text).toBeUndefined();
    });

    it("degrades the failed attachment but still returns ok for other attachments", async () => {
      const service = makeService(async (ref) => {
        if (ref.includes("bad")) {
          throw new Error("Storage error");
        }

        return Buffer.from("Good content here.");
      });

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-good-001",
          mimeType: "text/plain",
          storageRef: PLAIN_TEXT_STORAGE_REF,
        },
        {
          attachmentRefId: "ref-bad-001",
          mimeType: "text/plain",
          storageRef: "local://attachments/bad-file.txt",
        },
      ]);

      expect(result.get("ref-good-001")?.status).toBe("ok");
      expect(result.get("ref-bad-001")?.status).toBe("failed");
    });
  });

  describe("timeout degradation", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("returns status 'failed' when extraction exceeds 5s timeout", async () => {
      let resolveHang: (() => void) | undefined;
      const hangingRead = new Promise<Buffer>((resolve) => {
        resolveHang = () => resolve(Buffer.from("never-reached"));
      });

      const service = makeService(async () => hangingRead);

      const resultPromise = service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-timeout-001",
          mimeType: "text/plain",
          storageRef: PLAIN_TEXT_STORAGE_REF,
        },
      ]);

      // Advance past the 5s timeout.
      await vi.runAllTimersAsync();

      const result = await resultPromise;
      const entry = result.get("ref-timeout-001");
      expect(entry?.status).toBe("failed");

      // Resolve the hanging promise to avoid leaks.
      resolveHang?.();
    });
  });

  describe("image MIMEs are skipped", () => {
    it("does not process image/jpeg attachments and omits them from result map", async () => {
      const readFn = vi.fn().mockResolvedValue(Buffer.from("fake image bytes"));
      const service = makeService(readFn);

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-img-001",
          mimeType: "image/jpeg",
          storageRef: "local://attachments/meal.jpg",
        },
        {
          attachmentRefId: "ref-img-002",
          mimeType: "image/png",
          storageRef: "local://attachments/photo.png",
        },
      ]);

      // Image attachments must NOT appear in the result map.
      expect(result.size).toBe(0);
      expect(readFn).not.toHaveBeenCalled();
    });

    it("processes document attachments alongside images, only extracts documents", async () => {
      const service = makeService(async () => Buffer.from("Meal plan content.", "utf8"));

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-img-skip",
          mimeType: "image/jpeg",
          storageRef: "local://attachments/meal.jpg",
        },
        {
          attachmentRefId: "ref-doc-001",
          mimeType: "text/plain",
          storageRef: PLAIN_TEXT_STORAGE_REF,
        },
      ]);

      expect(result.has("ref-img-skip")).toBe(false);
      expect(result.has("ref-doc-001")).toBe(true);
      expect(result.get("ref-doc-001")?.status).toBe("ok");
    });
  });

  describe("null storageRef", () => {
    it("skips attachments with null storageRef", async () => {
      const readFn = vi.fn();
      const service = makeService(readFn);

      const result = await service.extractTurnAttachmentTexts([
        {
          attachmentRefId: "ref-no-storage",
          mimeType: "text/plain",
          storageRef: null,
        },
      ]);

      expect(result.size).toBe(0);
      expect(readFn).not.toHaveBeenCalled();
    });
  });

  describe("empty input", () => {
    it("returns an empty map when called with no attachments", async () => {
      const service = makeService(async () => Buffer.from("x"));

      const result = await service.extractTurnAttachmentTexts([]);
      expect(result.size).toBe(0);
    });
  });
});
