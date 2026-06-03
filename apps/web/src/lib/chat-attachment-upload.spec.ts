import { describe, expect, it } from "vitest";
import {
  buildChatAttachmentUploadPayload,
} from "./chat-attachment-upload.js";
import {
  createChatComposerAttachmentDraft,
} from "./chat-attachment-ui-state.js";

function createMockFile(name: string, type: string, content = "hello"): File {
  return new File([content], name, { type });
}

describe("chat attachment upload payload", () => {
  it("builds a generic image upload payload with filename, mimeType, and base64 content", async () => {
    const draft = createChatComposerAttachmentDraft(createMockFile("meal.jpg", "image/jpeg"));
    const result = await buildChatAttachmentUploadPayload({ draft });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload.filename).toBe("meal.jpg");
    expect(result.payload.mimeType).toBe("image/jpeg");
    expect(typeof result.payload.fileContentBase64).toBe("string");
    expect(result.payload.fileContentBase64.length).toBeGreaterThan(0);
  });

  it("includes threadId when provided", async () => {
    const draft = createChatComposerAttachmentDraft(createMockFile("photo.png", "image/png"));
    const result = await buildChatAttachmentUploadPayload({
      draft,
      threadId: "24b19287-75b8-4a3e-9c10-691908479405",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload.threadId).toBe("24b19287-75b8-4a3e-9c10-691908479405");
  });

  it("omits threadId when not provided", async () => {
    const draft = createChatComposerAttachmentDraft(createMockFile("img.webp", "image/webp"));
    const result = await buildChatAttachmentUploadPayload({ draft });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect("threadId" in result.payload).toBe(false);
  });

  it("returns error for unsupported MIME types (PDF, text)", async () => {
    const pdfDraft = createChatComposerAttachmentDraft(createMockFile("lab.pdf", "application/pdf"));
    const pdfResult = await buildChatAttachmentUploadPayload({ draft: pdfDraft });
    expect(pdfResult.ok).toBe(false);

    const txtDraft = createChatComposerAttachmentDraft(createMockFile("plan.txt", "text/plain"));
    const txtResult = await buildChatAttachmentUploadPayload({ draft: txtDraft });
    expect(txtResult.ok).toBe(false);
  });

  it("payload has no category, categorySource, consentScopes, or documentTitle fields", async () => {
    const draft = createChatComposerAttachmentDraft(createMockFile("meal.jpg", "image/jpeg"));
    const result = await buildChatAttachmentUploadPayload({ draft });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect("category" in result.payload).toBe(false);
    expect("categorySource" in result.payload).toBe(false);
    expect("consentScopes" in result.payload).toBe(false);
    expect("documentTitle" in result.payload).toBe(false);
    expect("consentVersion" in result.payload).toBe(false);
  });
});
