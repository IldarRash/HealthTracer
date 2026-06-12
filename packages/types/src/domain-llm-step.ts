import { z } from "zod";
import {
  agentSafetyFlagSchema,
  agentToolCallResultSchema,
  agentToolNameSchema,
} from "./agent-context.js";
import { routerDomainSchema } from "./router-decision.js";
import { messagePreprocessorLanguageCodeSchema } from "./message-preprocessor.js";
import { MAX_CHAT_USER_MESSAGE_CHARS } from "./message-limits.js";
import { deepReviewPromptContextSchema } from "./progress-history.js";

// ---------------------------------------------------------------------------
// Bounded attachment context for domain LLM steps
//
// Carries the minimal metadata a domain LLM needs to read an attachment as
// bounded context. No recognition or classification envelope — the domain LLM
// analyzes content directly (multimodal).
//
// Safety floors:
//   - Temporary, intentional relaxation: image content — including a medical-document
//     photo — reaches the LLM with no pre-upload consent gate (see llm-pipeline.md).
//   - Documents/sensitive health context are denied by default per packet budget
//     floors in CoachingContextService; this schema does not relax them.
//   - imageDataUri is set only on the OpenAI vision path for vision-capable models.
// ---------------------------------------------------------------------------

/**
 * Maximum number of characters for extracted text content in domain attachment items.
 * Text content is ephemeral context-only (NEVER persisted or logged).
 * Larger documents are truncated at the head to this limit.
 */
export const MAX_ATTACHMENT_TEXT_CONTENT_CHARS = 12_000;

export const domainAttachmentItemSchema = z.object({
  /** Stable attachment ref id from the chat-attachments upload. */
  attachmentRefId: z.string().min(1).max(128),
  /** User-declared or MIME-inferred category (no LLM classification). */
  category: z.string().min(1).max(80),
  /** Full MIME type (e.g. "image/jpeg", "application/pdf"). */
  mimeType: z.string().min(1).max(120),
  /**
   * Consent state at the time of this turn (carried for context only; there is no
   * pre-LLM consent gate today — see the temporary relaxation in llm-pipeline.md).
   */
  // "needs_consent" is never produced at runtime; retained for historical DB-row reads only.
  consentState: z.enum(["granted", "needs_consent", "none"]),
  /**
   * Storage reference (local:// or cloud key).
   * Null when content was purged by retention policy.
   */
  storageRef: z.string().min(1).max(512).nullable(),
  /**
   * Base64-encoded data URI for vision-capable LLM paths (OpenAI gpt-4o etc.).
   * Set only when the domain is nutrition or health AND the attachment is an image
   * MIME (medical-document images included — no consent gate; temporary relaxation).
   * Not set on non-image MIMEs.
   * Maximum size guard: truncated before reaching this field if oversized.
   */
  imageDataUri: z.string().min(1).optional(),
  /**
   * Original filename of the uploaded document (e.g. "training-plan.pdf").
   * Set for document_file attachments on ALL selected domains.
   * Context-only — never persisted or logged beyond the turn.
   */
  filename: z.string().min(1).max(200).optional(),
  /**
   * Extracted plain-text content from the document file.
   * Populated for document_file MIME attachments on ALL selected domains.
   * Capped at MAX_ATTACHMENT_TEXT_CONTENT_CHARS (12,000 chars); truncated flag is
   * indicated by the extraction service but not carried on this schema field.
   *
   * SAFETY: text content is NEVER persisted to the database and NEVER logged.
   * It is ephemeral, context-only, and scoped to this turn's LLM calls only.
   */
  textContent: z.string().min(1).max(MAX_ATTACHMENT_TEXT_CONTENT_CHARS).optional(),
});

export type DomainAttachmentItem = z.infer<typeof domainAttachmentItemSchema>;

export const domainAttachmentContextSchema = z.object({
  items: z.array(domainAttachmentItemSchema).max(5),
});

export type DomainAttachmentContext = z.infer<typeof domainAttachmentContextSchema>;

