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
 * The domain step additionally has a PER-TURN builder (`buildDomainStepWireSchema`):
 * when every allowed proposal intent of the turn has a typed LLM emission schema
 * (packages/types/src/llm-emission), the builder returns a fully strict schema whose
 * candidateProposals items are an anyOf of per-intent envelopes and whose tool_request
 * variants enumerate the read-only tool input shapes. Otherwise it gracefully falls
 * back to the permissive strict:false shape — no behavior cliff.
 *
 * Unit tests in openai-wire-schemas.spec.ts verify that a valid sample that satisfies
 * each wire schema also passes the corresponding Zod contract — keeping the schemas
 * in sync.
 */

import {
  buildLlmCandidateEnvelopeSchema,
  hasLlmEmissionSchemaForIntent,
  type LlmEmissionCoveredIntent,
} from "@health/types";
import { toOpenAiStrictJsonSchema } from "./openai-json-schema.js";

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
function nullableBoolean(): JsonSchema {
  return { type: ["boolean", "null"] };
}

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

/**
 * agentToolNameSchema enum values — mirrors agentToolNameSchema in
 * packages/types/src/agent-context.ts (read-only context tools only).
 */
const AGENT_TOOL_NAME_VALUES = [
  "getUserContextSlice",
  "getWeeklyProgressContext",
  "searchExerciseCatalog",
  "searchRecipeCatalog",
  "getActivePlanDetail",
  "getRecentAdherence",
] as const;

type AgentToolNameValue = (typeof AGENT_TOOL_NAME_VALUES)[number];

