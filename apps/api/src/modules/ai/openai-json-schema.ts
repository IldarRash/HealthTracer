/**
 * openai-json-schema.ts — Zod → OpenAI strict-mode JSON schema conversion.
 *
 * Converts the strict-by-construction LLM emission schemas
 * (`packages/types/src/llm-emission/*`) into JSON schemas that OpenAI
 * structured outputs accept with `strict: true`.
 *
 * OpenAI strict mode requires (verified against the current OpenAI docs via
 * Context7, 2026-06):
 *  - root and every nested object: `additionalProperties: false`
 *  - every key listed in `required` (optionality is expressed as
 *    `anyOf: [T, {type:"null"}]` — anyOf-with-null is supported)
 *  - only a subset of JSON Schema keywords. Recent model snapshots accept
 *    some constraint keywords (minimum/maximum/minLength/...), but support is
 *    per-snapshot, so we STRIP them for cross-model safety — the canonical
 *    Zod contracts re-validate every payload post-receive anyway.
 *
 * Conversion pipeline:
 *  1. `z.toJSONSchema(schema, { target: "draft-2020-12" })`
 *  2. post-pass that (a) asserts/sets `additionalProperties: false` and
 *     `required == all property keys` on every object, (b) strips constraint
 *     keywords OpenAI strict mode may reject, (c) rewrites `const` → `enum`
 *     and flattens nested `anyOf`, and (d) THROWS a descriptive error when an
 *     unsupported construct sneaks in (records/open objects, `.optional()`
 *     keys, `.default()`, oneOf/allOf/not, $ref/$defs) — failing loudly at
 *     build/test time instead of 400ing at the OpenAI boundary.
 */

import { z } from "zod";

export class OpenAiStrictSchemaConversionError extends Error {
  constructor(message: string) {
    super(`OpenAI strict schema conversion failed: ${message}`);
    this.name = "OpenAiStrictSchemaConversionError";
  }
}

/**
 * Constraint keywords stripped for cross-model strict-mode safety.
 * The canonical Zod contracts own these bounds and re-validate post-receive.
 */
const STRIPPED_KEYWORDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "contentEncoding",
  "contentMediaType",
] as const;

/**
 * Structural keywords that indicate a construct OpenAI strict mode rejects or
 * that violates the emission-schema construction rules. Always an error.
 */
const FORBIDDEN_KEYWORDS = [
  "oneOf",
  "allOf",
  "not",
  "$ref",
  "$defs",
  "definitions",
  "if",
  "then",
  "else",
  "dependentSchemas",
  "patternProperties",
  "propertyNames",
  "unevaluatedProperties",
  "prefixItems",
] as const;

/**
 * Convert a strict-by-construction Zod emission schema into an OpenAI
 * strict-mode JSON schema. Throws OpenAiStrictSchemaConversionError on any
 * construct strict mode cannot express (see module doc).
 */
export function toOpenAiStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<
    string,
    unknown
  >;

  delete json["$schema"];

  return postProcessNode(json, "#");
}

function postProcessNode(
  node: Record<string, unknown>,
  path: string,
): Record<string, unknown> {
  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (keyword in node) {
      throw new OpenAiStrictSchemaConversionError(
        `unsupported construct "${keyword}" at ${path} — emission schemas must be strict by construction (no records/open objects, no oneOf/allOf/not, no $ref).`,
      );
    }
  }

  if ("default" in node) {
    throw new OpenAiStrictSchemaConversionError(
      `"default" at ${path} — emission schemas must not use .default(); use .nullable() and let the canonical schema apply defaults post-strip.`,
    );
  }

  for (const keyword of STRIPPED_KEYWORDS) {
    delete node[keyword];
  }

  // OpenAI strict mode prefers enum over const; rewrite for cross-model safety.
  if ("const" in node) {
    node["enum"] = [node["const"]];
    delete node["const"];
  }

  if (Array.isArray(node["anyOf"])) {
    node["anyOf"] = flattenAnyOf(node["anyOf"], path).map((entry, index) =>
      postProcessNode(entry, `${path}/anyOf/${index}`),
    );
  }

  if (node["type"] === "object" || "properties" in node) {
    postProcessObjectNode(node, path);
  }

  if (node["type"] === "array") {
    const items = node["items"];

    if (items === undefined || items === null || typeof items !== "object") {
      throw new OpenAiStrictSchemaConversionError(
        `array at ${path} has no items schema — open-ended arrays are not allowed.`,
      );
    }

    node["items"] = postProcessNode(items as Record<string, unknown>, `${path}/items`);
  }

  return node;
}

function postProcessObjectNode(node: Record<string, unknown>, path: string): void {
  const properties = node["properties"];

  if (properties === undefined || properties === null || typeof properties !== "object") {
    throw new OpenAiStrictSchemaConversionError(
      `object at ${path} has no properties — z.record / open-ended objects are not expressible in strict mode.`,
    );
  }

  const additionalProperties = node["additionalProperties"];

  if (additionalProperties !== undefined && additionalProperties !== false) {
    throw new OpenAiStrictSchemaConversionError(
      `object at ${path} has additionalProperties that is not false — records and passthrough objects are not allowed.`,
    );
  }

  node["additionalProperties"] = false;

  const propertyEntries = Object.entries(properties as Record<string, unknown>);
  const propertyKeys = propertyEntries.map(([key]) => key);
  const required = Array.isArray(node["required"])
    ? (node["required"] as string[])
    : [];
  const optionalKeys = propertyKeys.filter((key) => !required.includes(key));

  if (optionalKeys.length > 0) {
    throw new OpenAiStrictSchemaConversionError(
      `object at ${path} has optional keys [${optionalKeys.join(", ")}] — emission schemas must use .nullable() instead of .optional().`,
    );
  }

  node["required"] = propertyKeys;

  for (const [key, value] of propertyEntries) {
    if (value === null || typeof value !== "object") {
      throw new OpenAiStrictSchemaConversionError(
        `property "${key}" at ${path} is not a schema object.`,
      );
    }

    (properties as Record<string, unknown>)[key] = postProcessNode(
      value as Record<string, unknown>,
      `${path}/properties/${key}`,
    );
  }
}

/**
 * Flatten one level of nested anyOf (z.union().nullable() produces
 * anyOf:[anyOf:[...], {type:"null"}]) so the wire schema stays simple.
 */
function flattenAnyOf(
  entries: unknown[],
  path: string,
): Array<Record<string, unknown>> {
  const flattened: Array<Record<string, unknown>> = [];

  for (const entry of entries) {
    if (entry === null || typeof entry !== "object") {
      throw new OpenAiStrictSchemaConversionError(
        `anyOf at ${path} contains a non-object entry.`,
      );
    }

    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record);

    if (keys.length === 1 && Array.isArray(record["anyOf"])) {
      flattened.push(...flattenAnyOf(record["anyOf"], path));
      continue;
    }

    flattened.push(record);
  }

  return flattened;
}
