import type { CoachAiProvider } from "@health/ai";
import { validateReplySafety } from "@health/ai";
import type {
  AgentContextPacket,
  AgentIntent,
  AgentTurnCapabilityPresentation,
  AgentTurnMetadata,
  AgentToolName,
  AiStructuredOutput,
  BuildAgentContextRequest,
  ChatAttachmentCategory,
  ContextDepth,
  ContextTimeRange,
  ProposalExplainerTurnContext,
  RawAiProposal,
  ResolvedCapabilityPresentationMetadata,
} from "@health/types";
import { createFallbackDomainAnswer, isDeterministicResponseModeExecutorMode } from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { CoachingContextService } from "../coaching-context/coaching-context.service.js";
import { ContextCompressionService } from "../coaching-context/context-compression.service.js";
import { ContextExpansionPolicyService } from "../coaching-context/context-expansion-policy.service.js";
import { mapContextSourceRefsToAgentCitations } from "../coaching-context/agent-prompt-context.js";
import { ActionResolverService } from "./action-resolver.service.js";
import { ActionVariantCatalogService } from "./action-variant-catalog.service.js";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { createCoachAiProvider, resolveAiCoachProviderMode } from "./coach-provider.factory.js";
import { DecisionMakerExecutorService } from "./decision-maker-executor.service.js";
import { DomainLlmExecutorService } from "./domain-llm-executor.service.js";
import type { DomainLlmExecutorResult } from "./domain-llm-executor.service.js";
import { MessagePreprocessorService } from "./message-preprocessor.service.js";
import { ResponseModeExecutorService } from "./response-mode-executor.service.js";
import { RouterLlmService } from "./router-llm.service.js";
import { SystemPlannerService } from "./system-planner.service.js";
import type { DomainFanoutEntry } from "./system-planner.service.js";

/**
 * Bounded attachment metadata passed into the orchestrator.
 * No recognition envelope — the router and domain LLMs read attachment
 * content directly as multimodal context.
 */
export interface AttachmentTurnContextItem {
  attachmentRefId: string;
  category: ChatAttachmentCategory;
  mimeType: string;
  consentState: "granted" | "needs_consent" | "none";
  storageRef: string | null;
}

export interface AttachmentTurnContext {
  attachments: ReadonlyArray<AttachmentTurnContextItem>;
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
  /**
   * When true, the pipeline resolved a consent-gated outcome (e.g. a medical
   * document save proposal from the decision-maker). The caller (ChatService)
   * should surface a distinct consent prompt to the user. Nothing is
   * auto-persisted — the proposal must be accepted through the normal
   * proposal-accept flow.
   *
   * Only set on fan-out turns; undefined on single-executor / pre-AI-gate turns.
   */
  consentRequired?: boolean;
}

