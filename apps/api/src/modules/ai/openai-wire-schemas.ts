/**
 * OpenAI strict structured output wire schemas.
 *
 * OpenAI strict mode requires:
 *  - `additionalProperties: false` on every object
 *  - Every object property listed in `required`
 *  - Optional fields represented as `type: ["T", "null"]` nullable-required
 *  - No `.superRefine` constraints (those live in Zod and run as a second-line parse)
 *
 * The authoritative Zod contracts in packages/types remain the source of truth.
 * These wire schemas are intentionally more permissive on some details (e.g. they
 * drop min/max constraints that OpenAI strict mode does not support), but downstream
 * Zod parse catches any violations.
 *
 * Design: manually authored schemas for each of the three provider call types.
 * The domain step schema is hand-rolled because the discriminated union + superRefine
 * in domainLlmStepOutputSchema is not expressible as a strict JSON schema; the calorie-
 * domain restriction is enforced by the Zod parse after the provider returns.
 *
 * Unit tests in openai-wire-schemas.spec.ts verify that a valid sample that satisfies
 * each wire schema also passes the corresponding Zod contract — keeping the schemas
 * in sync.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** An object with additionalProperties:false and all keys required. */
function strictObject(
  properties: Record<string, JsonSchema>,
  requiredKeys: string[],
): JsonSchema {
  return {
    type: "object",
    properties,
    required: requiredKeys,
    additionalProperties: false,
  };
}

/** String-or-null (for nullable optional fields that must still appear in required). */
function nullableString(): JsonSchema {
  return { type: ["string", "null"] };
}

/** Number-or-null */
function nullableNumber(): JsonSchema {
  return { type: ["number", "null"] };
}

/** Boolean-or-null */
// Retained for future use; unused currently.
// function nullableBoolean(): JsonSchema {
//   return { type: ["boolean", "null"] };
// }

/** An array whose items match the given schema. */
function arrayOf(items: JsonSchema): JsonSchema {
  return { type: "array", items };
}

/** A nullable version of any schema. */
function nullable(schema: JsonSchema): JsonSchema {
  if (Array.isArray(schema.type)) {
    return { ...schema, type: [...schema.type, "null"] };
  }
  if (schema.type) {
    return { ...schema, type: [schema.type as string, "null"] };
  }
  // oneOf/anyOf schema — wrap in anyOf
  return { anyOf: [schema, { type: "null" }] };
}

// ---------------------------------------------------------------------------
// Minimal JSON schema type
// ---------------------------------------------------------------------------

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  description?: string;
  default?: unknown;
}

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

/** agentSafetyFlagSchema enum values */
const AGENT_SAFETY_FLAG_VALUES = [
  "pain",
  "fatigue",
  "injury",
  "sleep_issue",
  "heart_condition",
  "hypertension",
  "diabetes",
  "eating_disorder",
  "mental_health",
  "pregnancy",
  "crisis",
  "general_health_concern",
] as const;

const agentSafetyFlagSchema: JsonSchema = {
  type: "string",
  enum: [...AGENT_SAFETY_FLAG_VALUES],
};

const agentToolNameSchema: JsonSchema = {
  type: "string",
  enum: ["getUserContextSlice", "getDocumentContext", "getWeeklyProgressContext"],
};

const routerDomainSchema: JsonSchema = {
  type: "string",
  enum: ["workout", "nutrition", "health"],
};

// ---------------------------------------------------------------------------
// Router decision output wire schema
// ---------------------------------------------------------------------------

/** Wire schema for RouterDecisionOutput (generateRouterDecision response). */
export const routerDecisionWireSchema: JsonSchema = strictObject(
  {
    selectedDomains: arrayOf(
      strictObject(
        {
          domain: routerDomainSchema,
          confidence: { type: "number" },
          intentHints: arrayOf({ type: "string" }),
          toolHints: arrayOf(agentToolNameSchema),
          signalHints: arrayOf({ type: "string" }),
        },
        ["domain", "confidence", "intentHints", "toolHints", "signalHints"],
      ),
    ),
    contextNeeds: arrayOf({ type: "string" }),
    directCommand: nullable(
      strictObject(
        {
          detected: { type: "boolean" },
          kind: nullableString(),
          confidence: nullableNumber(),
        },
        ["detected", "kind", "confidence"],
      ),
    ),
    safetyFlags: arrayOf(agentSafetyFlagSchema),
    confidence: { type: "number" },
  },
  ["selectedDomains", "contextNeeds", "directCommand", "safetyFlags", "confidence"],
);

// ---------------------------------------------------------------------------
// Domain LLM step output wire schema
// ---------------------------------------------------------------------------
//
// The Zod contract is a discriminatedUnion("kind", [tool_request, domain_answer])
// with a superRefine that restricts workoutCalorieEstimate/workoutCaloriePerHourRate
// to the workout domain only. OpenAI strict mode does not support superRefine
// logic. The wire schema accepts both variants; the Zod parse enforces the calorie
// restriction post-receive.
//
// We use anyOf (not oneOf) for OpenAI compatibility per current API constraints.

const toolRequestWireSchema: JsonSchema = strictObject(
  {
    kind: { type: "string", enum: ["tool_request"] },
    tool: agentToolNameSchema,
    input: {
      type: "object",
      additionalProperties: true, // tool input is open-ended
    },
    rationale: nullableString(),
  },
  ["kind", "tool", "input", "rationale"],
);

const domainAnswerWireSchema: JsonSchema = strictObject(
  {
    kind: { type: "string", enum: ["domain_answer"] },
    domain: routerDomainSchema,
    summary: { type: "string" },
    candidateProposals: arrayOf({
      type: "object",
      additionalProperties: true, // untyped records; Zod validates per-intent
    }),
    domainSignals: arrayOf({ type: "string" }),
    workoutCalorieEstimate: nullableNumber(),
    workoutCaloriePerHourRate: nullableNumber(),
  },
  [
    "kind",
    "domain",
    "summary",
    "candidateProposals",
    "domainSignals",
    "workoutCalorieEstimate",
    "workoutCaloriePerHourRate",
  ],
);

/** Wire schema for DomainLlmStepOutput (generateDomainStep response). */
export const domainLlmStepWireSchema: JsonSchema = {
  anyOf: [toolRequestWireSchema, domainAnswerWireSchema],
};

// ---------------------------------------------------------------------------
// Final decision output wire schema
// ---------------------------------------------------------------------------

/** Wire schema for FinalDecisionOutput (generateFinalDecision response). */
export const finalDecisionWireSchema: JsonSchema = strictObject(
  {
    reply: { type: "string" },
    selectedAction: nullableString(),
    proposals: arrayOf({
      type: "object",
      additionalProperties: true, // untyped records; Zod validates per-intent
    }),
    consentRequired: { type: "boolean" },
  },
  ["reply", "selectedAction", "proposals", "consentRequired"],
);

// ---------------------------------------------------------------------------
// JSON schema name constants
// ---------------------------------------------------------------------------

export const ROUTER_DECISION_SCHEMA_NAME = "router_decision_output" as const;
export const DOMAIN_LLM_STEP_SCHEMA_NAME = "domain_llm_step_output" as const;
export const FINAL_DECISION_SCHEMA_NAME = "final_decision_output" as const;
