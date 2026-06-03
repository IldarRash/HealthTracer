import { describe, expect, it } from "vitest";
import { getProvisionalAttachmentMimeTypeError, isChatAttachmentPendingMessageFirstSend } from "./chat-attachments.js";
import { createChatAttachmentSchema } from "./chat-attachments.js";

describe("chat attachment classification contracts", () => {
  it("accepts provisional unclassified image uploads", () => {
    const parsed = createChatAttachmentSchema.safeParse({
      filename: "meal.jpg",
      mimeType: "image/jpeg",
      fileContentBase64: "dGVzdA==",
    });

    expect(parsed.success).toBe(true);
  });

  it("allows provisional image MIME types for unclassified uploads", () => {
    expect(getProvisionalAttachmentMimeTypeError("image/jpeg")).toBeNull();
    expect(getProvisionalAttachmentMimeTypeError("image/png")).toBeNull();
    expect(getProvisionalAttachmentMimeTypeError("image/webp")).toBeNull();
    // PDF and text are no longer accepted (images only)
    expect(getProvisionalAttachmentMimeTypeError("application/octet-stream")).toMatch(
      /Unsupported MIME type/,
    );
    expect(getProvisionalAttachmentMimeTypeError("application/pdf")).toMatch(
      /Unsupported MIME type/,
    );
  });

  it("treats queued unclassified refs as pending message-first send", () => {
    expect(
      isChatAttachmentPendingMessageFirstSend({
        category: "unclassified",
        status: "queued",
        recognition: null,
      }),
    ).toBe(true);
  });
});
