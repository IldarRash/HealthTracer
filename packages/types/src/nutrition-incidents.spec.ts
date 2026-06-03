import { describe, expect, it } from "vitest";
import {
  foodPhotoAnalysisRequestSchema,
  foodPhotoAnalysisResultSchema,
  getNutritionIncidentDomainErrors,
  getNutritionIncidentImageRefOwnershipErrors,
  logNutritionIncidentProposalPayloadSchema,
  validateFoodPhotoAnalysisRequestShape,
} from "./nutrition-incidents.js";

const basePayload = {
  incidentDateTime: "2026-05-26T18:00:00.000Z",
  items: [
    {
      name: "Chicken bowl",
      quantity: "1 serving",
      calories: 620,
      proteinGrams: 42,
      carbsGrams: 55,
      fatGrams: 18,
    },
  ],
  estimatedCalories: 620,
  estimatedMacros: {
    proteinGrams: 42,
    carbsGrams: 55,
    fatGrams: 18,
  },
  confidence: "medium" as const,
  provenance: {
    source: "text_estimate" as const,
    providerId: "chat_trigger",
  },
  imageRefs: [],
};

describe("nutrition incident contracts", () => {
  it("parses bounded nutrition incident proposal payloads", () => {
    expect(() => logNutritionIncidentProposalPayloadSchema.parse(basePayload)).not.toThrow();
  });

  it("rejects out-of-range confidence and oversized notes", () => {
    expect(
      logNutritionIncidentProposalPayloadSchema.safeParse({
        ...basePayload,
        confidence: "very_high",
      }).success,
    ).toBe(false);

    expect(
      logNutritionIncidentProposalPayloadSchema.safeParse({
        ...basePayload,
        userEdits: {
          editedAt: "2026-05-26T18:05:00.000Z",
          items: basePayload.items,
          note: "x".repeat(281),
        },
      }).success,
    ).toBe(false);
  });

  it("requires user edits before accepting low-confidence incidents", () => {
    const errors = getNutritionIncidentDomainErrors(
      logNutritionIncidentProposalPayloadSchema.parse({
        ...basePayload,
        confidence: "low",
      }),
    );

    expect(errors).toContain(
      "nutrition_incident: low-confidence estimates require userEdits before acceptance.",
    );
  });

  it("rejects photo-backed incidents with unowned image references", () => {
    const payload = logNutritionIncidentProposalPayloadSchema.parse({
      ...basePayload,
      confidence: "medium",
      provenance: {
        source: "dev_stub",
        providerId: "dev_food_photo",
        analysisId: "b1000001-0000-4000-8000-000000000002",
      },
      imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
    });

    expect(
      getNutritionIncidentImageRefOwnershipErrors(payload, [
        {
          analysisId: "b1000001-0000-4000-8000-000000000002",
          imageRefId: "a1000001-0000-4000-8000-000000000099",
        },
      ]),
    ).toContain(
      "proposedChanges.provenance.analysisId: Food photo analysis does not match the referenced image.",
    );

    expect(getNutritionIncidentImageRefOwnershipErrors(payload, [])).toContain(
      "proposedChanges.imageRefs[0].id: Image reference was not analyzed for this user.",
    );
  });

  it("accepts text-only incidents without image ownership records", () => {
    expect(getNutritionIncidentImageRefOwnershipErrors(basePayload, [])).toEqual([]);
  });

  describe("vision_llm_estimate provenance — chat attachment ownership path", () => {
    const ownedAttachmentId = "c1000001-0000-4000-8000-000000000001";

    const visionPayload = logNutritionIncidentProposalPayloadSchema.parse({
      ...basePayload,
      provenance: { source: "vision_llm_estimate" },
      imageRefs: [{ id: ownedAttachmentId }],
    });

    it("accepts imageRefs that are in the ownedChatAttachmentIds list", () => {
      const errors = getNutritionIncidentImageRefOwnershipErrors(
        visionPayload,
        [],
        [ownedAttachmentId],
      );

      expect(errors).toEqual([]);
    });

    it("rejects imageRefs that are NOT in the ownedChatAttachmentIds list (IDOR guard)", () => {
      const errors = getNutritionIncidentImageRefOwnershipErrors(visionPayload, [], []);

      expect(errors).toContain(
        "proposedChanges.imageRefs[0].id: Image reference was not found as an owned chat attachment for this user.",
      );
    });

    it("rejects vision_llm_estimate with empty imageRefs", () => {
      const noImagePayload = logNutritionIncidentProposalPayloadSchema.parse({
        ...basePayload,
        provenance: { source: "vision_llm_estimate" },
        imageRefs: [],
      });

      const errors = getNutritionIncidentImageRefOwnershipErrors(noImagePayload, [], []);

      expect(errors).toContain(
        "proposedChanges.imageRefs: Photo-backed nutrition incidents require at least one analyzed image reference.",
      );
    });

    it("does NOT consult ownedAnalyses for vision_llm_estimate (no analysis records exist)", () => {
      // Even if ownedAnalyses contains a matching imageRefId, it must be ignored
      // for vision_llm_estimate — the check is against chat attachments only.
      const spoofedAnalyses = [{ analysisId: "fake-analysis", imageRefId: ownedAttachmentId }];

      // Without ownedChatAttachmentIds the ref is rejected (ownedAnalyses not consulted)
      const errorsWithoutAttachmentIds = getNutritionIncidentImageRefOwnershipErrors(
        visionPayload,
        spoofedAnalyses,
        [],
      );

      expect(errorsWithoutAttachmentIds).toContain(
        "proposedChanges.imageRefs[0].id: Image reference was not found as an owned chat attachment for this user.",
      );

      // With ownedChatAttachmentIds the ref is accepted
      const errorsWithAttachmentIds = getNutritionIncidentImageRefOwnershipErrors(
        visionPayload,
        spoofedAnalyses,
        [ownedAttachmentId],
      );

      expect(errorsWithAttachmentIds).toEqual([]);
    });
  });

  it("accepts recipe recommendation provenance without photo image refs", () => {
    const payload = logNutritionIncidentProposalPayloadSchema.parse({
      ...basePayload,
      confidence: "medium",
      provenance: {
        source: "recipe_recommendation",
        providerId: "b2000001-0000-4000-8000-000000000001",
      },
      imageRefs: [],
    });

    expect(getNutritionIncidentImageRefOwnershipErrors(payload, [])).toEqual([]);
    expect(getNutritionIncidentDomainErrors(payload)).toEqual([]);
  });

  it("requires user edits for low-confidence recipe recommendation incidents", () => {
    const payload = logNutritionIncidentProposalPayloadSchema.parse({
      ...basePayload,
      confidence: "low",
      provenance: {
        source: "recipe_recommendation",
        providerId: "b2000001-0000-4000-8000-000000000001",
      },
      imageRefs: [],
    });

    expect(getNutritionIncidentDomainErrors(payload)).toContain(
      "nutrition_incident: low-confidence estimates require userEdits before acceptance.",
    );
  });

  it("rejects strict-schema violations on incident payloads", () => {
    expect(
      logNutritionIncidentProposalPayloadSchema.safeParse({
        ...basePayload,
        healthDocuments: ["do-not-send"],
      }).success,
    ).toBe(false);

    expect(
      logNutritionIncidentProposalPayloadSchema.safeParse({
        ...basePayload,
        items: [{ name: "Snack", calories: 6000 }],
      }).success,
    ).toBe(false);
  });

  it("validates food photo analysis request/response envelopes", () => {
    const request = foodPhotoAnalysisRequestSchema.parse({
      imageRef: {
        id: "a1000001-0000-4000-8000-000000000001",
        mimeType: "image/jpeg",
      },
    });

    expect(validateFoodPhotoAnalysisRequestShape(request)).toEqual([]);
    expect(
      validateFoodPhotoAnalysisRequestShape({
        imageRef: { id: "not-a-uuid" },
        profile: { birthDate: "1990-01-01" },
      }),
    ).not.toEqual([]);

    expect(
      validateFoodPhotoAnalysisRequestShape({
        imageRef: { id: "a1000001-0000-4000-8000-000000000001" },
        documents: [{ id: "doc-1" }],
        wellbeingNotes: "private note",
      }),
    ).not.toEqual([]);

    expect(() =>
      foodPhotoAnalysisResultSchema.parse({
        candidates: [
          {
            items: basePayload.items,
            estimatedCalories: 620,
            estimatedMacros: basePayload.estimatedMacros,
            confidence: "high",
            provenance: {
              source: "dev_stub",
              providerId: "dev_food_photo",
              analysisId: "b1000001-0000-4000-8000-000000000002",
            },
          },
        ],
        lowConfidenceNotice: null,
      }),
    ).not.toThrow();
  });
});
