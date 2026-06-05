import { z } from "zod";
import { isoDateSchema, isoDateTimeSchema } from "./dates.js";
import { aiDocumentContextSummarySchema } from "./documents.js";
import { aiMetricsContextSummarySchema } from "./device-metrics.js";
import { personalContextSummarySchema } from "./goal-hierarchy.js";
import { habitAdherencePlanSummarySchema } from "./habits.js";
import { aiRecoveryContextSummarySchema } from "./recovery.js";
import { aiWellbeingContextSummarySchema } from "./wellbeing-check-ins.js";

const progressDataStatusValues = ["sufficient", "partial", "insufficient"] as const;
const trendDirectionValues = ["up", "down", "stable", "unknown"] as const;

export const contextSlicePurposeSchema = z.enum([
  "general_chat",
  "daily_checkin",
  "workout_adaptation",
  "nutrition_adaptation",
  "weekly_review",
  "longevity_overview",
  "health_context",
]);

export type ContextSlicePurpose = z.infer<typeof contextSlicePurposeSchema>;

export const contextDepthSchema = z.enum(["small", "medium", "large"]);

export type ContextDepth = z.infer<typeof contextDepthSchema>;

export const contextTimeRangeSchema = z.enum(["7d", "14d", "30d", "90d", "1y"]);

export type ContextTimeRange = z.infer<typeof contextTimeRangeSchema>;

export const agentIntentSchema = z.enum([
  "general",
  "ask_about_today",
  "adjust_workout",
  "adjust_nutrition",
  "review_progress",
  "longevity_overview",
  "ask_health_context",
  "proposal_explainer",
]);

export type AgentIntent = z.infer<typeof agentIntentSchema>;

export const attachmentCatalogIntentIdSchema = z.enum([
  "attachment_food_photo",
  "attachment_workout",
  "attachment_medical_document",
]);

export type AttachmentCatalogIntentId = z.infer<typeof attachmentCatalogIntentIdSchema>;

export const catalogIntentIdSchema = z.union([
  agentIntentSchema,
  attachmentCatalogIntentIdSchema,
]);

export type CatalogIntentId = z.infer<typeof catalogIntentIdSchema>;

export const MAX_AGENT_LOOP_ITERATIONS = 3 as const;

export const MAX_CONTEXT_SLICES = 3 as const;

export const RULE_ROUTE_CONFIDENCE_THRESHOLD = 0.75 as const;

export const expectedResponseModeSchema = z.enum([
  "advice_only",
  "recommendation_with_optional_proposal",
  "clarification_question",
]);

export type ExpectedResponseMode = z.infer<typeof expectedResponseModeSchema>;

export const agentSafetyFlagSchema = z.enum([
  "fatigue",
  "pain",
  "sleep_issue",
  "stress",
  "hunger",
  "schedule_conflict",
  "health_context",
]);

export type AgentSafetyFlag = z.infer<typeof agentSafetyFlagSchema>;

export const contextSliceRequestSchema = z.object({
  type: contextSlicePurposeSchema,
  depth: contextDepthSchema.optional(),
  timeRange: contextTimeRangeSchema.optional(),
  includeDocuments: z.boolean().optional(),
});

export type ContextSliceRequest = z.infer<typeof contextSliceRequestSchema>;

// B7 removal: "llm_router", "message_understanding", "attachment_family" deleted.
// Pre-launch disposable DB — no backfill needed. Surviving values: "rule_based" + "unified_turn_decision".
export const agentRoutingMethodSchema = z.enum([
  "rule_based",
  "unified_turn_decision",
]);

export type AgentRoutingMethod = z.infer<typeof agentRoutingMethodSchema>;

export const agentRoutingMetadataSchema = z.object({
  confidence: z.number().min(0).max(1),
  routingMethod: agentRoutingMethodSchema,
  llmRouterInvoked: z.boolean(),
  // messageUnderstandingInvoked deleted (B7 removal, C4 cluster) — no live writer remains.
  unifiedTurnDecisionInvoked: z.boolean().optional(),
  catalogIntentId: catalogIntentIdSchema.optional(),
  safetyFlags: z.array(agentSafetyFlagSchema).max(10).default([]),
  expectedResponseMode: expectedResponseModeSchema,
  contextSliceCount: z.number().int().min(1).max(MAX_CONTEXT_SLICES),
  loopIterations: z.number().int().min(0).max(MAX_AGENT_LOOP_ITERATIONS).optional(),
  maxLoopIterations: z.number().int().min(1).max(MAX_AGENT_LOOP_ITERATIONS).optional(),
});

