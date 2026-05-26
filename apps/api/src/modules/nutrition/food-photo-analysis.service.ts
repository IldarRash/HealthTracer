import type {
  FoodPhotoAnalysisRequest,
  FoodPhotoAnalysisResult,
  LogNutritionIncidentProposalPayload,
} from "@health/types";
import {
  foodPhotoAnalysisResultSchema,
  logNutritionIncidentProposalPayloadSchema,
} from "@health/types";
import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { NutritionRepository } from "./nutrition.repository.js";

export interface FoodPhotoAnalysisProvider {
  analyze(request: FoodPhotoAnalysisRequest): Promise<FoodPhotoAnalysisResult>;
}

@Injectable()
export class DevFoodPhotoAnalysisProvider implements FoodPhotoAnalysisProvider {
  async analyze(request: FoodPhotoAnalysisRequest): Promise<FoodPhotoAnalysisResult> {
    const analysisId = randomUUID();
    const suffix = request.imageRef.id.slice(-1);
    const confidence = suffix <= "3" ? "low" : suffix <= "7" ? "medium" : "high";

    const result = foodPhotoAnalysisResultSchema.parse({
      candidates: [
        {
          items: [
            {
              name: "Estimated plate",
              quantity: "1 serving",
              calories: confidence === "low" ? 450 : 620,
              proteinGrams: confidence === "low" ? 18 : 28,
              carbsGrams: confidence === "low" ? 55 : 68,
              fatGrams: confidence === "low" ? 16 : 24,
            },
          ],
          estimatedCalories: confidence === "low" ? 450 : 620,
          estimatedMacros: {
            proteinGrams: confidence === "low" ? 18 : 28,
            carbsGrams: confidence === "low" ? 55 : 68,
            fatGrams: confidence === "low" ? 16 : 24,
          },
          confidence,
          provenance: {
            source: "dev_stub",
            providerId: "dev_food_photo",
            analysisId,
          },
        },
      ],
      lowConfidenceNotice:
        confidence === "low"
          ? "This estimate is low confidence. Review items and quantities before confirming."
          : null,
    });

    return result;
  }
}

@Injectable()
export class FoodPhotoAnalysisService {
  constructor(
    private readonly provider: DevFoodPhotoAnalysisProvider,
    private readonly nutritionRepository: NutritionRepository,
  ) {}

  async analyzeOwnedPhoto(
    userId: string,
    request: FoodPhotoAnalysisRequest,
  ): Promise<FoodPhotoAnalysisResult> {
    if (!request.imageRef.id) {
      throw new Error("imageRef.id is required.");
    }

    if ("profile" in (request as Record<string, unknown>)) {
      throw new Error("Food photo analysis requests must not include profile context.");
    }

    const result = await this.provider.analyze({
      imageRef: request.imageRef,
      instruction: request.instruction,
    });
    const candidate = result.candidates[0];

    if (!candidate) {
      throw new Error("Food photo analysis returned no candidates.");
    }

    await this.nutritionRepository.persistFoodPhotoAnalysis({
      analysisId: candidate.provenance.analysisId,
      userId,
      imageRef: request.imageRef,
      provenanceSource: candidate.provenance.source,
      providerId: candidate.provenance.providerId,
    });

    return result;
  }

  buildProposalPayloadFromAnalysis(input: {
    incidentDateTime: string;
    analysis: FoodPhotoAnalysisResult;
    imageRefs: LogNutritionIncidentProposalPayload["imageRefs"];
    selectedCandidateIndex?: number;
  }): LogNutritionIncidentProposalPayload {
    const candidate =
      input.analysis.candidates[input.selectedCandidateIndex ?? 0] ??
      input.analysis.candidates[0];

    if (!candidate) {
      throw new Error("Food photo analysis returned no candidates.");
    }

    return logNutritionIncidentProposalPayloadSchema.parse({
      incidentDateTime: input.incidentDateTime,
      items: candidate.items,
      estimatedCalories: candidate.estimatedCalories,
      estimatedMacros: candidate.estimatedMacros,
      confidence: candidate.confidence,
      provenance: candidate.provenance,
      imageRefs: input.imageRefs,
    });
  }

  async assertOwnedImageRef(userId: string, imageRefId: string): Promise<void> {
    const owned = await this.nutritionRepository.findFoodPhotoAnalysisByImageRefForUser(
      userId,
      imageRefId,
    );

    if (!owned) {
      throw new BadRequestException(
        "Image reference was not analyzed for this user. Run food photo analysis before confirming.",
      );
    }
  }
}
