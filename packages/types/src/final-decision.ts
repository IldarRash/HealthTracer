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
// CandidateProposalSummary
// A lightweight descriptor for one domain candidate proposal passed to the
// decision-maker. Enough for an informed selection choice — the full payload
// stays on the domain answer and is resolved from the id→candidate map in
// ActionResolverService.
// ---------------------------------------------------------------------------

export const candidateProposalSummarySchema = z.object({
  /**
   * Stable id assigned deterministically by DomainLlmExecutorService after the
   * domain_answer is accepted. Pattern: `cand_<domain>_<index>` (e.g. cand_workout_0).
   * The decision-maker picks ids from this list; it never fabricates payloads.
   */
  id: z.string().min(1).max(80),
  /**
   * Proposal intent (e.g. "create_workout_plan", "log_nutrition_incident").
   * Included so the decision-maker can reason about intent without parsing the payload.
   */
  intent: z.string().min(1).max(80),
  /**
   * Short human-readable title from the candidate proposal.
   */
  title: z.string().min(1).max(200),
  /**
   * Short human-readable reason why the domain LLM proposed this change.
   */
  reason: z.string().min(1).max(500),
});

export type CandidateProposalSummary = z.infer<typeof candidateProposalSummarySchema>;

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
   * Candidate proposal summaries (id + intent + title + reason) for the
   * decision-maker to choose from. The full payloads live in the domain answers
   * and are resolved from the id→candidate map in ActionResolverService.
   * The decision-maker picks IDs from this list — it never fabricates payloads.
   */
  candidateProposalSummaries: z.array(candidateProposalSummarySchema).max(15).default([]),
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
  /**
   * Recent messages from the conversation (capped at 6 messages / 4000 chars each).
   * Gives the decision-maker conversation history context, same shape as other stages.
   */
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(4000),
      }),
    )
    .max(6)
    .default([]),
  /**
   * True when the system planner took the low-confidence/general fallback route
   * for an LLM-routed turn (confidence below RULE_ROUTE_CONFIDENCE_THRESHOLD or
   * selectedDomains empty).
   *
   * NOT set for proposal-revision, proposal-explainer, or deterministic routes.
   * Defaults to false so existing callers are unaffected.
   *
   * When true the decision template instructs the LLM to ask a short clarifying
   * question rather than guessing which domain to serve.
   */
  lowConfidenceRoute: z.boolean().default(false),
});

export type FinalDecisionRequest = z.infer<typeof finalDecisionRequestSchema>;

// ---------------------------------------------------------------------------
// FinalDecisionOutput
// Selection-only design: the decision-maker picks candidate IDs from the
// candidateProposalSummaries list and NEVER writes proposal payloads.
// ActionResolverService resolves the IDs to canonical payloads from the
// domain answers. This structurally prevents the decision-maker from
// fabricating calorie fields or any other domain-owned payload data.
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
   * IDs of selected candidate proposals from candidateProposalSummaries.
   * The decision-maker picks IDs — it never writes payload objects.
   * ActionResolverService resolves these to canonical payloads from the domain answers.
   * Empty for plain_reply/null selectedAction.
   */
  selectedProposalIds: z.array(z.string().min(1).max(80)).max(5).default([]),
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
  // Legacy field that was removed in slice 2:
  "proposals",
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
    selectedProposalIds: [],
    consentRequired: false,
  });
}