export type AgentRoutingMetadata = z.infer<typeof agentRoutingMetadataSchema>;

export const getUserContextSliceInputSchema = z.object({
  purpose: contextSlicePurposeSchema,
  depth: contextDepthSchema.optional(),
  timeRange: contextTimeRangeSchema.optional(),
  includeRawData: z.boolean().default(false),
  includeDocuments: z.boolean().default(false),
});

export type GetUserContextSliceInput = z.input<typeof getUserContextSliceInputSchema>;
export type ParsedGetUserContextSliceInput = z.infer<typeof getUserContextSliceInputSchema>;

export const goalContextSummarySchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1).max(80),
  status: z.string().min(1).max(40),
  priority: z.string().min(1).max(40),
  title: z.string().min(1).max(160),
  horizon: z.string().nullable(),
});

export type GoalContextSummary = z.infer<typeof goalContextSummarySchema>;

export const nutritionPlanContextSummarySchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1000),
  caloriesPerDay: z.number().int().positive().nullable(),
  proteinGrams: z.number().int().nonnegative().nullable(),
  carbsGrams: z.number().int().nonnegative().nullable(),
  fatGrams: z.number().int().nonnegative().nullable(),
  hydrationLiters: z.number().positive().nullable(),
  preferences: z.array(z.string().min(1).max(160)).max(20),
  restrictions: z.array(z.string().min(1).max(160)).max(20),
});

export type NutritionPlanContextSummary = z.infer<typeof nutritionPlanContextSummarySchema>;

export const habitPlanCoachingSummarySchema = z.object({
  activeHabitCount: z.number().int().nonnegative(),
  habits: z
    .array(
      z.object({
        habitDefinitionId: z.string().uuid(),
        title: z.string().min(1).max(160),
        category: z.string().min(1).max(80),
        status: z.string().min(1).max(40),
      }),
    )
    .max(30),
});

export const workoutExecutionSummarySchema = z.object({
  plannedCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  adherencePercent: z.number().min(0).max(100).nullable(),
  averageFatigue: z.number().min(1).max(10).nullable().optional(),
});

export type WorkoutExecutionSummary = z.infer<typeof workoutExecutionSummarySchema>;

export const weeklyProgressContextSummarySchema = z.object({
  weekStart: isoDateSchema,
  weekEnd: isoDateSchema,
  dataStatus: z.enum(progressDataStatusValues),
  userMessage: z.string().min(1).max(1000),
  trends: z
    .array(
      z.object({
        id: z.string().uuid(),
        domain: z.string().min(1).max(40),
        direction: z.enum(trendDirectionValues),
        message: z.string().min(1).max(500),
      }),
    )
    .max(10),
});

export type WeeklyProgressContextSummary = z.infer<
  typeof weeklyProgressContextSummarySchema
>;

export const userMemoryCategorySchema = z.enum([
  "preference",
  "constraint",
  "pattern",
  "insight",
]);

export type UserMemoryCategory = z.infer<typeof userMemoryCategorySchema>;

export const userMemorySourceSchema = z.enum([
  "user_stated",
  "coach_observed",
  "document_derived",
]);

export type UserMemorySource = z.infer<typeof userMemorySourceSchema>;

export const userMemoryItemSchema = z.object({
  id: z.string().uuid(),
  text: z.string().min(1).max(500),
  category: userMemoryCategorySchema,
  source: userMemorySourceSchema,
  staleAfter: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
});

export type UserMemoryItem = z.infer<typeof userMemoryItemSchema>;

export const contextSnapshotTypeSchema = z.enum([
  "weekly_review",
  "monthly_review",
  "plan_change",
]);

export type ContextSnapshotType = z.infer<typeof contextSnapshotTypeSchema>;

export const contextSnapshotItemSchema = z.object({
  id: z.string().uuid(),
  type: contextSnapshotTypeSchema,
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  summary: z.string().min(1).max(2000),
  generatedAt: isoDateTimeSchema,
});

