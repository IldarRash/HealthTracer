import { describe, expect, it } from "vitest";
import { MAX_LAB_REPORT_UPLOAD_BYTES } from "@health/types";
import {
  buildCreateLabReportPayload,
  LAB_REPORT_UPLOAD_ACCEPT,
  resolveSupportedLabReportMimeType,
  validateSelectedLabReportFile,
} from "./lab-report-upload.js";

function createTestFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

describe("lab report upload helpers", () => {
  it("accepts only PDF and plain text", () => {
    expect(LAB_REPORT_UPLOAD_ACCEPT).toBe(".pdf,.txt,application/pdf,text/plain");
  });

  it("resolves supported mime types from type and extension", () => {
    expect(
      resolveSupportedLabReportMimeType(createTestFile("a", "labs.pdf", "application/pdf")),
    ).toBe("application/pdf");
    expect(
      resolveSupportedLabReportMimeType(
        createTestFile("a", "labs.txt", "application/octet-stream"),
      ),
    ).toBe("text/plain");
    expect(
      resolveSupportedLabReportMimeType(createTestFile("a", "scan.jpg", "image/jpeg")),
    ).toBeNull();
  });

  it("rejects unsupported files and files over the 5 MB cap with i18n error keys", () => {
    expect(validateSelectedLabReportFile(createTestFile("a", "scan.jpg", "image/jpeg"))).toEqual(
      { ok: false, errorKey: "upload.fileErrorUnsupported" },
    );

    const oversized = createTestFile(
      "x".repeat(MAX_LAB_REPORT_UPLOAD_BYTES + 1),
      "large.txt",
      "text/plain",
    );
    expect(validateSelectedLabReportFile(oversized)).toEqual({
      ok: false,
      errorKey: "upload.fileErrorTooLarge",
    });

    expect(validateSelectedLabReportFile(createTestFile("a", "labs.txt", "text/plain"))).toEqual(
      { ok: true, mimeType: "text/plain" },
    );
  });

  it("builds a consented create payload with base64 file content", async () => {
    const result = await buildCreateLabReportPayload({
      title: "  Spring panel  ",
      selectedFile: createTestFile("%PDF-1.4 labs", "labs.pdf", "application/pdf"),
      coachChat: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload).toMatchObject({
      title: "Spring panel",
      mimeType: "application/pdf",
      consent: { storeAndParse: true, coachChat: true },
      consentVersion: "v2",
    });
    expect(result.payload.fileContentBase64).toBe(
      Buffer.from("%PDF-1.4 labs", "utf8").toString("base64"),
    );
  });

  it("requires a file and propagates validation error keys", async () => {
    expect(
      await buildCreateLabReportPayload({ title: "T", selectedFile: null, coachChat: false }),
    ).toEqual({ ok: false, errorKey: "upload.fileRequired" });

    expect(
      await buildCreateLabReportPayload({
        title: "T",
        selectedFile: createTestFile("a", "scan.jpg", "image/jpeg"),
        coachChat: false,
      }),
    ).toEqual({ ok: false, errorKey: "upload.fileErrorUnsupported" });
  });
});
