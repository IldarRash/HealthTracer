import { describe, expect, it } from "vitest";
import { ProposalValidationService } from "./proposal-validation.service.js";

function createService(options?: {
  attachments?: Array<{
    id: string;
    userId: string;
    category: "food_photo" | "medical_document" | "workout_attachment";
    status: string;
    linkedDocumentId: string | null;
    linkedImageRefId: string | null;
    retentionPolicy?: "ephemeral_recognition" | "document_consent_rules" | "session_linked";
    expiresAt?: Date | null;
  }>;
}) {
  const chatAttachmentsRepository = {
    listByIdsForUser: async () => options?.attachments ?? [],
  };

  const service = new ProposalValidationService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    chatAttachmentsRepository as never,
  );

  return { service };
}

describe("ProposalValidationService chat attachment refs", () => {
  it("accepts owned ready food photo attachment refs on nutrition incidents", async () => {
    const { service } = createService({
      attachments: [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          userId: "user-id",
          category: "food_photo",
          status: "ready",
          linkedDocumentId: null,
          linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
        },
      ],
    });

    const errors = await service.validateChatAttachmentProposalRefs(
      "user-id",
      "log_nutrition_incident",
      {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Salad", calories: 320 }],
        estimatedCalories: 320,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
        confidence: "medium",
        provenance: { source: "dev_stub" },
        imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      },
    );

    expect(errors).toEqual([]);
  });

  it("rejects cross-user attachment refs", async () => {
    const { service } = createService({ attachments: [] });

    const errors = await service.validateChatAttachmentProposalRefs(
      "user-id",
      "create_workout_plan",
      {
        title: "Imported plan",
        summary: "Draft",
        days: [{ weekday: "monday", focus: "Strength", exercises: ["Squat"] }],
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      },
    );

    expect(errors[0]).toMatch(/not found for this user/);
  });

  it("rejects wrong-category attachment refs on workout plan proposals", async () => {
    const { service } = createService({
      attachments: [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          userId: "user-id",
          category: "food_photo",
          status: "ready",
          linkedDocumentId: null,
          linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
        },
      ],
    });

    const errors = await service.validateChatAttachmentProposalRefs(
      "user-id",
      "create_workout_plan",
      {
        title: "Imported plan",
        summary: "Draft",
        days: [{ weekday: "monday", focus: "Strength", exercises: ["Squat"] }],
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      },
    );

    expect(errors[0]).toMatch(/Expected workout_attachment attachment but found food_photo/);
  });

  it("rejects attachment refs that are not proposal-ready", async () => {
    const { service } = createService({
      attachments: [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          userId: "user-id",
          category: "food_photo",
          status: "needs_consent",
          linkedDocumentId: null,
          linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
        },
      ],
    });

    const errors = await service.validateChatAttachmentProposalRefs(
      "user-id",
      "log_nutrition_incident",
      {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Salad", calories: 320 }],
        estimatedCalories: 320,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
        confidence: "medium",
        provenance: { source: "dev_stub" },
        imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      },
    );

    expect(errors[0]).toMatch(/not proposal-ready/);
  });

  it("accepts ready workout attachment refs on adapt_workout_plan proposals", async () => {
    const { service } = createService({
      attachments: [
        {
          id: "c1000008-0000-4000-8000-000000000008",
          userId: "user-id",
          category: "workout_attachment",
          status: "ready",
          linkedDocumentId: null,
          linkedImageRefId: null,
        },
      ],
    });

    const errors = await service.validateChatAttachmentProposalRefs(
      "user-id",
      "adapt_workout_plan",
      {
        plan: {
          title: "Imported plan",
          summary: "Draft",
          days: [{ weekday: "monday", focus: "Strength", exercises: ["Squat"] }],
        },
        sourceTrendObservationIds: [],
        attachmentRefId: "c1000008-0000-4000-8000-000000000008",
      },
    );

    expect(errors).toEqual([]);
  });

  it("rejects expired ephemeral attachment refs on proposals", async () => {
    const { service } = createService({
      attachments: [
        {
          id: "a1000001-0000-4000-8000-000000000001",
          userId: "user-id",
          category: "food_photo",
          status: "ready",
          linkedDocumentId: null,
          linkedImageRefId: "a1000001-0000-4000-8000-000000000001",
          retentionPolicy: "ephemeral_recognition",
          expiresAt: new Date("2026-05-25T12:00:00.000Z"),
        },
      ],
    });

    const errors = await service.validateChatAttachmentProposalRefs(
      "user-id",
      "log_nutrition_incident",
      {
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Salad", calories: 320 }],
        estimatedCalories: 320,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 20, fatGrams: 18 },
        confidence: "medium",
        provenance: { source: "dev_stub" },
        imageRefs: [{ id: "a1000001-0000-4000-8000-000000000001" }],
        attachmentRefId: "a1000001-0000-4000-8000-000000000001",
      },
    );

    expect(errors[0]).toMatch(/expired/);
  });
});