export type ContextSnapshotItem = z.infer<typeof contextSnapshotItemSchema>;

export const contextSourceRefSchema = z.object({
  domain: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  referenceId: z.string().uuid().optional(),
  generatedAt: isoDateTimeSchema.optional(),
});

export type ContextSourceRef = z.infer<typeof contextSourceRefSchema>;

export const ragContextResultSchema = z.object({
  documentId: z.string().uuid(),
  summaryId: z.string().uuid(),
  title: z.string().min(1).max(160),
  snippet: z.string().min(1).max(500),
  provenance: z.string().min(1).max(240),
  consentScope: z.string().min(1).max(80),
});

export type RagContextResult = z.infer<typeof ragContextResultSchema>;

export const userContextSliceSchema = z.object({
  purpose: contextSlicePurposeSchema,
  depth: contextDepthSchema,
  timeRange: contextTimeRangeSchema,
  generatedAt: isoDateTimeSchema,
  userProfile: personalContextSummarySchema.optional(),
  activeGoals: z.array(goalContextSummarySchema).max(20).optional(),
  coachingHierarchy: z
    .object({
      directionStatement: z.string().nullable(),
      weeklyFocusCount: z.number().int().nonnegative(),
    })
    .optional(),
  activeWorkoutPlan: z
    .object({
      title: z.string().min(1).max(160),
      summary: z.string().min(1).max(1000),
      sessionCount: z.number().int().nonnegative(),
    })
    .nullable()
    .optional(),
  activeNutritionPlan: nutritionPlanContextSummarySchema.nullable().optional(),
  activeHabitPlan: habitPlanCoachingSummarySchema.nullable().optional(),
  recentHabitAdherence: habitAdherencePlanSummarySchema.nullable().optional(),
  weeklyProgress: weeklyProgressContextSummarySchema.nullable().optional(),
  recentWorkoutExecution: workoutExecutionSummarySchema.nullable().optional(),
  metricsSummary: aiMetricsContextSummarySchema.optional(),
  wellbeingSummary: aiWellbeingContextSummarySchema.optional(),
  recoveryContext: aiRecoveryContextSummarySchema.optional(),
  documentContext: aiDocumentContextSummarySchema.optional(),
  ragResults: z.array(ragContextResultSchema).max(5).optional(),
  relevantMemories: z.array(userMemoryItemSchema).max(20).default([]),
  snapshots: z.array(contextSnapshotItemSchema).max(5).default([]),
  recommendationConstraints: z.array(z.string().min(1).max(240)).max(10).default([]),
  sourceRefs: z.array(contextSourceRefSchema).max(20).default([]),
});

export type UserContextSlice = z.infer<typeof userContextSliceSchema>;

export const buildAgentContextRequestSchema = z.object({
  userMessage: z.string().min(1).max(4000),
  intent: agentIntentSchema.optional(),
  purpose: contextSlicePurposeSchema.optional(),
  depth: contextDepthSchema.optional(),
  timeRange: contextTimeRangeSchema.optional(),
  includeDocuments: z.boolean().optional(),
});

export type BuildAgentContextRequest = z.infer<typeof buildAgentContextRequestSchema>;

export const agentContextPacketSchema = z
  .object({
    purpose: contextSlicePurposeSchema,
    depth: contextDepthSchema,
    timeRange: contextTimeRangeSchema,
    intent: agentIntentSchema,
    generatedAt: isoDateTimeSchema,
    slice: userContextSliceSchema,
    supplementarySlices: z.array(userContextSliceSchema).max(MAX_CONTEXT_SLICES - 1).default([]),
    missingContextNotes: z.array(z.string().min(1).max(240)).max(5).default([]),
    safetyConstraints: z.array(z.string().min(1).max(240)).max(15),
    sourceRefs: z.array(contextSourceRefSchema).max(20).default([]),
    routing: agentRoutingMetadataSchema.optional(),
  })
  .superRefine((packet, ctx) => {
    if (packet.slice.purpose !== packet.purpose) {
      ctx.addIssue({
        code: "custom",
        message: "agentContextPacket.purpose must match slice.purpose",
        path: ["purpose"],
      });
    }
  });

