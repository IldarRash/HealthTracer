import { describe, expect, it, vi } from "vitest";
import {
  DevFoodPhotoAnalysisProvider,
  FoodPhotoAnalysisService,
} from "./food-photo-analysis.service.js";

describe("FoodPhotoAnalysisService", () => {
  function createService(overrides: {
    persistFoodPhotoAnalysis?: ReturnType<typeof vi.fn>;
  } = {}) {
    const nutritionRepository = {
      persistFoodPhotoAnalysis:
        overrides.persistFoodPhotoAnalysis ??
        vi.fn(async (input: unknown) => input),
    };

    return {
      service: new FoodPhotoAnalysisService(
        new DevFoodPhotoAnalysisProvider(),
        nutritionRepository as never,
      ),
      nutritionRepository,
    };
  }

  it("returns deterministic dev analysis from scoped image refs only", async () => {
    const { service, nutritionRepository } = createService();

    const result = await service.analyzeOwnedPhoto("user-id", {
      imageRef: {
        id: "a1000001-0000-4000-8000-000000000001",
        mimeType: "image/jpeg",
      },
      instruction: "Estimate meal items and macros from this food photo.",
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.provenance.source).toBe("dev_stub");
    expect(result.candidates[0]?.items[0]?.name).toBe("Estimated plate");
    expect(nutritionRepository.persistFoodPhotoAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-id",
        imageRef: expect.objectContaining({
          id: "a1000001-0000-4000-8000-000000000001",
        }),
        provenanceSource: "dev_stub",
      }),
    );
  });

  it("builds proposal payloads from analysis candidates", () => {
    const { service } = createService();

    const payload = service.buildProposalPayloadFromAnalysis({
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      analysis: {
        candidates: [
          {
            items: [{ name: "Salad", calories: 320 }],
            estimatedCalories: 320,
            estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
            confidence: "medium",
            provenance: {
              source: "dev_stub",
              providerId: "dev_food_photo",
              analysisId: "b1000001-0000-4000-8000-000000000002",
            },
          },
        ],
        lowConfidenceNotice: null,
      },
      imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
    });

    expect(payload.items[0]?.name).toBe("Salad");
    expect(payload.imageRefs).toHaveLength(1);
  });

  it("rejects food photo analysis requests with unrelated sensitive context", async () => {
    const { service } = createService();

    await expect(
      service.analyzeOwnedPhoto("user-id", {
        imageRef: {
          id: "a1000001-0000-4000-8000-000000000001",
        },
        instruction: "Estimate meal items and macros from this food photo.",
        profile: { birthDate: "1990-01-01" },
      } as never),
    ).rejects.toThrow("Food photo analysis requests must not include profile context.");
  });

  it("persists user-scoped analysis records for audit and acceptance validation", async () => {
    const persistFoodPhotoAnalysis = vi.fn(async (input: unknown) => input);
    const { service } = createService({ persistFoodPhotoAnalysis });

    await service.analyzeOwnedPhoto("user-id", {
      imageRef: {
        id: "a1000001-0000-4000-8000-000000000008",
        mimeType: "image/jpeg",
      },
      instruction: "Estimate meal items and macros from this food photo.",
    });

    expect(persistFoodPhotoAnalysis).toHaveBeenCalledOnce();
    expect(persistFoodPhotoAnalysis.mock.calls[0]?.[0]).toMatchObject({
      userId: "user-id",
      analysisId: expect.any(String),
    });
  });
});
