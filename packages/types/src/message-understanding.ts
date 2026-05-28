import { z } from "zod";
import { agentSafetyFlagSchema, catalogIntentIdSchema } from "./agent-context.js";
import { chatAttachmentCategorySchema } from "./chat-attachments.js";
import { directChatPathKindSchema } from "./direct-chat-path.js";
import { messagePreprocessorResultSchema } from "./message-preprocessor.js";

export const MESSAGE_UNDERSTANDING_FALLBACK_CONFIDENCE = 0.35 as const;

export const messageUnderstandingSignalSchema = z.enum([
  "question",
  "request_change",
  "information_share",
  "feedback",
  "clarification_needed",
  "command_like",
  "greeting",
  "progress_update",
  "attachment_reference",
  "wellness_check_in",
]);

export type MessageUnderstandingSignal = z.infer<typeof messageUnderstandingSignalSchema>;

export const messageUnderstandingEntityKindSchema = z.enum([
  "date",
  "body_part",
  "exercise",
  "food",
  "metric",
  "goal",
  "habit",
  "symptom",
  "other",
]);

export type MessageUnderstandingEntityKind = z.infer<typeof messageUnderstandingEntityKindSchema>;

export const messageUnderstandingEntitySchema = z.object({
  kind: messageUnderstandingEntityKindSchema,
  value: z.string().min(1).max(200),
  confidence: z.number().min(0).max(1).optional(),
});

export type MessageUnderstandingEntity = z.infer<typeof messageUnderstandingEntitySchema>;

export const messageUnderstandingCapabilityHintSchema = z.object({
  capabilityId: catalogIntentIdSchema,
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(240).optional(),
});

export type MessageUnderstandingCapabilityHint = z.infer<
  typeof messageUnderstandingCapabilityHintSchema
>;

export const messageUnderstandingComplexitySchema = z.enum(["simple", "moderate", "complex"]);

export type MessageUnderstandingComplexity = z.infer<typeof messageUnderstandingComplexitySchema>;