// ---------------------------------------------------------------------------
// DomainLlmStepRequest
// Extends CoachAiLoopRequest from packages/ai/src/coach-ai-provider with a
// domain discriminator so each bounded loop knows which domain it serves.
// ---------------------------------------------------------------------------

export const domainLlmStepRequestSchema = z.object({
  // Domain discriminator
  domain: routerDomainSchema,

  // Bounded loop fields (mirrors CoachAiLoopRequest)
  iteration: z.number().int().min(0).max(10),
  maxIterations: z.number().int().min(1).max(10),
  priorToolResults: z.array(agentToolCallResultSchema).max(10).default([]),

  // Core request fields
  userMessage: z.string().min(1).max(MAX_CHAT_USER_MESSAGE_CHARS),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(MAX_CHAT_USER_MESSAGE_CHARS),
      }),
    )
    .max(10)
    .default([]),
  coachingContext: z.record(z.string(), z.unknown()).default({}),

  // Per-domain allowlists (clamped by SystemPlanner before reaching the executor).
  // Max 6 matches capabilityConfigSchema.allowedTools — review_progress carries 6
  // tools since Phase 1 added getProgressHistory; a smaller cap here would make
  // every review_progress domain step degrade on schema parse.
  allowedTools: z.array(agentToolNameSchema).max(6).default([]),
  allowedProposalIntents: z.array(z.string().min(1).max(80)).max(10).default([]),

  // Safety
  safetyFlags: z.array(agentSafetyFlagSchema).max(10).default([]),
  safetyConstraints: z.array(z.string().min(1).max(500)).max(15).default([]),

  /**
   * Bounded attachment context for this domain's step.
   * Contains attachment refs + category + MIME + consent state, and for vision
   * paths (OpenAI) the image data URI for food_photo / medical-document images.
   *
   * Image content (incl. medical-document photos) reaches the LLM with no consent
   * gate today (temporary relaxation — see llm-pipeline.md). Documents/sensitive
   * health context are still denied by the per-domain packet budget floors in
   * CoachingContextService; this field cannot widen them.
   *
   * Optional — absent on turns with no attachments.
   */
  attachmentContext: domainAttachmentContextSchema.optional(),
  /**
   * Resolved response language for this turn (hint ?? detected).
   * Input-only: tells the domain LLM which language to write user-facing text in.
   * Never an output field — the forbidden-key guard remains unchanged.
   * Null/absent means fall back to detecting from the user's message.
   */
  responseLanguage: messagePreprocessorLanguageCodeSchema.nullable().optional(),
  /**
   * Deep-review sufficiency framing (Phase 4). Present only on review-profile
   * turns whose context packet carries the progress_history_review slice.
   * Drives the {{deepReviewSuffix}} injection in the domain templates —
   * the same request-field → suffix channel as lowConfidenceRoute on
   * FinalDecisionRequest (domains have no other instruction channel).
   */
  deepReview: deepReviewPromptContextSchema.optional(),
});

export type DomainLlmStepRequest = z.infer<typeof domainLlmStepRequestSchema>;

// ---------------------------------------------------------------------------
// DomainLlmStepOutput — discriminated union
// ---------------------------------------------------------------------------

/**
 * tool_request variant — the domain LLM wants more context before answering.
 * Mirrors agentLoopToolRequestSchema but without the full agent shape, so the
 * executor can stay domain-aware.
 */
export const domainLlmToolRequestSchema = z
  .object({
    kind: z.literal("tool_request"),
    tool: agentToolNameSchema,
    input: z.record(z.string(), z.unknown()).default({}),
    rationale: z.string().min(1).max(500).optional(),
  })
  .strict();

export type DomainLlmToolRequest = z.infer<typeof domainLlmToolRequestSchema>;

/**
 * domain_answer variant — the domain LLM has produced its answer.
 *
 * workoutCalorieEstimate is ONLY permitted when domain === 'workout'.
 * This invariant is enforced by superRefine at the output-union level.
 */
