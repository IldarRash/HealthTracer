import { describe, expect, it } from "vitest";
import { createDefaultLocalChatAttachmentClassificationProvider } from "../ai/test-ai-behavior-fixtures.js";

describe("LocalChatAttachmentClassificationProvider", () => {
  const provider = createDefaultLocalChatAttachmentClassificationProvider();

  it("classifies meal photos with message context", async () => {
    const result = await provider.classify({
      message: "второй прием пищи",
      filename: "meal.jpg",
      mimeType: "image/jpeg",
      attachmentId: "a1000001-0000-4000-8000-000000000001",
      content: Buffer.from("fake-image"),
      userSelectedCategory: null,
      hasMedicalConsent: false,
    });

    expect(result.category).toBe("food_photo");
    expect(result.mealContextLabel).toBe("Second meal");
    expect(result.suggestedAction).toBe("run_category_recognition");
  });

  it("classifies volleyball training photos as workout attachments", async () => {
    const result = await provider.classify({
      message: "",
      filename: "volleyball-practice.jpg",
      mimeType: "image/jpeg",
      attachmentId: "c1000001-0000-4000-8000-000000000001",
      content: Buffer.from("fake-image"),
      userSelectedCategory: null,
      hasMedicalConsent: false,
    });

    expect(result.category).toBe("workout_attachment");
    expect(result.suggestedAction).toBe("run_category_recognition");
  });

  it("returns manual fallback for ambiguous jpeg images instead of food", async () => {
    const result = await provider.classify({
      message: "",
      filename: "IMG_1234.jpg",
      mimeType: "image/jpeg",
      attachmentId: "u1000001-0000-4000-8000-000000000001",
      content: Buffer.from("fake-image"),
      userSelectedCategory: null,
      hasMedicalConsent: false,
    });

    expect(result.category).toBe("unclassified");
    expect(result.confidence).toBe("low");
    expect(result.suggestedAction).toBe("manual_fallback");
  });

  it("returns manual fallback for PDFs without medical or workout signals", async () => {
    const result = await provider.classify({
      message: "",
      filename: "document.pdf",
      mimeType: "application/pdf",
      attachmentId: "d1000002-0000-4000-8000-000000000002",
      content: Buffer.from("pdf-bytes"),
      userSelectedCategory: null,
      hasMedicalConsent: false,
    });

    expect(result.category).toBe("unclassified");
    expect(result.suggestedAction).toBe("manual_fallback");
  });

  it("routes medical-signaled images to consent-first handling", async () => {
    const result = await provider.classify({
      message: "here are my lab results",
      filename: "scan.jpg",
      mimeType: "image/jpeg",
      attachmentId: "d1000001-0000-4000-8000-000000000001",
      content: Buffer.from("fake-image"),
      userSelectedCategory: null,
      hasMedicalConsent: false,
    });

    expect(result.category).toBe("medical_document");
    expect(result.suggestedAction).toBe("request_medical_consent");
  });
});
