import type {
  AgentSafetyFlag,
  AgentToolName,
  CapabilityContextStrategy,
  CatalogIntentId,
  ChatAttachmentCategory,
  ContextBudgetPolicy,
  ExpectedResponseMode,
  IntentRouteResult,
  ResolvedCapabilityPresentationMetadata,
  ResponseModeExecutorMode,
  RouterDecisionOutput,
} from "@health/types";
import {
  MAX_ROUTER_SELECTED_DOMAINS,
  RULE_ROUTE_CONFIDENCE_THRESHOLD,
  buildContextSliceRequestForIntent,
  buildRouteFromCatalogIntent,
  normalizePreprocessorText,
  proposalRevisionIntentSchema,
  resolveProposalRevisionCapabilityId,
  resolveResponseModeExecutorMode,
  type DirectChatPathCandidate,
  type RouterDomain,
} from "@health/types";
import type { RouterLlmResult } from "./router-llm.service.js";
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

// Code constant — do not remove; Phase 5 assertion tests depend on this.
export { MAX_ROUTER_SELECTED_DOMAINS };

export interface SystemPlannerAttachmentTurnContextItem {
  attachmentRefId: string;
  category: ChatAttachmentCategory;
  mimeType: string;
  consentState: "granted" | "needs_consent" | "none";
  storageRef: string | null;
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
  /** @deprecated use routerResult instead; kept for backward compat during migration */
  turnDecision?: never;
  routerResult?: RouterLlmResult;
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

/**
 * Per-domain entry produced by the fan-out planner.
 * Each entry holds the independently clamped allowlists and context budget
 * for ONE selected domain LLM. Safety floors (documents/sensitive denied by
 * default) are re-applied to each entry independently.
 */
export interface DomainFanoutEntry {
  /** RouterDomain discriminator for this entry (workout | nutrition | health). */
  domain: RouterDomain;
  /** Resolved CatalogIntentId for this domain (clamped to capability catalog). */
  capabilityId: CatalogIntentId;
  /** Tool allowlist: intersection of domain config + capability catalog. Read-only context tools only. */
  allowedTools: readonly AgentToolName[];
  /** Proposal-intent allowlist: from capability catalog for this domain. */
  allowedProposalIntents: readonly string[];
  /** Per-domain context budget with safety floors re-applied (documents/sensitive denied by default). */
  contextBudget: ContextBudgetPolicy;
  /** Per-domain executor mode, derived from capability policy and route signals. */
  executorMode: ResponseModeExecutorMode;
}

/**
 * Fan-out plan metadata — added to every planTurn result in Phase 4.
 *
 * For confident router routes: selectedDomains has 1–MAX_ROUTER_SELECTED_DOMAINS entries.
 * For non-fan-out routes (proposal-revision, explainer, fallback, direct-path):
 *   selectedDomains has exactly one entry derived from the single capability, and
 *   isMultiDomain is false.
 *
 * Downstream callers (orchestrator, executor) continue to read the primary-domain
 * CapabilityPlanResult fields (route, intentDefinition, executorMode, etc.) which
 * mirror selectedDomains[0] for all routes. Phase 5 (DecisionMakerExecutorService)
 * will iterate selectedDomains to run the parallel domain LLMs.
 */
export interface DomainFanoutMetadata {
  /**
   * Per-domain entries, ordered by router confidence (highest first).
   * Capped at MAX_ROUTER_SELECTED_DOMAINS. Always at least one entry.
   */
  selectedDomains: readonly DomainFanoutEntry[];
  /**
   * True when the router selected more than one domain and the fan-out
   * will run multiple concurrent domain LLMs in Phase 5.
   */
  isMultiDomain: boolean;
}

/**
 * Full planner output: the existing CapabilityPlanResult fields (primary-domain
 * backward-compat slice, read by orchestrator and executor today) plus the
 * DomainFanoutMetadata for the parallel fan-out path.
 *
 * The orchestrator runs DomainLlmExecutorService concurrently for each entry in
 * selectedDomains, feeds all domain outputs to DecisionMakerExecutorService (Stage 9),
 * and the primary-domain CapabilityPlanResult fields remain for backward-compat with
 * the single-executor (proposal-revision / explainer / fallback) path.
 */
export interface DomainFanoutPlan extends CapabilityPlanResult {
  fanout: DomainFanoutMetadata;
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