export const domainAnswerSchema = z.object({
  kind: z.literal("domain_answer"),
  domain: routerDomainSchema,
  /** Empty string is valid for a degraded/timed-out domain that produced no output. */
  summary: z.string().max(4000).default(""),
  /**
   * Candidate proposals from this domain LLM. Typed as untyped records here
   * (mirrors agentLoopFinalAnswerSchema.proposals) to avoid a circular import
   * from index.ts. Full rawAiProposalSchema validation is applied by
   * ProposalValidationService and ActionResolver.
   */
  candidateProposals: z
    .array(z.record(z.string(), z.unknown()))
    .max(5)
    .default([]),
  domainSignals: z.array(z.string().min(1).max(240)).max(10).default([]),
  /**
   * Approximate calorie burn estimate from the workout domain LLM.
   * Must only be present when domain === 'workout' (enforced by superRefine
   * on domainLlmStepOutputSchema below).
   */
  workoutCalorieEstimate: z.number().int().nonnegative().max(5000).optional(),
  /**
   * Trusted kcal/hour burn rate from the workout domain LLM.
   * Used to stamp caloriePerHourRate on workout proposals via ActionResolver.
   * Must only be present when domain === 'workout' (same superRefine guard as
   * workoutCalorieEstimate below).
   * Max 5000 kcal/hour is a generous ceiling for any activity.
   */
  workoutCaloriePerHourRate: z.number().int().nonnegative().max(5000).optional(),
});

export type DomainAnswer = z.infer<typeof domainAnswerSchema>;

/**
 * Full discriminated union of domain LLM step outputs.
 *
 * The workoutCalorieEstimate restriction is enforced here via superRefine so
 * that any parse path (safeParse, parse, discriminatedUnion) catches violations.
 */
export const domainLlmStepOutputSchema = z
  .discriminatedUnion("kind", [domainLlmToolRequestSchema, domainAnswerSchema])
  .superRefine((value, ctx) => {
    if (value.kind === "domain_answer" && value.domain !== "workout") {
      if (value.workoutCalorieEstimate !== undefined) {
        ctx.addIssue({
          code: "custom",
          message:
            `workoutCalorieEstimate is only permitted when domain is "workout"; got "${value.domain}".`,
          path: ["workoutCalorieEstimate"],
        });
      }

      if (value.workoutCaloriePerHourRate !== undefined) {
        ctx.addIssue({
          code: "custom",
          message:
            `workoutCaloriePerHourRate is only permitted when domain is "workout"; got "${value.domain}".`,
          path: ["workoutCaloriePerHourRate"],
        });
      }
    }
  });

export type DomainLlmStepOutput = z.infer<typeof domainLlmStepOutputSchema>;
export type DomainLlmStepOutputInput = z.input<typeof domainLlmStepOutputSchema>;

// ---------------------------------------------------------------------------
// Shape guard (mirrors validateTurnDecisionOutputShape / validateAgentLoopOutputShape)
// The domain LLM step must not include unexpected user-facing fields.
// ---------------------------------------------------------------------------

const DOMAIN_LLM_STEP_FORBIDDEN_KEYS = [
  "reply",
  "text",
  "message",
  "advice",
  "recommendation",
  "answer",
  "response",
  "userMessage",
  "coachingText",
  "finalAnswer",
] as const;

export function validateDomainLlmStepOutputShape(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["Domain LLM step output must be an object."];
  }

  const errors: string[] = [];

  for (const key of DOMAIN_LLM_STEP_FORBIDDEN_KEYS) {
    if (key in (value as Record<string, unknown>)) {
      errors.push(
        `Domain LLM step output must not include forbidden field "${key}".`,
      );
    }
  }

  const parsed = domainLlmStepOutputSchema.safeParse(value);

  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => issue.message));
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Fallback factories
// ---------------------------------------------------------------------------

/** Safe empty domain answer — used when a domain loop times out or errors. */
export function createFallbackDomainAnswer(
  domain: z.infer<typeof routerDomainSchema>,
): DomainAnswer {
  return domainAnswerSchema.parse({
    kind: "domain_answer",
    domain,
    summary: "",
    candidateProposals: [],
    domainSignals: [],
  });
}

