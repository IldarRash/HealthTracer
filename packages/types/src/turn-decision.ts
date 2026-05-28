import { z } from "zod";
import {
  agentSafetyFlagSchema,
  agentToolNameSchema,
  catalogIntentIdSchema,
} from "./agent-context.js";
import { chatAttachmentCategorySchema } from "./chat-attachments.js";
import { directChatPathKindSchema } from "./direct-chat-path.js";
import { messagePreprocessorResultSchema } from "./message-preprocessor.js";
import {
  MESSAGE_UNDERSTANDING_FALLBACK_CONFIDENCE,
  messageUnderstandingCapabilityHintSchema,
  messageUnderstandingComplexitySchema,
  messageUnderstandingContextNeedSchema,
  messageUnderstandingDirectCommandSchema,
  messageUnderstandingEntitySchema,
  messageUnderstandingSignalSchema,
  type MessageUnderstandingOutput,
  type MessageUnderstandingRequest,
} from "./message-understanding.js";

export const TURN_DECISION_FALLBACK_CONFIDENCE = MESSAGE_UNDERSTANDING_FALLBACK_CONFIDENCE;

export const turnDecisionSignalSchema = messageUnderstandingSignalSchema;

export type TurnDecisionSignal = z.infer<typeof turnDecisionSignalSchema>;

export const turnDecisionCapabilityHintSchema = messageUnderstandingCapabilityHintSchema;

export type TurnDecisionCapabilityHint = z.infer<typeof turnDecisionCapabilityHintSchema>;

export const turnDecisionComplexitySchema = messageUnderstandingComplexitySchema;

export type TurnDecisionComplexity = z.infer<typeof turnDecisionComplexitySchema>;

export const turnDecisionDirectCommandSchema = messageUnderstandingDirectCommandSchema;

export type TurnDecisionDirectCommand = z.infer<typeof turnDecisionDirectCommandSchema>;

export const turnDecisionContextNeedSchema = messageUnderstandingContextNeedSchema;

export type TurnDecisionContextNeed = z.infer<typeof turnDecisionContextNeedSchema>;

export const turnDecisionAttachmentHintSchema = z.object({
  attachmentRefId: z.string().uuid(),
  category: chatAttachmentCategorySchema,
  routingCapabilityId: catalogIntentIdSchema.nullable(),
  confidence: z.number().min(0).max(1).optional(),
  contextHint: z.string().max(240).nullable().optional(),
});

export type TurnDecisionAttachmentHint = z.infer<typeof turnDecisionAttachmentHintSchema>;

export const turnDecisionToolNeedSchema = z.object({
  tool: agentToolNameSchema,
  rationale: z.string().max(240).optional(),
});

export type TurnDecisionToolNeed = z.infer<typeof turnDecisionToolNeedSchema>;

export const turnDecisionOutputSchema = z
  .object({
    signals: z.array(turnDecisionSignalSchema).max(20).default([]),
    entities: z.array(messageUnderstandingEntitySchema).max(30).default([]),
    routeCapabilityHints: z.array(turnDecisionCapabilityHintSchema).max(5).default([]),
    complexity: turnDecisionComplexitySchema,
    directCommand: turnDecisionDirectCommandSchema,
    safetyFlags: z.array(agentSafetyFlagSchema).max(10).default([]),
    contextNeeds: z.array(turnDecisionContextNeedSchema).max(10).default([]),
    attachmentHints: z.array(turnDecisionAttachmentHintSchema).max(20).default([]),
    toolNeeds: z.array(turnDecisionToolNeedSchema).max(5).default([]),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type TurnDecisionOutput = z.infer<typeof turnDecisionOutputSchema>;
export type TurnDecisionOutputInput = z.input<typeof turnDecisionOutputSchema>;

export const turnDecisionSourceSchema = z.enum(["llm", "fallback"]);

export type TurnDecisionSource = z.infer<typeof turnDecisionSourceSchema>;

export const turnDecisionResultSchema = z.object({
  output: turnDecisionOutputSchema,
  source: turnDecisionSourceSchema,
  validationErrors: z.array(z.string()).default([]),
});

export type TurnDecisionResult = z.infer<typeof turnDecisionResultSchema>;

export const turnDecisionAttachmentContextSummarySchema = z.object({
  attachmentRefId: z.string().uuid(),
  category: chatAttachmentCategorySchema,
  status: z.string().min(1).max(40),
  routingCapabilityId: z.string().nullable(),
  contextHint: z.string().nullable(),
  recognitionPresent: z.boolean(),
});

export type TurnDecisionAttachmentContextSummary = z.infer<
  typeof turnDecisionAttachmentContextSummarySchema
>;

export const turnDecisionRecentMessageHintSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(4000),
});

