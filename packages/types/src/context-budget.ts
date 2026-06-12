import { z } from "zod";
import {
  contextDepthSchema,
  contextSlicePurposeSchema,
  contextSliceRequestSchema,
  MAX_CONTEXT_SLICES,
  type ContextDepth,
  type ContextSliceRequest,
} from "./agent-context.js";
import { isoDateSchema } from "./dates.js";

export const CONTEXT_BUDGET_ABSOLUTE_LIMITS = {
  maxSlices: 10,
  maxRawItems: 100,
  maxLookbackDays: 365,
  maxExpansionRounds: 5,
  maxSlicesPerExpansionRound: 10,
} as const;

export const contextBudgetProfileSchema = z.enum(["default", "deep_review"]);

export type ContextBudgetProfile = z.infer<typeof contextBudgetProfileSchema>;

export const contextBudgetPolicySchema = z.object({
  profile: contextBudgetProfileSchema.optional(),
  maxSlices: z.number().int().min(1).max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlices),
  maxDepth: contextDepthSchema,
  maxRawItems: z.number().int().min(0).max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxRawItems),
  maxLookbackDays: z
    .number()
    .int()
    .min(1)
    .max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxLookbackDays),
  /**
   * Code-level safety floor (always false). `allowDocuments` governs raw
   * document-derived text in chat context — none exists post-biomarkers.
   * `biomarkerContext` is structured, user-visible, consent-gated data and is
   * exempt from this floor by design.
   */
  allowDocuments: z.boolean().default(false),
  allowSensitiveHealthContext: z.boolean().default(false),
  requiresCompression: z.boolean().default(false),
  maxExpansionRounds: z
    .number()
    .int()
    .min(0)
    .max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxExpansionRounds),
  maxSlicesPerExpansionRound: z
    .number()
    .int()
    .min(1)
    .max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlicesPerExpansionRound)
    .default(2),
});

export type ContextBudgetPolicy = z.infer<typeof contextBudgetPolicySchema>;
export type ContextBudgetPolicyInput = z.input<typeof contextBudgetPolicySchema>;

export const DEFAULT_CONTEXT_BUDGET_POLICY: ContextBudgetPolicy = {
  profile: "default",
  maxSlices: MAX_CONTEXT_SLICES,
  maxDepth: "medium",
  maxRawItems: 20,
  maxLookbackDays: 30,
  allowDocuments: false,
  allowSensitiveHealthContext: false,
  requiresCompression: false,
  maxExpansionRounds: 0,
  maxSlicesPerExpansionRound: 2,
};

export const DEEP_REVIEW_CONTEXT_BUDGET_POLICY: ContextBudgetPolicy = {
  profile: "deep_review",
  maxSlices: 5,
  maxDepth: "large",
  maxRawItems: 50,
  maxLookbackDays: 90,
  allowDocuments: false,
  allowSensitiveHealthContext: false,
  requiresCompression: true,
  maxExpansionRounds: 2,
  maxSlicesPerExpansionRound: 3,
};

/**
 * Config cannot relax document or sensitive-health exposure; enforced after load
 * and resolve. `allowDocuments` governs raw document-derived text (none exists
 * post-biomarkers); `biomarkerContext` is structured, user-visible, consent-gated
 * data and is exempt by design.
 */
export const CONTEXT_BUDGET_CONFIG_SAFETY_FLOOR = {
  allowDocuments: false,
  allowSensitiveHealthContext: false,
} as const satisfies Pick<
  ContextBudgetPolicy,
  "allowDocuments" | "allowSensitiveHealthContext"
>;

export function tryCompileContextBudgetMessagePattern(
  source: string,
  flags = "i",
): RegExp | null {
  try {
    return new RegExp(source, flags);
  } catch {
    return null;
  }
}

export function applyContextBudgetSafetyFloor(policy: ContextBudgetPolicy): ContextBudgetPolicy {
  return {
    ...policy,
    allowDocuments: CONTEXT_BUDGET_CONFIG_SAFETY_FLOOR.allowDocuments,
    allowSensitiveHealthContext: CONTEXT_BUDGET_CONFIG_SAFETY_FLOOR.allowSensitiveHealthContext,
  };
}

const CONTEXT_DEPTH_ORDER: Record<ContextDepth, number> = {
  small: 1,
  medium: 2,
  large: 3,
};

export const contextCompressionReviewKindSchema = z.enum([
  "monthly_review",
  "multi_domain_review",
]);

export type ContextCompressionReviewKind = z.infer<typeof contextCompressionReviewKindSchema>;

export const contextCompressionSourceRangeSchema = z.object({
  domain: z.string().min(1).max(80),
  periodStart: isoDateSchema.optional(),
  periodEnd: isoDateSchema.optional(),
  slicePurpose: contextSlicePurposeSchema.optional(),
});

export type ContextCompressionSourceRange = z.infer<typeof contextCompressionSourceRangeSchema>;

export const contextCompressionSourceRefSchema = z.object({
  domain: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  referenceId: z.string().uuid().optional(),
});

export type ContextCompressionSourceRef = z.infer<typeof contextCompressionSourceRefSchema>;

