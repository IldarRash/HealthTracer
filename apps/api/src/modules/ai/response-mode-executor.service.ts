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
  buildResponseModeExecutionMetadata,
  isDeterministicResponseModeExecutorMode,
  resolveResponseModeExecutorLoopPolicy,
  type ResponseModeExecutorLoopPolicy,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { mapContextSourceRefsToAgentCitations } from "../coaching-context/agent-prompt-context.js";
import { ActionResolverService } from "./action-resolver.service.js";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";
import type { CoachIntentDefinitionMetadata } from "./capability-intent-definition.adapter.js";
import { resolveAiCoachProviderMode } from "./coach-provider.factory.js";
import type { RouterLlmResult } from "./router-llm.service.js";
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
  routerTurn: {
    routerRan: boolean;
    routerResult?: RouterLlmResult;
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

  async execute(input: ResponseModeExecutorTurnInput): Promise<ResponseModeExecutorTurnResult> {
    const { plan, orchestratorInput, contextPacket, coachingContext } = input;
    const { route, intentDefinition } = plan;
    const capabilityTurnMetadata = input.capabilityTurnMetadata;

    // Use the executor mode computed by SystemPlannerService rather than recomputing it;
    // planner and executor use the same inputs (classifyDirectPathCandidate, turnDecision).
    const executorMode = plan.executorMode;

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
      routerTurn: input.routerTurn,
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
    const baseMetadata = this.buildBaseMetadata({
      ...input,
      turnDecisionTurn: this.toTurnDecisionTurnCompat(input.routerTurn),
    });
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
    routerTurn: ResponseModeExecutorTurnInput["routerTurn"];
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
      provider,
      executorMode,
      loopPolicy,
    } = params;

    const coachingContext = this.enrichCoachingContextForLoop({
      coachingContext: inputCoachingContext,
      executorMode,
      loopPolicy,
    });

    const toolsInvoked: AgentToolName[] = [];
    const priorToolResults: AgentToolCallResult[] = [];
    let loopIterations = 0;
    const maxLoopIterations = loopPolicy.maxLoopIterations;

    // Build baseMetadata once using the shared toolsInvoked array so mutations
    // (push) are reflected in the final agentMetadata without re-building.
    const baseMetadata = this.buildBaseMetadata(
      { ...params, turnDecisionTurn: this.toTurnDecisionTurnCompat(params.routerTurn) },
      toolsInvoked,
      maxLoopIterations,
    );

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
          const toolIterationResult = await this.executeToolIteration({
            toolRequest: parsedLoop.value,
            loopPolicy,
            executorMode,
            intentDefinition,
            route,
            auth: input.auth,
            toolsInvoked,
            priorToolResults,
            coachingContext,
            baseMetadata,
            contextPacket,
            loopIterations,
          });

          if (toolIterationResult !== null) {
            return toolIterationResult;
          }

          continue;
        }

        const finalResult = this.validateAndResolveFinalAnswer({
          finalAnswer: parsedLoop.value,
          route,
          intentDefinition,
          baseMetadata,
          contextPacket,
          toolsInvoked,
          loopIterations,
        });

        return finalResult;
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

  /**
   * Handles a tool_request step within the agent loop.
   * Returns a failure result if the tool cannot be executed, or null to continue the loop.
   */
  private async executeToolIteration(params: {
    toolRequest: { tool: AgentToolName; input?: Record<string, unknown> };
    loopPolicy: ResponseModeExecutorLoopPolicy;
    executorMode: ResponseModeExecutorMode;
    intentDefinition: CoachIntentDefinitionMetadata;
    route: IntentRouteResult;
    auth: OrchestrateCoachTurnInput["auth"];
    toolsInvoked: AgentToolName[];
    priorToolResults: AgentToolCallResult[];
    coachingContext: Record<string, unknown>;
    baseMetadata: ReturnType<ResponseModeExecutorService["buildBaseMetadata"]>;
    contextPacket: AgentContextPacket;
    loopIterations: number;
  }): Promise<Omit<ResponseModeExecutorTurnResult, "responseModeExecution"> | null> {
    const {
      toolRequest,
      loopPolicy,
      executorMode,
      intentDefinition,
      route,
      auth,
      toolsInvoked,
      priorToolResults,
      coachingContext,
      baseMetadata,
      contextPacket,
      loopIterations,
    } = params;

    if (!loopPolicy.allowToolLoop) {
      return this.buildFailureResult(baseMetadata, contextPacket, loopIterations, {
        parseErrors: [
          `Executor mode "${executorMode}" does not allow tool loops; return final_answer in one step.`,
        ],
        replySafetyErrors: [],
        safetyStatus: "parse_failed",
      });
    }

    const toolAllowed = intentDefinition.allowedTools.includes(toolRequest.tool);

    if (!toolAllowed) {
      return this.buildFailureResult(baseMetadata, contextPacket, loopIterations, {
        parseErrors: [
          `Requested tool "${toolRequest.tool}" is not allowed for intent "${route.catalogIntentId}".`,
        ],
        replySafetyErrors: [],
        safetyStatus: "parse_failed",
      });
    }

    const toolResult = await this.agentToolRegistryService.executeTool(auth, {
      tool: toolRequest.tool,
      input: toolRequest.input ?? {},
    });

    priorToolResults.push(toolResult);

    if (toolResult.ok) {
      toolsInvoked.push(toolResult.tool);
      coachingContext.toolResults = priorToolResults;
    }

    return null;
  }

  /**
   * Coerces, safety-validates, and resolves the final_answer from the agent loop.
   * Returns either a success result or a failure result (never throws).
   */
  private validateAndResolveFinalAnswer(params: {
    finalAnswer: { kind: "final_answer"; reply: string; proposals?: Record<string, unknown>[] };
    route: IntentRouteResult;
    intentDefinition: CoachIntentDefinitionMetadata;
    baseMetadata: ReturnType<ResponseModeExecutorService["buildBaseMetadata"]>;
    contextPacket: AgentContextPacket;
    toolsInvoked: AgentToolName[];
    loopIterations: number;
  }): Omit<ResponseModeExecutorTurnResult, "responseModeExecution"> {
    const {
      finalAnswer,
      route,
      intentDefinition,
      baseMetadata,
      contextPacket,
      toolsInvoked,
      loopIterations,
    } = params;

    const coerced = coerceAgentLoopFinalAnswer(finalAnswer);

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

    return this.buildSuccessResult({
      output: resolvedOutput,
      baseMetadata,
      contextPacket,
      toolsInvoked,
      loopIterations,
    });
  }

  private buildSuccessResult(params: {
    output: AiStructuredOutput;
    baseMetadata: ReturnType<ResponseModeExecutorService["buildBaseMetadata"]>;
    contextPacket: AgentContextPacket;
    toolsInvoked: AgentToolName[];
    loopIterations: number;
  }): Omit<ResponseModeExecutorTurnResult, "responseModeExecution"> {
    const { output, baseMetadata, contextPacket, toolsInvoked, loopIterations } = params;

    return {
      output,
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

  private buildBaseMetadata(
    input: {
      route?: IntentRouteResult;
      plan?: CapabilityPlanResult;
      contextPacket: AgentContextPacket;
      capabilityTurnMetadata: AgentTurnCapabilityPresentation;
      turnDecisionTurn: {
        turnDecisionRan: boolean;
        turnDecision?: { source: "llm" | "fallback"; output: { confidence: number }; validationErrors: string[] };
      };
      executorMode?: ResponseModeExecutorMode;
    },
    toolsInvoked?: AgentToolName[],
    maxLoopIterations?: number,
  ) {
    const isTurnInput = "plan" in input && input.plan !== undefined;
    const route = isTurnInput ? input.plan!.route : input.route!;
    const contextPacket = input.contextPacket;
    const capabilityTurnMetadata = input.capabilityTurnMetadata;
    const turnDecisionTurn = input.turnDecisionTurn;
    const providerMode = resolveAiCoachProviderMode();

    const resolvedMaxLoopIterations =
      maxLoopIterations ??
      resolveResponseModeExecutorLoopPolicy(
        (isTurnInput ? input.plan!.executorMode : input.executorMode) ?? "single_llm",
      ).maxLoopIterations;

    // llmRouterInvoked is true when the router ran and returned an LLM result (source="llm").
    const llmRouterInvoked =
      turnDecisionTurn.turnDecisionRan && turnDecisionTurn.turnDecision?.source === "llm";

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
      toolsInvoked: toolsInvoked ?? ([] as AgentToolName[]),
      citations: mapContextSourceRefsToAgentCitations(contextPacket.sourceRefs),
      routing: {
        confidence: route.confidence,
        routingMethod: route.routingMethod,
        llmRouterInvoked: llmRouterInvoked ?? false,
        unifiedTurnDecisionInvoked: turnDecisionTurn.turnDecisionRan,
        catalogIntentId: route.catalogIntentId,
        safetyFlags: route.safetyFlags,
        expectedResponseMode: route.expectedResponseMode,
        contextSliceCount: route.requiredContextSlices.length,
        maxLoopIterations: resolvedMaxLoopIterations,
      },
      unifiedTurnDecision: {
        ran: turnDecisionTurn.turnDecisionRan,
        ...(turnDecisionTurn.turnDecision
          ? {
              source: turnDecisionTurn.turnDecision.source,
              confidence: turnDecisionTurn.turnDecision.output.confidence,
              routingMethod: "unified_turn_decision" as const,
              ...(turnDecisionTurn.turnDecision.validationErrors.length > 0
                ? { validationErrorCount: turnDecisionTurn.turnDecision.validationErrors.length }
                : {}),
            }
          : {}),
      },
      missingContextNotes: contextPacket.missingContextNotes,
    };
  }

  /**
   * Converts RouterLlmResult into the shape expected by buildBaseMetadata's turnDecisionTurn.
   * This provides backward compatibility for the metadata produced by the executor.
   */
  private toTurnDecisionTurnCompat(routerTurn: ResponseModeExecutorTurnInput["routerTurn"]): {
    turnDecisionRan: boolean;
    turnDecision?: { source: "llm" | "fallback"; output: { confidence: number }; validationErrors: string[] };
  } {
    if (!routerTurn.routerRan || !routerTurn.routerResult) {
      return { turnDecisionRan: routerTurn.routerRan };
    }

    return {
      turnDecisionRan: true,
      turnDecision: {
        source: routerTurn.routerResult.source,
        output: { confidence: routerTurn.routerResult.output.confidence },
        validationErrors: [...routerTurn.routerResult.validationErrors],
      },
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
    // Suppress attachment-proposal side-channel when the router ran and the turn failed.
    // All callers pass a non-passing safetyStatus, so the gate reduces to routerRan.
    const blockedFallback = baseMetadata.unifiedTurnDecision?.ran === true;

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
