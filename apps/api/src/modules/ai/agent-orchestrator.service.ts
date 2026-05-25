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

export interface OrchestrateCoachTurnInput {
  auth: ClerkAuthContext;
  userMessage: string;
  recentMessages: ReadonlyArray<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
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
    const route = routeAgentIntent(input.userMessage);
    const toolsInvoked: AgentToolName[] = [];

    const contextPacket = await this.coachingContextService.buildAgentContext(input.auth, {
      userMessage: input.userMessage,
      intent: route.intent,
      purpose: route.purpose,
      depth: route.depth,
      timeRange: route.timeRange,
      includeDocuments: route.includeDocuments,
    });

    if (route.includeDocuments) {
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

    return this.invokeProvider(input, contextPacket, coachingContext, route.intent, toolsInvoked);
  }

  private async invokeProvider(
    input: OrchestrateCoachTurnInput,
    contextPacket: AgentContextPacket,
    coachingContext: Record<string, unknown>,
    intent: AgentContextPacket["intent"],
    toolsInvoked: AgentToolName[],
  ): Promise<OrchestratedCoachTurnResult> {
    const providerMode = resolveAiCoachProviderMode();
    const baseMetadata = {
      provider: providerMode,
      intent,
      purpose: contextPacket.purpose,
      depth: contextPacket.depth,
      timeRange: contextPacket.timeRange,
      toolsInvoked,
      citations: mapContextSourceRefsToAgentCitations(contextPacket.sourceRefs),
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
