import { describe, expect, it } from "vitest";
import {
  normalizeLogNutritionIncidentChanges,
  type NutritionIncidentNormalizationContext,
} from "./nutrition-incident-normalization.js";
import { logNutritionIncidentProposalPayloadSchema } from "./nutrition-incidents.js";

const NOW_ISO = "2026-06-12T10:00:00.000Z";
const ATTACHMENT_ID = "aa345678-90ab-4cde-8f01-234567890abc";
const SECOND_ATTACHMENT_ID = "bb345678-90ab-4cde-8f01-234567890abc";
const LLM_UUID = "cc345678-90ab-4cde-8f01-234567890abc";

function ctx(
  overrides: Partial<NutritionIncidentNormalizationContext> = {},
): NutritionIncidentNormalizationContext {
  return {
    nowIso: NOW_ISO,
    imageAttachmentIds: [],
    ...overrides,
  };
}

const basePayload = {
  incidentDateTime: NOW_ISO,
  items: [{ name: "Oatmeal with berries", calories: 320 }],
  estimatedCalories: 320,
  estimatedMacros: { proteinGrams: 12, carbsGrams: 55, fatGrams: 6 },
  confidence: "medium",
  provenance: { source: "text_estimate" },
};

describe("normalizeLogNutritionIncidentChanges", () => {
  it("returns non-object input unchanged", () => {
    expect(normalizeLogNutritionIncidentChanges(null, ctx())).toBeNull();
    expect(normalizeLogNutritionIncidentChanges("text", ctx())).toBe("text");
    expect(normalizeLogNutritionIncidentChanges(42, ctx())).toBe(42);

    const arrayInput = [{ source: "text_estimate" }];
    expect(normalizeLogNutritionIncidentChanges(arrayInput, ctx())).toBe(arrayInput);
  });

  it("does not mutate the input object", () => {
    const input = { ...basePayload, imageRefs: [LLM_UUID] };
    const snapshot = JSON.parse(JSON.stringify(input)) as unknown;

    normalizeLogNutritionIncidentChanges(input, ctx({ imageAttachmentIds: [ATTACHMENT_ID] }));

    expect(input).toEqual(snapshot);
  });

  describe("imageRefs", () => {
    it("coerces UUID-string entries to {id} objects when no turn images exist", () => {
      const result = normalizeLogNutritionIncidentChanges(
        { ...basePayload, imageRefs: [LLM_UUID, { id: ATTACHMENT_ID }] },
        ctx(),
      ) as Record<string, unknown>;

      expect(result.imageRefs).toEqual([{ id: LLM_UUID }, { id: ATTACHMENT_ID }]);
    });

    it("leaves non-UUID string entries alone (validation catches them)", () => {
      const result = normalizeLogNutritionIncidentChanges(
        { ...basePayload, imageRefs: ["not-a-uuid"] },
        ctx(),
      ) as Record<string, unknown>;

      expect(result.imageRefs).toEqual(["not-a-uuid"]);
    });

    it("replaces imageRefs entirely with trusted attachment ids when turn images exist", () => {
      const result = normalizeLogNutritionIncidentChanges(
        { ...basePayload, imageRefs: [LLM_UUID] },
        ctx({ imageAttachmentIds: [ATTACHMENT_ID, SECOND_ATTACHMENT_ID] }),
      ) as Record<string, unknown>;

      expect(result.imageRefs).toEqual([
        { id: ATTACHMENT_ID },
        { id: SECOND_ATTACHMENT_ID },
      ]);
    });

    it("caps trusted-stamped imageRefs at 5", () => {
      const ids = Array.from(
        { length: 7 },
        (_, index) => `aa345678-90ab-4cde-8f01-23456789000${index}`,
      );
      const result = normalizeLogNutritionIncidentChanges(
        { ...basePayload },
        ctx({ imageAttachmentIds: ids }),
      ) as Record<string, unknown>;

      expect(result.imageRefs).toEqual(ids.slice(0, 5).map((id) => ({ id })));
    });

    it("leaves a missing imageRefs key absent when no turn images exist", () => {
      const result = normalizeLogNutritionIncidentChanges(
        { ...basePayload },
        ctx(),
      ) as Record<string, unknown>;

      expect("imageRefs" in result).toBe(false);
    });
  });

  describe("provenance.source", () => {
    it("stamps vision_llm_estimate for an unknown source when images are present (live regression: image_estimate)", () => {
      const result = normalizeLogNutritionIncidentChanges(
        { ...basePayload, provenance: { source: "image_estimate" } },
        ctx({ imageAttachmentIds: [ATTACHMENT_ID] }),
      ) as { provenance: { source: string } };

      expect(result.provenance.source).toBe("vision_llm_estimate");
    });

    it("stamps text_estimate for an unknown source when no images are present", () => {
      const result = normalizeLogNutritionIncidentChanges(
        { ...basePayload, provenance: { source: "made_up_source" } },
        ctx(),
      ) as { provenance: { source: string } };

      expect(result.provenance.source).toBe("text_estimate");
    });

    it("stamps a missing provenance object from turn state", () => {
      const { provenance: _omitted, ...withoutProvenance } = basePayload;
      const result = normalizeLogNutritionIncidentChanges(
        withoutProvenance,
        ctx({ imageAttachmentIds: [ATTACHMENT_ID] }),
      ) as { provenance: { source: string } };

      expect(result.provenance).toEqual({ source: "vision_llm_estimate" });
    });

    it("coerces food_photo_analysis and dev_stub to vision_llm_estimate when images are present", () => {
      for (const source of ["food_photo_analysis", "dev_stub"]) {
        const result = normalizeLogNutritionIncidentChanges(
          { ...basePayload, provenance: { source } },
          ctx({ imageAttachmentIds: [ATTACHMENT_ID] }),
        ) as { provenance: { source: string } };

        expect(result.provenance.source).toBe("vision_llm_estimate");
      }
    });

    it("leaves food_photo_analysis alone when no images are present", () => {
      const result = normalizeLogNutritionIncidentChanges(
        { ...basePayload, provenance: { source: "food_photo_analysis" } },
        ctx(),
      ) as { provenance: { source: string } };

      expect(result.provenance.source).toBe("food_photo_analysis");
    });

    it("leaves valid non-photo sources alone even when images are present", () => {
      for (const source of ["user_manual", "text_estimate", "recipe_recommendation"]) {
        const result = normalizeLogNutritionIncidentChanges(
          { ...basePayload, provenance: { source, providerId: "rec-1" } },
          ctx({ imageAttachmentIds: [ATTACHMENT_ID] }),
        ) as { provenance: { source: string; providerId: string } };

        expect(result.provenance.source).toBe(source);
        expect(result.provenance.providerId).toBe("rec-1");
      }
    });

    it("preserves sibling provenance fields when coercing the source", () => {
      const result = normalizeLogNutritionIncidentChanges(
        { ...basePayload, provenance: { source: "image_estimate", providerId: "vision-1" } },
        ctx({ imageAttachmentIds: [ATTACHMENT_ID] }),
      ) as { provenance: { source: string; providerId: string } };

      expect(result.provenance).toEqual({ source: "vision_llm_estimate", providerId: "vision-1" });
    });
  });

  describe("incidentDateTime", () => {
    it("stamps nowIso for a hallucinated past date (live regression: 2023-10-05)", () => {
      const result = normalizeLogNutritionIncidentChanges(
        { ...basePayload, incidentDateTime: "2023-10-05T08:00:00.000Z" },
        ctx(),
      ) as { incidentDateTime: string };

      expect(result.incidentDateTime).toBe(NOW_ISO);
    });

    it("stamps nowIso for missing, unparseable, and date-only values", () => {
      for (const value of [undefined, 123, "not-a-date", "2026-06-12"]) {
        const result = normalizeLogNutritionIncidentChanges(
          { ...basePayload, incidentDateTime: value },
          ctx(),
        ) as { incidentDateTime: string };

        expect(result.incidentDateTime).toBe(NOW_ISO);
      }
    });

    it("stamps nowIso for a datetime more than 12 hours in the future", () => {
      const result = normalizeLogNutritionIncidentChanges(
        { ...basePayload, incidentDateTime: "2026-06-13T11:00:00.000Z" },
        ctx(),
      ) as { incidentDateTime: string };

      expect(result.incidentDateTime).toBe(NOW_ISO);
    });

    it("keeps a datetime inside the [now − 7d, now + 12h] window", () => {
      for (const value of [
        "2026-06-10T08:00:00.000Z", // 2 days ago
        "2026-06-05T10:00:00.000Z", // exactly 7 days ago (boundary)
        "2026-06-12T20:00:00.000Z", // 10 hours ahead
      ]) {
        const result = normalizeLogNutritionIncidentChanges(
          { ...basePayload, incidentDateTime: value },
          ctx(),
        ) as { incidentDateTime: string };

        expect(result.incidentDateTime).toBe(value);
      }
    });
  });

  it("never touches items, calories, macros, or confidence", () => {
    const result = normalizeLogNutritionIncidentChanges(
      {
        ...basePayload,
        incidentDateTime: "2023-10-05T08:00:00.000Z",
        provenance: { source: "image_estimate" },
        imageRefs: [LLM_UUID],
      },
      ctx({ imageAttachmentIds: [ATTACHMENT_ID] }),
    ) as Record<string, unknown>;

    expect(result.items).toEqual(basePayload.items);
    expect(result.estimatedCalories).toBe(basePayload.estimatedCalories);
    expect(result.estimatedMacros).toEqual(basePayload.estimatedMacros);
    expect(result.confidence).toBe(basePayload.confidence);
  });

  it("round-trip: the exact live failure payload normalizes into a schema-valid payload", () => {
    // Live evidence: provenance.source "image_estimate" (not in enum), imageRefs as
    // UUID strings (schema wants objects), hallucinated 2023 incidentDateTime.
    const normalized = normalizeLogNutritionIncidentChanges(
      {
        ...basePayload,
        incidentDateTime: "2023-10-05T08:00:00.000Z",
        provenance: { source: "image_estimate" },
        imageRefs: [LLM_UUID],
      },
      ctx({ imageAttachmentIds: [ATTACHMENT_ID] }),
    );

    const parsed = logNutritionIncidentProposalPayloadSchema.safeParse(normalized);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.imageRefs).toEqual([{ id: ATTACHMENT_ID }]);
      expect(parsed.data.provenance.source).toBe("vision_llm_estimate");
      expect(parsed.data.incidentDateTime).toBe(NOW_ISO);
    }
  });
});
