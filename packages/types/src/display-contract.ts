import { z } from "zod";

// ---------------------------------------------------------------------------
// Closed declarative display-contract model
//
// A displayContract is an optional payload field that tells the frontend how
// to render an interactive editable card with live-recomputed derived values.
// Example: volleyball activity card with a durationMinutes slider, a readonly
// kcal/hour rate field, and a rate_per_hour derived totalCalories.
//
// Safety notes:
//  - This is render metadata only. It is DROPPED by stripWorkoutPlanProposalExtras
//    before the plan revision is persisted.
//  - The kcal/hour rate is read from the STORED proposal (workout LLM source),
//    never from a client-submitted override.
//  - Backend ALWAYS recomputes and clamps derived values on accept.
//  - This schema carries no formulas — all ops are a closed enum.
// ---------------------------------------------------------------------------

/** Field key regex — alphanumeric + underscore, starts with a letter, max 60 chars. */
const KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export const displayFieldKindSchema = z.enum(["number", "slider", "text", "readonly"]);

export type DisplayFieldKind = z.infer<typeof displayFieldKindSchema>;

export const displayFieldSchema = z
  .object({
    /** Unique key within the contract, used as the lookup handle. */
    key: z.string().min(1).max(60).regex(KEY_REGEX, "key must match ^[a-zA-Z][a-zA-Z0-9_]*$"),
    /** Human-readable label shown in the UI. */
    label: z.string().min(1).max(120),
    kind: displayFieldKindSchema,
    /** Optional unit label (e.g. "kcal/hour", "min"). */
    unit: z.string().min(1).max(24).optional(),
    /** Numeric value (for number / slider / readonly kinds). */
    value: z.number().finite().optional(),
    /** Text value (for text kind). Max 280 chars. */
    textValue: z.string().max(280).optional(),
    /** Minimum bound (for slider / number kinds). */
    min: z.number().finite().optional(),
    /** Maximum bound (for slider / number kinds). */
    max: z.number().finite().optional(),
    /** Step increment for slider kind. Must be positive when present. */
    step: z.number().positive().finite().optional(),
    /** Whether the user can edit this field. Defaults to true. */
    editable: z.boolean().default(true),
  })
  .strict()
  .superRefine((field, ctx) => {
    // number and slider kinds require a value
    if (
      (field.kind === "number" || field.kind === "slider") &&
      field.value === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        message: `displayField '${field.key}': number and slider kinds require a value.`,
        path: ["value"],
      });
    }

    // if both min and max present, min must be <= max
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      ctx.addIssue({
        code: "custom",
        message: `displayField '${field.key}': min must be <= max.`,
        path: ["min"],
      });
    }
  });

export type DisplayField = z.infer<typeof displayFieldSchema>;

// ---------------------------------------------------------------------------
// Derived computation ops — closed enum, no free-form formulas
// ---------------------------------------------------------------------------

export const displayDerivedOpSchema = z.enum([
  "multiply",
  "sum",
  "subtract",
  "rate_per_hour",
]);

export type DisplayDerivedOp = z.infer<typeof displayDerivedOpSchema>;

export const displayDerivedSchema = z
  .object({
    /** Key of the derived output field. Must match the key regex. */
    target: z.string().min(1).max(60).regex(KEY_REGEX, "target must match ^[a-zA-Z][a-zA-Z0-9_]*$"),
    /** Human-readable label for this derived quantity. */
    label: z.string().min(1).max(120),
    /** Optional unit label. */
    unit: z.string().min(1).max(24).optional(),
    op: displayDerivedOpSchema,
    /**
     * Keys of input fields (field keys or other derived targets).
     * Evaluated in the order listed. min 1, max 4.
     */
    inputs: z.array(z.string().min(1).max(60)).min(1).max(4),
    /**
     * When true, the computed result of this derived field is the primary
     * total (e.g. totalCalories). At most one derived item may have this flag.
     */
    isPrimaryTotal: z.boolean().default(false),
  })
  .strict();

export type DisplayDerived = z.infer<typeof displayDerivedSchema>;

// ---------------------------------------------------------------------------
// DisplayContract
// ---------------------------------------------------------------------------

