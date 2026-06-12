import { BIOMARKER_KEYS, labExtractionOutputSchema } from "@health/types";
import { describe, expect, it } from "vitest";
import {
  LAB_EXTRACTION_SCHEMA_NAME,
  labExtractionWireSchema,
  MAX_EXTRACTED_READINGS,
} from "./lab-extraction-wire-schema.js";

interface JsonSchemaNode {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchemaNode;
  maxItems?: number;
  enum?: unknown[];
}

const schema = labExtractionWireSchema as JsonSchemaNode;
const readingSchema = schema.properties?.["readings"]?.items as JsonSchemaNode;

/** Collects every object node in the schema tree. */
function collectObjectNodes(node: JsonSchemaNode, found: JsonSchemaNode[] = []): JsonSchemaNode[] {
  if (node.type === "object") {
    found.push(node);
  }

  for (const child of Object.values(node.properties ?? {})) {
    collectObjectNodes(child, found);
  }

  if (node.items) {
    collectObjectNodes(node.items, found);
  }

  return found;
}

describe("labExtractionWireSchema", () => {
  it("has a stable schema name", () => {
    expect(LAB_EXTRACTION_SCHEMA_NAME).toBe("lab_extraction_output");
  });

  it("keeps the biomarkerKey enum in exact sync with BIOMARKER_KEYS (catalog edits cannot drift)", () => {
    const enumValues = readingSchema.properties?.["biomarkerKey"]?.enum;

    expect(enumValues).toEqual([...BIOMARKER_KEYS]);
  });

  it("marks every object as strict: additionalProperties false and all properties required", () => {
    const objectNodes = collectObjectNodes(schema);

    expect(objectNodes.length).toBeGreaterThanOrEqual(2);

    for (const node of objectNodes) {
      expect(node.additionalProperties).toBe(false);
      expect(node.required).toEqual(Object.keys(node.properties ?? {}));
    }
  });

  it("declares the root and reading shapes the Zod contract expects", () => {
    expect(Object.keys(schema.properties ?? {})).toEqual([
      "isLabReport",
      "observedAt",
      "readings",
      "unmappedMarkerCount",
    ]);
    expect(Object.keys(readingSchema.properties ?? {})).toEqual([
      "biomarkerKey",
      "valueNumeric",
      "valueText",
      "unit",
      "referenceRangeText",
      "observedAt",
      "confidence",
    ]);
  });

  it("caps readings at 80 items", () => {
    expect(schema.properties?.["readings"]?.maxItems).toBe(MAX_EXTRACTED_READINGS);
    expect(MAX_EXTRACTED_READINGS).toBe(80);
  });

  it("declares nullable fields as nullable-required (strict-mode pattern)", () => {
    expect(schema.properties?.["observedAt"]?.type).toEqual(["string", "null"]);
    expect(readingSchema.properties?.["valueNumeric"]?.type).toEqual(["number", "null"]);
    expect(readingSchema.properties?.["valueText"]?.type).toEqual(["string", "null"]);
    expect(readingSchema.properties?.["referenceRangeText"]?.type).toEqual([
      "string",
      "null",
    ]);
    expect(readingSchema.properties?.["observedAt"]?.type).toEqual(["string", "null"]);
  });

  it("accepts a wire-shaped sample through the authoritative Zod contract without null-stripping", () => {
    // A payload that satisfies the wire schema exactly (explicit nulls for
    // nullable-required fields) must parse under labExtractionOutputSchema.
    const sample = {
      isLabReport: true,
      observedAt: "2026-05-20",
      readings: [
        {
          biomarkerKey: "fasting_glucose",
          valueNumeric: 92,
          valueText: null,
          unit: "mg/dL",
          referenceRangeText: "70 - 99",
          observedAt: null,
          confidence: 0.93,
        },
      ],
      unmappedMarkerCount: 2,
    };

    expect(labExtractionOutputSchema.safeParse(sample).success).toBe(true);
  });
});
