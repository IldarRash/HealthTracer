import type { CoachAiProvider } from "@health/ai";
import type {
  CapabilityContextStrategy,
  CatalogIntentId,
  ChatAttachmentCategory,
  ContextBudgetPolicy,
  ExpectedResponseMode,
  IntentRouteResult,
  ResolvedCapabilityPresentationMetadata,
} from "@health/types";
import {
  buildContextSliceRequestForIntent,
  buildRouteFromCatalogIntent,
  llmIntentRouterOutputSchema,
  mergeLlmRouterOutputIntoRoute,
  normalizePreprocessorText,
  proposalRevisionIntentSchema,
  resolvePrimaryAttachmentCapabilityId,
  resolveProposalRevisionCapabilityId,
  validateLlmRouterOutputShape,
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

const LLM_FALLBACK_CONFIDENCE = 0.35;

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
}

export interface CapabilityPlanResult extends ContextBudgetPlanMetadata {
  route: IntentRouteResult;
  intentDefinition: CoachIntentDefinitionMetadata;
  catalogIntentId: CatalogIntentId;
  primaryCapabilityId: CatalogIntentId;
  selectedCapabilities: readonly CatalogIntentId[];
  presentationMetadata: ResolvedCapabilityPresentationMetadata;
  expectedResponseMode: ExpectedResponseMode;
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

  async planTurn(
    input: SystemPlannerTurnInput,
    provider: CoachAiProvider,
  ): Promise<CapabilityPlanResult> {
    const route = await this.resolveRoute(input, provider);
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

    return {
      route: {
        ...route,
        expectedResponseMode,
      },
      intentDefinition,
      catalogIntentId: primaryCapabilityId,
      primaryCapabilityId,
      selectedCapabilities,
      presentationMetadata,
      expectedResponseMode,
      defaultContextStrategy,
      ...budgetMetadata,
    };
  }

  private async resolveRoute(
    input: SystemPlannerTurnInput,
    provider: CoachAiProvider,
  ): Promise<IntentRouteResult> {
    if (input.proposalRevision) {
      return this.resolveProposalRevisionRoute(input.proposalRevision);
    }

    if (this.hasClassifiedAttachmentTurn(input.attachmentTurn)) {
      return this.resolveAttachmentRoute(input.attachmentTurn!);
    }

    if (this.isProposalExplainerTurn(input)) {
      return this.resolveProposalExplainerRoute();
    }

    return this.resolveLlmCatalogRoute(input, provider);
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

  private hasClassifiedAttachmentTurn(
    attachmentTurn: SystemPlannerAttachmentTurnContext | undefined,
  ): attachmentTurn is SystemPlannerAttachmentTurnContext {
    return (
      attachmentTurn != null &&
      attachmentTurn.attachments.some((attachment) => attachment.category !== "unclassified")
    );
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

  private resolveAttachmentRoute(
    attachmentTurn: SystemPlannerAttachmentTurnContext,
  ): IntentRouteResult {
    const routingConfig = this.aiBehaviorConfigService.getAttachmentRouting();
    const catalogIntentId = resolvePrimaryAttachmentCapabilityId(
      routingConfig,
      attachmentTurn.attachments
        .map((attachment) => attachment.category)
        .filter((category): category is Exclude<ChatAttachmentCategory, "unclassified"> =>
          category !== "unclassified",
        ),
    );
    const mappedAgentIntent =
      this.capabilityRegistryService.resolveMappedAgentIntent(catalogIntentId);
    const contextStrategy =
      this.capabilityRegistryService.getDefaultContextStrategy(catalogIntentId);

    return buildRouteFromCatalogIntent({
      catalogIntentId,
      mappedAgentIntent,
      confidence: routingConfig.confidence,
      routingMethod: routingConfig.routingMethod,
      requiredContextSlices: [contextStrategy],
      expectedResponseMode: this.responseModePolicyService.resolveFromCapabilityPolicy(
        catalogIntentId,
      ),
    });
  }

  private async resolveLlmCatalogRoute(
    input: SystemPlannerTurnInput,
    provider: CoachAiProvider,
  ): Promise<IntentRouteResult> {
    const fallbackCapabilityId =
      this.aiBehaviorConfigService.getResponseModes().fallbackCapabilityId;
    const fallbackConfig = this.capabilityRegistryService.getConfig(fallbackCapabilityId);
    const fallbackRoute = buildRouteFromCatalogIntent({
      catalogIntentId: fallbackCapabilityId,
      mappedAgentIntent: fallbackConfig.mappedAgentIntent,
      confidence: LLM_FALLBACK_CONFIDENCE,
      routingMethod: "llm_router",
      requiredContextSlices: [fallbackConfig.defaultContextStrategy],
      expectedResponseMode: this.responseModePolicyService.resolveFromCapabilityPolicy(
        fallbackCapabilityId,
      ),
    });

    let rawRouterOutput: unknown;

    try {
      rawRouterOutput = await provider.generateIntentRoute({
        userMessage: input.userMessage,
        recentMessages: input.recentMessages,
        intentCatalog: this.capabilityRegistryService.serializeForRouter(),
      });
    } catch {
      return {
        ...fallbackRoute,
        isConfident: false,
        confidence: LLM_FALLBACK_CONFIDENCE,
      };
    }

    const shapeErrors = validateLlmRouterOutputShape(rawRouterOutput);

    if (shapeErrors.length > 0) {
      return {
        ...fallbackRoute,
        isConfident: false,
        confidence: LLM_FALLBACK_CONFIDENCE,
      };
    }

    const llmRoute = llmIntentRouterOutputSchema.parse(rawRouterOutput);
    const mappedAgentIntent = this.capabilityRegistryService.resolveMappedAgentIntent(
      llmRoute.catalogIntentId,
    );

    return mergeLlmRouterOutputIntoRoute(fallbackRoute, llmRoute, mappedAgentIntent);
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
