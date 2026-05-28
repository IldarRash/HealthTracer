import {
  agentSafetyFlagSchema,
  catalogIntentIdSchema,
  RULE_ROUTE_CONFIDENCE_THRESHOLD,
  type AgentIntent,
  type AgentSafetyFlag,
  type AgentSafetyStatus,
  type AgentToolName,
  type CatalogIntentId,
  type ContextSliceRequest,
} from "./agent-context.js";
import type { AgentTurnMetadata } from "./agent-context.js";
import {
  buildContextSlicePlanFromUnderstanding,
  mergeUnderstandingSafetyFlags,
} from "./message-understanding-routing.js";
import {
  createFallbackMessageUnderstanding,
  type MessageUnderstandingContextNeed,
} from "./message-understanding.js";
import {
  TURN_DECISION_FALLBACK_CONFIDENCE,
  turnDecisionOutputSchema,
  type TurnDecisionOutput,
  type TurnDecisionRequest,
  type TurnDecisionResult,
} from "./turn-decision.js";

const TURN_DECISION_HINT_CONFIDENCE_THRESHOLD = 0.5 as const;

export interface ShouldRunUnifiedTurnDecisionInput {
  proposalRevision?: unknown;
  proposalExplainer?: unknown;
}

export function shouldRunUnifiedTurnDecision(
  input: ShouldRunUnifiedTurnDecisionInput,
): boolean {
  if (input.proposalRevision) {
    return false;
  }

  if (input.proposalExplainer) {
    return false;
  }

  return true;
}

export function pickPrimaryCapabilityFromTurnDecision(
  output: TurnDecisionOutput,
): CatalogIntentId | null {
  const sortedHints = [...output.routeCapabilityHints].sort(
    (left, right) => right.confidence - left.confidence,
  );

  return sortedHints[0]?.capabilityId ?? null;
}

export function isTurnDecisionRouteConfident(result: TurnDecisionResult): boolean {
  if (result.source !== "llm") {
    return false;
  }

  if (result.output.confidence < RULE_ROUTE_CONFIDENCE_THRESHOLD) {
    return false;
  }

  const topHint = [...result.output.routeCapabilityHints].sort(
    (left, right) => right.confidence - left.confidence,
  )[0];

  if (!topHint || topHint.confidence < TURN_DECISION_HINT_CONFIDENCE_THRESHOLD) {
    return false;
  }

  return pickPrimaryCapabilityFromTurnDecision(result.output) != null;
}

export function clampTurnDecisionOutput(input: {
  output: TurnDecisionOutput;
  allowedCatalogIds: ReadonlySet<CatalogIntentId>;
  allowedTools: ReadonlySet<AgentToolName>;
}): TurnDecisionOutput {
  const routeCapabilityHints = input.output.routeCapabilityHints
    .filter((hint) => input.allowedCatalogIds.has(hint.capabilityId))
    .slice(0, 5);
  const attachmentHints = input.output.attachmentHints
    .map((hint) => {
      if (!hint.routingCapabilityId) {
        return hint;
      }

      return input.allowedCatalogIds.has(hint.routingCapabilityId)
        ? hint
        : { ...hint, routingCapabilityId: null };
    })
    .slice(0, 20);
  const toolNeeds = input.output.toolNeeds
    .filter((need) => input.allowedTools.has(need.tool))
    .slice(0, 5);

  return turnDecisionOutputSchema.parse({
    ...input.output,
    routeCapabilityHints,
    attachmentHints,
    toolNeeds,
    confidence: Math.min(1, Math.max(0, input.output.confidence)),
    safetyFlags: [...new Set(input.output.safetyFlags.filter((flag) => agentSafetyFlagSchema.safeParse(flag).success))],
  });
}

export function mergeTurnDecisionSafetyFlags(output: TurnDecisionOutput): AgentSafetyFlag[] {
  return mergeUnderstandingSafetyFlags({
    signals: output.signals,
    entities: output.entities,
    capabilityHints: output.routeCapabilityHints,
    complexity: output.complexity,
    directCommand: output.directCommand,
    safetyFlags: output.safetyFlags,
    needsContext: output.contextNeeds,
    confidence: output.confidence,
  });
}