export const contextCompressionRequestSchema = z
  .object({
    reviewKind: contextCompressionReviewKindSchema,
    slicePurposes: z.array(contextSlicePurposeSchema).min(1).max(10),
    lookbackDays: z
      .number()
      .int()
      .min(1)
      .max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxLookbackDays),
    domainBuckets: z.array(z.string().min(1).max(80)).max(10).default([]),
  })
  .strict();

export type ContextCompressionRequest = z.infer<typeof contextCompressionRequestSchema>;

export const contextCompressionQualitySchema = z.enum(["sufficient", "partial", "insufficient"]);

export type ContextCompressionQuality = z.infer<typeof contextCompressionQualitySchema>;

export const contextCompressionConfidenceSchema = z.enum(["high", "medium", "low"]);

export type ContextCompressionConfidence = z.infer<typeof contextCompressionConfidenceSchema>;

export const contextCompressionSummarySchema = z
  .object({
    reviewKind: contextCompressionReviewKindSchema,
    keyFindings: z.array(z.string().min(1).max(500)).min(1).max(15),
    risks: z.array(z.string().min(1).max(500)).max(10).default([]),
    focusAreas: z.array(z.string().min(1).max(240)).min(1).max(10),
    sourceRanges: z.array(contextCompressionSourceRangeSchema).max(20).default([]),
    sourceRefs: z.array(contextCompressionSourceRefSchema).max(20).default([]),
    dataQuality: contextCompressionQualitySchema.optional(),
    confidence: contextCompressionConfidenceSchema.optional(),
  })
  .strict();

export type ContextCompressionSummary = z.infer<typeof contextCompressionSummarySchema>;

export const contextExpansionDecisionSchema = z.enum(["approved", "denied"]);

export type ContextExpansionDecision = z.infer<typeof contextExpansionDecisionSchema>;

export const contextExpansionLimitsSchema = z.object({
  maxExpansionRounds: z
    .number()
    .int()
    .min(0)
    .max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxExpansionRounds),
  maxSlicesPerRound: z
    .number()
    .int()
    .min(1)
    .max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlicesPerExpansionRound),
  remainingRounds: z
    .number()
    .int()
    .min(0)
    .max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxExpansionRounds),
});

export type ContextExpansionLimits = z.infer<typeof contextExpansionLimitsSchema>;

export const contextExpansionRequestSchema = z
  .object({
    roundIndex: z.number().int().min(0).max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxExpansionRounds),
    requestedSlices: z
      .array(contextSliceRequestSchema)
      .min(1)
      .max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlicesPerExpansionRound),
    reason: z.string().min(1).max(500),
  })
  .strict();

export type ContextExpansionRequest = z.infer<typeof contextExpansionRequestSchema>;

export const contextExpansionDecisionResultSchema = z
  .object({
    decision: contextExpansionDecisionSchema,
    roundIndex: z.number().int().min(0).max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxExpansionRounds),
    requestedSlices: z.array(contextSliceRequestSchema).max(10),
    approvedSlices: z
      .array(contextSliceRequestSchema)
      .max(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlicesPerExpansionRound)
      .default([]),
    reason: z.string().min(1).max(500),
    limits: contextExpansionLimitsSchema,
    denialReason: z.string().min(1).max(240).optional(),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.decision === "approved" && result.approvedSlices.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Approved expansion decisions must include at least one approved slice.",
        path: ["approvedSlices"],
      });
    }

    if (result.decision === "denied" && !result.denialReason?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Denied expansion decisions must include a denialReason.",
        path: ["denialReason"],
      });
    }
  });

export type ContextExpansionDecisionResult = z.infer<typeof contextExpansionDecisionResultSchema>;

export type ContextBudgetPolicyParseResult =
  | { success: true; data: ContextBudgetPolicy }
  | { success: false; errors: readonly string[] };

const CONTEXT_COMPRESSION_FORBIDDEN_KEYS = [
  "documentContent",
  "rawDocument",
  "documentText",
  "fullText",
  "rawContent",
  "pageContent",
  "extractedText",
  "body",
  "snippet",
  "ragResults",
] as const;

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "value";
    return `${path}: ${issue.message}`;
  });
}

export function resolveContextBudgetPolicyForProfile(
  profile: ContextBudgetProfile = "default",
): ContextBudgetPolicy {
  return profile === "deep_review"
    ? { ...DEEP_REVIEW_CONTEXT_BUDGET_POLICY }
    : { ...DEFAULT_CONTEXT_BUDGET_POLICY };
}

export function clampContextDepth(requested: ContextDepth, maxDepth: ContextDepth): ContextDepth {
  return CONTEXT_DEPTH_ORDER[requested] <= CONTEXT_DEPTH_ORDER[maxDepth] ? requested : maxDepth;
}

