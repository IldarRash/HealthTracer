import { describe, expect, it } from "vitest";
import {
  foodPhotoAnalysisRequestSchema,
  foodPhotoAnalysisResultSchema,
  getNutritionIncidentDomainErrors,
  getNutritionIncidentImageRefOwnershipErrors,
  logNutritionIncidentProposalPayloadSchema,
  sumNutritionIncidentMacros,
  toNutritionIncidentSnapshot,
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

// ---------------------------------------------------------------------------
// C7: sumNutritionIncidentMacros + toNutritionIncidentSnapshot helpers
// ---------------------------------------------------------------------------

describe("sumNutritionIncidentMacros (C7)", () => {
  it("returns null for an empty input array (no incidents, not zero)", () => {
    expect(sumNutritionIncidentMacros([])).toBeNull();
  });

  it("sums calories and macros across multiple rows and rounds to integers", () => {
    const rows = [
      {
        estimatedCalories: 620,
        estimatedMacros: { proteinGrams: 42.3, carbsGrams: 55.7, fatGrams: 18.0 },
      },
      {
        estimatedCalories: 380,
        estimatedMacros: { proteinGrams: 18.6, carbsGrams: 44.2, fatGrams: 12.1 },
      },
    ];

    const result = sumNutritionIncidentMacros(rows);

    expect(result).not.toBeNull();
    expect(result!.calories).toBe(1000);          // 620 + 380
    expect(result!.proteinGrams).toBe(61);         // round(42.3 + 18.6) = round(60.9) = 61
    expect(result!.carbsGrams).toBe(100);          // round(55.7 + 44.2) = round(99.9) = 100
    expect(result!.fatGrams).toBe(30);             // round(18.0 + 12.1) = round(30.1) = 30
    expect(result!.incidentCount).toBe(2);
  });

  it("counts incident rows (incidentCount) correctly for a single row", () => {
    const rows = [
      {
        estimatedCalories: 300,
        estimatedMacros: { proteinGrams: 20, carbsGrams: 30, fatGrams: 10 },
      },
    ];

    const result = sumNutritionIncidentMacros(rows);

    expect(result!.incidentCount).toBe(1);
    expect(result!.calories).toBe(300);
  });

  it("uses ?? 0 fallback for missing macro keys in estimatedMacros", () => {
    const rows = [
      {
        estimatedCalories: 200,
        estimatedMacros: { carbsGrams: 40 }, // proteinGrams and fatGrams absent
      },
    ];

    const result = sumNutritionIncidentMacros(rows);

    expect(result!.proteinGrams).toBe(0);
    expect(result!.carbsGrams).toBe(40);
    expect(result!.fatGrams).toBe(0);
    expect(result!.calories).toBe(200);
  });

  it("rounds fractional totals rather than truncating", () => {
    // 3 rows each contributing 0.4 protein = total 1.2 → round = 1
    // 3 rows each contributing 0.6 carbs  = total 1.8 → round = 2
    const rows = [
      { estimatedCalories: 100, estimatedMacros: { proteinGrams: 0.4, carbsGrams: 0.6, fatGrams: 0 } },
      { estimatedCalories: 100, estimatedMacros: { proteinGrams: 0.4, carbsGrams: 0.6, fatGrams: 0 } },
      { estimatedCalories: 100, estimatedMacros: { proteinGrams: 0.4, carbsGrams: 0.6, fatGrams: 0 } },
    ];

    const result = sumNutritionIncidentMacros(rows);

    expect(result!.proteinGrams).toBe(1);  // round(1.2) = 1
    expect(result!.carbsGrams).toBe(2);    // round(1.8) = 2
  });
});

describe("toNutritionIncidentSnapshot (C7)", () => {
  it("maps estimatedMacros keys into typed fields", () => {
    const row = {
      date: "2026-06-04",
      estimatedCalories: 500,
      estimatedMacros: { proteinGrams: 35, carbsGrams: 60, fatGrams: 15 },
    };

    const snap = toNutritionIncidentSnapshot(row);

    expect(snap.date).toBe("2026-06-04");
    expect(snap.estimatedCalories).toBe(500);
    expect(snap.proteinGrams).toBe(35);
    expect(snap.carbsGrams).toBe(60);
    expect(snap.fatGrams).toBe(15);
  });

  it("applies ?? 0 fallback for absent macro keys", () => {
    const row = {
      date: "2026-06-04",
      estimatedCalories: 100,
      estimatedMacros: { carbsGrams: 20 }, // protein and fat absent
    };

    const snap = toNutritionIncidentSnapshot(row);

    expect(snap.proteinGrams).toBe(0);
    expect(snap.carbsGrams).toBe(20);
    expect(snap.fatGrams).toBe(0);
  });

  it("passes values through to aggregateNutritionIncidentsWeek producing same totals (regression)", async () => {
    // This regression test verifies that toNutritionIncidentSnapshot + aggregateNutritionIncidentsWeek
    // produce identical totals to what the old inline extraction would have produced.
    const { aggregateNutritionIncidentsWeek } = await import("./progress-cross-domain.js");

    const dbRows = [
      {
        date: "2026-06-02",
        estimatedCalories: 620,
        estimatedMacros: { proteinGrams: 42, carbsGrams: 55, fatGrams: 18 },
      },
      {
        date: "2026-06-02",
        estimatedCalories: 380,
        estimatedMacros: { proteinGrams: 18, carbsGrams: 44, fatGrams: 12 },
      },
      {
        date: "2026-06-03",
        estimatedCalories: 500,
        estimatedMacros: { proteinGrams: 30, carbsGrams: 50, fatGrams: 15 },
      },
    ];

    const snapshots = dbRows.map(toNutritionIncidentSnapshot);
    const agg = aggregateNutritionIncidentsWeek(snapshots);

    expect(agg.incidentCount).toBe(3);
    expect(agg.daysWithIncidentsLogged).toBe(2); // June 2 + June 3
    expect(agg.totalCalories).toBe(1500);         // 620 + 380 + 500
    expect(agg.totalProteinGrams).toBe(90);        // 42 + 18 + 30
    expect(agg.totalCarbsGrams).toBe(149);         // 55 + 44 + 50
    expect(agg.totalFatGrams).toBe(45);            // 18 + 12 + 15
    expect(agg.averageDailyCalories).toBe(750);    // 1500 / 2 days
  });
});

describe("buildEatenBlock regression via sumNutritionIncidentMacros (C7)", () => {
  it("returns null when no incident rows are present (no zero-calorie ghost entry)", () => {
    // sumNutritionIncidentMacros([]) === null, matching old buildEatenBlock contract.
    expect(sumNutritionIncidentMacros([])).toBeNull();
  });

  it("returns a non-null eaten block with correct incidentCount for one row", () => {
    const rows = [
      {
        estimatedCalories: 480,
        estimatedMacros: { proteinGrams: 30, carbsGrams: 60, fatGrams: 14 },
      },
    ];

    const eaten = sumNutritionIncidentMacros(rows);

    expect(eaten).not.toBeNull();
    expect(eaten!.calories).toBe(480);
    expect(eaten!.incidentCount).toBe(1);
  });

  it("produces the same total calories as a manual sum over the rows", () => {
    const rows = [
      { estimatedCalories: 350, estimatedMacros: { proteinGrams: 20, carbsGrams: 40, fatGrams: 12 } },
      { estimatedCalories: 420, estimatedMacros: { proteinGrams: 25, carbsGrams: 48, fatGrams: 15 } },
      { estimatedCalories: 280, estimatedMacros: { proteinGrams: 15, carbsGrams: 35, fatGrams: 8 } },
    ];

    const manualTotal = rows.reduce((s, r) => s + r.estimatedCalories, 0);
    const result = sumNutritionIncidentMacros(rows);

    expect(result!.calories).toBe(manualTotal); // 1050
    expect(result!.incidentCount).toBe(3);
  });
});