  async planTurn(input: SystemPlannerTurnInput): Promise<DomainFanoutPlan> {
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
    const routerDirectCommand =
      input.routerResult?.output.directCommand?.detected === true;
    const executorMode = resolveResponseModeExecutorMode({
      route: resolvedRoute,
      expectedResponseMode,
      requiresCompression: budgetMetadata.requiresCompression,
      allowedProposalIntents: intentDefinition.allowedProposalIntents,
      allowedTools: intentDefinition.allowedTools,
      directPathCandidate: this.classifyDirectPathCandidate(input),
      turnDecisionDirectCommand: routerDirectCommand,
    });

    // Build the fan-out metadata for Phase 4.
    // - Confident router routes iterate all selectedDomains (up to MAX_ROUTER_SELECTED_DOMAINS).
    // - All other routes produce a single-entry fanout from the primary capability.
    const fanout = this.buildFanoutMetadata(input, resolvedRoute, budgetMetadata.contextBudget);

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
      fanout,
      ...budgetMetadata,
    };
  }

  /**
   * Build DomainFanoutMetadata for this turn.
   *
   * For confident router routes: maps all selectedDomains (up to MAX_ROUTER_SELECTED_DOMAINS)
   * to DomainFanoutEntry values, each with independently clamped allowlists and budget.
   *
   * For all other routes (proposal-revision, explainer, fallback, direct-path):
   * returns a single-entry fanout from the primary capability so downstream code
   * always receives a uniform DomainFanoutMetadata shape.
   *
   * Safety floors: per-domain contextBudget is re-derived for each selected domain
   * independently (same inputs → same budget; floors are enforced at usage time
   * by CoachingContextService). If the primary budget was applied, each domain entry
   * inherits the same floor — documents and sensitive health context remain denied
   * unless the catalog explicitly allows them for that capability.
   */
  private buildFanoutMetadata(
    input: SystemPlannerTurnInput,
    resolvedRoute: IntentRouteResult,
    primaryContextBudget: ContextBudgetPolicy,
  ): DomainFanoutMetadata {
    const isConfidentRouterRoute =
      !input.proposalRevision &&
      input.routerResult?.source === "llm" &&
      input.routerResult.output.confidence >= RULE_ROUTE_CONFIDENCE_THRESHOLD &&
      input.routerResult.output.selectedDomains.length > 0;

    if (isConfidentRouterRoute) {
      return this.buildRouterFanout(input, resolvedRoute, primaryContextBudget);
    }

    // Single-domain fanout: primary capability used as the sole domain entry.
    return this.buildSingleDomainFanout(resolvedRoute, primaryContextBudget);
  }

  /**
   * Build multi-domain fanout from the router's selectedDomains.
   * Capped at MAX_ROUTER_SELECTED_DOMAINS. Each entry is independently derived.
   *
   * Phase 5: per-domain context budgets are now derived from each domain's OWN
   * capability/route via ContextBudgetPolicyService.buildPlanMetadata, rather
   * than reusing the primary route's budget. Safety floors (documents/sensitive
   * denied by default) are re-applied per domain.
   */
  private buildRouterFanout(
    input: SystemPlannerTurnInput,
    resolvedRoute: IntentRouteResult,
    primaryContextBudget: ContextBudgetPolicy,
  ): DomainFanoutMetadata {
    const routerDomains = input.routerResult!.output.selectedDomains.slice(
      0,
      MAX_ROUTER_SELECTED_DOMAINS,
    );

    const entries: DomainFanoutEntry[] = [];

    for (const routerDomain of routerDomains) {
      const capabilityId = this.pickCapabilityFromRouterDomain(
        input.routerResult!.output,
        routerDomain,
      );

      if (!capabilityId) {
        // Domain cannot be mapped to a catalog capability — skip it.
        continue;
      }

      const capConfig = this.capabilityRegistryService.getConfig(capabilityId);
      const domainIntentDef = this.capabilityRegistryService.getCoachIntentDefinition(capabilityId);

      // Phase 5: derive a per-domain context budget from the domain's OWN capability
      // and context strategy, not the primary route's budget.
      // Safety floors (documents/sensitive denied by default) are re-applied by
      // ContextBudgetPolicyService.buildPlanMetadata per capability.
      const domainContextSlices = [capConfig.defaultContextStrategy];
      const domainRoute = buildRouteFromCatalogIntent({
        catalogIntentId: capabilityId,
        mappedAgentIntent: this.capabilityRegistryService.resolveMappedAgentIntent(capabilityId),
        confidence: routerDomain.confidence,
        routingMethod: "unified_turn_decision",
        requiredContextSlices: domainContextSlices,
        expectedResponseMode: this.responseModePolicyService.resolveFromCapabilityPolicy(capabilityId),
      });
      const domainBudgetMetadata = this.contextBudgetPolicyService.buildPlanMetadata({
        userMessage: input.userMessage,
        route: domainRoute,
        selectedCapabilities: [capabilityId],
      });
      const contextBudget = domainBudgetMetadata.contextBudget;

      // Per-domain executor mode: use a derivation grounded in the domain's own route.
      const domainExecutorMode = resolveResponseModeExecutorMode({
        route: domainRoute,
        expectedResponseMode: this.responseModePolicyService.resolveFromCapabilityPolicy(capabilityId),
        requiresCompression: domainBudgetMetadata.requiresCompression,
        allowedProposalIntents: domainIntentDef.allowedProposalIntents,
        allowedTools: domainIntentDef.allowedTools,
        directPathCandidate: null,
        turnDecisionDirectCommand: false,
      });

      entries.push({
        domain: routerDomain.domain,
        capabilityId,
        allowedTools: [...capConfig.allowedTools],
        allowedProposalIntents: [...domainIntentDef.allowedProposalIntents],
        contextBudget,
        executorMode: domainExecutorMode,
      });
    }

    // If all domains failed capability mapping, fall back to single primary-domain entry.
    if (entries.length === 0) {
      return this.buildSingleDomainFanout(resolvedRoute, primaryContextBudget);
    }

    return {
      selectedDomains: entries,
      isMultiDomain: entries.length > 1,
    };
  }

