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
  ChatAttachmentCategory,
  IntentRouteResult,
  ProposalExplainerTurnContext,
  RawAiProposal,
  ResolvedCapabilityPresentationMetadata,
} from "@health/types";
import { MAX_AGENT_LOOP_ITERATIONS } from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { mapContextSourceRefsToAgentCitations } from "../coaching-context/agent-prompt-context.js";
import { CoachingContextService } from "../coaching-context/coaching-context.service.js";
import { ContextCompressionService } from "../coaching-context/context-compression.service.js";
import { ContextExpansionPolicyService } from "../coaching-context/context-expansion-policy.service.js";
import { ActionResolverService } from "./action-resolver.service.js";
import { AgentToolRegistryService } from "./agent-tool-registry.service.js";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import type { CoachIntentDefinitionMetadata } from "./capability-intent-definition.adapter.js";
import { createCoachAiProvider, resolveAiCoachProviderMode } from "./coach-provider.factory.js";
import { SystemPlannerService } from "./system-planner.service.js";

const SAFE_FALLBACK_REPLY =
  "I could not safely process that response. Please try again with a wellness-focused question.";

export interface AttachmentPreparedProposalSummary {
  intent: string;
  targetDomain: string;
  title: string;
}

export interface AttachmentTurnContextItem {
  attachmentRefId: string;
  category: ChatAttachmentCategory;
  status: string;
  recognition?: unknown;
}

