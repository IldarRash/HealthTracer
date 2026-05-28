import { describe, expect, it } from "vitest";
import {
  isTrustedUserSelectedChatAttachmentUpload,
  resolveProvisionalUploadCategorySource,
  resolveSendTimeAttachmentCategory,
  resolveSendTimeCategorySource,
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

describe("resolveSendTimeAttachmentCategory", () => {
  it("reclassifies upload-time ai_classified food when message signals medical", () => {
    expect(
      resolveSendTimeAttachmentCategory({
        attachmentCategory: "food_photo",
        attachmentCategorySource: "ai_classified",
        classificationCategory: "medical_document",
      }),
    ).toBe("medical_document");
  });

  it("preserves user_selected workout categories at send", () => {
    expect(
      resolveSendTimeAttachmentCategory({
        attachmentCategory: "workout_attachment",
        attachmentCategorySource: "user_selected",
        classificationCategory: "food_photo",
      }),
    ).toBe("workout_attachment");
  });
});

describe("resolveSendTimeCategorySource", () => {
  it("keeps user_selected provenance after send", () => {
    expect(
      resolveSendTimeCategorySource({
        previousCategorySource: "user_selected",
        resolvedCategory: "workout_attachment",
      }),
    ).toBe("user_selected");
  });

  it("marks send-time reclassification as ai_classified", () => {
    expect(
      resolveSendTimeCategorySource({
        previousCategorySource: "ai_classified",
        resolvedCategory: "medical_document",
      }),
    ).toBe("ai_classified");
  });
});
