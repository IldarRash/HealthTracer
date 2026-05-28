import type {
  CapabilityContextStrategy,
  CatalogIntentId,
  ChatAttachmentCategory,
  ContextBudgetPolicy,
  ExpectedResponseMode,
  IntentRouteResult,
  ResolvedCapabilityPresentationMetadata,
  TurnDecisionResult,
  ResponseModeExecutorMode,
} from "@health/types";
import {
  buildContextSlicePlanFromTurnDecision,
  buildContextSliceRequestForIntent,
  buildRouteFromCatalogIntent,
  isTurnDecisionRouteConfident,
  mergeTurnDecisionSafetyFlags,
  pickPrimaryCapabilityFromTurnDecision,
  normalizePreprocessorText,
  proposalRevisionIntentSchema,
  resolveProposalRevisionCapabilityId,
  resolveResponseModeExecutorMode,
  type DirectChatPathCandidate,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type { CoachIntentDefinitionMetadata } from "./capability-intent-definition.adapter.js";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import {
  ContextBudgetPolicyService,
  type ContextBudgetPlanMetadata,
} from "../coaching-context/context-budget-policy.service.js";
import { DirectChatPathMatcherService } from "./direct-chat-path-matcher.service.js";
import { ProposalExplainerMatcherService } from "./proposal-explainer-matcher.service.js";
import { ResponseModePolicyService } from "./response-mode-policy.service.js";

const SAFE_FALLBACK_CONFIDENCE = 0.35;

export interface SystemPlannerAttachmentTurnContextItem {
  attachmentRefId: string;
  category: ChatAttachmentCategory;
  status: string;
  recognition?: unknown;
}

export interface SystemPlannerAttachmentTurnContext {
  attachments: ReadonlyArray<SystemPlannerAttachmentTurnContextItem>;
}

export interface SystemPlannerProposalRevisionContext {
  supersededProposalId: string;
  originalProposal: {
    intent: string;
    targetDomain: string;
    title: string;
    reason?: string;
    proposedChanges?: unknown;
  };
  modificationFeedback: string;
}

export interface SystemPlannerTurnInput {
  userMessage: string;
  recentMessages: ReadonlyArray<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  proposalRevision?: SystemPlannerProposalRevisionContext;
  attachmentTurn?: SystemPlannerAttachmentTurnContext;
  turnDecision?: TurnDecisionResult;
}

export interface CapabilityPlanResult extends ContextBudgetPlanMetadata {
  route: IntentRouteResult;
  intentDefinition: CoachIntentDefinitionMetadata;
  catalogIntentId: CatalogIntentId;
  primaryCapabilityId: CatalogIntentId;
  selectedCapabilities: readonly CatalogIntentId[];
  presentationMetadata: ResolvedCapabilityPresentationMetadata;
  expectedResponseMode: ExpectedResponseMode;
  executorMode: ResponseModeExecutorMode;
  defaultContextStrategy: CapabilityContextStrategy;
  contextBudget: ContextBudgetPolicy;
}

@Injectable()
export class SystemPlannerService {
  constructor(
    private readonly capabilityRegistryService: CapabilityRegistryService,
    private readonly responseModePolicyService: ResponseModePolicyService,
    private readonly contextBudgetPolicyService: ContextBudgetPolicyService,
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
    private readonly directChatPathMatcherService: DirectChatPathMatcherService,
    private readonly proposalExplainerMatcherService: ProposalExplainerMatcherService,
  ) {}

  async planTurn(input: SystemPlannerTurnInput): Promise<CapabilityPlanResult> {
    const route = this.resolveRoute(input);
    const primaryCapabilityId = route.catalogIntentId;
    const selectedCapabilities =
      this.capabilityRegistryService.resolveSelectedCapabilityIds(primaryCapabilityId);
    const presentationMetadata =
      this.capabilityRegistryService.resolvePresentationMetadata(
        primaryCapabilityId,
        selectedCapabilities,
      );
    const intentDefinition =
      this.capabilityRegistryService.getCoachIntentDefinition(primaryCapabilityId);
    const defaultContextStrategy =
      this.capabilityRegistryService.getDefaultContextStrategy(primaryCapabilityId);
    const expectedResponseMode = this.responseModePolicyService.resolve({
      capabilityId: primaryCapabilityId,
      routeProvidedMode: route.expectedResponseMode,
    });
    const budgetMetadata = this.contextBudgetPolicyService.buildPlanMetadata({
      userMessage: input.userMessage,
      route: {
        ...route,
        expectedResponseMode,
      },
      selectedCapabilities,
    });
    const resolvedRoute = {
      ...route,
      expectedResponseMode,
    };
    const executorMode = resolveResponseModeExecutorMode({
      route: resolvedRoute,
      expectedResponseMode,
      requiresCompression: budgetMetadata.requiresCompression,
      allowedProposalIntents: intentDefinition.allowedProposalIntents,
      allowedTools: intentDefinition.allowedTools,
      directPathCandidate: this.classifyDirectPathCandidate(input),
      messageUnderstandingDirectCommand: input.turnDecision?.output.directCommand.detected,
    });

    return {
      route: resolvedRoute,
      intentDefinition,
      catalogIntentId: primaryCapabilityId,
      primaryCapabilityId,
      selectedCapabilities,
      presentationMetadata,
      expectedResponseMode,
      executorMode,
      defaultContextStrategy,
      ...budgetMetadata,
    };
  }

  private resolveRoute(input: SystemPlannerTurnInput): IntentRouteResult {
    if (input.proposalRevision) {
      return this.resolveProposalRevisionRoute(input.proposalRevision);
    }

    const turnDecisionRoute = this.tryResolveTurnDecisionRoute(input);

    if (turnDecisionRoute) {
      return turnDecisionRoute;
    }

    if (this.isProposalExplainerTurn(input)) {
      return this.resolveProposalExplainerRoute();
    }

    return this.resolveSafeFallbackRoute(input);
  }

  private isProposalExplainerTurn(input: SystemPlannerTurnInput): boolean {
    return this.proposalExplainerMatcherService.detect(
      normalizePreprocessorText(input.userMessage),
      {
        hasAttachments: Boolean(input.attachmentTurn?.attachments.length),
      },
    );
  }

  private resolveProposalExplainerRoute(): IntentRouteResult {
    const explainerConfig = this.aiBehaviorConfigService.getProposalExplainer();
    const catalogIntentId = explainerConfig.capabilityId;
    const config = this.capabilityRegistryService.getConfig(catalogIntentId);

    return buildRouteFromCatalogIntent({
      catalogIntentId,
      mappedAgentIntent: config.mappedAgentIntent,
      confidence: explainerConfig.confidence,
      routingMethod: explainerConfig.routingMethod,
      requiredContextSlices: [config.defaultContextStrategy],
      expectedResponseMode: this.responseModePolicyService.resolveFromCapabilityPolicy(
        catalogIntentId,
      ),
    });
  }

  private resolveProposalRevisionRoute(
    proposalRevision: SystemPlannerProposalRevisionContext,
  ): IntentRouteResult {
    const revisionConfig = this.aiBehaviorConfigService.getProposalRevisionRouting();
    const original = proposalRevision.originalProposal;
    const parsedIntent = proposalRevisionIntentSchema.safeParse(original.intent);
    const catalogIntentId = parsedIntent.success
      ? resolveProposalRevisionCapabilityId(revisionConfig, parsedIntent.data)
      : revisionConfig.fallbackCapabilityId;
    const mappedAgentIntent =
      this.capabilityRegistryService.resolveMappedAgentIntent(catalogIntentId);
    const contextStrategy =
      this.capabilityRegistryService.getDefaultContextStrategy(catalogIntentId);

    return buildRouteFromCatalogIntent({
      catalogIntentId,
      mappedAgentIntent,
      confidence: revisionConfig.confidence,
      routingMethod: revisionConfig.routingMethod,
      requiredContextSlices: [contextStrategy],
      expectedResponseMode: this.responseModePolicyService.resolve({
        capabilityId: catalogIntentId,
        routeProvidedMode: revisionConfig.expectedResponseMode,
      }),
    });
  }

  private resolveSafeFallbackRoute(input: SystemPlannerTurnInput): IntentRouteResult {
    const fallbackCapabilityId =
      this.aiBehaviorConfigService.getResponseModes().fallbackCapabilityId;
    const fallbackConfig = this.capabilityRegistryService.getConfig(fallbackCapabilityId);
    const safetyFlags = input.turnDecision
      ? mergeTurnDecisionSafetyFlags(input.turnDecision.output)
      : [];

    return buildRouteFromCatalogIntent({
      catalogIntentId: fallbackCapabilityId,
      mappedAgentIntent: fallbackConfig.mappedAgentIntent,
      confidence: SAFE_FALLBACK_CONFIDENCE,
      routingMethod: input.turnDecision ? "unified_turn_decision" : "rule_based",
      requiredContextSlices: [fallbackConfig.defaultContextStrategy],
      safetyFlags,
      expectedResponseMode: this.responseModePolicyService.resolveFromCapabilityPolicy(
        fallbackCapabilityId,
      ),
    });
  }

  private tryResolveTurnDecisionRoute(
    input: SystemPlannerTurnInput,
  ): IntentRouteResult | null {
    const turnDecision = input.turnDecision;

    if (!turnDecision || !isTurnDecisionRouteConfident(turnDecision)) {
      return null;
    }

    const catalogIntentId = pickPrimaryCapabilityFromTurnDecision(turnDecision.output);

    if (!catalogIntentId) {
      return null;
    }

    let capabilityConfig;

    try {
      capabilityConfig = this.capabilityRegistryService.getConfig(catalogIntentId);
    } catch {
      return null;
    }

    const mappedAgentIntent =
      this.capabilityRegistryService.resolveMappedAgentIntent(catalogIntentId);
    const requiredContextSlices = buildContextSlicePlanFromTurnDecision({
      mappedAgentIntent,
      defaultContextStrategy: capabilityConfig.defaultContextStrategy,
      contextNeeds: turnDecision.output.contextNeeds,
    });

    return buildRouteFromCatalogIntent({
      catalogIntentId,
      mappedAgentIntent,
      confidence: turnDecision.output.confidence,
      routingMethod: "unified_turn_decision",
      safetyFlags: mergeTurnDecisionSafetyFlags(turnDecision.output),
      requiredContextSlices,
      expectedResponseMode: this.responseModePolicyService.resolveFromCapabilityPolicy(
        catalogIntentId,
      ),
    });
  }

  resolveContextStrategyFallback(
    capabilityId: CatalogIntentId,
    mappedAgentIntent: IntentRouteResult["intent"],
  ): CapabilityContextStrategy {
    const fromRegistry = this.capabilityRegistryService.getDefaultContextStrategy(capabilityId);

    if (fromRegistry) {
      return fromRegistry;
    }

    return buildContextSliceRequestForIntent(mappedAgentIntent);
  }

  /**
   * Deterministic direct-path classification only; does not execute reads or mutations.
   */
  classifyDirectPathCandidate(
    input: Pick<SystemPlannerTurnInput, "userMessage" | "attachmentTurn" | "proposalRevision">,
  ): DirectChatPathCandidate | null {
    if (input.proposalRevision) {
      return null;
    }

    const hasAttachments = Boolean(input.attachmentTurn?.attachments.length);

    if (hasAttachments) {
      return null;
    }

    const normalizedText = normalizePreprocessorText(input.userMessage);

    return this.directChatPathMatcherService.detect(normalizedText, {
      hasAttachments: false,
    });
  }
}