  /**
   * Wrap a single capability into a DomainFanoutMetadata with one entry.
   * Used for proposal-revision, explainer, fallback, direct-path routes and
   * as a safety fallback when router domain mapping fails entirely.
   *
   * Phase 5: uses the provided contextBudget (already derived from the primary
   * capability's route). The safety floors on the budget are already enforced by
   * the caller (planTurn → buildPlanMetadata).
   */
  private buildSingleDomainFanout(
    resolvedRoute: IntentRouteResult,
    contextBudget: ContextBudgetPolicy,
  ): DomainFanoutMetadata {
    const capabilityId = resolvedRoute.catalogIntentId;
    const capConfig = this.capabilityRegistryService.getConfig(capabilityId);
    const intentDef = this.capabilityRegistryService.getCoachIntentDefinition(capabilityId);

    // Map capability to the closest RouterDomain for the single-entry case.
    // Non-router routes don't have a real domain; use the intent's mapped domain.
    const domain = resolveDomainForCapability(capabilityId);

    const executorMode = resolveResponseModeExecutorMode({
      route: resolvedRoute,
      expectedResponseMode: this.responseModePolicyService.resolveFromCapabilityPolicy(capabilityId),
      requiresCompression: false,
      allowedProposalIntents: intentDef.allowedProposalIntents,
      allowedTools: intentDef.allowedTools,
      directPathCandidate: null,
      turnDecisionDirectCommand: false,
    });

    return {
      selectedDomains: [
        {
          domain,
          capabilityId,
          allowedTools: [...capConfig.allowedTools],
          allowedProposalIntents: [...intentDef.allowedProposalIntents],
          contextBudget,
          executorMode,
        },
      ],
      isMultiDomain: false,
    };
  }

