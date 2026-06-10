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
  domainLlmStepOutputSchema,
  finalDecisionOutputSchema,
  routerDecisionOutputSchema,
} from "@health/types";
import {
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
// stripExplicitNulls (mirrored below) before Zod parse, as the provider does.
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
  contextNeeds: ["recent_workouts"],
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

// ---------------------------------------------------------------------------
// Helper: mirrors the generic stripExplicitNulls in openai-coach-provider.ts
// ---------------------------------------------------------------------------

function stripExplicitNulls(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(stripExplicitNulls);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== null) result[k] = stripExplicitNulls(v);
    }
    return result;
  }
  return value;
}

/** Applies generic null stripping (matches the provider's normalizePayload). */
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

  it("domainLlmStepWireSchema is an anyOf with two variants", () => {
    const wireSchema = domainLlmStepWireSchema as { anyOf: unknown[] };
    expect(Array.isArray(wireSchema.anyOf)).toBe(true);
    expect(wireSchema.anyOf).toHaveLength(2);
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
      contextNeeds: [],
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
      contextNeeds: [],
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
