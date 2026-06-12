/**
 * llm-coerce.ts — Shared Zod helpers for tolerating real LLM output quirks.
 *
 * Two systematic problems arise when parsing AI-produced proposal payloads:
 *
 *   1. stripExplicitNulls (in openai-coach-provider.ts) removes every null key
 *      before Zod parse.  Any field declared `.nullable()` without `.default(null)`
 *      will fail with "Required" when the model returns null and stripExplicitNulls
 *      deletes the key.
 *
 *   2. LLMs routinely emit floating-point numbers (e.g. 66.7 g, 2350.5 kcal) for
 *      fields that are logically integers.  Strict `.int()` rejects these.
 *
 * Helpers here are intentionally minimal — they solve only these two problems
 * without loosening enum, max-bound, or safety-language constraints.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// llmInt — accepts a number (possibly non-integer), rounds it, then validates
// the rounded integer against caller-supplied constraints.
//
// Pattern: z.number().transform(Math.round).pipe(z.number().nonnegative().max(5000))
//
// The base schema (z.number()) accepts the raw input; Math.round normalises it;
// the pipe target validates the rounded value with Zod's standard number methods.
//
// Usage:
//   llmInt(z.number().nonnegative().max(5000))       → required int field
//   llmInt(z.number().positive().max(600))            → required positive int
//   llmInt(z.number().nonnegative().max(5000)).optional()
//   llmInt(z.number().nonnegative().max(5000)).nullable().optional()
//
// The caller passes the ZodNumber that carries the constraints.  This is more
// explicit than fluent chaining off of llmInt() itself, which would require
// ZodEffects to re-expose every ZodNumber method — far too much boilerplate.
// ---------------------------------------------------------------------------

/**
 * Zod schema that accepts a decimal number, rounds it to the nearest integer,
 * then validates the rounded value with the supplied ZodNumber constraints.
 *
 * The return type is inferred by TypeScript (a ZodPipe chain); callers can
 * append .optional(), .nullable(), .nullable().optional() as usual.
 *
 * @param constraints - A ZodNumber with the desired bound/sign/etc. modifiers.
 *
 * @example
 *   llmInt(z.number().nonnegative().max(5000))           // required
 *   llmInt(z.number().nonnegative().max(5000)).optional() // optional
 *   llmInt(z.number().nonnegative().max(5000)).nullable().optional()
 */
export function llmInt(constraints: z.ZodNumber) {
  return z.number().transform(Math.round).pipe(constraints);
}

// ---------------------------------------------------------------------------
// requiredNullable — combines .nullable() with .default(null).
//
// Use on any required field that the LLM may legitimately return as null AND
// that will be stripped by stripExplicitNulls before parse:
//
//   requiredNullable(z.number().positive().max(10000))
//   requiredNullable(llmInt(z.number().nonnegative().max(1000)))
//
// The inferred output type is `T | null`.
// ---------------------------------------------------------------------------

/**
 * Returns a Zod schema that coerces undefined → null (so the field tolerates
 * the key being absent after stripExplicitNulls removes null values from the
 * LLM payload while keeping the field required at the API level).
 *
 * The inferred output type is `T | null`.
 */
export function requiredNullable<T>(inner: z.ZodType<T>) {
  return inner.nullable().default(null);
}