export const displayContractSchema = z
  .object({
    version: z.literal(1),
    /** Optional card title, shown above the editable fields. */
    title: z.string().min(1).max(160).optional(),
    /** Editable / readonly display fields. Min 1, max 12. */
    fields: z.array(displayFieldSchema).min(1).max(12),
    /** Derived computations evaluated after field edits. Max 6. */
    derived: z.array(displayDerivedSchema).max(6).default([]),
  })
  .strict()
  .superRefine((contract, ctx) => {
    // Field keys must be unique
    const keys = contract.fields.map((f) => f.key);
    const seenKeys = new Set<string>();
    for (const key of keys) {
      if (seenKeys.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: `displayContract: duplicate field key '${key}'.`,
          path: ["fields"],
        });
      }
      seenKeys.add(key);
    }

    // Build the full set of resolvable keys: field keys + derived targets (evaluated in order)
    const allResolvableKeys = new Set(seenKeys);
    const derivedTargets = new Set<string>();

    for (const derived of contract.derived) {
      // Each derived input must reference an existing field key or a previously
      // declared derived target (evaluated in-order)
      for (const inputKey of derived.inputs) {
        if (!allResolvableKeys.has(inputKey)) {
          ctx.addIssue({
            code: "custom",
            message: `displayContract: derived '${derived.target}' input '${inputKey}' does not reference an existing field key or derived target.`,
            path: ["derived"],
          });
        }
      }
      // After checking inputs, register this derived target as resolvable for subsequent entries
      allResolvableKeys.add(derived.target);
      derivedTargets.add(derived.target);
    }

    // At most one isPrimaryTotal
    const primaryTotalCount = contract.derived.filter((d) => d.isPrimaryTotal).length;
    if (primaryTotalCount > 1) {
      ctx.addIssue({
        code: "custom",
        message: "displayContract: at most one derived field may have isPrimaryTotal=true.",
        path: ["derived"],
      });
    }
  });

export type DisplayContract = z.infer<typeof displayContractSchema>;

// ---------------------------------------------------------------------------
// Pure helpers — no Nest deps
// ---------------------------------------------------------------------------

/**
 * Evaluate derived values in declaration order.
 *
 * - Lookup order: already-computed derived targets first, then fieldValues (default 0).
 * - multiply: product of all inputs
 * - sum: sum of all inputs
 * - subtract: left-fold subtraction (inputs[0] - inputs[1] - inputs[2] - ...)
 * - rate_per_hour: inputs[0] * (inputs[1] / 60)  (e.g. kcalPerHour * durationMinutes / 60)
 *
 * Returns a record of { [derivedTarget]: computedValue } for each derived entry.
 */
export function computeDerivedValues(
  contract: DisplayContract,
  fieldValues: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const derived of contract.derived) {
    const resolveInput = (key: string): number => {
      if (key in result) return result[key]!;
      if (key in fieldValues) return fieldValues[key]!;
      return 0;
    };

    const inputs = derived.inputs.map(resolveInput);

    let computed: number;

    switch (derived.op) {
      case "multiply": {
        computed = inputs.reduce((acc, v) => acc * v, 1);
        break;
      }
      case "sum": {
        computed = inputs.reduce((acc, v) => acc + v, 0);
        break;
      }
      case "subtract": {
        computed = inputs[0] ?? 0;
        for (let i = 1; i < inputs.length; i++) {
          computed -= inputs[i]!;
        }
        break;
      }
      case "rate_per_hour": {
        // inputs[0] = rate (e.g. kcal/hour), inputs[1] = duration in minutes
        const rate = inputs[0] ?? 0;
        const durationMinutes = inputs[1] ?? 0;
        computed = rate * (durationMinutes / 60);
        break;
      }
    }

    result[derived.target] = computed;
  }

  return result;
}

/**
 * Clamp a client-submitted field value according to the field's definition.
 *
 * - If editable === false, always return the stored field.value (ignore client input).
 * - Otherwise, clamp the submitted value to [min, max] when those bounds are present.
 */
export function clampFieldValue(field: DisplayField, submitted: number): number {
  if (!field.editable) {
    // C4: non-editable fields always return the stored value; ignore client input entirely.
    // If no stored value exists, default to 0 (never echo raw client input).
    return field.value ?? 0;
  }

  let result = submitted;

  if (field.min !== undefined && result < field.min) {
    result = field.min;
  }

  if (field.max !== undefined && result > field.max) {
    result = field.max;
  }

  return result;
}

/**
 * Extract client-submitted editable field values from a displayContract.
 *
 * Returns a record of { fieldKey: value } for every field in the contract where:
 *   - editable === true (the default), AND
 *   - value is a finite number.
 *
 * Non-editable fields are excluded — the recompute helper fills those from the
 * stored field.value instead.  This is the shared extractor used by all
 * accept-time recompute paths (plan intents + log_workout_activity).
 *
 * @param contract  A DisplayContract (from the client-submitted effective payload).
 */
export function extractEditableFieldValues(
  contract: DisplayContract,
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const field of contract.fields) {
    if (field.editable && field.value !== undefined && isFinite(field.value)) {
      result[field.key] = field.value;
    }
  }

  return result;
}