const FAN_OUT_SAFE_FALLBACK_REPLY =
  "I could not safely process that response. Please try again with a wellness-focused question.";

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
    private readonly routerLlmService: RouterLlmService,
    private readonly domainLlmExecutorService: DomainLlmExecutorService,
    private readonly actionResolverService: ActionResolverService,
    private readonly decisionMakerExecutorService: DecisionMakerExecutorService,
    private readonly actionVariantCatalogService: ActionVariantCatalogService,
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

    // RouterLlm is the only first-LLM routing stage for eligible turns.
    // Proposal-revision and proposal-explainer turns are the explicit non-router exceptions.
    const shouldRunRouter = !input.proposalRevision && !input.proposalExplainer;
    const routerResult = shouldRunRouter
      ? await this.routerLlmService.route({
          preprocessorResult,
          attachmentHints: (input.attachmentTurn?.attachments ?? []).map((a) => ({
            category: a.category as string,
          })),
          recentMessages: input.recentMessages,
        })
      : undefined;

    const plan = await this.systemPlannerService.planTurn({
      userMessage: input.userMessage,
      recentMessages: input.recentMessages,
      proposalRevision: input.proposalRevision,
      attachmentTurn: input.attachmentTurn,
      routerResult,
    });
    const { route } = plan;
    const capabilityTurnMetadata = toAgentTurnCapabilityPresentation(plan.presentationMetadata);

    // Build primary context packet for the current route (used by the single-domain
    // path and as a fallback for the fan-out path metadata).
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
          mimeType: attachment.mimeType,
          consentState: attachment.consentState,
          storageRef: attachment.storageRef,
        })),
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

    // ---------------------------------------------------------------------------
    // Route selection: fan-out vs. single-executor path
    //
    // Fan-out path: the router ran, returned a confident LLM result, and the plan
    // is not a deterministic mode. For this path we run one DomainLlmExecutorService
    // loop per selected domain concurrently (Stage 8), then synthesize via
    // DecisionMakerExecutorService (Stage 9) and ActionResolver (Stage 10).
    // Pre-gates (crisis/explainer/direct-path/proposal-revision) always bypass the
    // fan-out — their turns reach this code only via the ResponseModeExecutorService path below.
    //
    // Single-executor path: all other turns (proposal-revision, proposal-explainer,
    // low-confidence fallback, deterministic modes). ResponseModeExecutorService
    // handles both the LLM loop (proposal-revision, explainer, fallback) and the
    // deterministic gate-miss path (buildDelegatedResult).
    // ---------------------------------------------------------------------------
    const isFanOutTurn =
      shouldRunRouter &&
      routerResult?.source === "llm" &&
      !isDeterministicResponseModeExecutorMode(plan.executorMode);

    if (isFanOutTurn) {
      return this.runFanOutTurn(input, {
        plan,
        contextPacket,
        // Pass the primary coachingContext (with compression summary if applied) so
        // domain executors have access to review compression context. Each domain's
        // per-domain packet context is merged on top of this base.
        primaryCoachingContext: coachingContext,
        capabilityTurnMetadata,
        routerResult: routerResult!,
      });
    }

    // Single-executor path — proposal-revision, explainer, fallback, deterministic modes.
    const executed = await this.responseModeExecutorService.execute({
      plan,
      orchestratorInput: input,
      contextPacket,
      coachingContext,
      capabilityTurnMetadata,
      routerTurn: {
        routerRan: shouldRunRouter,
        routerResult,
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

  // ---------------------------------------------------------------------------
  // Private — fan-out turn execution
  // ---------------------------------------------------------------------------

  private async runFanOutTurn(
    input: OrchestrateCoachTurnInput,
    params: {
      plan: import("./system-planner.service.js").DomainFanoutPlan;
      contextPacket: AgentContextPacket;
      /** Primary coaching context with compression summary already applied. */
      primaryCoachingContext: Record<string, unknown>;
      capabilityTurnMetadata: AgentTurnCapabilityPresentation;
      routerResult: import("./router-llm.service.js").RouterLlmResult;
    },
  ): Promise<OrchestratedCoachTurnResult> {
    const { plan, contextPacket, primaryCoachingContext, capabilityTurnMetadata, routerResult } = params;
    const selectedDomains = plan.fanout.selectedDomains;

    // Build one bounded AgentContextPacket per selected domain.
    // Safety floors (documents/sensitive denied by default) are re-applied by
    // CoachingContextService per packet — we do not relax them here.
    const domainContextPackets = await this.buildDomainContextPackets(
      input,
      selectedDomains,
      contextPacket,
    );

    // Run selected domain LLMs concurrently.
    // Guard: Promise.all is wrapped so a rejected inner promise (which should never
    // happen since executeDomainLoopSafe never rejects) does not crash the turn.
    const domainResults = await this.runDomainsConcurrently(
      input,
      selectedDomains,
      domainContextPackets,
      primaryCoachingContext,
    );

    const degradedDomains = domainResults
      .filter((r) => r.result.degraded)
      .map((r) => r.domain);

    // Build the action-variant catalog from the selected domains' clamped allowlists.
    const actionVariantCatalog = this.actionVariantCatalogService.buildCatalog({
      selectedDomains,
    });

    // Collect domain outputs for the decision-maker (only domain_answer entries).
    const domainOutputs = domainResults.map((r) => r.result.domainAnswer);

    // Collect safety flags and constraints from the primary context packet.
    const safetyFlags = plan.route.safetyFlags ?? [];
    const safetyConstraints = contextPacket.safetyConstraints ?? [];

    // Run the decision-maker LLM (Stage 9).
    // DecisionMakerExecutorService always resolves — degrades to fallback on error.
    const decisionResult = await this.decisionMakerExecutorService.execute({
      userMessage: input.userMessage,
      domainOutputs,
      actionVariantCatalog,
      safetyFlags,
      safetyConstraints,
      provider: this.provider,
    });

    // Extract the workout domain calorie estimate and rate from the fan-out results.
    // ONLY the workout domain LLM may provide workoutCalorieEstimate /
    // workoutCaloriePerHourRate — this is enforced structurally by domainAnswerSchema's
    // superRefine. We extract them here so ActionResolver can stamp them onto workout
    // proposals with provenance 'workout_llm'. The decision-maker output must never
    // be the source.
    const workoutCalorieEstimate = extractWorkoutCalorieEstimate(domainResults);
    const workoutCaloriePerHourRate = extractWorkoutCaloriePerHourRate(domainResults);

    // Resolve the decision-maker output through ActionResolver (Stage 10).
    // ActionResolver filters proposals to the union of the selected domains'
    // allowedProposalIntents and handles the consent-gated medical-save action.
    // When a workout calorie estimate or rate is present, it is stamped onto
    // workout proposals.
    const resolved = this.actionResolverService.resolveFinalDecisionOutput({
      finalDecision: decisionResult.output,
      selectedDomains,
      workoutCalorieEstimate,
      workoutCaloriePerHourRate,
    });

    // Safety floor: validate the decision-maker's synthesized reply for diagnosis/treatment language.
    // This mirrors ResponseModeExecutorService.validateAndResolveFinalAnswer — the decision-maker
    // re-synthesizes a new reply that may introduce unsafe language not present in any domain summary.
    // On failure, replace the reply with a safe fallback and drop all proposals (reply_blocked).
    const replySafetyErrors = validateReplySafety(resolved.reply);
    const replyBlocked = replySafetyErrors.length > 0;

    // Carry the consent-required flag from ActionResolver: when true, the
    // decision-maker selected a consent-gated action (e.g. medical document save).
    // Surface it to ChatService so the response can include the distinct consent
    // prompt flag. Nothing is auto-persisted — the proposal flows through the
    // normal proposal validation + accept path.
    const consentRequired = replyBlocked ? false : resolved.consentRequired;

    const finalOutput: AiStructuredOutput = replyBlocked
      ? { reply: FAN_OUT_SAFE_FALLBACK_REPLY, proposals: [] }
      : { reply: resolved.reply, proposals: resolved.proposals };

    const parseErrors: string[] = [];

    if (degradedDomains.length > 0) {
      parseErrors.push(`Fan-out: domains degraded to fallback: [${degradedDomains.join(", ")}].`);
    }

    if (decisionResult.degraded) {
      parseErrors.push(
        ...decisionResult.degradedReasons.map((r) => `Decision-maker degraded: ${r}`),
      );
    }

    const safetyStatus = replyBlocked
      ? ("reply_blocked" as const)
      : degradedDomains.length === domainResults.length
        ? ("parse_failed" as const)
        : ("passed" as const);

    return {
      output: finalOutput,
      parseErrors,
      replySafetyErrors,
      consentRequired,
      agentMetadata: {
        ...buildFanOutTurnMetadata({
          plan,
          contextPacket,
          capabilityTurnMetadata,
          routerResult,
          domainResults,
          mergedOutput: finalOutput,
          decisionDegraded: decisionResult.degraded,
        }),
        safety: {
          status: safetyStatus,
          blockedReasons: replyBlocked ? replySafetyErrors : [],
          constraintsApplied: contextPacket.safetyConstraints ?? [],
        },
      },
    };
  }

  /**
   * Build one bounded AgentContextPacket per selected domain.
   *
   * Phase 5: each domain's packet is built from the domain's OWN capability route
   * (intent, purpose, depth, timeRange, requiredContextSlices) rather than
   * spreading the primary route. This fixes the Phase 4 cross-domain context
   * inheritance where all domains received the primary domain's context shape.
   *
   * Safety floors (documents/sensitive denied by default) are re-applied by
   * CoachingContextService per packet. If building fails for a domain (e.g.
   * network error), the primary packet is reused as a safe fallback.
   */
  private async buildDomainContextPackets(
    input: OrchestrateCoachTurnInput,
    selectedDomains: readonly DomainFanoutEntry[],
    primaryContextPacket: AgentContextPacket,
  ): Promise<AgentContextPacket[]> {
    return Promise.all(
      selectedDomains.map(async (domainEntry) => {
        try {
          // Build a domain-specific context request from the domain entry's OWN capability.
          // The domainEntry was built in buildRouterFanout with per-domain capability config,
          // so we derive intent/purpose/depth/timeRange from the capability directly.
          const domainContextRequest = buildDomainContextRequest(
            domainEntry,
            input.userMessage,
          );

          return await this.coachingContextService.buildAgentContext(
            input.auth,
            domainContextRequest,
            // No route passed: CoachingContextService derives context slices from
            // the request's purpose/depth/timeRange and the contextBudget options.
            undefined,
            // Re-apply per-domain context budget (safety floors are enforced at build time).
            { contextBudget: domainEntry.contextBudget },
          );
        } catch {
          // Degrade gracefully — reuse the primary packet for this domain.
          // The domain executor will still run and will degrade to createFallbackDomainAnswer
          // if the context is insufficient.
          return primaryContextPacket;
        }
      }),
    );
  }

  /**
   * Run all selected domain LLM loops concurrently.
   *
   * Isolation guarantee: Promise.all is wrapped in an outer try/catch. Normally
   * DomainLlmExecutorService.runDomainLoop never rejects (always resolves to a
   * fallback). The outer guard is a belt-and-suspenders defence so a programming
   * error in the executor cannot crash the entire turn.
   */
  private async runDomainsConcurrently(
    input: OrchestrateCoachTurnInput,
    selectedDomains: readonly DomainFanoutEntry[],
    domainContextPackets: AgentContextPacket[],
    primaryCoachingContext: Record<string, unknown>,
  ): Promise<Array<{ domain: DomainFanoutEntry["domain"]; result: DomainLlmExecutorResult }>> {
    try {
      const results = await Promise.all(
        selectedDomains.map(async (domainEntry, index) => {
          const domainContextPacket = domainContextPackets[index] ?? domainContextPackets[0];

          if (!domainContextPacket) {
            return {
              domain: domainEntry.domain,
              result: {
                domainAnswer: createFallbackDomainAnswer(domainEntry.domain),
                degraded: true,
                degradedReasons: ["No context packet available for domain."],
                loopIterations: 0,
                toolsInvoked: [] as AgentToolName[],
              } satisfies DomainLlmExecutorResult,
            };
          }

          // Build per-domain context, then merge in primary context's turn-level keys
          // (attachment, revision, explainer, compression) so all domain LLMs see the
          // same turn-level information. Per-domain structured state overrides where present.
          const domainBaseContext = this.coachingContextService.toAgentPromptContext(domainContextPacket);
          const domainCoachingContext: Record<string, unknown> = {
            ...domainBaseContext,
            // Carry forward turn-level context from primary (these are set by orchestrateCoachTurn
            // and are the same for all domains in a fan-out).
            ...(primaryCoachingContext.attachmentTurn !== undefined
              ? { attachmentTurn: primaryCoachingContext.attachmentTurn }
              : {}),
            ...(primaryCoachingContext.proposalRevision !== undefined
              ? { proposalRevision: primaryCoachingContext.proposalRevision }
              : {}),
            ...(primaryCoachingContext.proposalExplainer !== undefined
              ? { proposalExplainer: primaryCoachingContext.proposalExplainer }
              : {}),
            // Carry forward compression summary and notes from the primary context
            // so all domain LLMs benefit from review compression on review turns.
            ...(primaryCoachingContext.contextCompressionSummary !== undefined
              ? { contextCompressionSummary: primaryCoachingContext.contextCompressionSummary }
              : {}),
            ...(primaryCoachingContext.contextCompressionNotes !== undefined
              ? { contextCompressionNotes: primaryCoachingContext.contextCompressionNotes }
              : {}),
          };

          // Also carry forward compression and expansion metadata on agentContext if present.
          if (
            primaryCoachingContext.agentContext &&
            typeof primaryCoachingContext.agentContext === "object" &&
            domainCoachingContext.agentContext &&
            typeof domainCoachingContext.agentContext === "object"
          ) {
            const primaryAgentCtx = primaryCoachingContext.agentContext as Record<string, unknown>;
            const domainAgentCtx = domainCoachingContext.agentContext as Record<string, unknown>;

            if (primaryAgentCtx.contextCompressionApplied !== undefined) {
              domainAgentCtx.contextCompressionApplied = primaryAgentCtx.contextCompressionApplied;
            }

            if (primaryAgentCtx.expansionPolicy !== undefined) {
              domainAgentCtx.expansionPolicy = primaryAgentCtx.expansionPolicy;
            }
          }

          const domainResult = await this.domainLlmExecutorService.runDomainLoop({
            domainEntry,
            contextPacket: domainContextPacket,
            coachingContext: domainCoachingContext,
            orchestratorInput: input,
            provider: this.provider,
          });

          return { domain: domainEntry.domain, result: domainResult };
        }),
      );

      return results;
    } catch (error) {
      // Last-resort fallback: if Promise.all somehow rejects, return safe fallbacks
      // for all domains so the turn can still produce a safe reply.
      const message =
        error instanceof Error ? error.message : "Unexpected fan-out error.";

      return selectedDomains.map((domainEntry) => ({
        domain: domainEntry.domain,
        result: {
          domainAnswer: createFallbackDomainAnswer(domainEntry.domain),
          degraded: true,
          degradedReasons: [message],
          loopIterations: 0,
          toolsInvoked: [] as AgentToolName[],
        } satisfies DomainLlmExecutorResult,
      }));
    }
  }

}


// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

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

/**
 * Build AgentTurnMetadata for a fan-out turn result.
 * The metadata mirrors the shape produced by ResponseModeExecutorService so
 * downstream callers (ChatService, tests) see a consistent structure.
 */
function buildFanOutTurnMetadata(params: {
  plan: import("./system-planner.service.js").DomainFanoutPlan;
  contextPacket: AgentContextPacket;
  capabilityTurnMetadata: AgentTurnCapabilityPresentation;
  routerResult: import("./router-llm.service.js").RouterLlmResult;
  domainResults: Array<{ domain: DomainFanoutEntry["domain"]; result: DomainLlmExecutorResult }>;
  mergedOutput: AiStructuredOutput;
  decisionDegraded?: boolean;
}): AgentTurnMetadata {
  const { plan, contextPacket, capabilityTurnMetadata, routerResult, domainResults } = params;
  const { route } = plan;

  const providerMode = resolveAiCoachProviderMode();
  const totalIterations = domainResults.reduce((sum, r) => sum + r.result.loopIterations, 0);
  const allToolsInvoked = domainResults.flatMap((r) => r.result.toolsInvoked);
  const degradedDomains = domainResults
    .filter((r) => r.result.degraded)
    .map((r) => r.domain);

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
    toolsInvoked: allToolsInvoked,
    citations: mapContextSourceRefsToAgentCitations(contextPacket.sourceRefs),
    routing: {
      confidence: route.confidence,
      routingMethod: route.routingMethod,
      llmRouterInvoked: routerResult.source === "llm",
      unifiedTurnDecisionInvoked: true,
      catalogIntentId: route.catalogIntentId,
      safetyFlags: route.safetyFlags,
      expectedResponseMode: route.expectedResponseMode,
      contextSliceCount: route.requiredContextSlices.length,
      loopIterations: totalIterations,
      maxLoopIterations: domainResults.length * 3, // 3 per domain (DOMAIN_MAX_LOOP_ITERATIONS)
    },
    unifiedTurnDecision: {
      ran: true,
      source: routerResult.source,
      confidence: routerResult.output.confidence,
      routingMethod: "unified_turn_decision" as const,
      ...(routerResult.validationErrors.length > 0
        ? { validationErrorCount: routerResult.validationErrors.length }
        : {}),
      ...(degradedDomains.length > 0 ? { blockedFallback: false } : {}),
    },
    missingContextNotes: contextPacket.missingContextNotes,
    responseModeExecution: {
      executorMode: plan.executorMode,
      llmInvoked: true,
      expectedResponseMode: route.expectedResponseMode,
      delegatedToPreAiGate: false,
      preAiGateDelegationMissed: false,
    },
    safety: {
      status: degradedDomains.length === domainResults.length ? "parse_failed" : "passed",
      blockedReasons: [],
      constraintsApplied: contextPacket.safetyConstraints,
    },
  };
}

/**
 * Build a typed BuildAgentContextRequest for a specific DomainFanoutEntry.
 *
 * Phase 5: each selected domain gets a context request derived from its OWN
 * capability (not inherited from the primary route). This ensures that the
 * workout domain gets workout context slices, the nutrition domain gets
 * nutrition slices, etc.
 *
 * Conservative typed defaults are applied. The per-domain contextBudget from
 * DomainFanoutEntry further clamps depth/timeRange/documents at build time
 * (safety floor re-applied by CoachingContextService).
 */
function buildDomainContextRequest(
  domainEntry: DomainFanoutEntry,
  userMessage: string,
): BuildAgentContextRequest {
  // Map capabilityId to typed intent/depth/timeRange values.
  const CAPABILITY_TO_INTENT: Partial<Record<string, AgentIntent>> = {
    adjust_workout: "adjust_workout",
    review_progress: "review_progress",
    adjust_nutrition: "adjust_nutrition",
    ask_health_context: "ask_health_context",
    longevity_overview: "longevity_overview",
  };
  const CAPABILITY_TO_DEPTH: Partial<Record<string, ContextDepth>> = {
    adjust_workout: "medium",
    review_progress: "large",
    adjust_nutrition: "medium",
    ask_health_context: "large",
    longevity_overview: "large",
  };
  const CAPABILITY_TO_TIME_RANGE: Partial<Record<string, ContextTimeRange>> = {
    adjust_workout: "14d",
    review_progress: "30d",
    adjust_nutrition: "14d",
    ask_health_context: "30d",
    longevity_overview: "90d",
  };

  const cap = domainEntry.capabilityId;

  return {
    userMessage,
    intent: CAPABILITY_TO_INTENT[cap] ?? "general",
    depth: CAPABILITY_TO_DEPTH[cap] ?? "medium",
    timeRange: CAPABILITY_TO_TIME_RANGE[cap] ?? "14d",
    includeDocuments: false,
  };
}

/**
 * Extract the workout domain LLM's calorie estimate from fan-out domain results.
 *
 * Returns the first (and only expected) non-undefined workoutCalorieEstimate from
 * a domain result whose domain is 'workout'. Returns undefined when no workout
 * domain was selected or its answer carries no estimate.
 *
 * Source restriction: this function ONLY reads from the workout domain answer.
 * The decision-maker LLM and non-workout domains must never be the source of
 * the workout calorie estimate. The domainAnswerSchema superRefine guarantees
 * workoutCalorieEstimate is absent on non-workout answers at the Zod level.
 */
function extractWorkoutCalorieEstimate(
  domainResults: Array<{ domain: DomainFanoutEntry["domain"]; result: DomainLlmExecutorResult }>,
): number | undefined {
  for (const entry of domainResults) {
    if (entry.domain === "workout" && !entry.result.degraded) {
      const estimate = entry.result.domainAnswer.workoutCalorieEstimate;

      if (estimate !== undefined) {
        return estimate;
      }
    }
  }

  return undefined;
}

/**
 * Extract the workout domain LLM's kcal/hour burn rate from fan-out domain results.
 *
 * Returns the first (and only expected) non-undefined workoutCaloriePerHourRate from
 * a domain result whose domain is 'workout'. Returns undefined when no workout
 * domain was selected or its answer carries no rate.
 *
 * Source restriction: this function ONLY reads from the workout domain answer.
 * The decision-maker LLM and non-workout domains must never be the source of
 * the workout calorie per hour rate. The domainAnswerSchema superRefine guarantees
 * workoutCaloriePerHourRate is absent on non-workout answers at the Zod level.
 */
function extractWorkoutCaloriePerHourRate(
  domainResults: Array<{ domain: DomainFanoutEntry["domain"]; result: DomainLlmExecutorResult }>,
): number | undefined {
  for (const entry of domainResults) {
    if (entry.domain === "workout" && !entry.result.degraded) {
      const rate = entry.result.domainAnswer.workoutCaloriePerHourRate;

      if (rate !== undefined) {
        return rate;
      }
    }
  }

  return undefined;
}

