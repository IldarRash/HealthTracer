import { describe, expect, it } from "vitest";
import {
  isTrustedUserSelectedChatAttachmentUpload,
  resolveProvisionalUploadCategorySource,
} from "./chat-attachment-category-source.js";

describe("isTrustedUserSelectedChatAttachmentUpload", () => {
  it("treats explicit user_selected categories as trusted", () => {
    expect(
      isTrustedUserSelectedChatAttachmentUpload({
        category: "workout_attachment",
        categorySource: "user_selected",
      }),
    ).toBe(true);
  });

  it("rejects mime-inferred medical preselection without consent", () => {
    expect(
      isTrustedUserSelectedChatAttachmentUpload({
        category: "medical_document",
        categorySource: "mime_inferred",
      }),
    ).toBe(false);
  });

  it("accepts medical uploads with upload_storage consent", () => {
    expect(
      isTrustedUserSelectedChatAttachmentUpload({
        category: "medical_document",
        consentScopes: ["upload_storage", "parse_ocr"],
      }),
    ).toBe(true);
  });
});

describe("resolveProvisionalUploadCategorySource", () => {
  it("marks upload-time AI assignments as ai_classified", () => {
    expect(
      resolveProvisionalUploadCategorySource({
        dispositionCategory: "food_photo",
        inputCategorySource: "default_unclassified",
      }),
    ).toBe("ai_classified");
  });

  it("preserves default_unclassified for needs_review uploads", () => {
    expect(
      resolveProvisionalUploadCategorySource({
        dispositionCategory: "unclassified",
        inputCategorySource: "mime_inferred",
      }),
    ).toBe("mime_inferred");
  });
});

