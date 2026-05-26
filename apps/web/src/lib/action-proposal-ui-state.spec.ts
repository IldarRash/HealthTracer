import { describe, expect, it } from "vitest";
import {
  buildNutritionIncidentAcceptPayload,
  buildWellbeingCheckinAcceptPayload,
  createNutritionIncidentFormState,
  createWellbeingCheckinFormState,
  getNutritionIncidentAcceptBlockReason,
  getWellbeingCheckinAcceptBlockReason,
  isActionProposalIntent,
  nutritionConfidenceNotice,
  parseNutritionIncidentProposalPayload,
  parseWellbeingCheckinProposalPayload,
} from "./action-proposal-ui-state.js";

describe("action proposal UI state", () => {
  it("parses wellbeing and nutrition proposal payloads", () => {
    expect(
      parseWellbeingCheckinProposalPayload({
        date: "2026-05-26",
        moodScore: 2,
        stressScore: 3,
      })?.moodScore,
    ).toBe(2);

    expect(
      parseNutritionIncidentProposalPayload({
        incidentDateTime: "2026-05-26T18:00:00.000Z",
        items: [{ name: "Pizza slice", calories: 280 }],
        estimatedCalories: 280,
        estimatedMacros: { proteinGrams: 12, carbsGrams: 30, fatGrams: 10 },
        confidence: "medium",
        provenance: { source: "text_estimate", providerId: "chat_trigger" },
        imageRefs: [],
      })?.confidence,
    ).toBe("medium");
  });

  it("blocks wellbeing apply until mood and stress are selected", () => {
    expect(
      getWellbeingCheckinAcceptBlockReason({
        date: "2026-05-26",
        moodScore: null,
        stressScore: 3,
        energyLevel: null,
        note: "",
        tags: [],
      }),
    ).toContain("Select mood and stress");

    const payload = buildWellbeingCheckinAcceptPayload({
      date: "2026-05-26",
      moodScore: 2,
      stressScore: 4,
      energyLevel: 3,
      note: "Rough day",
      tags: [],
    });

    expect(payload?.moodScore).toBe(2);
    expect(getWellbeingCheckinAcceptBlockReason({
      date: "2026-05-26",
      moodScore: 2,
      stressScore: 4,
      energyLevel: 3,
      note: "Rough day",
      tags: [],
    })).toBeNull();
  });

  it("requires review edits before applying low-confidence nutrition incidents", () => {
    const form = createNutritionIncidentFormState({
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      items: [{ name: "Estimated plate", calories: 450 }],
      estimatedCalories: 450,
      estimatedMacros: { proteinGrams: 18, carbsGrams: 55, fatGrams: 16 },
      confidence: "low",
      provenance: { source: "dev_stub", providerId: "dev_food_photo" },
      imageRefs: [{ id: "00000000-0000-4000-8000-000000000003" }],
    }, "Review this estimate.");

    expect(getNutritionIncidentAcceptBlockReason(form)).toContain("low-confidence");
    expect(nutritionConfidenceNotice("low", form.lowConfidenceNotice)).toContain("Review");

    const reviewed = {
      ...form,
      hasUserEdited: true,
    };

    const payload = buildNutritionIncidentAcceptPayload(reviewed);
    expect(payload?.userEdits?.items[0]?.name).toBe("Estimated plate");
    expect(getNutritionIncidentAcceptBlockReason(reviewed)).toBeNull();
  });

  it("identifies action proposal intents", () => {
    expect(isActionProposalIntent("capture_wellbeing_checkin")).toBe(true);
    expect(isActionProposalIntent("log_nutrition_incident")).toBe(true);
    expect(isActionProposalIntent("create_goal")).toBe(false);
  });

  it("blocks wellbeing apply for oversized notes and flags lowest mood on accept", () => {
    const form = createWellbeingCheckinFormState({
      date: "2026-05-26",
      moodScore: 1,
      stressScore: 4,
      energyLevel: 1,
      note: null,
      tags: [],
    });

    expect(
      getWellbeingCheckinAcceptBlockReason({
        ...form,
        note: "x".repeat(281),
      }),
    ).toContain("280 characters");

    const payload = buildWellbeingCheckinAcceptPayload(form);
    expect(payload?.safetyFlags).toEqual(["lowest_mood"]);
  });

  it("blocks nutrition apply when item names are blank after trimming", () => {
    const form = createNutritionIncidentFormState({
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      items: [{ name: "   ", calories: 100 }],
      estimatedCalories: 100,
      estimatedMacros: { proteinGrams: 5, carbsGrams: 10, fatGrams: 3 },
      confidence: "medium",
      provenance: { source: "text_estimate", providerId: "chat_trigger" },
      imageRefs: [],
    });

    expect(buildNutritionIncidentAcceptPayload(form)).toBeNull();
    expect(getNutritionIncidentAcceptBlockReason(form)).toContain("name");
  });

  it("uses default low-confidence notice when provider notice is absent", () => {
    expect(nutritionConfidenceNotice("low", null)).toContain("Review items and quantities");
  });

  it("labels recipe recommendation provenance and gates low-confidence recipe logs", () => {
    const form = createNutritionIncidentFormState({
      incidentDateTime: "2026-05-26T18:00:00.000Z",
      items: [{ name: "Vegetable curry", quantity: "1 serving", calories: 550 }],
      estimatedCalories: 550,
      estimatedMacros: { proteinGrams: 25, carbsGrams: 45, fatGrams: 20 },
      confidence: "low",
      provenance: {
        source: "recipe_recommendation",
        providerId: "b2000001-0000-4000-8000-000000000001",
      },
      imageRefs: [],
    });

    expect(getNutritionIncidentAcceptBlockReason(form)).toContain("low-confidence");
    expect(buildNutritionIncidentAcceptPayload(form)?.userEdits?.items[0]?.name).toBe(
      "Vegetable curry",
    );

    const reviewed = { ...form, hasUserEdited: true };
    expect(getNutritionIncidentAcceptBlockReason(reviewed)).toBeNull();
    expect(buildNutritionIncidentAcceptPayload(reviewed)?.provenance.source).toBe(
      "recipe_recommendation",
    );
  });
});
