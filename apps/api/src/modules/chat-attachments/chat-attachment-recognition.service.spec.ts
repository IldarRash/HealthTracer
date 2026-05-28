import { describe, expect, it, vi } from "vitest";
import type { RawAiProposal } from "@health/types";
import { ChatAttachmentRecognitionService } from "./chat-attachment-recognition.service.js";

function createRecognitionService(deps: {
  foodPhotoRecognizer?: Record<string, unknown>;
  medicalDocumentRecognizer?: Record<string, unknown>;
  workoutAttachmentRecognizer?: Record<string, unknown>;
  foodPhotoAnalysisService?: Record<string, unknown>;
} = {}) {
  const foodPhotoAnalysisService = {
    buildProposalPayloadFromAnalysis: vi.fn((input: { mealContextLabel?: string | null }) => ({
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      items: [{ name: "Salad", calories: 320 }],
      estimatedCalories: 320,
      estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
      confidence: "medium" as const,
      provenance: {
        source: "dev_stub" as const,
        providerId: "dev_food_photo",
        analysisId: "b1000001-0000-4000-8000-000000000002",
      },
      imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
      ...(input.mealContextLabel ? { mealContextLabel: input.mealContextLabel } : {}),
    })),
    ...deps.foodPhotoAnalysisService,
  };

  return new ChatAttachmentRecognitionService(
    (deps.foodPhotoRecognizer ?? { recognize: vi.fn(), buildEnvelope: vi.fn() }) as never,
    (deps.medicalDocumentRecognizer ?? { recognize: vi.fn() }) as never,
    (deps.workoutAttachmentRecognizer ?? { recognize: vi.fn() }) as never,
    foodPhotoAnalysisService as never,
  );
}

