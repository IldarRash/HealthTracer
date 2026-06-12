/**
 * zod-tolerant.ts — element-tolerant array parsing.
 *
 * `tolerantArraySchema` validates each array element independently: elements
 * that pass the element schema are kept, broken elements are dropped instead
 * of failing the whole parse. One malformed entity (e.g. a single proposal
 * persisted with an unexpected shape) must never take down an entire API
 * response — the chat turn, thread detail, and proposals list stay renderable.
 *
 * Privacy floor: dropped elements are logged with the label, index, and Zod
 * issue PATHS only — never element contents. This is a health product; payloads
 * may contain sensitive data and must not reach the console.
 */

import { z } from "zod";

/**
 * Build a tolerant array schema around `element`.
 *
 * - Input: any array (non-arrays still fail the parse).
 * - Output: only the elements that pass `element`, in original order.
 * - Each dropped element emits one console.warn with `label`, the element
 *   index, and the failing issue paths (no contents).
 */
export function tolerantArraySchema<TSchema extends z.ZodType>(
  element: TSchema,
  label: string,
): z.ZodType<Array<z.output<TSchema>>> {
  return z.array(z.unknown()).transform((items) => {
    const kept: Array<z.output<TSchema>> = [];

    items.forEach((item, index) => {
      const result = element.safeParse(item);

      if (result.success) {
        kept.push(result.data as z.output<TSchema>);
        return;
      }

      const issuePaths = result.error.issues
        .map((issue) => (issue.path.length > 0 ? issue.path.join(".") : "(root)"))
        .join(", ");

      // Privacy floor: label/index/issue paths only — never element contents.
      console.warn(
        `[tolerant-array] dropped ${label}[${index}] — issue paths: ${issuePaths}`,
      );
    });

    return kept;
  }) as unknown as z.ZodType<Array<z.output<TSchema>>>;
}