export function clampContextBudgetPolicy(
  input: Partial<ContextBudgetPolicyInput> = {},
): ContextBudgetPolicy {
  const base = resolveContextBudgetPolicyForProfile(
    input.profile ?? DEFAULT_CONTEXT_BUDGET_POLICY.profile,
  );

  const clamped = {
    ...base,
    ...input,
    maxSlices: Math.min(
      Math.max(1, input.maxSlices ?? base.maxSlices),
      CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlices,
    ),
    maxRawItems: Math.min(
      Math.max(0, input.maxRawItems ?? base.maxRawItems),
      CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxRawItems,
    ),
    maxLookbackDays: Math.min(
      Math.max(1, input.maxLookbackDays ?? base.maxLookbackDays),
      CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxLookbackDays,
    ),
    maxExpansionRounds: Math.min(
      Math.max(0, input.maxExpansionRounds ?? base.maxExpansionRounds),
      CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxExpansionRounds,
    ),
    maxSlicesPerExpansionRound: Math.min(
      Math.max(1, input.maxSlicesPerExpansionRound ?? base.maxSlicesPerExpansionRound),
      CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlicesPerExpansionRound,
    ),
  };

  return applyContextBudgetSafetyFloor(contextBudgetPolicySchema.parse(clamped));
}

export function safeParseContextBudgetPolicy(value: unknown): ContextBudgetPolicyParseResult {
  const parsed = contextBudgetPolicySchema.safeParse(value);

  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  return { success: false, errors: formatZodIssues(parsed.error) };
}

export function validateContextBudgetPolicy(value: unknown): string[] {
  const result = safeParseContextBudgetPolicy(value);
  return result.success ? [] : [...result.errors];
}

export function validateContextCompressionOutputShape(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["Context compression output must be an object."];
  }

  const errors: string[] = [];

  for (const key of CONTEXT_COMPRESSION_FORBIDDEN_KEYS) {
    if (key in value) {
      errors.push(`Context compression output must not include raw document field "${key}".`);
    }
  }

  const parsed = contextCompressionSummarySchema.safeParse(value);

  if (!parsed.success) {
    errors.push(...formatZodIssues(parsed.error));
  }

  return errors;
}

export function safeParseContextCompressionSummary(
  value: unknown,
): { success: true; data: ContextCompressionSummary } | { success: false; errors: readonly string[] } {
  const errors = validateContextCompressionOutputShape(value);

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: contextCompressionSummarySchema.parse(value) };
}

export type ContextExpansionValidationResult =
  | { ok: true; decision: ContextExpansionDecisionResult }
  | { ok: false; errors: readonly string[] };

export function evaluateContextExpansionRequest(input: {
  request: ContextExpansionRequest;
  budget: ContextBudgetPolicy;
  completedRounds?: number;
}): ContextExpansionValidationResult {
  const { request, budget } = input;
  const completedRounds = input.completedRounds ?? request.roundIndex;
  const limits: ContextExpansionLimits = {
    maxExpansionRounds: budget.maxExpansionRounds,
    maxSlicesPerRound: budget.maxSlicesPerExpansionRound,
    remainingRounds: Math.max(0, budget.maxExpansionRounds - completedRounds),
  };

  const errors: string[] = [];

  if (request.roundIndex >= budget.maxExpansionRounds) {
    errors.push(
      `roundIndex: Expansion round ${request.roundIndex} exceeds maxExpansionRounds (${budget.maxExpansionRounds}).`,
    );
  }

  if (request.requestedSlices.length > budget.maxSlicesPerExpansionRound) {
    errors.push(
      `requestedSlices: Requested ${request.requestedSlices.length} slices exceeds maxSlicesPerExpansionRound (${budget.maxSlicesPerExpansionRound}).`,
    );
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const approvedSlices = request.requestedSlices.slice(0, budget.maxSlicesPerExpansionRound).map(
    (slice): ContextSliceRequest => ({
      ...slice,
      depth: slice.depth
        ? clampContextDepth(slice.depth, budget.maxDepth)
        : undefined,
    }),
  );

  const decision: ContextExpansionDecisionResult = {
    decision: "approved",
    roundIndex: request.roundIndex,
    requestedSlices: request.requestedSlices,
    approvedSlices,
    reason: request.reason,
    limits,
  };

  const parsedDecision = contextExpansionDecisionResultSchema.safeParse(decision);

  if (!parsedDecision.success) {
    return { ok: false, errors: formatZodIssues(parsedDecision.error) };
  }

  return { ok: true, decision: parsedDecision.data };
}

export function denyContextExpansionRequest(input: {
  request: ContextExpansionRequest;
  budget: ContextBudgetPolicy;
  completedRounds?: number;
  denialReason: string;
}): ContextExpansionDecisionResult {
  const completedRounds = input.completedRounds ?? input.request.roundIndex;

  return contextExpansionDecisionResultSchema.parse({
    decision: "denied",
    roundIndex: input.request.roundIndex,
    requestedSlices: input.request.requestedSlices,
    approvedSlices: [],
    reason: input.request.reason,
    limits: {
      maxExpansionRounds: input.budget.maxExpansionRounds,
      maxSlicesPerRound: input.budget.maxSlicesPerExpansionRound,
      remainingRounds: Math.max(0, input.budget.maxExpansionRounds - completedRounds),
    },
    denialReason: input.denialReason,
  });
}