export type AgentContextPacket = z.infer<typeof agentContextPacketSchema>;

export const intentRouteResultSchema = z.object({
  intent: agentIntentSchema,
  catalogIntentId: catalogIntentIdSchema,
  confidence: z.number().min(0).max(1),
  isConfident: z.boolean(),
  purpose: contextSlicePurposeSchema,
  depth: contextDepthSchema,
  timeRange: contextTimeRangeSchema,
  includeDocuments: z.boolean(),
  routingMethod: agentRoutingMethodSchema,
  requiredContextSlices: z.array(contextSliceRequestSchema).min(1).max(MAX_CONTEXT_SLICES),
  safetyFlags: z.array(agentSafetyFlagSchema).max(10).default([]),
  expectedResponseMode: expectedResponseModeSchema,
});

export type IntentRouteResult = z.infer<typeof intentRouteResultSchema>;

export const agentSafetyStatusSchema = z.enum([
  "passed",
  "reply_blocked",
  "parse_failed",
  "provider_error",
]);

export type AgentSafetyStatus = z.infer<typeof agentSafetyStatusSchema>;

export const agentSafetyMetadataSchema = z.object({
  status: agentSafetyStatusSchema,
  blockedReasons: z.array(z.string().min(1).max(240)).max(10).default([]),
  constraintsApplied: z.array(z.string().min(1).max(240)).max(15).default([]),
});

export type AgentSafetyMetadata = z.infer<typeof agentSafetyMetadataSchema>;

export const agentToolNameSchema = z.enum([
  "getUserContextSlice",
  "getDocumentContext",
  "getWeeklyProgressContext",
]);

export type AgentToolName = z.infer<typeof agentToolNameSchema>;

export const agentToolCallRequestSchema = z.object({
  tool: agentToolNameSchema,
  input: z.record(z.string(), z.unknown()),
});

export type AgentToolCallRequest = z.infer<typeof agentToolCallRequestSchema>;

export const agentToolCallResultSchema = z.object({
  tool: agentToolNameSchema,
  ok: z.boolean(),
  result: z.unknown().optional(),
  errors: z.array(z.string().min(1).max(240)).max(10).default([]),
});

export type AgentToolCallResult = z.infer<typeof agentToolCallResultSchema>;

export const agentGetUserContextSliceToolResultSchema = userContextSliceSchema;

export type AgentGetUserContextSliceToolResult = z.infer<
  typeof agentGetUserContextSliceToolResultSchema
>;

export const agentGetDocumentContextToolResultSchema = z.object({
  documentContext: aiDocumentContextSummarySchema,
  ragResults: z.array(ragContextResultSchema),
});

export type AgentGetDocumentContextToolResult = z.infer<
  typeof agentGetDocumentContextToolResultSchema
>;

export const agentGetWeeklyProgressContextToolResultSchema =
  weeklyProgressContextSummarySchema.nullable();

export type AgentGetWeeklyProgressContextToolResult = z.infer<
  typeof agentGetWeeklyProgressContextToolResultSchema
>;

export const agentLoopToolRequestSchema = z
  .object({
    kind: z.literal("tool_request"),
    tool: agentToolNameSchema,
    input: z.record(z.string(), z.unknown()).default({}),
    rationale: z.string().min(1).max(500).optional(),
  })
  .strict();

export type AgentLoopToolRequest = z.infer<typeof agentLoopToolRequestSchema>;

export const agentLoopFinalAnswerSchema = z
  .object({
    kind: z.literal("final_answer"),
    reply: z.string().min(1).max(8000),
    proposals: z.array(z.record(z.string(), z.unknown())).max(5).default([]),
  })
  .strict();

export type AgentLoopFinalAnswer = z.infer<typeof agentLoopFinalAnswerSchema>;

export const agentLoopOutputSchema = z.discriminatedUnion("kind", [
  agentLoopToolRequestSchema,
  agentLoopFinalAnswerSchema,
]);

export type AgentLoopOutput = z.infer<typeof agentLoopOutputSchema>;
export type AgentLoopOutputInput = z.input<typeof agentLoopOutputSchema>;