export const messageUnderstandingDirectCommandSchema = z.object({
  detected: z.boolean(),
  kind: directChatPathKindSchema.nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type MessageUnderstandingDirectCommand = z.infer<
  typeof messageUnderstandingDirectCommandSchema
>;

export const messageUnderstandingContextNeedSchema = z.enum([
  "today_summary",
  "active_workout_plan",
  "active_nutrition_plan",
  "weekly_progress",
  "habit_plan",
  "wellbeing_history",
  "health_documents",
  "attachment_context",
  "recent_conversation",
]);

export type MessageUnderstandingContextNeed = z.infer<typeof messageUnderstandingContextNeedSchema>;

export const messageUnderstandingOutputSchema = z
  .object({
    signals: z.array(messageUnderstandingSignalSchema).max(20).default([]),
    entities: z.array(messageUnderstandingEntitySchema).max(30).default([]),
    capabilityHints: z.array(messageUnderstandingCapabilityHintSchema).max(5).default([]),
    complexity: messageUnderstandingComplexitySchema,
    directCommand: messageUnderstandingDirectCommandSchema,
    safetyFlags: z.array(agentSafetyFlagSchema).max(10).default([]),
    needsContext: z.array(messageUnderstandingContextNeedSchema).max(10).default([]),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type MessageUnderstandingOutput = z.infer<typeof messageUnderstandingOutputSchema>;
export type MessageUnderstandingOutputInput = z.input<typeof messageUnderstandingOutputSchema>;

export const messageUnderstandingSourceSchema = z.enum(["llm", "fallback"]);

export type MessageUnderstandingSource = z.infer<typeof messageUnderstandingSourceSchema>;

export const messageUnderstandingResultSchema = z.object({
  output: messageUnderstandingOutputSchema,
  source: messageUnderstandingSourceSchema,
  validationErrors: z.array(z.string()).default([]),
});

export type MessageUnderstandingResult = z.infer<typeof messageUnderstandingResultSchema>;

export const messageUnderstandingAttachmentContextSummarySchema = z.object({
  attachmentRefId: z.string().uuid(),
  category: chatAttachmentCategorySchema,
  status: z.string().min(1).max(40),
  routingCapabilityId: z.string().nullable(),
  contextHint: z.string().nullable(),
  recognitionPresent: z.boolean(),
});

export type MessageUnderstandingAttachmentContextSummary = z.infer<
  typeof messageUnderstandingAttachmentContextSummarySchema
>;

export const messageUnderstandingRecentMessageHintSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(4000),
});

export type MessageUnderstandingRecentMessageHint = z.infer<
  typeof messageUnderstandingRecentMessageHintSchema
>;

export const messageUnderstandingCatalogHintSchema = z.object({
  id: catalogIntentIdSchema,
  description: z.string(),
  routerGuidance: z.string(),
});

export type MessageUnderstandingCatalogHint = z.infer<typeof messageUnderstandingCatalogHintSchema>;

export const messageUnderstandingRequestSchema = z.object({
  originalText: z.string(),
  normalizedText: z.string(),
  preprocessor: messagePreprocessorResultSchema,
  attachmentContextSummaries: z
    .array(messageUnderstandingAttachmentContextSummarySchema)
    .max(20)
    .default([]),
  recentMessageHints: z.array(messageUnderstandingRecentMessageHintSchema).max(10).default([]),
  catalogHints: z.array(messageUnderstandingCatalogHintSchema).max(30).default([]),
});

export type MessageUnderstandingRequest = z.infer<typeof messageUnderstandingRequestSchema>;

const MESSAGE_UNDERSTANDING_FORBIDDEN_KEYS = [
  "reply",
  "advice",
  "recommendation",
  "answer",
  "response",
  "proposals",
  "proposal",
  "userMessage",
  "coachingText",
  "finalAnswer",
  "tool",
  "tool_request",
  "kind",
  "catalogIntentId",
  "requiredContextSlices",
  "expectedResponseMode",
  "routingMethod",
] as const;

export function validateMessageUnderstandingOutputShape(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["Message understanding output must be an object."];
  }

  const errors: string[] = [];

  for (const key of MESSAGE_UNDERSTANDING_FORBIDDEN_KEYS) {
    if (key in value) {
      errors.push(`Message understanding output must not include forbidden field "${key}".`);
    }
  }

  const parsed = messageUnderstandingOutputSchema.safeParse(value);

  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => issue.message));
  }

  return errors;
}

function deriveSafetyFlagsFromPreprocessor(
  simpleSignals: MessageUnderstandingRequest["preprocessor"]["simpleSignals"],
): MessageUnderstandingOutput["safetyFlags"] {
  const flags = new Set<MessageUnderstandingOutput["safetyFlags"][number]>();

  if (simpleSignals.fatigue) {
    flags.add("fatigue");
  }

  if (simpleSignals.pain) {
    flags.add("pain");
  }

  if (simpleSignals.sleep) {
    flags.add("sleep_issue");
  }

  return [...flags];
}

function deriveSignalsFromPreprocessor(
  request: MessageUnderstandingRequest,
): MessageUnderstandingSignal[] {
  const signals = new Set<MessageUnderstandingSignal>();
  const { preprocessor, attachmentContextSummaries } = request;

  if (preprocessor.directPathCandidate) {
    signals.add("command_like");
  }

  if (attachmentContextSummaries.length > 0) {
    signals.add("attachment_reference");
  }

  if (/\?/.test(request.normalizedText)) {
    signals.add("question");
  }

  if (
    preprocessor.simpleSignals.workout ||
    preprocessor.simpleSignals.nutrition ||
    preprocessor.simpleSignals.today
  ) {
    signals.add("request_change");
  }

  if (
    preprocessor.simpleSignals.fatigue ||
    preprocessor.simpleSignals.pain ||
    preprocessor.simpleSignals.sleep
  ) {
    signals.add("wellness_check_in");
  }

  return [...signals];
}

