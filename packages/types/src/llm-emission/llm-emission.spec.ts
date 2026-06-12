/**
 * LLM emission schema construction tests.
 *
 * The emission schemas must stay strict-by-construction so that
 * toOpenAiStrictJsonSchema (apps/api) can convert them to OpenAI strict-mode
 * JSON schemas. Full strict-JSON invariants and emission→canonical round-trip
 * pins live in apps/api (openai-json-schema.spec.ts,
 * llm-emission-roundtrip.spec.ts); this spec covers the packages/types side:
 * registry coverage, envelope shape, and unknown-key rejection.
 */

import { describe, expect, it } from "vitest";
import {
  LLM_EMISSION_COVERED_INTENTS,
  LLM_EMISSION_PAYLOAD_SCHEMAS,
  buildLlmCandidateEnvelopeSchema,
  captureWellbeingCheckinLlmEmissionSchema,
  hasLlmEmissionSchemaForIntent,
  logNutritionIncidentLlmEmissionSchema,
} from "./index.js";

describe("LLM emission registry", () => {
  it("covers exactly the workout + nutrition + wellbeing fan-out intents", () => {
    expect([...LLM_EMISSION_COVERED_INTENTS].sort()).toEqual(
      [
        "adapt_workout_plan",
        "adapt_workout_plan_from_progress",
        "adjust_nutrition_plan",
        "capture_wellbeing_checkin",
        "create_nutrition_plan",
        "create_workout_plan",
        "log_nutrition_incident",
        "log_workout_activity",
        "recommend_recipes",
      ].sort(),
    );
  });

  it("hasLlmEmissionSchemaForIntent rejects uncovered and unknown intents", () => {
    expect(hasLlmEmissionSchemaForIntent("create_workout_plan")).toBe(true);
    expect(hasLlmEmissionSchemaForIntent("update_profile")).toBe(false);
    expect(hasLlmEmissionSchemaForIntent("save_body_analysis")).toBe(false);
    expect(hasLlmEmissionSchemaForIntent("not_a_real_intent")).toBe(false);
  });

  it("every emission payload schema rejects unknown keys (strict objects)", () => {
    for (const intent of LLM_EMISSION_COVERED_INTENTS) {
      const result = LLM_EMISSION_PAYLOAD_SCHEMAS[intent].safeParse({
        unexpectedKey: true,
      });

      expect(result.success, `intent ${intent}`).toBe(false);
    }
  });
});

describe("buildLlmCandidateEnvelopeSchema", () => {
  it("pins the envelope to the intent literal and rejects other intents", () => {
    const envelope = buildLlmCandidateEnvelopeSchema("capture_wellbeing_checkin");
    const payload = {
      date: "2026-06-12",
      moodScore: 3,
      stressScore: 3,
      energyLevel: null,
      note: null,
      tags: [],
    };

    expect(
      envelope.safeParse({
        intent: "capture_wellbeing_checkin",
        targetDomain: "general",
        title: "Wellbeing check-in",
        reason: "User reported low mood",
        proposedChanges: payload,
      }).success,
    ).toBe(true);

    expect(
      envelope.safeParse({
        intent: "create_workout_plan",
        targetDomain: "general",
        title: "Wellbeing check-in",
        reason: "User reported low mood",
        proposedChanges: payload,
      }).success,
    ).toBe(false);
  });

  it("rejects an LLM-invented candidate id (ids are code-assigned)", () => {
    const envelope = buildLlmCandidateEnvelopeSchema("log_nutrition_incident");
    const proposedChanges = logNutritionIncidentLlmEmissionSchema.parse({
      items: [
        {
          name: "Apple",
          quantity: "1",
          calories: 80,
          proteinGrams: 0,
          carbsGrams: 21,
          fatGrams: 0,
        },
      ],
      estimatedCalories: 80,
      estimatedMacros: { proteinGrams: 0, carbsGrams: 21, fatGrams: 0 },
      confidence: "high",
      mealContextLabel: null,
    });

    expect(
      envelope.safeParse({
        id: "cand_nutrition_0",
        intent: "log_nutrition_incident",
        targetDomain: "nutrition",
        title: "Log meal",
        reason: "User reported a meal",
        proposedChanges,
      }).success,
    ).toBe(false);
  });
});

describe("server-owned fields stay un-emittable", () => {
  it("log_nutrition_incident emission rejects incidentDateTime/provenance/imageRefs", () => {
    const base = {
      items: [
        { name: "Apple", quantity: null, calories: null, proteinGrams: null, carbsGrams: null, fatGrams: null },
      ],
      estimatedCalories: 80,
      estimatedMacros: { proteinGrams: 0, carbsGrams: 21, fatGrams: 0 },
      confidence: "high",
      mealContextLabel: null,
    };

    expect(logNutritionIncidentLlmEmissionSchema.safeParse(base).success).toBe(true);

    for (const serverOwnedField of ["incidentDateTime", "provenance", "imageRefs"]) {
      const result = logNutritionIncidentLlmEmissionSchema.safeParse({
        ...base,
        [serverOwnedField]: serverOwnedField === "imageRefs" ? [] : "anything",
      });

      expect(result.success, serverOwnedField).toBe(false);
    }
  });

  it("capture_wellbeing_checkin emission rejects safetyFlags", () => {
    const result = captureWellbeingCheckinLlmEmissionSchema.safeParse({
      date: "2026-06-12",
      moodScore: 3,
      stressScore: 3,
      energyLevel: null,
      note: null,
      tags: [],
      safetyFlags: ["keyword_match"],
    });

    expect(result.success).toBe(false);
  });
});