const AGENT_LOOP_FORBIDDEN_KEYS = [
  "advice",
  "recommendation",
  "answer",
  "response",
  "userMessage",
  "coachingText",
] as const;

export function validateAgentLoopOutputShape(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["Agent loop output must be an object."];
  }

  const errors: string[] = [];

  for (const key of AGENT_LOOP_FORBIDDEN_KEYS) {
    if (key in value) {
      errors.push(`Agent loop output must not include user-facing field "${key}".`);
    }
  }

  const parsed = agentLoopOutputSchema.safeParse(value);

  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => issue.message));
  }

  return errors;
}

export const agentCitationSchema = z.object({
  sourceType: z.enum(["structured_state", "document_summary", "memory", "snapshot"]),
  label: z.string().min(1).max(160),
  referenceId: z.string().uuid().optional(),
});

export type AgentCitation = z.infer<typeof agentCitationSchema>;

export const agentTurnCapabilityCompositionStrategySchema = z.enum([
  "primary_only",
  "additive_supporting",
]);

export type AgentTurnCapabilityCompositionStrategy = z.infer<
  typeof agentTurnCapabilityCompositionStrategySchema
>;

export const agentTurnCapabilityDescriptorSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.string().min(1).max(80),
  proposalIntent: z.string().min(1).max(80).optional(),
});

export type AgentTurnCapabilityDescriptor = z.infer<typeof agentTurnCapabilityDescriptorSchema>;

export const agentTurnCapabilityPresentationSchema = z.object({
  primaryCapabilityId: catalogIntentIdSchema,
  selectedCapabilityIds: z.array(catalogIntentIdSchema).min(1).max(10),
  compositionStrategy: agentTurnCapabilityCompositionStrategySchema,
  widgetDescriptors: z.array(agentTurnCapabilityDescriptorSchema).max(20).default([]),
  actionDescriptors: z.array(agentTurnCapabilityDescriptorSchema).max(20).default([]),
});

export type AgentTurnCapabilityPresentation = z.infer<
  typeof agentTurnCapabilityPresentationSchema
>;

