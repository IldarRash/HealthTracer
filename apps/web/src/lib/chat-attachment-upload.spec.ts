import { describe, expect, it } from "vitest";
import {
  buildChatAttachmentUploadPayload,
  resolveChatAttachmentUploadCategory,
} from "./chat-attachment-upload.js";
import {
  applyChatAttachmentCategoryChange,
  createChatComposerAttachmentDraft,
} from "./chat-attachment-ui-state.js";

function createMockFile(name: string, type: string, content = "hello"): File {
  return new File([content], name, { type });
}

describe("chat attachment upload payload", () => {
  it("sends untouched attachments as unclassified with default_unclassified source", async () => {
    const draft = createChatComposerAttachmentDraft(createMockFile("meal.jpg", "image/jpeg"));
    const result = await buildChatAttachmentUploadPayload({ draft });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload.category).toBe("unclassified");
    expect(result.payload.categorySource).toBe("default_unclassified");
    expect(result.payload.consentScopes).toBeUndefined();
  });

  it("sends untouched PDF attachments as unclassified with mime_inferred source", async () => {
    const draft = createChatComposerAttachmentDraft(createMockFile("lab.pdf", "application/pdf"));
    const result = await buildChatAttachmentUploadPayload({ draft });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload.category).toBe("unclassified");
    expect(result.payload.categorySource).toBe("mime_inferred");
    expect(result.payload.consentScopes).toBeUndefined();
  });

  it("sends user-selected categories with user_selected source", async () => {
    const draft = applyChatAttachmentCategoryChange(
      createChatComposerAttachmentDraft(createMockFile("session.jpg", "image/jpeg")),
      "workout_attachment",
    );
    const result = await buildChatAttachmentUploadPayload({ draft });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload.category).toBe("workout_attachment");
    expect(result.payload.categorySource).toBe("user_selected");
  });

  it("requires consent metadata for user-selected medical uploads", async () => {
    const draft = applyChatAttachmentCategoryChange(
      createChatComposerAttachmentDraft(createMockFile("lab.pdf", "application/pdf")),
      "medical_document",
    );

    const missingConsent = await buildChatAttachmentUploadPayload({ draft });
    expect(missingConsent.ok).toBe(false);

    draft.documentTitle = "Annual labs";
    draft.consentScopes = ["upload_storage", "parse_ocr"];

    const result = await buildChatAttachmentUploadPayload({ draft });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.payload.category).toBe("medical_document");
    expect(result.payload.categorySource).toBe("user_selected");
    expect(result.payload.consentScopes).toEqual(["upload_storage", "parse_ocr"]);
    expect(result.payload.documentTitle).toBe("Annual labs");
  });

  it("maps non-user-selected categories back to unclassified upload disposition", () => {
    expect(
      resolveChatAttachmentUploadCategory({
        category: "medical_document",
        categorySource: "mime_inferred",
      }),
    ).toEqual({
      category: "unclassified",
      categorySource: "mime_inferred",
    });
  });
});
