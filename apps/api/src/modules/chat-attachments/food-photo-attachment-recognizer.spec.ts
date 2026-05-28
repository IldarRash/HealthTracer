import { describe, expect, it, vi } from "vitest";
import { createDefaultAiBehaviorConfigService } from "../ai/test-ai-behavior-fixtures.js";
import { FoodPhotoAttachmentRecognizer } from "./food-photo-attachment-recognizer.js";

describe("FoodPhotoAttachmentRecognizer", () => {
  it("calls analyzeOwnedPhoto with scoped image refs only", async () => {
    const analyzeOwnedPhoto = vi.fn(async (_userId: string, _input: { imageRef: unknown }) => ({
      candidates: [
        {
          items: [{ name: "Salad", calories: 320 }],
          estimatedCalories: 320,
          estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
          confidence: "medium" as const,
          provenance: {
            source: "dev_stub",
            providerId: "dev_food_photo",
            analysisId: "b1000001-0000-4000-8000-000000000002",
          },
        },
      ],
      lowConfidenceNotice: null,
    }));

    const recognizer = new FoodPhotoAttachmentRecognizer(
      { analyzeOwnedPhoto } as never,
      createDefaultAiBehaviorConfigService(),
    );

    await recognizer.recognize({
      userId: "user-id",
      attachment: {
        id: "a1000001-0000-4000-8000-000000000001",
        linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
        storageKey: "user/meal.jpg",
        mimeType: "image/jpeg",
      } as never,
    });

    expect(analyzeOwnedPhoto).toHaveBeenCalledWith(
      "user-id",
      expect.objectContaining({
        imageRef: expect.objectContaining({
          id: "a1000001-0000-4000-8000-000000000001",
          mimeType: "image/jpeg",
        }),
      }),
    );

    const payload = analyzeOwnedPhoto.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
    expect(payload).not.toHaveProperty("profile");
    expect(payload).not.toHaveProperty("documentText");
  });

  it("builds a food photo recognition envelope with provenance", () => {
    const recognizer = new FoodPhotoAttachmentRecognizer(
      {} as never,
      createDefaultAiBehaviorConfigService(),
    );

    const envelope = recognizer.buildEnvelope({
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      analysis: {
        candidates: [
          {
            items: [{ name: "Salad", calories: 320 }],
            estimatedCalories: 320,
            estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
            confidence: "low",
            provenance: {
              source: "dev_stub",
              providerId: "dev_food_photo",
              analysisId: "b1000001-0000-4000-8000-000000000002",
            },
          },
        ],
        lowConfidenceNotice: "Review estimates before applying.",
      },
    });

    expect(envelope.category).toBe("food_photo");
    expect(envelope.provenance.confidence).toBe("low");
  });
});