describe("ChatAttachmentRecognitionService", () => {
  it("builds nutrition incident proposal candidates without direct writes", () => {
    const foodPhotoAnalysisService = {
      buildProposalPayloadFromAnalysis: vi.fn(() => ({
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Salad", calories: 320 }],
        estimatedCalories: 320,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
        confidence: "medium" as const,
        provenance: {
          source: "dev_stub" as const,
          providerId: "dev_food_photo",
          analysisId: "b1000001-0000-4000-8000-000000000002",
        },
        imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
      })),
    };

    const service = createRecognitionService({ foodPhotoAnalysisService });

    const candidates = service.buildProposalCandidates({
      attachment: {
        id: "a1000001-0000-4000-8000-000000000001",
        recognition: {
          category: "food_photo",
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          analysis: {
            candidates: [],
            lowConfidenceNotice: null,
          },
          provenance: {
            source: "dev_stub",
            providerId: "dev_food_photo",
            recognitionId: "b1000001-0000-4000-8000-000000000002",
          },
        },
      } as never,
      incidentDateTime: "2026-05-26T18:00:00.000Z",
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.intent).toBe("log_nutrition_incident");
    expect(candidates[0]?.proposedChanges).toMatchObject({
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
    });
  });

  it("includes meal context in food photo proposal candidate title and payload", () => {
    const service = createRecognitionService();

    const candidates = service.buildProposalCandidates({
      attachment: {
        id: "a1000001-0000-4000-8000-000000000001",
        recognition: {
          category: "food_photo",
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
          analysis: {
            candidates: [],
            lowConfidenceNotice: null,
          },
          provenance: {
            source: "dev_stub",
            providerId: "dev_food_photo",
            recognitionId: "b1000001-0000-4000-8000-000000000002",
          },
        },
      } as never,
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      mealContextLabel: "Second meal",
    });

    expect(candidates[0]?.title).toBe("Log meal from photo (Second meal)");
    expect(candidates[0]?.proposedChanges).toMatchObject({
      mealContextLabel: "Second meal",
    });
  });

  it("does not emit medical document proposals before review", () => {
    const service = createRecognitionService();

    const candidates = service.buildProposalCandidates({
      attachment: {
        id: "d1000001-0000-4000-8000-000000000001",
        recognition: {
          category: "medical_document",
          attachmentRefId: "d1000001-0000-4000-8000-000000000001",
          documentId: "e1000001-0000-4000-8000-000000000001",
          documentType: "lab_report",
          title: "Labs",
          parseStatus: "summary_ready",
          summarySnippet: "Vitamin D is slightly below the reference range.",
          reviewStatus: "pending_review",
          consentScopes: ["upload_storage", "parse_ocr", "ai_summarization"],
          provenance: {
            source: "document_parser",
            providerId: "documents_module",
            recognitionId: "f1000001-0000-4000-8000-000000000001",
          },
          wellnessContextOnlyNotice:
            "This document is wellness coaching context only. It is not a diagnosis or treatment plan.",
        },
      } as never,
      incidentDateTime: "2026-05-26T18:00:00.000Z",
    });

    expect(candidates).toHaveLength(0);
  });

  it("replaces text-estimate nutrition proposals with photo-backed attachment proposals", () => {
    const service = createRecognitionService();

    const merged = service.mergeAttachmentProposals(
      [
        {
          intent: "log_nutrition_incident",
          targetDomain: "nutrition",
          title: "Log nutrition incident",
          reason: "Text estimate",
          proposedChanges: {
            incidentDateTime: "2026-05-26T18:00:00.000Z",
            items: [{ name: "Mixed meal estimate" }],
            estimatedCalories: 650,
            estimatedMacros: { proteinGrams: 25, carbsGrams: 70, fatGrams: 28 },
            confidence: "medium",
            provenance: { source: "text_estimate", providerId: "chat_trigger" },
            imageRefs: [],
          },
        },
      ],
      [
        {
          intent: "log_nutrition_incident",
          targetDomain: "nutrition",
          title: "Log meal from photo (Second meal)",
          reason: "Photo-backed estimate",
          proposedChanges: {
            incidentDateTime: "2026-05-26T18:00:00.000Z",
            items: [{ name: "Salad", calories: 320 }],
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
          },
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
        },
      ],
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.title).toMatch(/photo/i);
    expect(merged[0]?.proposedChanges).toMatchObject({
      attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      mealContextLabel: "Second meal",
    });
  });

  it("merges attachment proposals without replacing AI proposals", () => {
    const service = createRecognitionService();

    const merged = service.mergeAttachmentProposals(
      [
        {
          intent: "capture_wellbeing_checkin",
          targetDomain: "today",
          title: "Check-in",
          reason: "Daily wellbeing",
          proposedChanges: {
            date: "2026-05-26",
            moodScore: 3,
            stressScore: 4,
          },
        },
      ],
      [
        {
          intent: "log_nutrition_incident",
          targetDomain: "nutrition",
          title: "Log meal from photo",
          reason: "Review meal estimate",
          proposedChanges: { attachmentRefId: "a1000001-0000-4000-8000-000000000001" },
          attachmentRefId: "a1000001-0000-4000-8000-000000000001",
        },
      ],
    );

    expect(merged).toHaveLength(2);
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
    const medicalRecognize = vi.fn(async () => {
      throw new Error("Medical recognizer should not run for image uploads.");
    });

    const service = createRecognitionService({
      medicalDocumentRecognizer: {
        recognize: medicalRecognize,
      },
    });

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
    expect(medicalRecognize).not.toHaveBeenCalled();
  });

  it("requires consent before medical document recognition", async () => {
    const service = createRecognitionService({
      medicalDocumentRecognizer: {
        recognize: vi.fn(async () => {
          throw new Error("Medical recognizer should not run without consent.");
        }),
      },
    });

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

  it("returns needs_review for consented medical documents and blocks unsafe summaries", async () => {
    const service = createRecognitionService({
      medicalDocumentRecognizer: {
        recognize: vi.fn(async () => ({
          category: "medical_document",
          attachmentRefId: "d1000001-0000-4000-8000-000000000001",
          documentId: "e1000001-0000-4000-8000-000000000001",
          documentType: "lab_report",
          title: "Labs",
          parseStatus: "summary_ready",
          summarySnippet: "This confirms a diagnosis of anemia.",
          reviewStatus: "pending_review",
          consentScopes: ["upload_storage", "parse_ocr"],
          provenance: {
            source: "document_parser",
            providerId: "documents_module",
            recognitionId: "f1000001-0000-4000-8000-000000000001",
          },
          wellnessContextOnlyNotice:
            "This document is wellness coaching context only. It is not a diagnosis or treatment plan.",
        })),
      },
    });

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

    expect(outcome.status).toBe("failed");
    expect(outcome.failureReason).toMatch(/unsafe medical wording/i);
  });

  it("omits medical summary text while review is pending", async () => {
    const service = createRecognitionService({
      medicalDocumentRecognizer: {
        recognize: vi.fn(async () => ({
          category: "medical_document",
          attachmentRefId: "d1000001-0000-4000-8000-000000000001",
          documentId: "e1000001-0000-4000-8000-000000000001",
          documentType: "lab_report",
          title: "Labs",
          parseStatus: "summary_ready",
          summarySnippet: "Vitamin D is slightly below the reference range.",
          reviewStatus: "pending_review",
          consentScopes: ["upload_storage", "parse_ocr"],
          provenance: {
            source: "document_parser",
            providerId: "documents_module",
            recognitionId: "f1000001-0000-4000-8000-000000000001",
          },
          wellnessContextOnlyNotice:
            "This document is wellness coaching context only. It is not a diagnosis or treatment plan.",
        })),
      },
    });

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
      expect(outcome.recognition.documentReviewPath).toMatch(/documentId=/);
      expect(outcome.recognition.documentId).toBe("e1000001-0000-4000-8000-000000000001");
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

  it("builds create_workout_plan proposal candidates for plan attachments only", () => {
    const service = createRecognitionService();

    const candidates = service.buildProposalCandidates({
      attachment: {
        id: "c1000008-0000-4000-8000-000000000008",
        recognition: {
          category: "workout_attachment",
          attachmentRefId: "c1000008-0000-4000-8000-000000000008",
          attachmentKind: "plan_screenshot",
          sessionLabel: null,
          sessionDate: null,
          exercises: [{ name: "Squat", target: "3 sets", sets: 3, reps: "8-10" }],
          suggestedIntent: "create_workout_plan",
          planDraftTitle: "Imported workout plan draft",
          provenance: {
            source: "dev_stub",
            providerId: "dev_workout_attachment",
            recognitionId: "f1000001-0000-4000-8000-000000000001",
          },
          manualFallbackNotice: null,
        },
      } as never,
      incidentDateTime: "2026-05-26T18:00:00.000Z",
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.intent).toBe("create_workout_plan");
    expect(candidates[0]?.reason).toMatch(/revision/i);
  });

  it("builds create_today_checklist proposal when user asks to log today's workout", () => {
    const service = createRecognitionService();

    const candidates = service.buildProposalCandidates({
      attachment: {
        id: "c1000001-0000-4000-8000-000000000001",
        recognition: {
          category: "workout_attachment",
          attachmentRefId: "c1000001-0000-4000-8000-000000000001",
          attachmentKind: "exercise_photo",
          sessionLabel: "Volleyball training",
          sessionDate: null,
          exercises: [{ name: "Volleyball drill", target: "3 sets", sets: 3, reps: "8-10" }],
          suggestedIntent: "log_session_context",
          planDraftTitle: null,
          provenance: {
            source: "dev_stub",
            providerId: "dev_workout_attachment",
            recognitionId: "f1000001-0000-4000-8000-000000000002",
          },
          manualFallbackNotice: null,
        },
      } as never,
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      boundedMessage: "запиши мне тренировку волейбола на сегодня",
      todayIsoDate: "2026-05-26",
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.intent).toBe("create_today_checklist");
    expect(candidates[0]?.targetDomain).toBe("today");
    expect(candidates[0]?.proposedChanges).toMatchObject({
      date: "2026-05-26",
      items: [{ label: "Волейбол", kind: "workout", status: "pending" }],
    });
  });

  it("does not emit workout session proposals without plan-level intent", () => {
    const service = createRecognitionService();

    const candidates = service.buildProposalCandidates({
      attachment: {
        id: "c1000001-0000-4000-8000-000000000001",
        recognition: {
          category: "workout_attachment",
          attachmentRefId: "c1000001-0000-4000-8000-000000000001",
          attachmentKind: "exercise_photo",
          sessionLabel: "Recognized training session",
          sessionDate: null,
          exercises: [{ name: "Row", target: "3 sets", sets: 3, reps: "8-10" }],
          suggestedIntent: "log_session_context",
          planDraftTitle: null,
          provenance: {
            source: "dev_stub",
            providerId: "dev_workout_attachment",
            recognitionId: "f1000001-0000-4000-8000-000000000002",
          },
          manualFallbackNotice: "Describe the workout in text.",
        },
      } as never,
      incidentDateTime: "2026-05-26T18:00:00.000Z",
    });

    expect(candidates).toHaveLength(0);
  });

  it("drops AI full workout plan proposals for one-off today checklist attachment turns", () => {
    const service = createRecognitionService();
    const workoutRecognition = {
      category: "workout_attachment" as const,
      attachmentRefId: "c1000001-0000-4000-8000-000000000001",
      attachmentKind: "exercise_photo" as const,
      sessionLabel: "Volleyball training",
      sessionDate: null,
      exercises: [{ name: "Volleyball drill", target: "3 sets", sets: 3, reps: "8-10" }],
      suggestedIntent: "log_session_context" as const,
      planDraftTitle: null,
      provenance: {
        source: "dev_stub",
        providerId: "dev_workout_attachment",
        recognitionId: "f1000001-0000-4000-8000-000000000002",
      },
      manualFallbackNotice: null,
    };

    const merged = service.mergeAttachmentProposals(
      [
        {
          intent: "create_workout_plan",
          targetDomain: "workout",
          title: "Imported workout plan",
          reason: "AI emitted a full plan",
          proposedChanges: {
            title: "Imported workout plan",
            summary: "Plan from attachment",
            days: [],
            notes: [],
          },
        },
        {
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Adapt workout plan",
          reason: "AI adaptation",
          proposedChanges: {
            title: "Adapted plan",
            summary: "Adapted plan",
            days: [],
            notes: [],
          },
        },
      ] as RawAiProposal[],
      [
        {
          intent: "create_today_checklist",
          targetDomain: "today",
          title: "Add today's workout to Today",
          reason: "Review before accepting",
          proposedChanges: {
            date: "2026-05-26",
            items: [{ label: "Volleyball training", kind: "workout", status: "pending" }],
          },
          attachmentRefId: "c1000001-0000-4000-8000-000000000001",
        },
      ],
      { workoutRecognitions: [workoutRecognition] },
    );

    expect(merged.map((proposal) => proposal.intent)).toEqual(["create_today_checklist"]);
  });

  it("keeps AI create_workout_plan proposals for plan-document attachment turns", () => {
    const service = createRecognitionService();
    const workoutRecognition = {
      category: "workout_attachment" as const,
      attachmentRefId: "c1000008-0000-4000-8000-000000000008",
      attachmentKind: "plan_screenshot" as const,
      sessionLabel: null,
      sessionDate: null,
      exercises: [{ name: "Squat", target: "3 sets", sets: 3, reps: "8-10" }],
      suggestedIntent: "create_workout_plan" as const,
      planDraftTitle: "Imported workout plan draft",
      provenance: {
        source: "dev_stub",
        providerId: "dev_workout_attachment",
        recognitionId: "f1000001-0000-4000-8000-000000000001",
      },
      manualFallbackNotice: null,
    };

    const aiWorkoutPlan = {
      intent: "create_workout_plan",
      targetDomain: "workout",
      title: "Review imported workout plan",
      reason: "AI plan draft",
      proposedChanges: {
        title: "Imported workout plan draft",
        summary: "Plan from attachment",
        days: [],
        notes: [],
        attachmentRefId: "c1000008-0000-4000-8000-000000000008",
      },
    } as RawAiProposal;

    const merged = service.mergeAttachmentProposals(
      [aiWorkoutPlan],
      [
        {
          intent: "create_workout_plan",
          targetDomain: "workout",
          title: "Review imported workout plan",
          reason: "Deterministic plan candidate",
          proposedChanges: aiWorkoutPlan.proposedChanges,
          attachmentRefId: "c1000008-0000-4000-8000-000000000008",
        },
      ],
      { workoutRecognitions: [workoutRecognition] },
    );

    expect(merged.some((proposal) => proposal.intent === "create_workout_plan")).toBe(true);
  });
});
