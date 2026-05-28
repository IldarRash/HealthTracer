import type { DocumentConsentScope } from "@health/types";
import { describe, expect, it } from "vitest";
import {
  buildGrantMedicalAttachmentConsentInput,
  createPendingMedicalAttachmentConsentFromDraft,
  getPendingMedicalAttachmentConsentErrors,
  MEDICAL_ATTACHMENT_RESELECT_FILE_COPY,
} from "./chat-attachment-medical-consent";
import { createChatComposerAttachmentDraft } from "./chat-attachment-ui-state";

function createMockFile(name: string, type: string, content = "hello"): File {
  return new File([content], name, { type });
}

describe("chat-attachment-medical-consent", () => {
  it("builds grant consent payload with required medical fields and base64 content", async () => {
    const file = createMockFile("labs.pdf", "application/pdf");
    const draft = {
      ...createChatComposerAttachmentDraft(file),
      category: "medical_document" as const,
      attachmentId: "d1000001-0000-4000-8000-000000000001",
      documentType: "lab_report" as const,
      documentTitle: "Annual labs",
      consentScopes: ["upload_storage", "parse_ocr"] as DocumentConsentScope[],
    };

    const pending = createPendingMedicalAttachmentConsentFromDraft(draft);
    const result = await buildGrantMedicalAttachmentConsentInput(pending);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload.consentScopes).toEqual(["upload_storage", "parse_ocr"]);
    expect(result.payload.documentType).toBe("lab_report");
    expect(result.payload.documentTitle).toBe("Annual labs");
    expect(result.payload.fileContentBase64).toBeTruthy();
    expect(result.payload.consentVersion).toBe("v1");
  });

  it("requires file re-selection when local content is unavailable", async () => {
    const pending = {
      attachmentRefId: "d1000001-0000-4000-8000-000000000001",
      file: null,
      filename: "",
      documentType: "other" as const,
      documentTitle: "Annual labs",
      consentScopes: ["upload_storage", "parse_ocr"] as DocumentConsentScope[],
      isGranting: false,
      error: null,
    };

    expect(getPendingMedicalAttachmentConsentErrors(pending)).toContain(
      MEDICAL_ATTACHMENT_RESELECT_FILE_COPY,
    );

    const result = await buildGrantMedicalAttachmentConsentInput(pending);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.message).toContain("Choose the wellness document file again");
  });

  it("allows consent payload without file when explicitly optional", async () => {
    const file = createMockFile("labs.pdf", "application/pdf");
    const draft = {
      ...createChatComposerAttachmentDraft(file),
      category: "medical_document" as const,
      attachmentId: "d1000001-0000-4000-8000-000000000001",
      documentType: "lab_report" as const,
      documentTitle: "Annual labs",
      consentScopes: ["upload_storage", "parse_ocr"] as DocumentConsentScope[],
    };

    const pending = createPendingMedicalAttachmentConsentFromDraft(draft);
    const result = await buildGrantMedicalAttachmentConsentInput(
      { ...pending, file: null },
      { requireFile: false },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload.fileContentBase64).toBeUndefined();
    expect(result.payload.documentTitle).toBe("Annual labs");
  });
});
