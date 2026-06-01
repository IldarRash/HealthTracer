import { describe, expect, it } from "vitest";
import { getProvisionalAttachmentMimeTypeError, isChatAttachmentPendingMessageFirstSend } from "./chat-attachments.js";
import { createChatAttachmentSchema } from "./chat-attachments.js";

describe("chat attachment classification contracts", () => {
  it("accepts provisional unclassified uploads without a preset category", () => {
    const parsed = createChatAttachmentSchema.safeParse({
      filename: "meal.jpg",
      mimeType: "image/jpeg",
      fileContentBase64: "dGVzdA==",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.category).toBe("unclassified");
    }
  });

  it("allows provisional MIME types for unclassified uploads", () => {
    expect(getProvisionalAttachmentMimeTypeError("image/jpeg")).toBeNull();
    expect(getProvisionalAttachmentMimeTypeError("application/octet-stream")).toMatch(
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
