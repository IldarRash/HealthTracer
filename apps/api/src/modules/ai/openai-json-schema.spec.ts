/**
 * toOpenAiStrictJsonSchema — strict-mode invariants and error cases.
 *
 * Invariants asserted RECURSIVELY for every covered LLM emission envelope:
 *  - every object node has additionalProperties:false
 *  - every object node's required array equals its property keys
 *  - no constraint keywords OpenAI strict mode may reject (minimum, maximum,
 *    minLength, maxLength, pattern, format, default, ...)
 *  - no const (rewritten to enum), no $ref/$defs/oneOf/allOf/not
 *  - every array node has an items schema
 *
 * Error cases: records, .optional() keys, .default(), open-ended objects must
 * throw descriptive OpenAiStrictSchemaConversionError — failing loudly at
 * test/build time instead of 400ing at the OpenAI boundary.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  LLM_EMISSION_COVERED_INTENTS,
  buildLlmCandidateEnvelopeSchema,
} from "@health/types";
import {
  OpenAiStrictSchemaConversionError,
  toOpenAiStrictJsonSchema,
} from "./openai-json-schema.js";

const BANNED_KEYWORDS = [
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
  "default",
  "const",
  "$ref",
  "$defs",
  "definitions",
  "oneOf",
  "allOf",
  "not",
  "$schema",
] as const;

/** Recursively assert the strict-mode invariants on a converted schema node. */
function assertStrictInvariants(node: unknown, path: string): void {
  if (node === null || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((entry, index) => assertStrictInvariants(entry, `${path}[${index}]`));
    return;
  }

  const record = node as Record<string, unknown>;

  for (const keyword of BANNED_KEYWORDS) {
    expect(keyword in record, `banned keyword "${keyword}" at ${path}`).toBe(false);
  }

  if (record["type"] === "object" || "properties" in record) {
    expect(record["additionalProperties"], `additionalProperties at ${path}`).toBe(false);
    const properties = record["properties"] as Record<string, unknown>;
    expect(properties, `properties at ${path}`).toBeTypeOf("object");
    expect(
      [...((record["required"] as string[]) ?? [])].sort(),
      `required==keys at ${path}`,
    ).toEqual(Object.keys(properties).sort());
  }

  if (record["type"] === "array") {
    expect(record["items"], `array items at ${path}`).toBeTypeOf("object");
  }

  for (const [key, value] of Object.entries(record)) {
    assertStrictInvariants(value, `${path}/${key}`);
  }
}

describe("toOpenAiStrictJsonSchema — invariants for all covered emission envelopes", () => {
  it.each([...LLM_EMISSION_COVERED_INTENTS])(
    "envelope for %s satisfies strict-mode invariants recursively",
    (intent) => {
      const schema = toOpenAiStrictJsonSchema(buildLlmCandidateEnvelopeSchema(intent));

      expect(schema["type"]).toBe("object");
      assertStrictInvariants(schema, "#");

      // The intent literal is rewritten const → enum.
      const properties = schema["properties"] as Record<string, Record<string, unknown>>;
      expect(properties["intent"]?.["enum"]).toEqual([intent]);
    },
  );

  it("rewrites z.literal const to a single-value enum", () => {
    const schema = toOpenAiStrictJsonSchema(
      z.object({ version: z.literal(1) }).strict(),
    );
    const properties = schema["properties"] as Record<string, Record<string, unknown>>;

    expect(properties["version"]?.["enum"]).toEqual([1]);
    expect("const" in (properties["version"] ?? {})).toBe(false);
  });

  it("flattens the nested anyOf produced by union().nullable()", () => {
    const schema = toOpenAiStrictJsonSchema(
      z.object({ reps: z.union([z.string(), z.number()]).nullable() }).strict(),
    );
    const properties = schema["properties"] as Record<string, Record<string, unknown>>;
    const anyOf = properties["reps"]?.["anyOf"] as Array<Record<string, unknown>>;

    expect(anyOf).toHaveLength(3);
    expect(anyOf.map((entry) => entry["type"])).toEqual(["string", "number", "null"]);
  });

  it("strips numeric and string constraint keywords instead of forwarding them", () => {
    const schema = toOpenAiStrictJsonSchema(
      z.object({ s: z.string().min(1).max(5), n: z.number().int().min(0).max(10) }).strict(),
    );

    assertStrictInvariants(schema, "#");
    const properties = schema["properties"] as Record<string, Record<string, unknown>>;
    expect(properties["n"]?.["type"]).toBe("integer");
  });
});

describe("toOpenAiStrictJsonSchema — unsupported constructs throw", () => {
  it("throws on z.record (open-ended object)", () => {
    expect(() =>
      toOpenAiStrictJsonSchema(
        z.object({ extras: z.record(z.string(), z.number()) }).strict(),
      ),
    ).toThrow(OpenAiStrictSchemaConversionError);
  });

  it("throws on .optional() keys with the offending key named", () => {
    expect(() =>
      toOpenAiStrictJsonSchema(z.object({ keep: z.string(), drop: z.string().optional() }).strict()),
    ).toThrow(/optional keys \[drop\]/);
  });

  it("throws on .default()", () => {
    expect(() =>
      toOpenAiStrictJsonSchema(z.object({ flag: z.boolean().default(true) }).strict()),
    ).toThrow(/"default"/);
  });
});
