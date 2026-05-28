import {
  coerceAgentLoopFinalAnswer,
  parseAgentLoopOutput,
  validateReplySafety,
  type CoachAiLoopRequest,
  type CoachAiProvider,
} from "@health/ai";
import type {
  AgentContextPacket,
  AgentToolCallResult,
  AgentToolName,
  AgentTurnCapabilityPresentation,
  AgentTurnMetadata,
  AiStructuredOutput,
  IntentRouteResult,
  ResponseModeExecutionMetadata,
  ResponseModeExecutorMode,
} from "@health/types";
import {
  buildBoundedUnifiedTurnDecisionMetadata,
  buildResponseModeExecutionMetadata,
  shouldSuppressAttachmentProposalSideChannel,
  isDeterministicResponseModeExecutorMode,
  resolveResponseModeExecutorLoopPolicy,
  resolveResponseModeExecutorMode,
  type ResponseModeExecutorLoopPolicy,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { mapContextSourceRefsToAgentCitations } from "../coaching-context/agent-prompt-context.js";
import { ActionResolverService } from "./action-resolver.service.js";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";
import type { CoachIntentDefinitionMetadata } from "./capability-intent-definition.adapter.js";
import { resolveAiCoachProviderMode } from "./coach-provider.factory.js";
import type { TurnDecisionService } from "./turn-decision.service.js";
import type { CapabilityPlanResult } from "./system-planner.service.js";
import type { OrchestrateCoachTurnInput } from "./agent-orchestrator.service.js";

const SAFE_FALLBACK_REPLY =
  "I could not safely process that response. Please try again with a wellness-focused question.";

const DETERMINISTIC_PRE_AI_GATE_REPLY =
  "That quick action should have been handled before the AI coach ran. Please try your request again.";

export interface ResponseModeExecutorTurnInput {
  plan: CapabilityPlanResult;
  orchestratorInput: OrchestrateCoachTurnInput;
  contextPacket: AgentContextPacket;
  coachingContext: Record<string, unknown>;
  capabilityTurnMetadata: AgentTurnCapabilityPresentation;
  turnDecisionTurn: {
    turnDecisionRan: boolean;
    turnDecision?: Awaited<ReturnType<TurnDecisionService["decide"]>>;
  };
  directPathCandidate?: ReturnType<
    import("./system-planner.service.js").SystemPlannerService["classifyDirectPathCandidate"]
  >;
  provider: CoachAiProvider;
}

export interface ResponseModeExecutorTurnResult {
  output: AiStructuredOutput;
  parseErrors: string[];
  replySafetyErrors: string[];
  agentMetadata: AgentTurnMetadata;
  responseModeExecution: ResponseModeExecutionMetadata;
}

@Injectable()
export class ResponseModeExecutorService {
  constructor(
    private readonly actionResolverService: ActionResolverService,
    private readonly agentToolRegistryService: AgentToolRegistryService,
  ) {}

  resolveExecutorMode(
    plan: CapabilityPlanResult,
    options?: {
      directPathCandidate?: ResponseModeExecutorTurnInput["directPathCandidate"];
      messageUnderstandingDirectCommand?: boolean;
    },
  ): ResponseModeExecutorMode {
    return resolveResponseModeExecutorMode({
      route: plan.route,
      expectedResponseMode: plan.expectedResponseMode,
      requiresCompression: plan.requiresCompression,
      allowedProposalIntents: plan.intentDefinition.allowedProposalIntents,
      allowedTools: plan.intentDefinition.allowedTools,
      directPathCandidate: options?.directPathCandidate ?? null,
      messageUnderstandingDirectCommand: options?.messageUnderstandingDirectCommand,
    });
  }

  async execute(input: ResponseModeExecutorTurnInput): Promise<ResponseModeExecutorTurnResult> {
    const { plan, orchestratorInput, contextPacket, coachingContext } = input;
    const { route, intentDefinition } = plan;
    const capabilityTurnMetadata = input.capabilityTurnMetadata;

    const executorMode = this.resolveExecutorMode(plan, {
      directPathCandidate: input.directPathCandidate,
      messageUnderstandingDirectCommand:
        input.turnDecisionTurn.turnDecision?.output.directCommand.detected,
    });

    const loopPolicy = resolveResponseModeExecutorLoopPolicy(executorMode);

    if (isDeterministicResponseModeExecutorMode(executorMode)) {
      return this.buildDelegatedResult(input, {
        executorMode,
        expectedResponseMode: plan.expectedResponseMode,
        loopPolicy,
      });
    }

    const loopResult = await this.runCoachLoop({
      input: orchestratorInput,
      contextPacket,
      coachingContext,
      route,
      intentDefinition,
      capabilityTurnMetadata,
      turnDecisionTurn: input.turnDecisionTurn,
      provider: input.provider,
      executorMode,
      loopPolicy,
    });

    return {
      ...loopResult,
      responseModeExecution: buildResponseModeExecutionMetadata({
        executorMode,
        llmInvoked: true,
        expectedResponseMode: plan.expectedResponseMode,
      }),
    };
  }

  private buildDelegatedResult(
    input: ResponseModeExecutorTurnInput,
    params: {
      executorMode: ResponseModeExecutorTurnResult["responseModeExecution"]["executorMode"];
      expectedResponseMode: ResponseModeExecutorTurnResult["responseModeExecution"]["expectedResponseMode"];
      loopPolicy: ResponseModeExecutorLoopPolicy;
    },
  ): ResponseModeExecutorTurnResult {
    const baseMetadata = this.buildBaseMetadata(input);
    const responseModeExecution = buildResponseModeExecutionMetadata({
      executorMode: params.executorMode,
      llmInvoked: false,
      expectedResponseMode: params.expectedResponseMode,
      delegatedToPreAiGate: true,
      preAiGateDelegationMissed: true,
    });

    return {
      output: { reply: DETERMINISTIC_PRE_AI_GATE_REPLY, proposals: [] },
      parseErrors: [],
      replySafetyErrors: [],
      responseModeExecution,
      agentMetadata: {
        ...baseMetadata,
        routing: baseMetadata.routing
          ? {
              ...baseMetadata.routing,
              loopIterations: 0,
              maxLoopIterations: params.loopPolicy.maxLoopIterations,
            }
          : undefined,
        responseModeExecution,
        safety: {
          status: "passed",
          blockedReasons: [],
          constraintsApplied: input.contextPacket.safetyConstraints,
        },
      },
    };
  }

  private async runCoachLoop(params: {
    input: OrchestrateCoachTurnInput;
    contextPacket: AgentContextPacket;
    coachingContext: Record<string, unknown>;
    route: IntentRouteResult;
    intentDefinition: CoachIntentDefinitionMetadata;
    capabilityTurnMetadata: AgentTurnCapabilityPresentation;
    turnDecisionTurn: ResponseModeExecutorTurnInput["turnDecisionTurn"];
    provider: CoachAiProvider;
    executorMode: ResponseModeExecutorMode;
    loopPolicy: ResponseModeExecutorLoopPolicy;
  }): Promise<Omit<ResponseModeExecutorTurnResult, "responseModeExecution">> {
    const {
      input,
      contextPacket,
      coachingContext: inputCoachingContext,
      route,
      intentDefinition,
      capabilityTurnMetadata,
      turnDecisionTurn,
      provider,
      executorMode,
      loopPolicy,
    } = params;

    const coachingContext = this.enrichCoachingContextForLoop({
      coachingContext: inputCoachingContext,
      executorMode,
      loopPolicy,
    });

    const providerMode = resolveAiCoachProviderMode();
    const toolsInvoked: AgentToolName[] = [];
    const priorToolResults: AgentToolCallResult[] = [];
    let loopIterations = 0;
    const maxLoopIterations = loopPolicy.maxLoopIterations;

    const baseMetadata = {
      provider: providerMode,
      intent: route.intent,
      catalogIntentId: route.catalogIntentId,
      primaryCapabilityId: capabilityTurnMetadata.primaryCapabilityId,
      selectedCapabilityIds: [...capabilityTurnMetadata.selectedCapabilityIds],
      capabilityPresentation: capabilityTurnMetadata,
      purpose: contextPacket.purpose,
      depth: contextPacket.depth,
      timeRange: contextPacket.timeRange,
      toolsInvoked,
      citations: mapContextSourceRefsToAgentCitations(contextPacket.sourceRefs),
      routing: {
        confidence: route.confidence,
        routingMethod: route.routingMethod,
        llmRouterInvoked: false,
        messageUnderstandingInvoked: false,
        unifiedTurnDecisionInvoked: turnDecisionTurn.turnDecisionRan,
        catalogIntentId: route.catalogIntentId,
        safetyFlags: route.safetyFlags,
        expectedResponseMode: route.expectedResponseMode,
        contextSliceCount: route.requiredContextSlices.length,
        maxLoopIterations,
      },
      messageUnderstanding: { ran: false },
      unifiedTurnDecision: {
        ...buildBoundedUnifiedTurnDecisionMetadata({
          ran: turnDecisionTurn.turnDecisionRan,
          result: turnDecisionTurn.turnDecision,
        }),
      },
      missingContextNotes: contextPacket.missingContextNotes,
    };

    const agentMetadataBase = {
      purpose: contextPacket.purpose,
      intent: contextPacket.intent,
      catalogIntentId: route.catalogIntentId,
      depth: contextPacket.depth,
      timeRange: contextPacket.timeRange,
      safetyConstraints: contextPacket.safetyConstraints,
      expectedResponseMode: route.expectedResponseMode,
      safetyFlags: route.safetyFlags,
      missingContextNotes: contextPacket.missingContextNotes,
      intentDefinition,
      allowedTools: intentDefinition.allowedTools,
      allowedProposalIntents: intentDefinition.allowedProposalIntents,
      responseModeExecutor: {
        mode: executorMode,
        handlerPath: loopPolicy.handlerPath,
        maxLoopIterations,
        allowToolLoop: loopPolicy.allowToolLoop,
        useContextExpansionMetadata: loopPolicy.useContextExpansionMetadata,
      },
    } satisfies NonNullable<CoachAiLoopRequest["agentMetadata"]>;

    try {
      for (let iteration = 1; iteration <= maxLoopIterations; iteration += 1) {
        loopIterations = iteration;

        const rawOutput = await provider.generateAgentLoopStep({
          userMessage: input.userMessage,
          recentMessages: input.recentMessages,
          coachingContext,
          agentMetadata: agentMetadataBase,
          iteration,
          maxIterations: maxLoopIterations,
          priorToolResults,
        });

        const parsedLoop = parseAgentLoopOutput(rawOutput);

        if (!parsedLoop.ok) {
          return this.buildFailureResult(baseMetadata, contextPacket, loopIterations, {
            parseErrors: parsedLoop.errors,
            replySafetyErrors: [],
            safetyStatus: "parse_failed",
          });
        }

        if (parsedLoop.value.kind === "tool_request") {
          if (!loopPolicy.allowToolLoop) {
            return this.buildFailureResult(baseMetadata, contextPacket, loopIterations, {
              parseErrors: [
                `Executor mode "${executorMode}" does not allow tool loops; return final_answer in one step.`,
              ],
              replySafetyErrors: [],
              safetyStatus: "parse_failed",
            });
          }

          const toolAllowed = intentDefinition.allowedTools.includes(parsedLoop.value.tool);

          if (!toolAllowed) {
            return this.buildFailureResult(baseMetadata, contextPacket, loopIterations, {
              parseErrors: [
                `Requested tool "${parsedLoop.value.tool}" is not allowed for intent "${route.catalogIntentId}".`,
              ],
              replySafetyErrors: [],
              safetyStatus: "parse_failed",
            });
          }

          const toolResult = await this.agentToolRegistryService.executeTool(input.auth, {
            tool: parsedLoop.value.tool,
            input: parsedLoop.value.input ?? {},
          });

          priorToolResults.push(toolResult);

          if (toolResult.ok) {
            toolsInvoked.push(toolResult.tool);
            coachingContext.toolResults = priorToolResults;
          }

          continue;
        }

        const coerced = coerceAgentLoopFinalAnswer(parsedLoop.value);

        if (!coerced) {
          return this.buildFailureResult(baseMetadata, contextPacket, loopIterations, {
            parseErrors: ["Agent loop final_answer could not be coerced into structured output."],
            replySafetyErrors: [],
            safetyStatus: "parse_failed",
          });
        }

        const replySafetyErrors = validateReplySafety(coerced.reply);

        if (replySafetyErrors.length > 0) {
          return this.buildFailureResult(baseMetadata, contextPacket, loopIterations, {
            parseErrors: [],
            replySafetyErrors,
            safetyStatus: "reply_blocked",
            blockedReasons: replySafetyErrors,
          });
        }

        const resolvedOutput = this.actionResolverService.resolveProposalOnlyOutput({
          output: coerced,
          catalogIntentId: route.catalogIntentId,
          allowedProposalIntents: intentDefinition.allowedProposalIntents,
        });

        return {
          output: resolvedOutput,
          parseErrors: [],
          replySafetyErrors: [],
          agentMetadata: {
            ...baseMetadata,
            toolsInvoked,
            routing: {
              ...baseMetadata.routing,
              loopIterations,
            },
            safety: {
              status: "passed",
              blockedReasons: [],
              constraintsApplied: contextPacket.safetyConstraints,
            },
          },
        };
      }

      return this.buildFailureResult(baseMetadata, contextPacket, loopIterations, {
        parseErrors: [
          `Agent loop exceeded the maximum of ${maxLoopIterations} iterations without a final answer.`,
        ],
        replySafetyErrors: [],
        safetyStatus: "parse_failed",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown agent provider error.";

      return this.buildFailureResult(baseMetadata, contextPacket, loopIterations, {
        parseErrors: [message],
        replySafetyErrors: [],
        safetyStatus: "provider_error",
        blockedReasons: [message],
      });
    }
  }

  private buildBaseMetadata(input: ResponseModeExecutorTurnInput) {
    const { plan, contextPacket, capabilityTurnMetadata, turnDecisionTurn } = input;
    const { route } = plan;
    const providerMode = resolveAiCoachProviderMode();

    return {
      provider: providerMode,
      intent: route.intent,
      catalogIntentId: route.catalogIntentId,
      primaryCapabilityId: capabilityTurnMetadata.primaryCapabilityId,
      selectedCapabilityIds: [...capabilityTurnMetadata.selectedCapabilityIds],
      capabilityPresentation: capabilityTurnMetadata,
      purpose: contextPacket.purpose,
      depth: contextPacket.depth,
      timeRange: contextPacket.timeRange,
      toolsInvoked: [] as AgentToolName[],
      citations: mapContextSourceRefsToAgentCitations(contextPacket.sourceRefs),
      routing: {
        confidence: route.confidence,
        routingMethod: route.routingMethod,
        llmRouterInvoked: false,
        messageUnderstandingInvoked: false,
        unifiedTurnDecisionInvoked: turnDecisionTurn.turnDecisionRan,
        catalogIntentId: route.catalogIntentId,
        safetyFlags: route.safetyFlags,
        expectedResponseMode: route.expectedResponseMode,
        contextSliceCount: route.requiredContextSlices.length,
        maxLoopIterations: resolveResponseModeExecutorLoopPolicy(
          input.plan.executorMode ?? "single_llm",
        ).maxLoopIterations,
      },
      messageUnderstanding: { ran: false },
      unifiedTurnDecision: {
        ...buildBoundedUnifiedTurnDecisionMetadata({
          ran: turnDecisionTurn.turnDecisionRan,
          result: turnDecisionTurn.turnDecision,
        }),
      },
      missingContextNotes: contextPacket.missingContextNotes,
    };
  }

  private enrichCoachingContextForLoop(input: {
    coachingContext: Record<string, unknown>;
    executorMode: ResponseModeExecutorMode;
    loopPolicy: ResponseModeExecutorLoopPolicy;
  }): Record<string, unknown> {
    const enriched: Record<string, unknown> = {
      ...input.coachingContext,
      responseModeExecutor: {
        mode: input.executorMode,
        handlerPath: input.loopPolicy.handlerPath,
        maxLoopIterations: input.loopPolicy.maxLoopIterations,
        allowToolLoop: input.loopPolicy.allowToolLoop,
        useContextExpansionMetadata: input.loopPolicy.useContextExpansionMetadata,
      },
    };

    if (input.loopPolicy.useContextExpansionMetadata) {
      const agentContext = enriched.agentContext;

      if (agentContext && typeof agentContext === "object") {
        (agentContext as Record<string, unknown>).contextExpansionLoop = true;
      }
    }

    return enriched;
  }

  private buildFailureResult(
    baseMetadata: Omit<AgentTurnMetadata, "safety"> & {
      toolsInvoked: AgentToolName[];
      routing?: AgentTurnMetadata["routing"];
    },
    contextPacket: AgentContextPacket,
    loopIterations: number,
    failure: {
      parseErrors: string[];
      replySafetyErrors: string[];
      safetyStatus: "parse_failed" | "reply_blocked" | "provider_error";
      blockedReasons?: string[];
    },
  ): Omit<ResponseModeExecutorTurnResult, "responseModeExecution"> {
    const blockedFallback = shouldSuppressAttachmentProposalSideChannel({
      unifiedTurnDecisionRan: baseMetadata.unifiedTurnDecision?.ran === true,
      safetyStatus: failure.safetyStatus,
      parseErrors: failure.parseErrors,
      replySafetyErrors: failure.replySafetyErrors,
    });

    return {
      output: { reply: SAFE_FALLBACK_REPLY, proposals: [] },
      parseErrors: failure.parseErrors,
      replySafetyErrors: failure.replySafetyErrors,
      agentMetadata: {
        ...baseMetadata,
        ...(baseMetadata.unifiedTurnDecision
          ? {
              unifiedTurnDecision: {
                ...baseMetadata.unifiedTurnDecision,
                blockedFallback,
              },
            }
          : {}),
        routing: baseMetadata.routing
          ? {
              ...baseMetadata.routing,
              loopIterations,
            }
          : undefined,
        safety: {
          status: failure.safetyStatus,
          blockedReasons: failure.blockedReasons ?? [
            ...failure.parseErrors,
            ...failure.replySafetyErrors,
          ],
          constraintsApplied: contextPacket.safetyConstraints,
        },
      },
    };
  }
}
