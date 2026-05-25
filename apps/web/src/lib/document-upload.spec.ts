import { describe, expect, it } from "vitest";
import {
  buildCreateDocumentUploadPayload,
  DOCUMENT_UPLOAD_MUTUAL_EXCLUSIVITY_MESSAGE,
  DOCUMENT_UPLOAD_SIZE_LIMIT_MESSAGE,
  DOCUMENT_UPLOAD_SOURCE_REQUIRED_MESSAGE,
  DOCUMENT_UPLOAD_UNSUPPORTED_MESSAGE,
  formatDocumentFileSize,
  readFileAsBase64,
  resolveSupportedDocumentMimeType,
  validateSelectedDocumentFile,
} from "./document-upload.js";

function createTestFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

describe("document upload helpers", () => {
  it("resolves supported mime types from type and extension", () => {
    expect(resolveSupportedDocumentMimeType(createTestFile("a", "report.pdf", "application/pdf"))).toBe(
      "application/pdf",
    );
    expect(resolveSupportedDocumentMimeType(createTestFile("a", "note.txt", "text/plain"))).toBe(
      "text/plain",
    );
    expect(
      resolveSupportedDocumentMimeType(createTestFile("a", "note.txt", "application/octet-stream")),
    ).toBe("text/plain");
    expect(
      resolveSupportedDocumentMimeType(createTestFile("a", "report.pdf", "application/octet-stream")),
    ).toBe("application/pdf");
    expect(resolveSupportedDocumentMimeType(createTestFile("a", "scan.jpg", "image/jpeg"))).toBeNull();
  });

  it("rejects unsupported files and files over the upload limit", () => {
    expect(validateSelectedDocumentFile(createTestFile("a", "scan.jpg", "image/jpeg"))).toEqual({
      ok: false,
      message: DOCUMENT_UPLOAD_UNSUPPORTED_MESSAGE,
    });

    const oversized = createTestFile("x".repeat(5_000_001), "large.txt", "text/plain");
    expect(validateSelectedDocumentFile(oversized)).toEqual({
      ok: false,
      message: DOCUMENT_UPLOAD_SIZE_LIMIT_MESSAGE,
    });

    expect(
      validateSelectedDocumentFile(createTestFile("hello", "note.txt", "text/plain")),
    ).toEqual({
      ok: true,
      mimeType: "text/plain",
    });
  });

  it("formats file sizes for display", () => {
    expect(formatDocumentFileSize(512)).toBe("512 B");
    expect(formatDocumentFileSize(2048)).toBe("2.0 KB");
    expect(formatDocumentFileSize(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  it("encodes file bytes as base64 without logging content", async () => {
    const file = createTestFile("wellness sample", "note.txt", "text/plain");
    await expect(readFileAsBase64(file)).resolves.toBe(
      Buffer.from("wellness sample", "utf8").toString("base64"),
    );
  });

  it("builds sampleText payloads for development uploads", async () => {
    const result = await buildCreateDocumentUploadPayload({
      title: "Dev sample",
      documentType: "lab_report",
      consentScopes: ["upload_storage"],
      consentVersion: "v1",
      sampleText: "Synthetic lab values for testing.",
      selectedFile: null,
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        title: "Dev sample",
        documentType: "lab_report",
        consentScopes: ["upload_storage"],
        consentVersion: "v1",
        mimeType: "text/plain",
        sampleText: "Synthetic lab values for testing.",
      },
    });
  });

  it("builds fileContentBase64 payloads for supported files", async () => {
    const file = createTestFile("%PDF-1.4 sample", "labs.pdf", "application/pdf");
    const result = await buildCreateDocumentUploadPayload({
      title: "Lab PDF",
      documentType: "lab_report",
      consentScopes: ["upload_storage", "parse_ocr"],
      consentVersion: "v1",
      sampleText: "",
      selectedFile: file,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload).toMatchObject({
      title: "Lab PDF",
      documentType: "lab_report",
      mimeType: "application/pdf",
    });
    expect(result.payload.fileContentBase64).toBe(
      Buffer.from("%PDF-1.4 sample", "utf8").toString("base64"),
    );
    expect(result.payload.sampleText).toBeUndefined();
  });

  it("requires exactly one upload source", async () => {
    const file = createTestFile("hello", "note.txt", "text/plain");

    expect(
      await buildCreateDocumentUploadPayload({
        title: "Missing source",
        documentType: "other",
        consentScopes: ["upload_storage"],
        consentVersion: "v1",
        sampleText: "",
        selectedFile: null,
      }),
    ).toEqual({
      ok: false,
      message: DOCUMENT_UPLOAD_SOURCE_REQUIRED_MESSAGE,
    });

    expect(
      await buildCreateDocumentUploadPayload({
        title: "Both sources",
        documentType: "other",
        consentScopes: ["upload_storage"],
        consentVersion: "v1",
        sampleText: "Synthetic note",
        selectedFile: file,
      }),
    ).toEqual({
      ok: false,
      message: DOCUMENT_UPLOAD_MUTUAL_EXCLUSIVITY_MESSAGE,
    });
  });
});
