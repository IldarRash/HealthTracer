import { BIOMARKER_KEYS } from "@health/types";

/**
 * OpenAI strict structured-output wire schema for the lab-extraction stage.
 *
 * OpenAI strict mode requires:
 *  - `additionalProperties: false` on every object
 *  - every object property listed in `required`
 *  - nullable fields represented as nullable-required (`type: ["T", "null"]`)
 *
 * The authoritative Zod contract is `labExtractionOutputSchema` in
 * `@health/types` — deliberately authored as nullable-required end-to-end so a
 * strict-mode payload parses without any null-stripping normalization (unlike
 * the chat wire schemas, whose Zod contracts use `.optional()`).
 *
 * `biomarkerKey` is a CLOSED enum built from BIOMARKER_KEYS (single source of
 * truth) — the model structurally cannot return a free-text marker name;
 * unmappable markers surface only as `unmappedMarkerCount`.
 *
 * The small helpers below mirror the private helpers in
 * `../ai/openai-wire-schemas.ts`; that file belongs to the chat fan-out
 * pipeline, which this out-of-band module must not modify, so the few lines
 * are duplicated locally on purpose.
 */

interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  maxItems?: number;
  enum?: unknown[];
}

/** An object with additionalProperties:false and all keys required. */
function strictObject(properties: Record<string, JsonSchema>): JsonSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function nullableString(): JsonSchema {
  return { type: ["string", "null"] };
}

function nullableNumber(): JsonSchema {
  return { type: ["number", "null"] };
}

export const LAB_EXTRACTION_SCHEMA_NAME = "lab_extraction_output" as const;

/** Maximum readings per extraction — mirrors labExtractionOutputSchema's .max(80). */
export const MAX_EXTRACTED_READINGS = 80 as const;

const extractedReadingWireSchema: JsonSchema = strictObject({
  biomarkerKey: { type: "string", enum: [...BIOMARKER_KEYS] },
  valueNumeric: nullableNumber(),
  valueText: nullableString(),
  unit: { type: "string" },
  referenceRangeText: nullableString(),
  referenceRangeLow: nullableNumber(),
  referenceRangeHigh: nullableNumber(),
  optimalRangeLow: nullableNumber(),
  optimalRangeHigh: nullableNumber(),
  observedAt: nullableString(),
  confidence: { type: "number" },
});

export const labExtractionWireSchema: JsonSchema = strictObject({
  isLabReport: { type: "boolean" },
  observedAt: nullableString(),
  readings: {
    type: "array",
    items: extractedReadingWireSchema,
    maxItems: MAX_EXTRACTED_READINGS,
  },
  unmappedMarkerCount: { type: "integer" },
});