  private resolveRoute(input: SystemPlannerTurnInput): IntentRouteResult {
    if (input.proposalRevision) {
      return this.resolveProposalRevisionRoute(input.proposalRevision);
    }

    const routerRoute = this.tryResolveRouterRoute(input);

    if (routerRoute) {
      return routerRoute;
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
    const safetyFlags: AgentSafetyFlag[] = input.routerResult
      ? [...input.routerResult.output.safetyFlags]
      : [];

    return buildRouteFromCatalogIntent({
      catalogIntentId: fallbackCapabilityId,
      mappedAgentIntent: fallbackConfig.mappedAgentIntent,
      confidence: SAFE_FALLBACK_CONFIDENCE,
      routingMethod: input.routerResult ? "unified_turn_decision" : "rule_based",
      requiredContextSlices: [fallbackConfig.defaultContextStrategy],
      safetyFlags,
      expectedResponseMode: this.responseModePolicyService.resolveFromCapabilityPolicy(
        fallbackCapabilityId,
      ),
    });
  }

  private tryResolveRouterRoute(
    input: SystemPlannerTurnInput,
  ): IntentRouteResult | null {
    const routerResult = input.routerResult;

    if (!routerResult) {
      return null;
    }

    // Confidence gate: same threshold as the old TurnDecision path.
    if (
      routerResult.source !== "llm" ||
      routerResult.output.confidence < RULE_ROUTE_CONFIDENCE_THRESHOLD
    ) {
      return null;
    }

    // Primary domain = selectedDomains[0] (highest confidence, already ordered by the router).
    const primaryDomain = routerResult.output.selectedDomains[0];

    if (!primaryDomain) {
      return null;
    }

    // Map the domain to a single CatalogIntentId via the domain config bundle.
    const catalogIntentId = this.pickCapabilityFromRouterDomain(
      routerResult.output,
      primaryDomain,
    );

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
    // Primary route uses the capability's default context strategy for the existing
    // CapabilityPlanResult fields. The multi-domain fan-out is built separately in
    // buildFanoutMetadata, which iterates all selectedDomains independently.
    const requiredContextSlices = [capabilityConfig.defaultContextStrategy];

    return buildRouteFromCatalogIntent({
      catalogIntentId,
      mappedAgentIntent,
      confidence: routerResult.output.confidence,
      routingMethod: "unified_turn_decision",
      safetyFlags: [...routerResult.output.safetyFlags],
      requiredContextSlices,
      expectedResponseMode: this.responseModePolicyService.resolveFromCapabilityPolicy(
        catalogIntentId,
      ),
    });
  }

  /**
   * Deterministic domain→capability mapping for single-capability parity (Phase 3).
   * Uses the domain config intents intersected with the catalog.
   * Falls back to hard-coded domain defaults for robustness.
   */
  private pickCapabilityFromRouterDomain(
    output: RouterDecisionOutput,
    primaryDomain: RouterDecisionOutput["selectedDomains"][number],
  ): CatalogIntentId | null {
    const domainConfigBundle = this.aiBehaviorConfigService.getDomainConfigs();
    const domainConfig = domainConfigBundle[primaryDomain.domain];

    if (domainConfig && domainConfig.intents.length > 0) {
      // Match intent hints from the router output against available domain intents.
      const intentHints = primaryDomain.intentHints;

      if (intentHints.length > 0) {
        for (const hint of intentHints) {
          const matched = domainConfig.intents.find(
            (intent) =>
              intent.id === hint || intent.description.toLowerCase().includes(hint.toLowerCase()),
          );

          if (matched) {
            try {
              this.capabilityRegistryService.getConfig(matched.mapsToCapabilityId);
              return matched.mapsToCapabilityId;
            } catch {
              // capability not in registry; continue
            }
          }
        }
      }

      // Fall back to the first valid intent mapping in the domain config.
      for (const intent of domainConfig.intents) {
        try {
          this.capabilityRegistryService.getConfig(intent.mapsToCapabilityId);
          return intent.mapsToCapabilityId;
        } catch {
          // not in registry; try next
        }
      }
    }

    // Hard-coded domain defaults as last resort (ensures routing parity even without YAML).
    const DOMAIN_DEFAULT_CAPABILITY: Partial<Record<string, CatalogIntentId>> = {
      workout: "adjust_workout",
      nutrition: "adjust_nutrition",
      health: "ask_health_context",
    };

    const defaultCapability = DOMAIN_DEFAULT_CAPABILITY[primaryDomain.domain] as
      | CatalogIntentId
      | undefined;

    if (defaultCapability) {
      try {
        this.capabilityRegistryService.getConfig(defaultCapability);
        return defaultCapability;
      } catch {
        return null;
      }
    }

    return null;
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

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/**
 * Map a CatalogIntentId to the closest RouterDomain for single-entry fanout cases
 * (proposal-revision, explainer, fallback, direct-path). These routes don't pass
 * through the router so they don't have a real domain; this provides a sensible
 * canonical value for the DomainFanoutEntry.
 */
function resolveDomainForCapability(capabilityId: CatalogIntentId): RouterDomain {
  const CAPABILITY_TO_DOMAIN: Partial<Record<CatalogIntentId, RouterDomain>> = {
    adjust_workout: "workout",
    review_progress: "workout",
    adjust_nutrition: "nutrition",
    ask_health_context: "health",
    longevity_overview: "health",
    // general, ask_about_today, proposal_explainer, attachment_* → default to health
    // (conservative: these are advice-only turns with no proposal writes)
  };

  return CAPABILITY_TO_DOMAIN[capabilityId] ?? "health";
}