export const agentUnifiedTurnDecisionMetadataSchema = z.object({
  ran: z.boolean(),
  source: z.enum(["llm", "fallback"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  routingMethod: z.literal("unified_turn_decision").optional(),
  validationErrorCount: z.number().int().min(0).max(20).optional(),
  blockedFallback: z.boolean().optional(),
});

export type AgentUnifiedTurnDecisionMetadata = z.infer<
  typeof agentUnifiedTurnDecisionMetadataSchema
>;

// ---------------------------------------------------------------------------
// Fan-out diagnostics — per-stage observability for the multi-domain pipeline.
// All blocks are additive/optional so existing persisted metadata stays valid.
// Structural fields only (counts, ids, flags) — never message text or health
// content (safety floor). The three-domain enum is defined locally here to
// avoid a circular import with router-decision.ts (which imports this module).
// ---------------------------------------------------------------------------
const fanOutDomainEnumSchema = z.enum(["workout", "nutrition", "health"]);

export const agentFanOutRouterDiagnosticsSchema = z.object({
  ran: z.boolean(),
  source: z.enum(["llm", "fallback"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  selectedDomains: z
    .array(
      z.object({
        domain: fanOutDomainEnumSchema,
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(3)
    .default([]),
  blockedFallback: z.boolean().optional(),
});

export const agentFanOutDomainDiagnosticsSchema = z.object({
  domain: fanOutDomainEnumSchema,
  degraded: z.boolean(),
  degradedReasons: z.array(z.string().min(1).max(240)).max(10).default([]),
  candidateProposalCount: z.number().int().min(0).max(5),
  loopIterations: z.number().int().min(0).max(20),
  toolsInvoked: z.array(agentToolNameSchema).max(15).default([]),
  hasWorkoutCalorieEstimate: z.boolean().default(false),
});

export const agentFanOutDecisionDiagnosticsSchema = z.object({
  degraded: z.boolean(),
  selectedAction: z.string().min(1).max(80).nullable().default(null),
  proposalCount: z.number().int().min(0).max(5),
  consentRequired: z.boolean().default(false),
});

export const agentFanOutResolutionDiagnosticsSchema = z.object({
  resolvedProposalCount: z.number().int().min(0).max(5),
  droppedByAllowlist: z.number().int().min(0).max(10),
  replyBlocked: z.boolean(),
  finalProposalCount: z.number().int().min(0).max(5),
});

export const agentFanOutDiagnosticsSchema = z.object({
  router: agentFanOutRouterDiagnosticsSchema.optional(),
  domains: z.array(agentFanOutDomainDiagnosticsSchema).max(3).default([]),
  decision: agentFanOutDecisionDiagnosticsSchema.optional(),
  resolution: agentFanOutResolutionDiagnosticsSchema.optional(),
});

export type AgentFanOutDiagnostics = z.infer<typeof agentFanOutDiagnosticsSchema>;

export const agentTurnMetadataSchema = z.object({
  provider: z.literal("openai"),
  intent: agentIntentSchema,
  catalogIntentId: catalogIntentIdSchema.optional(),
  primaryCapabilityId: catalogIntentIdSchema.optional(),
  selectedCapabilityIds: z.array(catalogIntentIdSchema).max(10).optional(),
  capabilityPresentation: agentTurnCapabilityPresentationSchema.optional(),
  purpose: contextSlicePurposeSchema,
  depth: contextDepthSchema,
  timeRange: contextTimeRangeSchema,
  toolsInvoked: z.array(agentToolNameSchema).max(15).default([]),
  safety: agentSafetyMetadataSchema,
  citations: z.array(agentCitationSchema).max(10).default([]),
  routing: agentRoutingMetadataSchema.optional(),
  unifiedTurnDecision: agentUnifiedTurnDecisionMetadataSchema.optional(),
  responseModeExecution: z
    .object({
      executorMode: z.enum([
        "deterministic_read",
        "deterministic_write",
        "single_llm",
        "context_aware_llm",
        "proposal_flow",
        "context_expansion_loop",
      ]),
      llmInvoked: z.boolean(),
      expectedResponseMode: expectedResponseModeSchema,
      delegatedToPreAiGate: z.boolean().optional(),
      preAiGateDelegationMissed: z.boolean().optional(),
      handlerPath: z
        .enum([
          "pre_ai_gate_delegation",
          "single_final_answer",
          "bounded_tool_loop",
          "proposal_bounded_loop",
          "context_expansion_bounded_loop",
        ])
        .optional(),
      maxLoopIterations: z.number().int().min(0).max(MAX_AGENT_LOOP_ITERATIONS).optional(),
      allowToolLoop: z.boolean().optional(),
      useContextExpansionMetadata: z.boolean().optional(),
    })
    .optional(),
  missingContextNotes: z.array(z.string().min(1).max(240)).max(5).default([]),
  /** Per-stage fan-out diagnostics (router/domains/decision/resolution). Optional/additive. */
  fanOut: agentFanOutDiagnosticsSchema.optional(),
});

export type AgentTurnMetadata = z.infer<typeof agentTurnMetadataSchema>;

export const aiCoachProviderModeSchema = z.literal("openai");

export type AiCoachProviderMode = z.infer<typeof aiCoachProviderModeSchema>;

export const DEFAULT_AGENT_SAFETY_CONSTRAINTS = [
  "Do not diagnose medical conditions.",
  "Do not prescribe medication or claim to treat diseases.",
  "Prefer wellness coaching, habits, and structured plan suggestions.",
  "Plan changes must be proposals requiring user approval.",
  "Do not expose raw health documents or private wellbeing notes.",
] as const;

export const INTENT_TO_SLICE_PURPOSE: Record<AgentIntent, ContextSlicePurpose> = {
  general: "general_chat",
  ask_about_today: "daily_checkin",
  adjust_workout: "workout_adaptation",
  adjust_nutrition: "nutrition_adaptation",
  review_progress: "weekly_review",
  longevity_overview: "longevity_overview",
  ask_health_context: "health_context",
  proposal_explainer: "general_chat",
};

export function resolveDefaultDepthForPurpose(purpose: ContextSlicePurpose): ContextDepth {
  switch (purpose) {
    case "general_chat":
    case "daily_checkin":
      return "small";
    case "workout_adaptation":
    case "nutrition_adaptation":
      return "medium";
    case "weekly_review":
    case "longevity_overview":
    case "health_context":
      return "large";
  }
}

export function resolveDefaultTimeRangeForPurpose(
  purpose: ContextSlicePurpose,
): ContextTimeRange {
  switch (purpose) {
    case "general_chat":
    case "daily_checkin":
      return "7d";
    case "workout_adaptation":
    case "nutrition_adaptation":
      return "14d";
    case "weekly_review":
      return "7d";
    case "longevity_overview":
      return "90d";
    case "health_context":
      return "30d";
  }
}

export function shouldIncludeDocumentsForPurpose(purpose: ContextSlicePurpose): boolean {
  return purpose === "health_context";
}

export function resolveDefaultExpectedResponseMode(
  intent: AgentIntent,
): ExpectedResponseMode {
  switch (intent) {
    case "general":
    case "proposal_explainer":
      return "advice_only";
    case "ask_health_context":
      return "recommendation_with_optional_proposal";
    default:
      return "recommendation_with_optional_proposal";
  }
}

export function normalizeContextSlicePlan(
  requests: ReadonlyArray<ContextSliceRequest>,
): ContextSliceRequest[] {
  const normalized: ContextSliceRequest[] = [];
  const seen = new Set<ContextSlicePurpose>();

  for (const request of requests) {
    if (seen.has(request.type)) {
      continue;
    }

    seen.add(request.type);
    normalized.push({
      type: request.type,
      depth: request.depth ?? resolveDefaultDepthForPurpose(request.type),
      timeRange: request.timeRange ?? resolveDefaultTimeRangeForPurpose(request.type),
      includeDocuments:
        request.includeDocuments ?? shouldIncludeDocumentsForPurpose(request.type),
    });

    if (normalized.length >= MAX_CONTEXT_SLICES) {
      break;
    }
  }

  if (normalized.length === 0) {
    normalized.push({
      type: "general_chat",
      depth: resolveDefaultDepthForPurpose("general_chat"),
      timeRange: resolveDefaultTimeRangeForPurpose("general_chat"),
      includeDocuments: false,
    });
  }

  return normalized;
}

export function buildContextSliceRequestForIntent(
  intent: AgentIntent,
  options?: {
    depth?: ContextDepth;
    timeRange?: ContextTimeRange;
    includeDocuments?: boolean;
  },
): ContextSliceRequest {
  const purpose = INTENT_TO_SLICE_PURPOSE[intent];

  return {
    type: purpose,
    depth: options?.depth ?? resolveDefaultDepthForPurpose(purpose),
    timeRange: options?.timeRange ?? resolveDefaultTimeRangeForPurpose(purpose),
    includeDocuments: options?.includeDocuments ?? shouldIncludeDocumentsForPurpose(purpose),
  };
}

export function buildRouteFromCatalogIntent(input: {
  catalogIntentId: CatalogIntentId;
  mappedAgentIntent: AgentIntent;
  confidence: number;
  routingMethod: AgentRoutingMethod;
  safetyFlags?: AgentSafetyFlag[];
  expectedResponseMode?: ExpectedResponseMode;
  requiredContextSlices?: ContextSliceRequest[];
}): IntentRouteResult {
  const slicePlan = normalizeContextSlicePlan(
    input.requiredContextSlices ?? [buildContextSliceRequestForIntent(input.mappedAgentIntent)],
  );
  const primary = slicePlan[0]!;

  return {
    intent: input.mappedAgentIntent,
    catalogIntentId: input.catalogIntentId,
    confidence: input.confidence,
    isConfident: input.confidence >= RULE_ROUTE_CONFIDENCE_THRESHOLD,
    purpose: primary.type,
    depth: primary.depth ?? resolveDefaultDepthForPurpose(primary.type),
    timeRange: primary.timeRange ?? resolveDefaultTimeRangeForPurpose(primary.type),
    includeDocuments: primary.includeDocuments ?? shouldIncludeDocumentsForPurpose(primary.type),
    routingMethod: input.routingMethod,
    requiredContextSlices: slicePlan,
    safetyFlags: input.safetyFlags ?? [],
    expectedResponseMode:
      input.expectedResponseMode ?? resolveDefaultExpectedResponseMode(input.mappedAgentIntent),
  };
}

