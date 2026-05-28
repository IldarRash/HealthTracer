import { z } from "zod";
import {
  agentSafetyFlagSchema,
  catalogIntentIdSchema,
  normalizeContextSlicePlan,
  type AgentIntent,
  type AgentSafetyFlag,
  type CatalogIntentId,
  type ContextSliceRequest,
} from "./agent-context.js";
import {
  MESSAGE_UNDERSTANDING_FALLBACK_CONFIDENCE,
  messageUnderstandingComplexitySchema,
  messageUnderstandingContextNeedSchema,
  messageUnderstandingEntityKindSchema,
  messageUnderstandingSignalSchema,
  messageUnderstandingSourceSchema,
  type MessageUnderstandingContextNeed,
  type MessageUnderstandingOutput,
  type MessageUnderstandingResult,
} from "./message-understanding.js";

const MAX_COACH_UNDERSTANDING_ENTITY_VALUE_LENGTH = 80 as const;
const MAX_COACH_UNDERSTANDING_ENTITIES = 8 as const;

export const messageUnderstandingCoachSummarySchema = z.object({
  source: messageUnderstandingSourceSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  signals: z.array(messageUnderstandingSignalSchema).max(10).optional(),
  entities: z
    .array(
      z.object({
        kind: messageUnderstandingEntityKindSchema,
        value: z.string().min(1).max(MAX_COACH_UNDERSTANDING_ENTITY_VALUE_LENGTH),
      }),
    )
    .max(MAX_COACH_UNDERSTANDING_ENTITIES)
    .optional(),
  capabilityHints: z
    .array(
      z.object({
        capabilityId: catalogIntentIdSchema,
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(3)
    .optional(),
  complexity: messageUnderstandingComplexitySchema.optional(),
  needsContext: z.array(messageUnderstandingContextNeedSchema).max(10).optional(),
  safetyFlags: z.array(agentSafetyFlagSchema).max(10).optional(),
});

export type MessageUnderstandingCoachSummary = z.infer<
  typeof messageUnderstandingCoachSummarySchema
>;

const CONTEXT_NEED_SLICE_MAP: Partial<
  Record<MessageUnderstandingContextNeed, ContextSliceRequest>
> = {
  today_summary: { type: "daily_checkin", depth: "small", timeRange: "7d" },
  active_workout_plan: { type: "workout_adaptation", depth: "medium", timeRange: "14d" },
  active_nutrition_plan: { type: "nutrition_adaptation", depth: "medium", timeRange: "14d" },
  weekly_progress: { type: "weekly_review", depth: "large", timeRange: "30d" },
  habit_plan: { type: "longevity_overview", depth: "medium", timeRange: "30d" },
  wellbeing_history: { type: "daily_checkin", depth: "medium", timeRange: "14d" },
};

export function resolveSupplementaryContextSlicesFromUnderstanding(
  needsContext: ReadonlyArray<MessageUnderstandingContextNeed>,
  primarySlice: ContextSliceRequest,
): ContextSliceRequest[] {
  const supplementary: ContextSliceRequest[] = [];

  for (const need of needsContext) {
    if (need === "health_documents" || need === "attachment_context" || need === "recent_conversation") {
      continue;
    }

    const mapped = CONTEXT_NEED_SLICE_MAP[need];

    if (!mapped || mapped.type === primarySlice.type) {
      continue;
    }

    supplementary.push(mapped);
  }

  return normalizeContextSlicePlan(supplementary);
}

export function mergeUnderstandingSafetyFlags(
  output: MessageUnderstandingOutput,
): AgentSafetyFlag[] {
  return [...new Set(output.safetyFlags)];
}

export function buildContextSlicePlanFromUnderstanding(input: {
  mappedAgentIntent: AgentIntent;
  defaultContextStrategy: ContextSliceRequest;
  needsContext: ReadonlyArray<MessageUnderstandingContextNeed>;
}): ContextSliceRequest[] {
  const primary = input.defaultContextStrategy;

  return normalizeContextSlicePlan([
    primary,
    ...resolveSupplementaryContextSlicesFromUnderstanding(input.needsContext, primary),
  ]);
}

export function buildBoundedMessageUnderstandingMetadata(input: {
  ran: boolean;
  result?: MessageUnderstandingResult;
}): {
  ran: boolean;
  source?: MessageUnderstandingResult["source"];
  confidence?: number;
  signals?: MessageUnderstandingOutput["signals"];
  capabilityHints?: Array<{ capabilityId: CatalogIntentId; confidence: number }>;
  complexity?: MessageUnderstandingOutput["complexity"];
  validationErrorCount?: number;
} {
  if (!input.ran) {
    return { ran: false };
  }

  const result = input.result;

  if (!result) {
    return { ran: true };
  }

  const topHints = [...result.output.capabilityHints]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3)
    .map((hint) => ({
      capabilityId: hint.capabilityId,
      confidence: hint.confidence,
    }));

  const signals = result.output.signals
    .filter((signal) => messageUnderstandingSignalSchema.safeParse(signal).success)
    .slice(0, 10);

  return {
    ran: true,
    source: result.source,
    confidence: result.output.confidence,
    ...(signals.length > 0 ? { signals } : {}),
    ...(topHints.length > 0 ? { capabilityHints: topHints } : {}),
    complexity: result.output.complexity,
    ...(result.output.needsContext.length > 0
      ? { needsContext: [...result.output.needsContext] }
      : {}),
    ...(result.output.safetyFlags.length > 0
      ? { safetyFlags: [...result.output.safetyFlags] }
      : {}),
    ...(result.validationErrors.length > 0
      ? { validationErrorCount: result.validationErrors.length }
      : {}),
  };
}

function truncateCoachEntityValue(value: string): string {
  if (value.length <= MAX_COACH_UNDERSTANDING_ENTITY_VALUE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_COACH_UNDERSTANDING_ENTITY_VALUE_LENGTH - 1)}…`;
}

export function buildBoundedMessageUnderstandingCoachSummary(input: {
  ran: boolean;
  result?: MessageUnderstandingResult;
}): MessageUnderstandingCoachSummary | undefined {
  if (!input.ran || !input.result) {
    return undefined;
  }

  const { output, source } = input.result;
  const signals = output.signals
    .filter((signal) => messageUnderstandingSignalSchema.safeParse(signal).success)
    .slice(0, 10);
  const entities = output.entities
    .slice(0, MAX_COACH_UNDERSTANDING_ENTITIES)
    .map((entity) => ({
      kind: entity.kind,
      value: truncateCoachEntityValue(entity.value),
    }));
  const capabilityHints = [...output.capabilityHints]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3)
    .map((hint) => ({
      capabilityId: hint.capabilityId,
      confidence: hint.confidence,
    }));

  const summary = messageUnderstandingCoachSummarySchema.parse({
    source,
    confidence: output.confidence,
    ...(signals.length > 0 ? { signals } : {}),
    ...(entities.length > 0 ? { entities } : {}),
    ...(capabilityHints.length > 0 ? { capabilityHints } : {}),
    complexity: output.complexity,
    ...(output.needsContext.length > 0 ? { needsContext: [...output.needsContext] } : {}),
    ...(output.safetyFlags.length > 0 ? { safetyFlags: [...output.safetyFlags] } : {}),
  });

  return summary;
}

export { MESSAGE_UNDERSTANDING_FALLBACK_CONFIDENCE };
