import {
  parseAiStructuredOutput,
  validateReplySafety,
  type CoachAiProvider,
} from "@health/ai";
import type {
  AgentContextPacket,
  AgentToolName,
  AgentTurnMetadata,
  AiStructuredOutput,
  IntentRouteResult,
  RawAiProposal,
} from "@health/types";
import {
  llmIntentRouterOutputSchema,
  mergeLlmRouterOutputIntoRoute,
  validateLlmRouterOutputShape,
  buildContextSliceRequestForIntent,
  INTENT_TO_SLICE_PURPOSE,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { mapContextSourceRefsToAgentCitations } from "../coaching-context/agent-prompt-context.js";
import { CoachingContextService } from "../coaching-context/coaching-context.service.js";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";
import { createCoachAiProvider, resolveAiCoachProviderMode } from "./coach-provider.factory.js";
import { routeAgentIntent } from "./intent-router.js";

const SAFE_FALLBACK_REPLY =
  "I could not safely process that response. Please try again with a wellness-focused question.";

export interface ProposalRevisionContext {
  supersededProposalId: string;
  originalProposal: RawAiProposal;
  modificationFeedback: string;
}

export interface OrchestrateCoachTurnInput {
  auth: ClerkAuthContext;
  userMessage: string;
  recentMessages: ReadonlyArray<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  proposalRevision?: ProposalRevisionContext;
}

export interface OrchestratedCoachTurnResult {
  output: AiStructuredOutput;
  parseErrors: string[];
  replySafetyErrors: string[];
  agentMetadata: AgentTurnMetadata;
}

@Injectable()
export class AgentOrchestratorService {
  private readonly provider: CoachAiProvider;

  constructor(
    private readonly coachingContextService: CoachingContextService,
    private readonly agentToolRegistryService: AgentToolRegistryService,
  ) {
    this.provider = createCoachAiProvider();
  }

  getProviderMode() {
    return resolveAiCoachProviderMode();
  }

  async orchestrateCoachTurn(
    input: OrchestrateCoachTurnInput,
  ): Promise<OrchestratedCoachTurnResult> {
    const route = await this.resolveRoute(input);
    const toolsInvoked: AgentToolName[] = [];

    const contextPacket = await this.coachingContextService.buildAgentContext(
      input.auth,
      {
        userMessage: input.userMessage,
        intent: route.intent,
        purpose: route.purpose,
        depth: route.depth,
        timeRange: route.timeRange,
        includeDocuments: route.includeDocuments,
      },
      route,
    );

    if (route.includeDocuments || contextPacket.slice.documentContext) {
      const documentTool = await this.agentToolRegistryService.executeTool(input.auth, {
        tool: "getDocumentContext",
        input: {},
      });

      if (documentTool.ok) {
        toolsInvoked.push("getDocumentContext");
      }
    }

    if (route.intent === "review_progress") {
      const weeklyTool = await this.agentToolRegistryService.executeTool(input.auth, {
        tool: "getWeeklyProgressContext",
        input: {},
      });

      if (weeklyTool.ok) {
        toolsInvoked.push("getWeeklyProgressContext");
      }
    }

    const coachingContext = this.coachingContextService.toAgentPromptContext(contextPacket);

    if (input.proposalRevision) {
      coachingContext.proposalRevision = {
        supersededProposalId: input.proposalRevision.supersededProposalId,
        originalProposal: input.proposalRevision.originalProposal,
        modificationFeedback: input.proposalRevision.modificationFeedback,
      };
    }

    return this.invokeProvider(
      input,
      contextPacket,
      coachingContext,
      route,
      toolsInvoked,
    );
  }

  private async resolveRoute(input: OrchestrateCoachTurnInput): Promise<IntentRouteResult> {
    if (input.proposalRevision) {
      const original = input.proposalRevision.originalProposal;
      const mappedIntent =
        original.intent === "create_workout_plan" ||
        original.intent === "adapt_workout_plan" ||
        original.intent === "adapt_workout_plan_from_progress"
          ? "adjust_workout"
          : original.intent === "create_nutrition_plan" ||
              original.intent === "adjust_nutrition_plan"
            ? "adjust_nutrition"
            : original.intent === "create_habit_plan" || original.intent === "adapt_habit_plan"
              ? "longevity_overview"
              : "general";
      const purpose = INTENT_TO_SLICE_PURPOSE[mappedIntent];
      const sliceRequest = buildContextSliceRequestForIntent(mappedIntent);

      return {
        intent: mappedIntent,
        confidence: 0.95,
        isConfident: true,
        purpose,
        depth: sliceRequest.depth ?? "medium",
        timeRange: sliceRequest.timeRange ?? "14d",
        includeDocuments: sliceRequest.includeDocuments ?? false,
        routingMethod: "rule_based",
        requiredContextSlices: [sliceRequest],
        safetyFlags: [],
        expectedResponseMode: "recommendation_with_optional_proposal",
      };
    }

    const ruleRoute = routeAgentIntent(input.userMessage);

    if (ruleRoute.isConfident) {
      return ruleRoute;
    }

    let rawRouterOutput: unknown;

    try {
      rawRouterOutput = await this.provider.generateIntentRoute({
        userMessage: input.userMessage,
        recentMessages: input.recentMessages,
        ruleRouteHint: {
          intent: ruleRoute.intent,
          safetyFlags: ruleRoute.safetyFlags,
        },
      });
    } catch {
      return {
        ...ruleRoute,
        routingMethod: "llm_router",
        isConfident: false,
        confidence: 0.5,
      };
    }

    const shapeErrors = validateLlmRouterOutputShape(rawRouterOutput);

    if (shapeErrors.length > 0) {
      return {
        ...ruleRoute,
        routingMethod: "llm_router",
        isConfident: false,
        confidence: 0.5,
      };
    }

    const llmRoute = llmIntentRouterOutputSchema.parse(rawRouterOutput);
    return mergeLlmRouterOutputIntoRoute(ruleRoute, llmRoute);
  }

  private async invokeProvider(
    input: OrchestrateCoachTurnInput,
    contextPacket: AgentContextPacket,
    coachingContext: Record<string, unknown>,
    route: IntentRouteResult,
    toolsInvoked: AgentToolName[],
  ): Promise<OrchestratedCoachTurnResult> {
    const providerMode = resolveAiCoachProviderMode();
    const baseMetadata = {
      provider: providerMode,
      intent: route.intent,
      purpose: contextPacket.purpose,
      depth: contextPacket.depth,
      timeRange: contextPacket.timeRange,
      toolsInvoked,
      citations: mapContextSourceRefsToAgentCitations(contextPacket.sourceRefs),
      routing: contextPacket.routing ?? {
        confidence: route.confidence,
        routingMethod: route.routingMethod,
        llmRouterInvoked: route.routingMethod === "llm_router",
        safetyFlags: route.safetyFlags,
        expectedResponseMode: route.expectedResponseMode,
        contextSliceCount: route.requiredContextSlices.length,
      },
      missingContextNotes: contextPacket.missingContextNotes,
    };

    try {
      const rawOutput = await this.provider.generateCoachResponse({
        userMessage: input.userMessage,
        recentMessages: input.recentMessages,
        coachingContext,
        agentMetadata: {
          purpose: contextPacket.purpose,
          intent: contextPacket.intent,
          depth: contextPacket.depth,
          timeRange: contextPacket.timeRange,
          safetyConstraints: contextPacket.safetyConstraints,
          expectedResponseMode: route.expectedResponseMode,
          safetyFlags: route.safetyFlags,
          missingContextNotes: contextPacket.missingContextNotes,
        },
      });

      const parsed = parseAiStructuredOutput(rawOutput);

      if (!parsed.ok) {
        return {
          output: { reply: SAFE_FALLBACK_REPLY, proposals: [] },
          parseErrors: parsed.errors,
          replySafetyErrors: [],
          agentMetadata: {
            ...baseMetadata,
            safety: {
              status: "parse_failed",
              blockedReasons: parsed.errors,
              constraintsApplied: contextPacket.safetyConstraints,
            },
          },
        };
      }

      const replySafetyErrors = validateReplySafety(parsed.value.reply);

      if (replySafetyErrors.length > 0) {
        return {
          output: { reply: SAFE_FALLBACK_REPLY, proposals: [] },
          parseErrors: [],
          replySafetyErrors,
          agentMetadata: {
            ...baseMetadata,
            safety: {
              status: "reply_blocked",
              blockedReasons: replySafetyErrors,
              constraintsApplied: contextPacket.safetyConstraints,
            },
          },
        };
      }

      return {
        output: parsed.value,
        parseErrors: [],
        replySafetyErrors: [],
        agentMetadata: {
          ...baseMetadata,
          safety: {
            status: "passed",
            blockedReasons: [],
            constraintsApplied: contextPacket.safetyConstraints,
          },
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown agent provider error.";

      return {
        output: { reply: SAFE_FALLBACK_REPLY, proposals: [] },
        parseErrors: [message],
        replySafetyErrors: [],
        agentMetadata: {
          ...baseMetadata,
          safety: {
            status: "provider_error",
            blockedReasons: [message],
            constraintsApplied: contextPacket.safetyConstraints,
          },
        },
      };
    }
  }
}
