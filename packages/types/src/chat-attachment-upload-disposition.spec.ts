import { describe, expect, it } from "vitest";
import { resolveProvisionalUploadDisposition } from "./chat-attachment-upload-disposition.js";

describe("resolveProvisionalUploadDisposition", () => {
  const attachmentId = "a1000001-0000-4000-8000-000000000001";

  it("returns needs_consent without storage for medical classifications", () => {
    const disposition = resolveProvisionalUploadDisposition({
      attachmentId,
      classification: {
        category: "medical_document",
        confidence: "high",
        rationale: "Medical screenshot detected.",
        suggestedAction: "request_medical_consent",
        mealContextLabel: null,
        classificationProviderId: "openai",
        classificationMethod: "vision",
      },
    });

    expect(disposition.shouldPersistContent).toBe(false);
    expect(disposition.status).toBe("needs_consent");
    expect(disposition.category).toBe("medical_document");
  });

  it("returns needs_review without storage for manual fallback", () => {
    const disposition = resolveProvisionalUploadDisposition({
      attachmentId,
      classification: {
        category: "unclassified",
        confidence: "low",
        rationale: "Ambiguous attachment.",
        suggestedAction: "manual_fallback",
        mealContextLabel: null,
      },
    });

    expect(disposition.shouldPersistContent).toBe(false);
    expect(disposition.status).toBe("needs_review");
    expect(disposition.category).toBe("unclassified");
  });

  it("persists food_photo classifications for later recognition", () => {
    const disposition = resolveProvisionalUploadDisposition({
      attachmentId,
      classification: {
        category: "food_photo",
        confidence: "high",
        rationale: "Meal photo.",
        suggestedAction: "run_category_recognition",
        mealContextLabel: "Lunch",
      },
    });

    expect(disposition.shouldPersistContent).toBe(true);
    expect(disposition.status).toBe("queued");
    expect(disposition.linkedImageRefId).toBe(attachmentId);
  });
});