const agentToolNameSchema: JsonSchema = {
  type: "string",
  enum: [...AGENT_TOOL_NAME_VALUES],
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

/** Domain answer with caller-supplied candidateProposals item schema. */
function buildDomainAnswerWireSchema(candidateItemSchema: JsonSchema): JsonSchema {
  return strictObject(
    {
      kind: { type: "string", enum: ["domain_answer"] },
      domain: routerDomainSchema,
      summary: { type: "string" },
      candidateProposals: arrayOf(candidateItemSchema),
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
}

const domainAnswerWireSchema: JsonSchema = buildDomainAnswerWireSchema({
  type: "object",
  additionalProperties: true, // untyped records; Zod validates per-intent
});

/**
 * Wire schema for DomainLlmStepOutput (generateDomainStep response).
 *
 * OpenAI's json_schema response_format requires the ROOT schema to be
 * `type: "object"` (even with strict:false), so the tool_request/domain_answer
 * union is wrapped in a single required `result` key. The provider unwraps
 * `payload.result` before shape validation and Zod parse.
 */
export const domainLlmStepWireSchema: JsonSchema = {
  type: "object",
  properties: {
    result: { anyOf: [toolRequestWireSchema, domainAnswerWireSchema] },
  },
  required: ["result"],
  additionalProperties: false,
};

// ---------------------------------------------------------------------------
// Per-turn strict domain step wire schema (typed candidateProposals)
// ---------------------------------------------------------------------------
//
// tool_request decision: in the STRICT schema the open-ended `input` object is
// not allowed (additionalProperties:true is rejected), so the six read-only
// tool input shapes are enumerated as one strict variant per tool — the small
// input contracts from packages/types/src/agent-context.ts, with optional
// fields as nullable-required. The permissive open-ended `input` survives only
// in the strict:false fallback schema above.

/**
 * Strict per-tool input wire shapes. Optional Zod fields appear as
 * nullable-required; stripExplicitNulls turns null into "absent" before the
 * per-tool Zod input parse in AgentToolRegistryService.
 */
const TOOL_INPUT_WIRE_SCHEMAS: Record<AgentToolNameValue, JsonSchema> = {
  getUserContextSlice: strictObject(
    {
      purpose: {
        type: "string",
        enum: [
          "general_chat",
          "daily_checkin",
          "workout_adaptation",
          "nutrition_adaptation",
          "weekly_review",
          "longevity_overview",
          "health_context",
        ],
      },
      depth: nullable({ type: "string", enum: ["small", "medium", "large"] }),
      timeRange: nullable({ type: "string", enum: ["7d", "14d", "30d", "90d", "1y"] }),
      includeRawData: nullableBoolean(),
      includeDocuments: nullableBoolean(),
    },
    ["purpose", "depth", "timeRange", "includeRawData", "includeDocuments"],
  ),
  // Input is ignored by the executor — an empty strict object keeps the wire honest.
  getWeeklyProgressContext: strictObject({}, []),
  searchExerciseCatalog: strictObject(
    {
      query: nullableString(),
      muscle: nullableString(),
      equipment: nullableString(),
      difficulty: nullable({
        type: "string",
        enum: ["beginner", "intermediate", "advanced"],
      }),
      limit: nullableNumber(),
    },
    ["query", "muscle", "equipment", "difficulty", "limit"],
  ),
  searchRecipeCatalog: strictObject(
    {
      mealType: nullableString(),
      tags: nullable(arrayOf({ type: "string" })),
      restrictions: nullable(arrayOf({ type: "string" })),
      limit: nullableNumber(),
    },
    ["mealType", "tags", "restrictions", "limit"],
  ),
  getActivePlanDetail: strictObject(
    { domain: { type: "string", enum: ["workout", "nutrition"] } },
    ["domain"],
  ),
  getRecentAdherence: strictObject(
    { domain: nullable({ type: "string", enum: ["workout", "nutrition", "health"] }) },
    ["domain"],
  ),
};

/** One strict tool_request variant per read-only tool (computed once). */
const STRICT_TOOL_REQUEST_VARIANTS: readonly JsonSchema[] = AGENT_TOOL_NAME_VALUES.map(
  (tool) =>
    strictObject(
      {
        kind: { type: "string", enum: ["tool_request"] },
        tool: { type: "string", enum: [tool] },
        input: TOOL_INPUT_WIRE_SCHEMAS[tool],
        rationale: nullableString(),
      },
      ["kind", "tool", "input", "rationale"],
    ),
);

/** Memo cache keyed by the sorted, deduplicated intent list. */
const domainStepWireSchemaCache = new Map<string, JsonSchema>();

export interface DomainStepWireSchemaResult {
  schema: JsonSchema;
  strict: boolean;
}

/**
 * Build the domain-step wire schema for one turn, from the turn's clamped
 * allowedProposalIntents (SystemPlanner output — the capability catalog floor).
 *
 * strict:true only when the list is non-empty AND every intent has a typed
 * LLM emission schema; the candidateProposals items then become an anyOf of
 * per-intent strict envelopes ({intent, targetDomain, title, reason,
 * proposedChanges}; candidate IDs stay code-assigned and are never emitted).
 *
 * Otherwise returns the existing permissive shape with strict:false — a
 * per-turn graceful fallback with NO behavior change versus the previous
 * always-permissive schema. An empty intent list also falls back: an empty
 * anyOf is invalid JSON schema, and such turns (e.g. health/explainer routes)
 * produce no proposals anyway.
 */
export function buildDomainStepWireSchema(
  allowedProposalIntents: readonly string[],
): DomainStepWireSchemaResult {
  const uniqueIntents = [...new Set(allowedProposalIntents)].sort();
  const coveredIntents: LlmEmissionCoveredIntent[] = [];

  for (const intent of uniqueIntents) {
    if (!hasLlmEmissionSchemaForIntent(intent)) {
      return { schema: domainLlmStepWireSchema, strict: false };
    }

    coveredIntents.push(intent);
  }

  if (coveredIntents.length === 0) {
    return { schema: domainLlmStepWireSchema, strict: false };
  }

  const cacheKey = coveredIntents.join(",");
  const cached = domainStepWireSchemaCache.get(cacheKey);

  if (cached) {
    return { schema: cached, strict: true };
  }

  const envelopeSchemas = coveredIntents.map(
    (intent) =>
      toOpenAiStrictJsonSchema(buildLlmCandidateEnvelopeSchema(intent)) as JsonSchema,
  );

  const candidateItemSchema: JsonSchema =
    envelopeSchemas.length === 1 ? envelopeSchemas[0]! : { anyOf: envelopeSchemas };

  const schema: JsonSchema = {
    type: "object",
    properties: {
      result: {
        anyOf: [
          ...STRICT_TOOL_REQUEST_VARIANTS,
          buildDomainAnswerWireSchema(candidateItemSchema),
        ],
      },
    },
    required: ["result"],
    additionalProperties: false,
  };

  domainStepWireSchemaCache.set(cacheKey, schema);

  return { schema, strict: true };
}

// ---------------------------------------------------------------------------
// Final decision output wire schema
// ---------------------------------------------------------------------------

/**
 * Wire schema for FinalDecisionOutput (generateFinalDecision response).
 *
 * Selection-only design (Slice 2): the decision-maker picks candidate IDs from
 * `selectedProposalIds`; it never writes proposal payload objects.
 * `proposals` is intentionally removed — ActionResolverService resolves IDs to
 * canonical payloads from the domain answers. This structurally prevents the
 * decision-maker from fabricating calorie fields or any domain-owned data.
 */
export const finalDecisionWireSchema: JsonSchema = strictObject(
  {
    reply: { type: "string" },
    selectedAction: nullableString(),
    selectedProposalIds: arrayOf({ type: "string" }),
    consentRequired: { type: "boolean" },
  },
  ["reply", "selectedAction", "selectedProposalIds", "consentRequired"],
);

// ---------------------------------------------------------------------------
// JSON schema name constants
// ---------------------------------------------------------------------------

export const ROUTER_DECISION_SCHEMA_NAME = "router_decision_output" as const;
export const DOMAIN_LLM_STEP_SCHEMA_NAME = "domain_llm_step_output" as const;
export const FINAL_DECISION_SCHEMA_NAME = "final_decision_output" as const;