export type TurnDecisionRecentMessageHint = z.infer<typeof turnDecisionRecentMessageHintSchema>;

export const turnDecisionCatalogHintSchema = z.object({
  id: catalogIntentIdSchema,
  description: z.string(),
  routerGuidance: z.string(),
});

export type TurnDecisionCatalogHint = z.infer<typeof turnDecisionCatalogHintSchema>;

export const turnDecisionRequestSchema = z.object({
  originalText: z.string(),
  normalizedText: z.string(),
  preprocessor: messagePreprocessorResultSchema,
  attachmentContextSummaries: z
    .array(turnDecisionAttachmentContextSummarySchema)
    .max(20)
    .default([]),
  recentMessageHints: z.array(turnDecisionRecentMessageHintSchema).max(10).default([]),
  catalogHints: z.array(turnDecisionCatalogHintSchema).max(30).default([]),
  availableTools: z.array(agentToolNameSchema).max(10).default([]),
});

export type TurnDecisionRequest = z.infer<typeof turnDecisionRequestSchema>;

const TURN_DECISION_FORBIDDEN_KEYS = [
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
  "capabilityHints",
  "needsContext",
] as const;

export function validateTurnDecisionOutputShape(value: unknown): string[] {
  if (!value || typeof value !== "object") {
    return ["Turn decision output must be an object."];
  }

  const errors: string[] = [];

  for (const key of TURN_DECISION_FORBIDDEN_KEYS) {
    if (key in value) {
      errors.push(`Turn decision output must not include forbidden field "${key}".`);
    }
  }

  const parsed = turnDecisionOutputSchema.safeParse(value);

  if (!parsed.success) {
    errors.push(...parsed.error.issues.map((issue) => issue.message));
  }

  return errors;
}

export function mapMessageUnderstandingRequestToTurnDecisionRequest(
  request: MessageUnderstandingRequest,
  availableTools: TurnDecisionRequest["availableTools"] = [],
): TurnDecisionRequest {
  return turnDecisionRequestSchema.parse({
    originalText: request.originalText,
    normalizedText: request.normalizedText,
    preprocessor: request.preprocessor,
    attachmentContextSummaries: request.attachmentContextSummaries.map((summary) => ({
      attachmentRefId: summary.attachmentRefId,
      category: summary.category,
      status: summary.status,
      routingCapabilityId: summary.routingCapabilityId,
      contextHint: summary.contextHint,
      recognitionPresent: summary.recognitionPresent,
    })),
    recentMessageHints: request.recentMessageHints,
    catalogHints: request.catalogHints,
    availableTools: [...availableTools],
  });
}

export function mapTurnDecisionOutputFromMessageUnderstanding(
  output: MessageUnderstandingOutput,
  request: TurnDecisionRequest,
): TurnDecisionOutput {
  return turnDecisionOutputSchema.parse({
    signals: output.signals,
    entities: output.entities,
    routeCapabilityHints: output.capabilityHints,
    complexity: output.complexity,
    directCommand: output.directCommand,
    safetyFlags: output.safetyFlags,
    contextNeeds: output.needsContext,
    attachmentHints: request.attachmentContextSummaries.map((summary) => {
      const parsedCapability = summary.routingCapabilityId
        ? catalogIntentIdSchema.safeParse(summary.routingCapabilityId)
        : null;

      return {
        attachmentRefId: summary.attachmentRefId,
        category: summary.category,
        routingCapabilityId: parsedCapability?.success ? parsedCapability.data : null,
        confidence: parsedCapability?.success ? 0.72 : undefined,
        contextHint: summary.contextHint,
      };
    }),
    toolNeeds: [],
    confidence: output.confidence,
  });
}
