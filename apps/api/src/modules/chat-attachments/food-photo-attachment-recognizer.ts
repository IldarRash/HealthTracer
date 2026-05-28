import type {
  ChatAttachmentRecord,
  FoodPhotoAnalysisRequest,
  FoodPhotoAnalysisResult,
} from "@health/types";
import {
  assertRecognitionProviderIsolation,
  foodPhotoAnalysisResultSchema,
  recognitionProvenanceSchema,
} from "@health/types";
import { buildFoodPhotoRecognitionInstruction } from "@health/types";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import { FoodPhotoAnalysisService } from "../nutrition/food-photo-analysis.service.js";

@Injectable()
export class FoodPhotoAttachmentRecognizer {
  constructor(
    private readonly foodPhotoAnalysisService: FoodPhotoAnalysisService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
  ) {}

  async recognize(input: {
    userId: string;
    attachment: ChatAttachmentRecord;
    mealContextLabel?: string | null;
    boundedMessage?: string;
  }): Promise<FoodPhotoAnalysisResult> {
    const prompts = this.aiBehaviorConfigService.getAttachmentBehavior().recognition.prompts
      .foodPhoto;
    const instruction = buildFoodPhotoRecognitionInstruction({
      prompts,
      mealContextLabel: input.mealContextLabel,
      boundedMessage: input.boundedMessage,
    });

    assertRecognitionProviderIsolation({
      category: "food_photo",
      payload: {
        imageRef: {
          id: input.attachment.linkedImageRefId ?? input.attachment.id,
          storageKey: input.attachment.storageKey ?? undefined,
          mimeType: input.attachment.mimeType,
        },
        instruction,
      },
    });

    const request: FoodPhotoAnalysisRequest = {
      imageRef: {
        id: input.attachment.linkedImageRefId ?? input.attachment.id,
        ...(input.attachment.storageKey ? { storageKey: input.attachment.storageKey } : {}),
        mimeType: input.attachment.mimeType,
      },
      instruction,
    };

    return this.foodPhotoAnalysisService.analyzeOwnedPhoto(input.userId, request);
  }

  buildEnvelope(input: {
    attachmentRefId: string;
    analysis: FoodPhotoAnalysisResult;
  }) {
    const candidate = input.analysis.candidates[0];

    if (!candidate) {
      throw new Error("Food photo analysis returned no candidates.");
    }

    return {
      category: "food_photo" as const,
      attachmentRefId: input.attachmentRefId,
      analysis: foodPhotoAnalysisResultSchema.parse(input.analysis),
      provenance: recognitionProvenanceSchema.parse({
        source: candidate.provenance.source,
        providerId: candidate.provenance.providerId,
        recognitionId: candidate.provenance.analysisId,
        confidence: candidate.confidence,
      }),
    };
  }
}

export function buildEphemeralFoodPhotoExpiry(): Date {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  return expiresAt;
}

export function newRecognitionId(): string {
  return randomUUID();
}
