import { z } from "zod";
import { agentSafetyFlagSchema } from "./agent-context.js";
import { domainAnswerSchema } from "./domain-llm-step.js";
import { messagePreprocessorLanguageCodeSchema } from "./message-preprocessor.js";

// ---------------------------------------------------------------------------
// Action variant catalog entry
// The decision-maker receives a bounded catalog of actions it may select.
// ---------------------------------------------------------------------------

export const actionVariantSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  description: z.string().min(1).max(500).optional(),
  requiresConsent: z.boolean().default(false),
});

export type ActionVariant = z.infer<typeof actionVariantSchema>;

// ---------------------------------------------------------------------------
// FinalDecisionRequest
// ---------------------------------------------------------------------------

export const finalDecisionRequestSchema = z.object({
  userMessage: z.string().min(1).max(4000),
  /**
   * Outputs from the selected domain LLMs.
   * Only `domain_answer` entries reach the decision-maker — tool requests
   * are resolved before this stage.
   */
  domainOutputs: z.array(domainAnswerSchema).max(3).default([]),
  /**
   * The bounded set of actions the decision-maker may select.
   * SystemPlanner builds this from the capability catalog allowlist.
   */
  actionVariantCatalog: z.array(actionVariantSchema).max(20).default([]),
  safetyFlags: z.array(agentSafetyFlagSchema).max(10).default([]),
  safetyConstraints: z.array(z.string().min(1).max(500)).max(15).default([]),
  /**
   * Resolved response language for this turn (hint ?? detected).
   * Input-only: tells the decision-maker LLM which language to write the reply in.
   * Never an output field — the forbidden-key guard remains unchanged.
   * Null/absent means fall back to detecting from the user's message / domain outputs.
   */
  responseLanguage: messagePreprocessorLanguageCodeSchema.nullable().optional(),
});

export type FinalDecisionRequest = z.infer<typeof finalDecisionRequestSchema>;

// ---------------------------------------------------------------------------
// FinalDecisionOutput
// ---------------------------------------------------------------------------

export const finalDecisionOutputSchema = z.object({
  /**
   * The coach's final reply to the user.
   * Must be present even when proposals are returned.
   */
  reply: z.string().min(1).max(8000),
  /**
   * The id of the selected action variant from the actionVariantCatalog, or
   * null for a plain reply with no structured action.
   */
  selectedAction: z.string().min(1).max(80).nullable().default(null),
  /**
   * Proposals from domain LLMs selected for persistence.
   * Typed as untyped records here (mirrors agentLoopFinalAnswerSchema.proposals)
   * to avoid a circular import from index.ts. Full rawAiProposalSchema
   * validation is applied by ProposalValidationService and ActionResolver.
   */
  proposals: z.array(z.record(z.string(), z.unknown())).max(5).default([]),
  /**
   * Whether the decision requires explicit user consent (e.g. medical document save).
   * ActionResolver will gate the proposal accordingly.
   */
  consentRequired: z.boolean().default(false),
});

export type FinalDecisionOutput = z.infer<typeof finalDecisionOutputSchema>;
export type FinalDecisionOutputInput = z.input<typeof finalDecisionOutputSchema>;

// ---------------------------------------------------------------------------
// Shape guard — mirrors validateTurnDecisionOutputShape pattern
// The decision-maker output must not include unknown or dangerous fields.
// ---------------------------------------------------------------------------

const FINAL_DECISION_FORBIDDEN_KEYS = [
  "advice",
  "recommendation",
  "coachingText",
  "userMessage",
  "rawOutput",
  "tool",
  "tool_request",
  "kind",
  "domain",
  "summary",
] as const;

export function validateFinalDecisionOutputShape(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["Final decision output must be an object."];
  }

  const errors: string[] = [];

  for (const key of FINAL_DECISION_FORBIDDEN_KEYS) {
    if (key in (value as Record<string, unknown>)) {
      errors.push(
        `Final decision output must not include forbidden field "${key}".`,
      );
    }
  }

  const parsed = finalDecisionOutputSchema.safeParse(value);

  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => issue.message));
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Fallback factory
// ---------------------------------------------------------------------------

export function createFallbackFinalDecision(): FinalDecisionOutput {
  return finalDecisionOutputSchema.parse({
    reply:
      "I can help with wellness coaching, habit planning, and structured suggestions you can review before anything changes.",
    selectedAction: null,
    proposals: [],
    consentRequired: false,
  });
}
