/**
 * Wire schema sync tests.
 *
 * Verifies that the OpenAI strict-mode wire schemas (openai-wire-schemas.ts)
 * stay in sync with the authoritative Zod contracts in packages/types.
 *
 * Strategy: create a sample payload that satisfies each wire schema, then
 * confirm it also passes the corresponding Zod contract. This is a structural
 * coupling test — if either schema changes incompatibly the test will catch it
 * before the divergence reaches production.
 *
 * Note: the wire schemas are more permissive on some details (no min/max
 * constraints, nullable calorie fields) because OpenAI strict mode has
 * restrictions. The Zod contracts are the source of truth for semantic
 * validation. This test also covers `stripExplicitNulls` behavior indirectly
 * (null → undefined conversion for all nullable-required wire fields).
 */

import { describe, expect, it } from "vitest";
import {
  LLM_EMISSION_COVERED_INTENTS,
  agentToolNameSchema,
  contextDepthSchema,
  contextSlicePurposeSchema,
  contextTimeRangeSchema,
  domainLlmStepOutputSchema,
  finalDecisionOutputSchema,
  getActivePlanDetailInputSchema,
  getRecentAdherenceInputSchema,
  routerDecisionOutputSchema,
  searchExerciseCatalogInputSchema,
} from "@health/types";
import { stripExplicitNulls } from "./openai-http.js";
import {
  buildDomainStepWireSchema,
  domainLlmStepWireSchema,
  finalDecisionWireSchema,
  routerDecisionWireSchema,
  ROUTER_DECISION_SCHEMA_NAME,
  DOMAIN_LLM_STEP_SCHEMA_NAME,
  FINAL_DECISION_SCHEMA_NAME,
} from "./openai-wire-schemas.js";

// ---------------------------------------------------------------------------
// Minimal valid samples — must satisfy both wire schema AND Zod contract.
// For nullable-required wire fields: use null (wire schema value), then apply
// the shared stripExplicitNulls before Zod parse, as the provider does.
// ---------------------------------------------------------------------------

const validRouterSample = {
  selectedDomains: [
    {
      domain: "workout",
      confidence: 0.85,
      intentHints: ["adjust plan"],
      toolHints: [],
      signalHints: ["fatigue"],
    },
  ],
  // directCommand is optional (undefined) in Zod; omit to keep sample valid
  safetyFlags: ["fatigue"],
  confidence: 0.85,
};

const validDomainAnswerSample = {
  kind: "domain_answer" as const,
  domain: "workout" as const,
  summary: "Adjusting your workout plan.",
  candidateProposals: [],
  domainSignals: ["workout_flagged"],
  workoutCalorieEstimate: null, // null from wire schema → stripped to undefined before Zod
  workoutCaloriePerHourRate: null,
};

const validToolRequestSample = {
  kind: "tool_request" as const,
  tool: "getUserContextSlice",
  input: { purpose: "workout_adaptation" },
  // rationale is optional (undefined) in Zod; omit to keep sample valid
};

const validFinalDecisionSample = {
  reply: "Here is your updated coaching plan.",
  selectedAction: null,
  selectedProposalIds: [],
  consentRequired: false,
};

