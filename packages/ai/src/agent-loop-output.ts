import {
  agentLoopOutputSchema,
  aiStructuredOutputSchema,
  type AgentLoopOutput,
  type AgentLoopOutputInput,
  type AiStructuredOutput,
} from "@health/types";

export type ParsedAgentLoopOutput =
  | { ok: true; value: AgentLoopOutput }
  | { ok: false; errors: string[] };

export function parseAgentLoopOutput(value: unknown): ParsedAgentLoopOutput {
  const result = agentLoopOutputSchema.safeParse(value);

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

export function coerceAgentLoopFinalAnswer(
  value: AgentLoopOutputInput,
): AiStructuredOutput | null {
  if (value.kind !== "final_answer") {
    return null;
  }

  const structured = aiStructuredOutputSchema.safeParse({
    reply: value.reply,
    proposals: value.proposals ?? [],
  });

  if (!structured.success) {
    return null;
  }

  return structured.data;
}