export function buildContextSlicePlanFromTurnDecision(input: {
  mappedAgentIntent: AgentIntent;
  defaultContextStrategy: ContextSliceRequest;
  contextNeeds: ReadonlyArray<MessageUnderstandingContextNeed>;
}): ContextSliceRequest[] {
  return buildContextSlicePlanFromUnderstanding({
    mappedAgentIntent: input.mappedAgentIntent,
    defaultContextStrategy: input.defaultContextStrategy,
    needsContext: input.contextNeeds,
  });
}

export function createFallbackTurnDecision(request: TurnDecisionRequest): TurnDecisionOutput {
  const fallbackUnderstanding = createFallbackMessageUnderstanding({
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
  });

  const allowedCatalogIds = new Set(
    request.catalogHints
      .map((hint) => catalogIntentIdSchema.safeParse(hint.id))
      .filter((parsed) => parsed.success)
      .map((parsed) => parsed.data),
  );

  for (const hint of fallbackUnderstanding.capabilityHints) {
    allowedCatalogIds.add(hint.capabilityId);
  }

  const allowedTools = new Set(request.availableTools);

  return clampTurnDecisionOutput({
    output: turnDecisionOutputSchema.parse({
      signals: fallbackUnderstanding.signals,
      entities: fallbackUnderstanding.entities,
      routeCapabilityHints: fallbackUnderstanding.capabilityHints,
      complexity: fallbackUnderstanding.complexity,
      directCommand: fallbackUnderstanding.directCommand,
      safetyFlags: fallbackUnderstanding.safetyFlags,
      contextNeeds: fallbackUnderstanding.needsContext,
      attachmentHints: request.attachmentContextSummaries.map((summary) => {
        const parsedCapability = summary.routingCapabilityId
          ? catalogIntentIdSchema.safeParse(summary.routingCapabilityId)
          : null;

        return {
          attachmentRefId: summary.attachmentRefId,
          category: summary.category,
          routingCapabilityId: parsedCapability?.success ? parsedCapability.data : null,
          contextHint: summary.contextHint,
        };
      }),
      toolNeeds: [],
      confidence: TURN_DECISION_FALLBACK_CONFIDENCE,
    }),
    allowedCatalogIds,
    allowedTools,
  });
}

export function createFallbackTurnDecisionResult(
  request: TurnDecisionRequest,
  validationErrors: readonly string[] = [],
): TurnDecisionResult {
  return {
    output: createFallbackTurnDecision(request),
    source: "fallback",
    validationErrors: [...validationErrors],
  };
}

export function shouldSuppressAttachmentProposalSideChannel(input: {
  unifiedTurnDecisionRan: boolean;
  safetyStatus: AgentSafetyStatus;
  parseErrors: readonly string[];
  replySafetyErrors: readonly string[];
}): boolean {
  if (!input.unifiedTurnDecisionRan) {
    return false;
  }

  if (input.safetyStatus !== "passed") {
    return true;
  }

  return input.parseErrors.length > 0 || input.replySafetyErrors.length > 0;
}

export function isUnifiedTurnDecisionBlockedFallback(metadata: AgentTurnMetadata): boolean {
  return shouldSuppressAttachmentProposalSideChannel({
    unifiedTurnDecisionRan: metadata.unifiedTurnDecision?.ran === true,
    safetyStatus: metadata.safety.status,
    parseErrors: [],
    replySafetyErrors: [],
  });
}

export function buildBoundedUnifiedTurnDecisionMetadata(input: {
  ran: boolean;
  result?: TurnDecisionResult;
}): {
  ran: boolean;
  source?: TurnDecisionResult["source"];
  confidence?: number;
  routingMethod?: "unified_turn_decision";
  validationErrorCount?: number;
} {
  if (!input.ran) {
    return { ran: false };
  }

  const result = input.result;

  if (!result) {
    return { ran: true, routingMethod: "unified_turn_decision" };
  }

  return {
    ran: true,
    routingMethod: "unified_turn_decision",
    source: result.source,
    confidence: result.output.confidence,
    ...(result.validationErrors.length > 0
      ? { validationErrorCount: result.validationErrors.length }
      : {}),
  };
}

export { TURN_DECISION_HINT_CONFIDENCE_THRESHOLD };
