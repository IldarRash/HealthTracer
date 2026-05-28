import type { CoachAiProvider } from "@health/ai";
import type {
  AgentTurnCapabilityPresentation,
  AgentTurnMetadata,
  AiStructuredOutput,
  ChatAttachmentCategory,
  ProposalExplainerTurnContext,
  RawAiProposal,
  ResolvedCapabilityPresentationMetadata,
} from "@health/types";
import { shouldRunUnifiedTurnDecision } from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { CoachingContextService } from "../coaching-context/coaching-context.service.js";
import { ContextCompressionService } from "../coaching-context/context-compression.service.js";
import { ContextExpansionPolicyService } from "../coaching-context/context-expansion-policy.service.js";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { createCoachAiProvider, resolveAiCoachProviderMode } from "./coach-provider.factory.js";
import { MessagePreprocessorService } from "./message-preprocessor.service.js";
import { ResponseModeExecutorService } from "./response-mode-executor.service.js";
import { SystemPlannerService } from "./system-planner.service.js";
import { TurnDecisionService } from "./turn-decision.service.js";

export interface AttachmentTurnContextItem {
  attachmentRefId: string;
  category: ChatAttachmentCategory;
  status: string;
  recognition?: unknown;
}

export interface AttachmentTurnContextSummary {
  attachmentRefId: string;
  category: ChatAttachmentCategory;
  status: string;
  routingCapabilityId: string | null;
  contextHint: string | null;
  recognitionPresent: boolean;
}

export interface AttachmentTurnContext {
  attachments: ReadonlyArray<AttachmentTurnContextItem>;
  contextSummaries?: ReadonlyArray<AttachmentTurnContextSummary>;
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
    private readonly systemPlannerService: SystemPlannerService,
    private readonly responseModeExecutorService: ResponseModeExecutorService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
    private readonly messagePreprocessorService: MessagePreprocessorService,
    private readonly turnDecisionService: TurnDecisionService,
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
    const preprocessorResult = this.messagePreprocessorService.preprocess({
      userMessage: input.userMessage,
      hasAttachments: Boolean(input.attachmentTurn?.attachments.length),
    });
    const turnDecisionRan = shouldRunUnifiedTurnDecision({
      proposalRevision: input.proposalRevision,
      proposalExplainer: input.proposalExplainer,
    });
    const turnDecision = turnDecisionRan
      ? await this.turnDecisionService.decide({
          preprocessorResult,
          attachmentContextSummaries: input.attachmentTurn?.contextSummaries ?? [],
          recentMessages: input.recentMessages,
        })
      : undefined;

    const plan = await this.systemPlannerService.planTurn({
      userMessage: input.userMessage,
      recentMessages: input.recentMessages,
      proposalRevision: input.proposalRevision,
      attachmentTurn: input.attachmentTurn,
      turnDecision,
    });
    const { route } = plan;
    const capabilityTurnMetadata = toAgentTurnCapabilityPresentation(plan.presentationMetadata);

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
        ...(input.attachmentTurn.contextSummaries?.length
          ? { contextSummaries: [...input.attachmentTurn.contextSummaries] }
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

    const directPathCandidate = this.systemPlannerService.classifyDirectPathCandidate({
      userMessage: input.userMessage,
      attachmentTurn: input.attachmentTurn,
      proposalRevision: input.proposalRevision,
    });

    const executed = await this.responseModeExecutorService.execute({
      plan,
      orchestratorInput: input,
      contextPacket,
      coachingContext,
      capabilityTurnMetadata,
      turnDecisionTurn: {
        turnDecisionRan,
        turnDecision,
      },
      directPathCandidate,
      provider: this.provider,
    });

    return {
      output: executed.output,
      parseErrors: executed.parseErrors,
      replySafetyErrors: executed.replySafetyErrors,
      agentMetadata: {
        ...executed.agentMetadata,
        responseModeExecution: executed.responseModeExecution,
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
