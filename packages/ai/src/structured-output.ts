import {
  aiStructuredOutputSchema,
  type AiStructuredOutput,
} from "@health/types";

export type ParsedAiStructuredOutput =
  | { ok: true; value: AiStructuredOutput }
  | { ok: false; errors: string[] };

export function parseAiStructuredOutput(value: unknown): ParsedAiStructuredOutput {
  const result = aiStructuredOutputSchema.safeParse(value);

  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "output"}: ${issue.message}`,
      ),
    };
  }

  return { ok: true, value: result.data };
}
