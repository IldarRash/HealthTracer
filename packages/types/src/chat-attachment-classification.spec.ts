import { describe, expect, it } from "vitest";
import {
  classifyAttachmentFromMessageContext,
  foodAttachmentExtractionResultSchema,
  hasMedicalDocumentSignals,
  inferMealContextFromMessage,
  isPhotoBackedNutritionProposalPayload,
  isTextEstimateNutritionProposalPayload,
  medicalDocumentAttachmentExtractionResultSchema,
  workoutAttachmentExtractionResultSchema,
} from "./chat-attachment-classification.js";
import { getProvisionalAttachmentMimeTypeError, isChatAttachmentPendingMessageFirstSend } from "./chat-attachments.js";
import { createChatAttachmentSchema } from "./chat-attachments.js";
import { logNutritionIncidentProposalPayloadSchema } from "./nutrition-incidents.js";

describe("chat attachment classification contracts", () => {
  it("accepts provisional unclassified uploads without a preset category", () => {
    const parsed = createChatAttachmentSchema.safeParse({
      filename: "meal.jpg",
      mimeType: "image/jpeg",
      fileContentBase64: "dGVzdA==",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.category).toBe("unclassified");
    }
  });

  it("allows provisional MIME types for unclassified uploads", () => {
    expect(getProvisionalAttachmentMimeTypeError("image/jpeg")).toBeNull();
    expect(getProvisionalAttachmentMimeTypeError("application/octet-stream")).toMatch(
      /Unsupported MIME type/,
    );
  });

  it("infers meal context from Russian and English meal phrases", () => {
    expect(inferMealContextFromMessage("второй прием пищи")).toBe("Second meal");
    expect(inferMealContextFromMessage("second meal photo")).toBe("Second meal");
    expect(inferMealContextFromMessage("hello coach")).toBeNull();
  });

  it("classifies food images with meal context from message text", () => {
    const result = classifyAttachmentFromMessageContext({
      message: "второй прием пищи",
      filename: "meal.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.category).toBe("food_photo");
    expect(result.mealContextLabel).toBe("Second meal");
    expect(result.suggestedAction).toBe("run_category_recognition");
  });

  it("classifies workout attachments from activity-fill messages", () => {
    const result = classifyAttachmentFromMessageContext({
      message: "заполни активность",
      filename: "training.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.category).toBe("workout_attachment");
    expect(result.suggestedAction).toBe("run_category_recognition");
  });

  it("routes medical PDFs to consent-first classification", () => {
    const result = classifyAttachmentFromMessageContext({
      message: "here are my lab results",
      filename: "labs.pdf",
      mimeType: "application/pdf",
    });

    expect(result.category).toBe("medical_document");
    expect(result.suggestedAction).toBe("request_medical_consent");
  });

  it("routes medical-signaled images to medical consent without food classification", () => {
    for (const message of ["here are my lab results", "blood report screenshot"]) {
      const result = classifyAttachmentFromMessageContext({
        message,
        filename: "scan.jpg",
        mimeType: "image/jpeg",
      });

      expect(result.category).toBe("medical_document");
      expect(result.suggestedAction).toBe("manual_fallback");
      expect(result.mealContextLabel).toBeNull();
    }
  });

  it("detects Russian medical document signals for image uploads", () => {
    expect(hasMedicalDocumentSignals("вот мои анализы", "photo.png")).toBe(true);
    expect(hasMedicalDocumentSignals("мед документ", "scan.jpg")).toBe(true);

    const result = classifyAttachmentFromMessageContext({
      message: "вот мои анализы",
      filename: "labs.png",
      mimeType: "image/png",
    });

    expect(result.category).toBe("medical_document");
    expect(result.suggestedAction).toBe("manual_fallback");
  });

  it("keeps meal photos as food when no medical signals are present", () => {
    const result = classifyAttachmentFromMessageContext({
      message: "второй прием пищи",
      filename: "meal.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.category).toBe("food_photo");
    expect(result.suggestedAction).toBe("run_category_recognition");
    expect(result.mealContextLabel).toBe("Second meal");
  });

  it("keeps workout activity images as workout when no medical signals are present", () => {
    const result = classifyAttachmentFromMessageContext({
      message: "заполни активность",
      filename: "training.jpg",
      mimeType: "image/jpeg",
    });

    expect(result.category).toBe("workout_attachment");
    expect(result.suggestedAction).toBe("run_category_recognition");
  });

  it("treats queued unclassified refs as pending message-first send", () => {
    expect(
      isChatAttachmentPendingMessageFirstSend({
        category: "unclassified",
        status: "queued",
        recognition: null,
      }),
    ).toBe(true);
  });

  it("distinguishes text-estimate and photo-backed nutrition payloads", () => {
    const textEstimate = logNutritionIncidentProposalPayloadSchema.parse({
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      items: [{ name: "Mixed meal estimate" }],
      estimatedCalories: 650,
      estimatedMacros: { proteinGrams: 25, carbsGrams: 70, fatGrams: 28 },
      confidence: "medium",
      provenance: { source: "text_estimate", providerId: "chat_trigger" },
      imageRefs: [],
    });

    const photoBacked = logNutritionIncidentProposalPayloadSchema.parse({
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      items: [{ name: "Salad" }],
      estimatedCalories: 320,
      estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
      confidence: "medium",
      provenance: {
        source: "dev_stub",
        providerId: "dev_food_photo",
        analysisId: "b1000001-0000-4000-8000-000000000002",
      },
      imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      mealContextLabel: "Second meal",
    });

    expect(isTextEstimateNutritionProposalPayload(textEstimate)).toBe(true);
    expect(isPhotoBackedNutritionProposalPayload(photoBacked)).toBe(true);
    expect(isPhotoBackedNutritionProposalPayload(textEstimate)).toBe(false);
  });

  it("parses typed extraction envelopes for food, workout, and medical flows", () => {
    const foodExtraction = foodAttachmentExtractionResultSchema.parse({
      mealContextLabel: "Second meal",
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
    });

    expect(foodExtraction.mealContextLabel).toBe("Second meal");

    const workoutExtraction = workoutAttachmentExtractionResultSchema.parse({
      recognition: {
        category: "workout_attachment",
        attachmentRefId: "c1000001-0000-4000-8000-000000000001",
        attachmentKind: "exercise_photo",
        sessionLabel: "Session",
        sessionDate: null,
        exercises: [],
        suggestedIntent: "log_session_context",
        planDraftTitle: null,
        provenance: {
          source: "dev_stub",
          providerId: "dev_workout_attachment",
          recognitionId: "f1000001-0000-4000-8000-000000000002",
        },
        manualFallbackNotice: "Describe the workout in text.",
      },
      messageDerivedIntent: "log_session_context",
    });

    expect(workoutExtraction.messageDerivedIntent).toBe("log_session_context");

    const medicalExtraction = medicalDocumentAttachmentExtractionResultSchema.parse({
      recognition: {
        category: "medical_document",
        attachmentRefId: "d1000001-0000-4000-8000-000000000001",
        documentId: "e1000001-0000-4000-8000-000000000001",
        documentType: "lab_report",
        title: "Labs",
        parseStatus: "summary_ready",
        summarySnippet: null,
        reviewStatus: "pending_review",
        consentScopes: ["upload_storage", "parse_ocr"],
        provenance: {
          source: "document_parser",
          providerId: "documents_module",
          recognitionId: "f1000001-0000-4000-8000-000000000001",
        },
        wellnessContextOnlyNotice:
          "This document is wellness coaching context only. It is not a diagnosis or treatment plan.",
        documentReviewPath: null,
      },
      proposalsSuppressed: true,
    });

    expect(medicalExtraction.proposalsSuppressed).toBe(true);
  });
});