/** Applies the providers' shared null stripping before the Zod parse. */
function normalizeForZod(payload: Record<string, unknown>): unknown {
  return stripExplicitNulls(payload);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("openai-wire-schemas — sync with Zod contracts", () => {
  it("router decision wire schema name constant is a non-empty string", () => {
    expect(typeof ROUTER_DECISION_SCHEMA_NAME).toBe("string");
    expect(ROUTER_DECISION_SCHEMA_NAME.length).toBeGreaterThan(0);
  });

  it("domain LLM step wire schema name constant is a non-empty string", () => {
    expect(typeof DOMAIN_LLM_STEP_SCHEMA_NAME).toBe("string");
    expect(DOMAIN_LLM_STEP_SCHEMA_NAME.length).toBeGreaterThan(0);
  });

  it("final decision wire schema name constant is a non-empty string", () => {
    expect(typeof FINAL_DECISION_SCHEMA_NAME).toBe("string");
    expect(FINAL_DECISION_SCHEMA_NAME.length).toBeGreaterThan(0);
  });

  it("routerDecisionWireSchema is an object with required fields", () => {
    expect(routerDecisionWireSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    const required = (routerDecisionWireSchema as { required: string[] }).required;
    expect(required).toContain("selectedDomains");
    expect(required).toContain("confidence");
    expect(required).toContain("safetyFlags");
  });

  it("valid router sample passes Zod routerDecisionOutputSchema", () => {
    const result = routerDecisionOutputSchema.safeParse(validRouterSample);
    expect(result.success).toBe(true);
  });

  it("routerDecisionOutputSchema rejects payload missing 'confidence'", () => {
    const { confidence: _omit, ...withoutConfidence } = validRouterSample;
    const result = routerDecisionOutputSchema.safeParse(withoutConfidence);
    expect(result.success).toBe(false);
  });

  it("valid domain_answer (after null→undefined normalization) passes Zod domainLlmStepOutputSchema", () => {
    const normalized = normalizeForZod(validDomainAnswerSample as Record<string, unknown>);
    const result = domainLlmStepOutputSchema.safeParse(normalized);
    expect(result.success).toBe(true);
  });

  it("valid tool_request passes Zod domainLlmStepOutputSchema", () => {
    const normalized = normalizeForZod(validToolRequestSample as Record<string, unknown>);
    const result = domainLlmStepOutputSchema.safeParse(normalized);
    expect(result.success).toBe(true);
  });

  it("domain_answer with null calorie fields (before normalization) fails Zod parse — normalization is required", () => {
    // Confirms that the null→undefined step is load-bearing.
    const result = domainLlmStepOutputSchema.safeParse(validDomainAnswerSample);
    // null is not accepted by .optional() fields in Zod 4
    expect(result.success).toBe(false);
  });

  it("domainLlmStepWireSchema has a type:object root wrapping the two-variant union in `result` (OpenAI requires an object root)", () => {
    const wireSchema = domainLlmStepWireSchema as {
      type: string;
      required: string[];
      properties: { result: { anyOf: unknown[] } };
    };
    expect(wireSchema.type).toBe("object");
    expect(wireSchema.required).toEqual(["result"]);
    expect(Array.isArray(wireSchema.properties.result.anyOf)).toBe(true);
    expect(wireSchema.properties.result.anyOf).toHaveLength(2);
  });

  it("valid final decision sample passes Zod finalDecisionOutputSchema", () => {
    const result = finalDecisionOutputSchema.safeParse(validFinalDecisionSample);
    expect(result.success).toBe(true);
  });

  it("finalDecisionWireSchema is an object with required fields (Slice 2: selectedProposalIds replaces proposals)", () => {
    const wireSchema = finalDecisionWireSchema as {
      type: string;
      required: string[];
      additionalProperties: boolean;
    };
    expect(wireSchema.type).toBe("object");
    expect(wireSchema.additionalProperties).toBe(false);
    expect(wireSchema.required).toContain("reply");
    expect(wireSchema.required).toContain("selectedAction");
    expect(wireSchema.required).toContain("selectedProposalIds");
    expect(wireSchema.required).toContain("consentRequired");
    // proposals must NOT be present — decision-maker uses selection-by-ID only
    expect(wireSchema.required).not.toContain("proposals");
  });

  it("finalDecisionOutputSchema rejects payload missing 'reply'", () => {
    const { reply: _omit, ...withoutReply } = validFinalDecisionSample;
    const result = finalDecisionOutputSchema.safeParse(withoutReply);
    expect(result.success).toBe(false);
  });

  it("non-workout domain_answer with workoutCalorieEstimate fails Zod parse even after normalization — calorie restriction enforced", () => {
    const nutritionAnswer = {
      kind: "domain_answer" as const,
      domain: "nutrition" as const,
      summary: "Here is nutrition advice.",
      candidateProposals: [],
      domainSignals: [],
      workoutCalorieEstimate: 300, // NOT null — explicitly set on wrong domain
    };
    const result = domainLlmStepOutputSchema.safeParse(nutritionAnswer);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stripExplicitNulls — null-stripping edge cases (Finding 1 regression guard)
// ---------------------------------------------------------------------------

describe("stripExplicitNulls — null-stripping edge cases", () => {
  it("router directCommand: null strips to absent — confidence field also stripped when null", () => {
    // Wire schema emits directCommand: { detected: true, kind: null, confidence: null }.
    // After stripping, directCommand.kind and .confidence are absent; routerDirectCommandSchema.optional()
    // accepts the stripped object (detected: true only).
    const withNullDirectCommand = {
      selectedDomains: [
        {
          domain: "workout",
          confidence: 0.8,
          intentHints: [],
          toolHints: [],
          signalHints: [],
        },
      ],
      directCommand: { detected: true, kind: null, confidence: null },
      safetyFlags: [],
      confidence: 0.8,
    };

    const normalized = normalizeForZod(withNullDirectCommand as Record<string, unknown>);
    const result = routerDecisionOutputSchema.safeParse(normalized);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.directCommand).toBeDefined();
      expect(result.data.directCommand?.detected).toBe(true);
      // confidence is optional in the Zod schema; stripped null → absent → undefined
      expect(result.data.directCommand?.confidence).toBeUndefined();
    }
  });

  it("router payload with directCommand: null (entire field null) strips the field entirely", () => {
    const withNullDirectCommandField = {
      selectedDomains: [],
      directCommand: null,
      safetyFlags: [],
      confidence: 0.5,
    };

    const normalized = normalizeForZod(withNullDirectCommandField as Record<string, unknown>);
    const result = routerDecisionOutputSchema.safeParse(normalized);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.directCommand).toBeUndefined();
    }
  });

  it("tool_request with rationale: null strips rationale — Zod parse succeeds", () => {
    // Wire schema has rationale as nullable-required; Zod expects optional (undefined).
    const withNullRationale = {
      kind: "tool_request" as const,
      tool: "getUserContextSlice",
      input: { purpose: "workout_adaptation" },
      rationale: null,
    };

    const normalized = normalizeForZod(withNullRationale as Record<string, unknown>);
    const result = domainLlmStepOutputSchema.safeParse(normalized);
    expect(result.success).toBe(true);
  });

  it("non-workout domain_answer with null calorie fields (not numeric) parses via union branch", () => {
    // nutrition domain_answer with workoutCalorieEstimate: null — null is stripped → field absent.
    // The Zod superRefine only rejects non-null numeric calorie fields on non-workout domains.
    const nutritionAnswerWithNullCalories = {
      kind: "domain_answer" as const,
      domain: "nutrition" as const,
      summary: "Nutrition plan adjusted.",
      candidateProposals: [],
      domainSignals: [],
      workoutCalorieEstimate: null,
      workoutCaloriePerHourRate: null,
    };

    const normalized = normalizeForZod(nutritionAnswerWithNullCalories as Record<string, unknown>);
    const result = domainLlmStepOutputSchema.safeParse(normalized);
    expect(result.success).toBe(true);
  });

  it("buildDomainStepWireSchema strict tool_request sample (after null stripping) passes Zod domainLlmStepOutputSchema", () => {
    const strictToolRequest = {
      kind: "tool_request" as const,
      tool: "getActivePlanDetail",
      input: { domain: "workout" },
      rationale: null,
    };

    const normalized = normalizeForZod(strictToolRequest as Record<string, unknown>);
    const result = domainLlmStepOutputSchema.safeParse(normalized);
    expect(result.success).toBe(true);
  });

  it("final-decision selectedAction: null survives stripping (Zod default re-applies null)", () => {
    // selectedAction is .nullable().default(null): stripping null gives undefined → default kicks in.
    // The final result should be null (not undefined, not missing).
    const withNullSelectedAction = {
      reply: "Here is your plan.",
      selectedAction: null,
      selectedProposalIds: [],
      consentRequired: false,
    };

    const normalized = normalizeForZod(withNullSelectedAction as Record<string, unknown>);
    const result = finalDecisionOutputSchema.safeParse(normalized);
    expect(result.success).toBe(true);

    if (result.success) {
      // The default re-applies null after stripping → selectedAction must be null.
      expect(result.data.selectedAction).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// buildDomainStepWireSchema — per-turn strict schema with graceful fallback
// ---------------------------------------------------------------------------

const WORKOUT_DOMAIN_INTENTS = [
  "create_workout_plan",
  "adapt_workout_plan",
  "adapt_workout_plan_from_progress",
  "log_workout_activity",
] as const;

const NUTRITION_DOMAIN_INTENTS = [
  "create_nutrition_plan",
  "adjust_nutrition_plan",
  "recommend_recipes",
  "log_nutrition_incident",
] as const;

/** Recursively assert no node allows additional properties or open objects. */
function assertNoOpenObjects(node: unknown, path: string): void {
  if (node === null || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((entry, index) => assertNoOpenObjects(entry, `${path}[${index}]`));
    return;
  }

  const record = node as Record<string, unknown>;

  if (record["type"] === "object" || "properties" in record) {
    expect(record["additionalProperties"], `additionalProperties at ${path}`).toBe(false);
    expect(
      [...((record["required"] as string[]) ?? [])].sort(),
      `required==keys at ${path}`,
    ).toEqual(Object.keys((record["properties"] as Record<string, unknown>) ?? {}).sort());
  }

  for (const [key, value] of Object.entries(record)) {
    assertNoOpenObjects(value, `${path}/${key}`);
  }
}

describe("buildDomainStepWireSchema", () => {
  it("returns strict:true when every allowed intent is covered (workout domain set)", () => {
    const { schema, strict } = buildDomainStepWireSchema(WORKOUT_DOMAIN_INTENTS);

    expect(strict).toBe(true);
    expect(schema).not.toBe(domainLlmStepWireSchema);
    assertNoOpenObjects(schema, "#");
  });

  it("returns strict:true for the nutrition domain set", () => {
    const { strict } = buildDomainStepWireSchema(NUTRITION_DOMAIN_INTENTS);
    expect(strict).toBe(true);
  });

  it("returns strict:true for every covered intent on its own", () => {
    for (const intent of LLM_EMISSION_COVERED_INTENTS) {
      const { strict } = buildDomainStepWireSchema([intent]);
      expect(strict, `intent ${intent}`).toBe(true);
    }
  });

  it("strict schema enumerates one tool_request variant per read-only tool plus the domain answer", () => {
    const { schema } = buildDomainStepWireSchema(["adapt_workout_plan"]);
    const result = (schema as { properties: { result: { anyOf: Array<Record<string, unknown>> } } })
      .properties.result;

    // One tool_request variant per agentToolNameSchema tool + 1 domain_answer variant.
    // Drift guard: derived from the Zod source so a tool rename/add/remove fails here.
    expect(result.anyOf).toHaveLength(agentToolNameSchema.options.length + 1);

    const toolEnums = result.anyOf
      .map((variant) => (variant["properties"] as Record<string, { enum?: string[] }>)["tool"]?.enum?.[0])
      .filter((tool): tool is string => tool !== undefined);

    expect(toolEnums.sort()).toEqual([...agentToolNameSchema.options].sort());
  });

  it("strict tool-input enums mirror the Zod enum sources in packages/types agent-context", () => {
    const { schema } = buildDomainStepWireSchema(["adapt_workout_plan"]);
    const result = (schema as { properties: { result: { anyOf: Array<Record<string, unknown>> } } })
      .properties.result;

    const inputPropertiesFor = (tool: string): Record<string, { enum?: string[] }> => {
      const variant = result.anyOf.find(
        (entry) =>
          (entry["properties"] as Record<string, { enum?: string[] }>)["tool"]?.enum?.[0] === tool,
      ) as { properties: { input: { properties: Record<string, { enum?: string[] }> } } };

      return variant.properties.input.properties;
    };

    const userContextSliceInput = inputPropertiesFor("getUserContextSlice");
    expect(userContextSliceInput["purpose"]?.enum).toEqual([...contextSlicePurposeSchema.options]);
    expect(userContextSliceInput["depth"]?.enum).toEqual([...contextDepthSchema.options]);
    expect(userContextSliceInput["timeRange"]?.enum).toEqual([...contextTimeRangeSchema.options]);

    const exerciseCatalogInput = inputPropertiesFor("searchExerciseCatalog");
    expect(exerciseCatalogInput["difficulty"]?.enum).toEqual([
      ...searchExerciseCatalogInputSchema.shape.difficulty.unwrap().options,
    ]);

    const activePlanDetailInput = inputPropertiesFor("getActivePlanDetail");
    expect(activePlanDetailInput["domain"]?.enum).toEqual([
      ...getActivePlanDetailInputSchema.shape.domain.options,
    ]);

    const recentAdherenceInput = inputPropertiesFor("getRecentAdherence");
    expect(recentAdherenceInput["domain"]?.enum).toEqual([
      ...getRecentAdherenceInputSchema.shape.domain.unwrap().options,
    ]);
  });

  it("strict candidateProposals items are the per-intent envelope (single intent) with code-owned id absent", () => {
    const { schema } = buildDomainStepWireSchema(["adapt_workout_plan"]);
    const result = (schema as { properties: { result: { anyOf: Array<Record<string, unknown>> } } })
      .properties.result;
    const domainAnswer = result.anyOf.find(
      (variant) =>
        (variant["properties"] as Record<string, { enum?: string[] }>)["kind"]?.enum?.[0] ===
        "domain_answer",
    ) as { properties: { candidateProposals: { items: Record<string, unknown> } } };

    const envelope = domainAnswer.properties.candidateProposals.items;
    const envelopeProperties = envelope["properties"] as Record<string, { enum?: unknown[] }>;

    expect(Object.keys(envelopeProperties).sort()).toEqual(
      ["intent", "proposedChanges", "reason", "targetDomain", "title"].sort(),
    );
    // No `id` — candidate ids (cand_<domain>_<index>) are assigned in code.
    expect("id" in envelopeProperties).toBe(false);
    expect(envelopeProperties["intent"]?.enum).toEqual(["adapt_workout_plan"]);
  });

  it("multiple covered intents produce an anyOf of envelopes", () => {
    const { schema } = buildDomainStepWireSchema(["create_workout_plan", "log_workout_activity"]);
    const result = (schema as { properties: { result: { anyOf: Array<Record<string, unknown>> } } })
      .properties.result;
    const domainAnswer = result.anyOf.find(
      (variant) =>
        (variant["properties"] as Record<string, { enum?: string[] }>)["kind"]?.enum?.[0] ===
        "domain_answer",
    ) as { properties: { candidateProposals: { items: { anyOf: Array<Record<string, unknown>> } } } };

    expect(domainAnswer.properties.candidateProposals.items.anyOf).toHaveLength(2);
  });

  it("falls back to the permissive strict:false schema when any intent is uncovered", () => {
    const { schema, strict } = buildDomainStepWireSchema([
      "adapt_workout_plan",
      "update_profile", // uncovered
    ]);

    expect(strict).toBe(false);
    expect(schema).toBe(domainLlmStepWireSchema);
  });

  it("falls back to the permissive strict:false schema for an empty intent list", () => {
    const { schema, strict } = buildDomainStepWireSchema([]);

    expect(strict).toBe(false);
    expect(schema).toBe(domainLlmStepWireSchema);
  });

  it("memoizes by intent set (order- and duplicate-insensitive)", () => {
    const first = buildDomainStepWireSchema(["adapt_workout_plan", "create_workout_plan"]);
    const second = buildDomainStepWireSchema([
      "create_workout_plan",
      "adapt_workout_plan",
      "create_workout_plan",
    ]);

    expect(second.schema).toBe(first.schema);
  });

  it("an emission-shaped domain_answer with a candidate (after null stripping) passes Zod domainLlmStepOutputSchema", () => {
    const emissionShapedAnswer = {
      kind: "domain_answer",
      domain: "workout",
      summary: "Plan drafted.",
      candidateProposals: [
        {
          intent: "create_workout_plan",
          targetDomain: "workout",
          title: "3-Day Strength Plan",
          reason: "User requested a plan",
          proposedChanges: {
            title: "3-Day Strength Plan",
            summary: "Strength program",
            days: [
              {
                weekday: "monday",
                focus: "Push",
                exercises: [
                  { name: "Bench Press", target: null, sets: 4, reps: "8-10", notes: null },
                ],
              },
            ],
            notes: [],
            displayContract: null,
          },
        },
      ],
      domainSignals: [],
      workoutCalorieEstimate: null,
      workoutCaloriePerHourRate: null,
    };

    const normalized = normalizeForZod(emissionShapedAnswer as Record<string, unknown>);
    const result = domainLlmStepOutputSchema.safeParse(normalized);
    expect(result.success).toBe(true);
  });
});
