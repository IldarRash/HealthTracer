import { describe, expect, it, vi } from "vitest";



import { createDefaultAiBehaviorConfigService } from "../ai/test-ai-behavior-fixtures.js";

import { ChatAttachmentRecognitionService } from "./chat-attachment-recognition.service.js";



function createRecognitionService(deps: {

  foodPhotoRecognizer?: Record<string, unknown>;

  workoutAttachmentRecognizer?: Record<string, unknown>;

} = {}) {

  return new ChatAttachmentRecognitionService(

    (deps.foodPhotoRecognizer ?? { recognize: vi.fn(), buildEnvelope: vi.fn() }) as never,

    (deps.workoutAttachmentRecognizer ?? { recognize: vi.fn() }) as never,

    createDefaultAiBehaviorConfigService(),

  );

}



describe("ChatAttachmentRecognitionService", () => {

  it("recognizes attachments without proposal candidate builders", () => {

    const service = createRecognitionService();



    expect(service).not.toHaveProperty("buildProposalCandidates");

    expect(service).not.toHaveProperty("mergeAttachmentProposals");

  });



  it("marks food photo recognition as low_confidence when top candidate confidence is low", async () => {

    const service = createRecognitionService({

      foodPhotoRecognizer: {

        recognize: vi.fn(async () => ({

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

        })),

        buildEnvelope: vi.fn(() => ({

          category: "food_photo",

          attachmentRefId: "a1000001-0000-4000-8000-000000000001",

          analysis: {

            candidates: [],

            lowConfidenceNotice: "Review estimates before applying.",

          },

          provenance: {

            source: "dev_stub",

            providerId: "dev_food_photo",

            recognitionId: "b1000001-0000-4000-8000-000000000002",

            confidence: "low",

          },

        })),

      },

    });



    const outcome = await service.recognizeAttachment({

      auth: { clerkUserId: "user_123" } as never,

      userId: "user-id",

      attachment: {

        id: "a1000001-0000-4000-8000-000000000001",

        category: "food_photo",

        mimeType: "image/jpeg",

      } as never,

      category: "food_photo",

      storage: {} as never,

    });



    expect(outcome.status).toBe("low_confidence");

  });



  it("skips medical image OCR and returns needs_review with safe copy", async () => {

    const service = createRecognitionService();



    const outcome = await service.recognizeAttachment({

      auth: { clerkUserId: "user_123" } as never,

      userId: "user-id",

      attachment: {

        id: "d1000001-0000-4000-8000-000000000001",

        category: "medical_document",

        mimeType: "image/jpeg",

        consent: {

          consentScopes: ["upload_storage", "parse_ocr"],

          consentVersion: "v1",

          consentGrantedAt: "2026-05-26T12:00:00.000Z",

          documentType: "lab_report",

          documentTitle: "Labs",

        },

      } as never,

      category: "medical_document",

      storage: {} as never,

    });



    expect(outcome.status).toBe("needs_review");

    expect(outcome.recognition).toBeNull();

    expect(outcome.failureReason).toMatch(/manual review/i);

  });



  it("requires consent before medical document recognition", async () => {

    const service = createRecognitionService();



    const outcome = await service.recognizeAttachment({

      auth: { clerkUserId: "user_123" } as never,

      userId: "user-id",

      attachment: {

        id: "d1000001-0000-4000-8000-000000000001",

        category: "medical_document",

        mimeType: "application/pdf",

        consent: null,

      } as never,

      category: "medical_document",

      storage: {} as never,

    });



    expect(outcome.status).toBe("needs_consent");

    expect(outcome.recognition).toBeNull();

  });



  it("does not create health documents during medical recognition", async () => {

    const service = createRecognitionService();



    const outcome = await service.recognizeAttachmentContext({

      auth: { clerkUserId: "user_123" } as never,

      userId: "user-id",

      attachment: {

        id: "d1000001-0000-4000-8000-000000000001",

        category: "medical_document",

        mimeType: "application/pdf",

        consent: {

          consentScopes: ["upload_storage", "parse_ocr"],

          consentVersion: "v1",

          consentGrantedAt: "2026-05-26T12:00:00.000Z",

          documentType: "lab_report",

          documentTitle: "Labs",

        },

      } as never,

      category: "medical_document",

      storage: {} as never,

    });



    expect(outcome.linkedDocumentId).toBeNull();

    expect(outcome.status).toBe("needs_review");

    expect(outcome.recognition?.category).toBe("medical_document");

    if (outcome.recognition?.category === "medical_document") {

      expect(outcome.recognition.parseStatus).toBe("uploaded");

      expect(outcome.recognition.provenance.source).toBe("attachment_context_only");

      expect(outcome.recognition.documentPersistenceStatus).toBe("attachment_context_only");

      expect(outcome.recognition.reviewStatus).toBeNull();

      expect(outcome.recognition.summarySnippet).toBeNull();

      expect(outcome.recognition.documentReviewPath).toBeNull();

    }

  });



  it("returns context-only needs_review for consented medical documents", async () => {

    const service = createRecognitionService();



    const outcome = await service.recognizeAttachment({

      auth: { clerkUserId: "user_123" } as never,

      userId: "user-id",

      attachment: {

        id: "d1000001-0000-4000-8000-000000000001",

        category: "medical_document",

        mimeType: "application/pdf",

        consent: {

          consentScopes: ["upload_storage", "parse_ocr"],

          consentVersion: "v1",

          consentGrantedAt: "2026-05-26T12:00:00.000Z",

          documentType: "lab_report",

          documentTitle: "Labs",

        },

      } as never,

      category: "medical_document",

      storage: {} as never,

    });



    expect(outcome.status).toBe("needs_review");

    expect(outcome.recognition?.category).toBe("medical_document");

    if (outcome.recognition?.category === "medical_document") {

      expect(outcome.recognition.summarySnippet).toBeNull();

      expect(outcome.recognition.provenance.source).toBe("attachment_context_only");

      expect(outcome.recognition.documentPersistenceStatus).toBe("attachment_context_only");

    }

  });



  it("omits medical summary text in context-only recognition", async () => {

    const service = createRecognitionService();



    const outcome = await service.recognizeAttachment({

      auth: { clerkUserId: "user_123" } as never,

      userId: "user-id",

      attachment: {

        id: "d1000001-0000-4000-8000-000000000001",

        category: "medical_document",

        mimeType: "application/pdf",

        consent: {

          consentScopes: ["upload_storage", "parse_ocr"],

          consentVersion: "v1",

          consentGrantedAt: "2026-05-26T12:00:00.000Z",

          documentType: "lab_report",

          documentTitle: "Labs",

        },

      } as never,

      category: "medical_document",

      storage: {} as never,

    });



    expect(outcome.status).toBe("needs_review");

    expect(outcome.recognition?.category).toBe("medical_document");

    if (outcome.recognition?.category === "medical_document") {

      expect(outcome.recognition.summarySnippet).toBeNull();

      expect(outcome.recognition.documentReviewPath).toBeNull();

      expect(outcome.recognition.provenance.source).toBe("attachment_context_only");

    }

  });



  it("rejects category mismatches before provider isolation boundaries are crossed", async () => {

    const foodRecognize = vi.fn(async () => ({

      candidates: [],

      lowConfidenceNotice: null,

    }));



    const service = createRecognitionService({

      foodPhotoRecognizer: {

        recognize: foodRecognize,

        buildEnvelope: vi.fn(),

      },

    });



    const outcome = await service.recognizeAttachment({

      auth: { clerkUserId: "user_123" } as never,

      userId: "user-id",

      attachment: {

        id: "d1000001-0000-4000-8000-000000000001",

        category: "medical_document",

        mimeType: "application/pdf",

      } as never,

      category: "food_photo",

      storage: {} as never,

    });



    expect(outcome.status).toBe("failed");

    expect(outcome.failureReason).toMatch(/must match stored attachment category/);

    expect(foodRecognize).not.toHaveBeenCalled();

  });

});