function deriveCapabilityHintsFromPreprocessor(
  request: MessageUnderstandingRequest,
): MessageUnderstandingCapabilityHint[] {
  const hints: MessageUnderstandingCapabilityHint[] = [];
  const { preprocessor, attachmentContextSummaries } = request;

  if (preprocessor.simpleSignals.workout) {
    hints.push({ capabilityId: "adjust_workout", confidence: 0.4 });
  }

  if (preprocessor.simpleSignals.nutrition) {
    hints.push({ capabilityId: "adjust_nutrition", confidence: 0.4 });
  }

  if (preprocessor.simpleSignals.today) {
    hints.push({ capabilityId: "ask_about_today", confidence: 0.4 });
  }

  for (const summary of attachmentContextSummaries) {
    if (!summary.routingCapabilityId) {
      continue;
    }

    const parsedCapabilityId = catalogIntentIdSchema.safeParse(summary.routingCapabilityId);

    if (parsedCapabilityId.success) {
      hints.push({
        capabilityId: parsedCapabilityId.data,
        confidence: 0.45,
      });
    }
  }

  if (hints.length === 0) {
    hints.push({ capabilityId: "general", confidence: MESSAGE_UNDERSTANDING_FALLBACK_CONFIDENCE });
  }

  return hints.slice(0, 5);
}

function deriveNeedsContextFromRequest(
  request: MessageUnderstandingRequest,
): MessageUnderstandingContextNeed[] {
  const needs = new Set<MessageUnderstandingContextNeed>();

  if (request.attachmentContextSummaries.length > 0) {
    needs.add("attachment_context");
  }

  if (request.preprocessor.directPathCandidate?.kind === "today_summary_read") {
    needs.add("today_summary");
  }

  if (request.preprocessor.directPathCandidate?.kind === "mark_today_workout_done") {
    needs.add("today_summary");
    needs.add("active_workout_plan");
  }

  if (request.recentMessageHints.length > 0) {
    needs.add("recent_conversation");
  }

  return [...needs];
}

export function createFallbackMessageUnderstanding(
  request: MessageUnderstandingRequest,
): MessageUnderstandingOutput {
  const directPathCandidate = request.preprocessor.directPathCandidate;

  return messageUnderstandingOutputSchema.parse({
    signals: deriveSignalsFromPreprocessor(request),
    entities: [],
    capabilityHints: deriveCapabilityHintsFromPreprocessor(request),
    complexity: directPathCandidate ? "simple" : "moderate",
    directCommand: {
      detected: Boolean(directPathCandidate),
      kind: directPathCandidate?.kind ?? null,
      confidence: directPathCandidate ? 0.75 : undefined,
    },
    safetyFlags: deriveSafetyFlagsFromPreprocessor(request.preprocessor.simpleSignals),
    needsContext: deriveNeedsContextFromRequest(request),
    confidence: MESSAGE_UNDERSTANDING_FALLBACK_CONFIDENCE,
  });
}

export function createFallbackMessageUnderstandingResult(
  request: MessageUnderstandingRequest,
  validationErrors: readonly string[] = [],
): MessageUnderstandingResult {
  return messageUnderstandingResultSchema.parse({
    output: createFallbackMessageUnderstanding(request),
    source: "fallback",
    validationErrors: [...validationErrors],
  });
}

export function truncateRecentMessagesForUnderstandingHints(
  recentMessages: ReadonlyArray<{
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
  }>,
  maxMessages = 6,
  maxContentLength = 400,
): MessageUnderstandingRecentMessageHint[] {
  return recentMessages.slice(-maxMessages).map((message) => ({
    role: message.role,
    content:
      message.content.length > maxContentLength
        ? `${message.content.slice(0, maxContentLength)}...`
        : message.content,
  }));
}
