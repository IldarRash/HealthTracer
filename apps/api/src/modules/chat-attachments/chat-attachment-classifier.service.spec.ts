import { describe, expect, it } from "vitest";
import { ChatAttachmentClassifierService } from "./chat-attachment-classifier.service.js";

describe("ChatAttachmentClassifierService", () => {
  const service = new ChatAttachmentClassifierService();

  it("classifies meal photos with inferred meal context", () => {
    const result = service.classify({
      message: "второй прием пищи",
      attachment: {
        filename: "meal.jpg",
        mimeType: "image/jpeg",
      },
    });

    expect(result.category).toBe("food_photo");
    expect(result.mealContextLabel).toBe("Second meal");
  });

  it("classifies training attachments from activity messages", () => {
    const result = service.classify({
      message: "заполни активность",
      attachment: {
        filename: "session.jpg",
        mimeType: "image/jpeg",
      },
    });

    expect(result.category).toBe("workout_attachment");
  });

  it("classifies medical-signaled images for consent-first handling", () => {
    const result = service.classify({
      message: "here are my lab results",
      attachment: {
        filename: "scan.jpg",
        mimeType: "image/jpeg",
      },
    });

    expect(result.category).toBe("medical_document");
    expect(result.suggestedAction).toBe("manual_fallback");
  });

  it("classifies Russian medical image messages safely", () => {
    const result = service.classify({
      message: "вот мои анализы",
      attachment: {
        filename: "photo.png",
        mimeType: "image/png",
      },
    });

    expect(result.category).toBe("medical_document");
    expect(result.suggestedAction).toBe("manual_fallback");
  });
});