export interface AttachmentTurnContext {
  attachments: ReadonlyArray<AttachmentTurnContextItem>;
  preparedProposals?: ReadonlyArray<AttachmentPreparedProposalSummary>;
}

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
  proposalExplainer?: ProposalExplainerTurnContext;
  attachmentTurn?: AttachmentTurnContext;
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
    private readonly contextCompressionService: ContextCompressionService,
    private readonly contextExpansionPolicyService: ContextExpansionPolicyService,
    private readonly agentToolRegistryService: AgentToolRegistryService,
    private readonly systemPlannerService: SystemPlannerService,
    private readonly actionResolverService: ActionResolverService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
  ) {
    this.provider = createCoachAiProvider(
      this.aiBehaviorConfigService.getCompiledPromptTemplates(),
    );
  }

  getProviderMode() {
    return resolveAiCoachProviderMode();
  }

  async orchestrateCoachTurn(
    input: OrchestrateCoachTurnInput,
  ): Promise<OrchestratedCoachTurnResult> {
    const plan = await this.systemPlannerService.planTurn(
      {
        userMessage: input.userMessage,
        recentMessages: input.recentMessages,
        proposalRevision: input.proposalRevision,
        attachmentTurn: input.attachmentTurn,
      },
      this.provider,
    );
    const { route, intentDefinition, presentationMetadata } = plan;
    const capabilityTurnMetadata = toAgentTurnCapabilityPresentation(presentationMetadata);

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
      { contextBudget: plan.contextBudget },
    );

    const coachingContext = this.coachingContextService.toAgentPromptContext(contextPacket);
    const expansionPolicy = this.contextExpansionPolicyService.createPolicySnapshot(
      plan.contextBudget,
    );

    if (plan.requiresCompression) {
      const compression = await this.contextCompressionService.compressForTurn({
        packet: contextPacket,
        reviewSignals: plan,
        budget: plan.contextBudget,
      });

      if (compression.summary) {
        coachingContext.contextCompressionSummary = compression.summary;
      }

      if (compression.notes.length > 0) {
        coachingContext.contextCompressionNotes = compression.notes;
      }

      const agentContext = coachingContext.agentContext;

      if (agentContext && typeof agentContext === "object") {
        (agentContext as Record<string, unknown>).contextCompressionApplied =
          compression.summary != null;
        (agentContext as Record<string, unknown>).expansionPolicy = expansionPolicy;
      }
    } else {
      const agentContext = coachingContext.agentContext;

      if (agentContext && typeof agentContext === "object") {
        (agentContext as Record<string, unknown>).expansionPolicy = expansionPolicy;
      }
    }

    if (input.attachmentTurn?.attachments.length) {
      coachingContext.attachmentTurn = {
        attachments: input.attachmentTurn.attachments.map((attachment) => ({
          attachmentRefId: attachment.attachmentRefId,
          category: attachment.category,
          status: attachment.status,
          recognition: attachment.recognition,
        })),
        ...(input.attachmentTurn.preparedProposals?.length
          ? { preparedProposals: [...input.attachmentTurn.preparedProposals] }
          : {}),
      };
    }

    if (input.proposalRevision) {
      coachingContext.proposalRevision = {
        supersededProposalId: input.proposalRevision.supersededProposalId,
        originalProposal: input.proposalRevision.originalProposal,
        modificationFeedback: input.proposalRevision.modificationFeedback,
      };
    }

    if (input.proposalExplainer) {
      coachingContext.proposalExplainer = input.proposalExplainer;
    }

    return this.runAgentLoop(
      input,
      contextPacket,
      coachingContext,
      route,
      intentDefinition,
      capabilityTurnMetadata,
    );
  }

  private async runAgentLoop(
    input: OrchestrateCoachTurnInput,
    contextPacket: AgentContextPacket,
    coachingContext: Record<string, unknown>,
    route: IntentRouteResult,
    intentDefinition: CoachIntentDefinitionMetadata,
    capabilityTurnMetadata: AgentTurnCapabilityPresentation,
  ): Promise<OrchestratedCoachTurnResult> {
    const providerMode = resolveAiCoachProviderMode();
    const toolsInvoked: AgentToolName[] = [];
    const priorToolResults: AgentToolCallResult[] = [];
    let loopIterations = 0;

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
        llmRouterInvoked: route.routingMethod === "llm_router",
        catalogIntentId: route.catalogIntentId,
        safetyFlags: route.safetyFlags,
        expectedResponseMode: route.expectedResponseMode,
        contextSliceCount: route.requiredContextSlices.length,
        maxLoopIterations: MAX_AGENT_LOOP_ITERATIONS,
      },
      missingContextNotes: contextPacket.missingContextNotes,
    };

    const agentMetadataBase: NonNullable<CoachAiLoopRequest["agentMetadata"]> = {
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
    };

    try {
      for (let iteration = 1; iteration <= MAX_AGENT_LOOP_ITERATIONS; iteration += 1) {
        loopIterations = iteration;

        const rawOutput = await this.provider.generateAgentLoopStep({
          userMessage: input.userMessage,
          recentMessages: input.recentMessages,
          coachingContext,
          agentMetadata: agentMetadataBase,
          iteration,
          maxIterations: MAX_AGENT_LOOP_ITERATIONS,
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
          `Agent loop exceeded the maximum of ${MAX_AGENT_LOOP_ITERATIONS} iterations without a final answer.`,
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
  ): OrchestratedCoachTurnResult {
    return {
      output: { reply: SAFE_FALLBACK_REPLY, proposals: [] },
      parseErrors: failure.parseErrors,
      replySafetyErrors: failure.replySafetyErrors,
      agentMetadata: {
        ...baseMetadata,
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

function toAgentTurnCapabilityPresentation(
  presentation: ResolvedCapabilityPresentationMetadata,
): AgentTurnCapabilityPresentation {
  return {
    primaryCapabilityId: presentation.primaryCapabilityId,
    selectedCapabilityIds: [...presentation.selectedCapabilityIds],
    compositionStrategy: presentation.compositionStrategy,
    widgetDescriptors: presentation.widgetDescriptors.map((descriptor) => ({
      id: descriptor.id,
      type: descriptor.type,
      ...(descriptor.proposalIntent ? { proposalIntent: descriptor.proposalIntent } : {}),
    })),
    actionDescriptors: presentation.actionDescriptors.map((descriptor) => ({
      id: descriptor.id,
      type: descriptor.type,
      ...(descriptor.proposalIntent ? { proposalIntent: descriptor.proposalIntent } : {}),
    })),
  };
}
