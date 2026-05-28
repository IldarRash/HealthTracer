import { describe, expect, it, vi } from "vitest";
import { createDefaultLocalChatAttachmentClassificationProvider } from "../ai/test-ai-behavior-fixtures.js";
import { ChatAttachmentClassifierService } from "./chat-attachment-classifier.service.js";

describe("ChatAttachmentClassifierService", () => {
  const localProvider = createDefaultLocalChatAttachmentClassificationProvider();
  const localService = new ChatAttachmentClassifierService(localProvider);

  it("classifies meal photos with inferred meal context", async () => {
    const result = await localService.classify({
      message: "второй прием пищи",
      attachment: {
        id: "a1000001-0000-4000-8000-000000000001",
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        category: "unclassified",
        consent: null,
        storageKey: "local://attachments/meal.jpg",
      },
      content: Buffer.from("fake-image"),
    });

    expect(result.category).toBe("food_photo");
    expect(result.mealContextLabel).toBe("Second meal");
  });

  it("classifies training attachments from activity messages", async () => {
    const result = await localService.classify({
      message: "заполни активность",
      attachment: {
        id: "c1000001-0000-4000-8000-000000000001",
        filename: "session.jpg",
        mimeType: "image/jpeg",
        category: "unclassified",
        consent: null,
        storageKey: "local://attachments/session.jpg",
      },
      content: Buffer.from("fake-image"),
    });

    expect(result.category).toBe("workout_attachment");
  });

  it("classifies medical-signaled images for consent-first handling", async () => {
    const result = await localService.classify({
      message: "here are my lab results",
      attachment: {
        id: "d1000001-0000-4000-8000-000000000001",
        filename: "scan.jpg",
        mimeType: "image/jpeg",
        category: "unclassified",
        consent: null,
        storageKey: "local://attachments/scan.jpg",
      },
      content: Buffer.from("fake-image"),
    });

    expect(result.category).toBe("medical_document");
    expect(result.suggestedAction).toBe("request_medical_consent");
  });

  it("preserves user-selected workout category without reclassification", async () => {
    const result = await localService.classify({
      message: "",
      attachment: {
        id: "c1000002-0000-4000-8000-000000000002",
        filename: "volleyball-practice.jpg",
        mimeType: "image/jpeg",
        category: "workout_attachment",
        consent: null,
        storageKey: "local://attachments/volleyball-practice.jpg",
      },
      content: Buffer.from("fake-image"),
      categorySource: "user_selected",
    });

    expect(result.category).toBe("workout_attachment");
    expect(result.confidence).toBe("high");
    expect(result.suggestedAction).toBe("run_category_recognition");
    expect(result.classificationMethod).toBe("user_selected");
  });

  it("does not default ambiguous jpeg uploads to food photo", async () => {
    const result = await localService.classify({
      message: "",
      attachment: {
        id: "u1000001-0000-4000-8000-000000000001",
        filename: "IMG_1234.jpg",
        mimeType: "image/jpeg",
        category: "unclassified",
        consent: null,
        storageKey: "local://attachments/IMG_1234.jpg",
      },
      content: Buffer.from("fake-image"),
    });

    expect(result.category).toBe("unclassified");
    expect(result.suggestedAction).toBe("manual_fallback");
  });

  it("invokes the classification provider with attachment bytes for unclassified uploads", async () => {
    const attachmentBytes = Buffer.from("vision-classifier-input");
    const classify = vi.fn(async () => ({
      category: "unclassified" as const,
      confidence: "low" as const,
      rationale: "Ambiguous image.",
      suggestedAction: "manual_fallback" as const,
      mealContextLabel: null,
    }));
    const service = new ChatAttachmentClassifierService({ classify } as never);

    await service.classify({
      message: "",
      attachment: {
        id: "u1000001-0000-4000-8000-000000000001",
        filename: "IMG_1234.jpg",
        mimeType: "image/jpeg",
        category: "unclassified",
        consent: null,
        storageKey: "local://attachments/IMG_1234.jpg",
      },
      content: attachmentBytes,
    });

    expect(classify).toHaveBeenCalledOnce();
    expect(classify).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "IMG_1234.jpg",
        mimeType: "image/jpeg",
        attachmentId: "u1000001-0000-4000-8000-000000000001",
        content: attachmentBytes,
        userSelectedCategory: null,
      }),
    );
  });

  it("bypasses the vision provider when categorySource is user_selected", async () => {
    const classify = vi.fn();
    const service = new ChatAttachmentClassifierService({ classify } as never);

    const result = await service.classify({
      message: "dinner photo",
      attachment: {
        id: "a1000001-0000-4000-8000-000000000001",
        filename: "meal.jpg",
        mimeType: "image/jpeg",
        category: "food_photo",
        consent: null,
        storageKey: "local://attachments/meal.jpg",
      },
      content: Buffer.from("fake-image"),
      categorySource: "user_selected",
    });

    expect(classify).not.toHaveBeenCalled();
    expect(result.category).toBe("food_photo");
    expect(result.suggestedAction).toBe("run_category_recognition");
    expect(result.classificationMethod).toBe("user_selected");
  });

  it("does not bypass the provider for mime-inferred medical categories", async () => {
    const classify = vi.fn(async () => ({
      category: "unclassified" as const,
      confidence: "low" as const,
      rationale: "Ambiguous document.",
      suggestedAction: "manual_fallback" as const,
      mealContextLabel: null,
    }));
    const service = new ChatAttachmentClassifierService({ classify } as never);

    await service.classify({
      message: "",
      attachment: {
        id: "d1000001-0000-4000-8000-000000000001",
        filename: "labs.pdf",
        mimeType: "application/pdf",
        category: "medical_document",
        consent: null,
        storageKey: null,
      },
      content: Buffer.from("pdf-bytes"),
      categorySource: "mime_inferred",
    });

    expect(classify).toHaveBeenCalledOnce();
  });

  it("does not bypass provider for upload-time ai_classified categories", () => {
    expect(
      localService.shouldBypassProviderForAttachment({
        category: "food_photo",
        categorySource: "ai_classified",
        consent: null,
      }),
    ).toBe(false);
  });

  it("bypasses provider for persisted user_selected categories", () => {
    expect(
      localService.shouldBypassProviderForAttachment({
        category: "workout_attachment",
        categorySource: "user_selected",
        consent: null,
      }),
    ).toBe(true);
  });
});
