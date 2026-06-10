import type { CoachAiProvider } from "@health/ai";
import { validateReplySafety } from "@health/ai";
import type {
  AgentContextPacket,
  AgentFanOutDiagnostics,
  AgentIntent,
  AgentTurnCapabilityPresentation,
  AgentTurnMetadata,
  AgentTurnTelemetry,
  AgentToolName,
  AiStructuredOutput,
  BuildAgentContextRequest,
  ChatAttachmentCategory,
  ContextDepth,
  ContextTimeRange,
  ProposalExplainerTurnContext,
  RawAiProposal,
  ResolvedCapabilityPresentationMetadata,
  UserLocale,
} from "@health/types";
import {
  agentTurnTelemetrySchema,
  buildResponseModeExecutionMetadata,
  createFallbackDomainAnswer,
  isDeterministicResponseModeExecutorMode,
  resolveResponseModeExecutorLoopPolicy,
} from "@health/types";
import { Injectable, Logger } from "@nestjs/common";
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
import type { DecisionMakerResult } from "./decision-maker-executor.service.js";
import { DomainLlmExecutorService } from "./domain-llm-executor.service.js";
import type { DomainLlmExecutorResult } from "./domain-llm-executor.service.js";
import { MessagePreprocessorService } from "./message-preprocessor.service.js";
import { RouterLlmService } from "./router-llm.service.js";
import type { RouterLlmResult } from "./router-llm.service.js";
import { SystemPlannerService } from "./system-planner.service.js";
import type { CapabilityPlanResult, DomainFanoutEntry, DomainFanoutPlan } from "./system-planner.service.js";

/**
 * Bounded attachment metadata passed into the orchestrator.
 * No recognition envelope — the router and domain LLMs read attachment
 * content directly as multimodal context.
 */
export interface AttachmentTurnContextItem {
  attachmentRefId: string;
  category: ChatAttachmentCategory;
  mimeType: string;
  // "needs_consent" is never produced at runtime; retained for historical DB-row reads only.
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
  /** Persisted user locale — forwarded as the authoritative responseLanguageHint to the preprocessor. */
  responseLocale?: UserLocale;
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
   * Only set on fan-out turns; undefined on deterministic gate-miss turns.
   */
  consentRequired?: boolean;
}

const FAN_OUT_SAFE_FALLBACK_REPLY =
  "I could not safely process that response. Please try again with a wellness-focused question.";

const DETERMINISTIC_PRE_AI_GATE_REPLY =
  "That quick action should have been handled before the AI coach ran. Please try your request again.";

@Injectable()
export class AgentOrchestratorService {
  private readonly logger = new Logger(AgentOrchestratorService.name);
  private readonly provider: CoachAiProvider;

  constructor(
    private readonly coachingContextService: CoachingContextService,
    private readonly contextCompressionService: ContextCompressionService,
    private readonly contextExpansionPolicyService: ContextExpansionPolicyService,
    private readonly systemPlannerService: SystemPlannerService,
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
    const turnStart = Date.now();

    const preprocessorResult = this.messagePreprocessorService.preprocess({
      userMessage: input.userMessage,
      hasAttachments: Boolean(input.attachmentTurn?.attachments.length),
      // responseLanguageHint: persisted locale takes precedence over detected language.
      // resolvePreprocessorResponseLanguage (in packages/types) applies hint ?? detected.
      responseLanguageHint: input.responseLocale ?? null,
    });

    // RouterLlm is the only first-LLM routing stage for eligible turns.
    // Proposal-revision and proposal-explainer turns are the explicit non-router exceptions.
    const shouldRunRouter = !input.proposalRevision && !input.proposalExplainer;
    const routerStart = Date.now();
    const routerResult = shouldRunRouter
      ? await this.routerLlmService.route({
          preprocessorResult,
          attachmentHints: (input.attachmentTurn?.attachments ?? []).map((a) => ({
            category: a.category as string,
          })),
          recentMessages: input.recentMessages,
        })
      : undefined;
    const routerLatencyMs = shouldRunRouter ? Date.now() - routerStart : undefined;

    const plan = await this.systemPlannerService.planTurn({
      userMessage: input.userMessage,
      recentMessages: input.recentMessages,
      proposalRevision: input.proposalRevision,
      attachmentTurn: input.attachmentTurn,
      routerResult,
    });
    const { route } = plan;
    const capabilityTurnMetadata = toAgentTurnCapabilityPresentation(plan.presentationMetadata);

    // Build primary context packet for the current route (used as a fallback
    // for fan-out path metadata and for domain context building).
    const contextStart = Date.now();
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
    const contextLatencyMs = Date.now() - contextStart;

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

    // ---------------------------------------------------------------------------
    // Route selection
    //
    // S4: deterministic gate-miss (deterministic_read / deterministic_write) is
    // handled INLINE by buildDeterministicGateMissResult — a rare safety-net for
    // the case where a deterministic executor mode somehow reaches the orchestrator
    // without the pre-AI gate having handled it. No ADDITIONAL LLM calls are made
    // from this point; however, for eligible turns the router will already have run
    // above (before SystemPlannerService produced the executorMode). The genuine
    // zero-LLM path is the pre-AI gate in chat.service.ts (crisis, direct-path,
    // quota), which returns before AiService is called.
    //
    // All other turns fan out through runFanOutTurn:
    //   - revision turns (router skipped; single-domain fan-out via the revision capability)
    //   - explainer-with-proposal turns (router skipped; read-only single-domain fan-out)
    //   - low-confidence / fallback turns (single-domain fan-out via "general" capability)
    //   - confident multi-domain turns (parallel fan-out; the primary case)
    //
    // Pre-AI gates (crisis, no-proposal explainer, direct-path, quota) never reach the
    // orchestrator, so they are never in scope here (S4 holds at chat.service.ts).
    // ---------------------------------------------------------------------------
    if (isDeterministicResponseModeExecutorMode(plan.executorMode)) {
      return this.buildDeterministicGateMissResult({
        plan,
        contextPacket,
        capabilityTurnMetadata,
        routerResult,
        shouldRunRouter,
      });
    }

    // Every non-deterministic turn fans out.
    return this.runFanOutTurn(input, {
      plan,
      contextPacket,
      primaryCoachingContext: coachingContext,
      capabilityTurnMetadata,
      routerResult,
      responseLanguage: preprocessorResult.responseLanguage,
      planRequestSignal: preprocessorResult.simpleSignals.plan_request,
      turnStart,
      routerLatencyMs,
      contextLatencyMs,
    });
  }

  // ---------------------------------------------------------------------------
  // Private — deterministic gate-miss safety-net
  // ---------------------------------------------------------------------------

  /**
   * Handles deterministic gate-miss turns (executorMode = deterministic_read |
   * deterministic_write) INLINE — a safety-net for turns that reach the orchestrator
   * without the pre-AI gate having handled them (S4). No additional LLM calls are
   * made from this point; for eligible turns the router may already have run above.
   *
   * Returns a canned reply with responseModeExecution.delegatedToPreAiGate=true
   * and preAiGateDelegationMissed=true so downstream telemetry can flag the miss.
   * The metadata shape mirrors what the pre-C6 ResponseModeExecutorService.buildDelegatedResult emitted.
   */
  private buildDeterministicGateMissResult(params: {
    plan: CapabilityPlanResult;
    contextPacket: AgentContextPacket;
    capabilityTurnMetadata: AgentTurnCapabilityPresentation;
    routerResult: RouterLlmResult | undefined;
    shouldRunRouter: boolean;
  }): OrchestratedCoachTurnResult {
    const { plan, contextPacket, capabilityTurnMetadata, routerResult, shouldRunRouter } = params;
    const { route } = plan;

    const loopPolicy = resolveResponseModeExecutorLoopPolicy(plan.executorMode);
    const providerMode = resolveAiCoachProviderMode();

    // llmRouterInvoked is true when the router ran and returned a source="llm" result.
    const llmRouterInvoked =
      shouldRunRouter && routerResult?.source === "llm";

    const responseModeExecution = buildResponseModeExecutionMetadata({
      executorMode: plan.executorMode,
      llmInvoked: false,
      expectedResponseMode: plan.expectedResponseMode,
      delegatedToPreAiGate: true,
      preAiGateDelegationMissed: true,
    });

    const routing: AgentTurnMetadata["routing"] = {
      confidence: route.confidence,
      routingMethod: route.routingMethod,
      llmRouterInvoked: llmRouterInvoked ?? false,
      unifiedTurnDecisionInvoked: shouldRunRouter,
      catalogIntentId: route.catalogIntentId,
      safetyFlags: route.safetyFlags,
      expectedResponseMode: route.expectedResponseMode,
      contextSliceCount: route.requiredContextSlices.length,
      loopIterations: 0,
      maxLoopIterations: loopPolicy.maxLoopIterations,
    };

    const unifiedTurnDecision: AgentTurnMetadata["unifiedTurnDecision"] = routerResult
      ? {
          ran: shouldRunRouter,
          source: routerResult.source,
          confidence: routerResult.output.confidence,
          routingMethod: "unified_turn_decision" as const,
          ...(routerResult.validationErrors.length > 0
            ? { validationErrorCount: routerResult.validationErrors.length }
            : {}),
        }
      : { ran: shouldRunRouter };

    return {
      output: { reply: DETERMINISTIC_PRE_AI_GATE_REPLY, proposals: [] },
      parseErrors: [],
      replySafetyErrors: [],
      agentMetadata: {
        provider: providerMode,
        intent: route.intent,
        catalogIntentId: route.catalogIntentId,
        primaryCapabilityId: capabilityTurnMetadata.primaryCapabilityId,
        selectedCapabilityIds: [...capabilityTurnMetadata.selectedCapabilityIds],
        capabilityPresentation: capabilityTurnMetadata,
        purpose: contextPacket.purpose,
        depth: contextPacket.depth,
        timeRange: contextPacket.timeRange,
        toolsInvoked: [],
        citations: mapContextSourceRefsToAgentCitations(contextPacket.sourceRefs),
        routing,
        unifiedTurnDecision,
        missingContextNotes: contextPacket.missingContextNotes,
        responseModeExecution,
        safety: {
          status: "passed",
          blockedReasons: [],
          constraintsApplied: contextPacket.safetyConstraints,
        },
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private — fan-out turn execution
  // ---------------------------------------------------------------------------

  private async runFanOutTurn(
    input: OrchestrateCoachTurnInput,
    params: {
      plan: DomainFanoutPlan;
      contextPacket: AgentContextPacket;
      /** Primary coaching context with compression summary already applied. */
      primaryCoachingContext: Record<string, unknown>;
      capabilityTurnMetadata: AgentTurnCapabilityPresentation;
      /** undefined for revision/explainer turns where the router was skipped */
      routerResult: RouterLlmResult | undefined;
      /** Resolved response language (hint ?? detected). Null = fall back to message detection. */
      responseLanguage: string | null;
      /** Whether the user message was classified as an explicit plan-creation/modification request. */
      planRequestSignal: boolean;
      /** Turn entry timestamp for total latency calculation. */
      turnStart: number;
      /** Router LLM latency in ms. Absent when router was skipped. */
      routerLatencyMs: number | undefined;
      /** Context loading latency in ms. */
      contextLatencyMs: number;
    },
  ): Promise<OrchestratedCoachTurnResult> {
    const { plan, contextPacket, primaryCoachingContext, capabilityTurnMetadata, routerResult, responseLanguage, planRequestSignal, turnStart, routerLatencyMs, contextLatencyMs } = params;
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
    const domainsStart = Date.now();
    const domainResults = await this.runDomainsConcurrently(
      input,
      selectedDomains,
      domainContextPackets,
      primaryCoachingContext,
      responseLanguage,
    );
    const domainsLatencyMs = Date.now() - domainsStart;

    // Structured log: router stage done (counts/ids/flags only — no message text).
    if (routerResult !== undefined) {
      this.logger.log({
        stage: "router_done",
        source: routerResult.source,
        confidence: routerResult.output.confidence,
        selectedDomainCount: routerResult.output.selectedDomains.length,
        selectedDomains: routerResult.output.selectedDomains.map((d) => ({
          domain: d.domain,
          confidence: d.confidence,
        })),
        validationErrorCount: routerResult.validationErrors.length,
      });
    }

    // Structured log: each domain done (counts/ids/flags only — no health content).
    for (const { domain, result } of domainResults) {
      this.logger.log({
        stage: "domain_done",
        domain,
        degraded: result.degraded,
        degradedReasonCount: result.degradedReasons.length,
        candidateProposalCount: result.domainAnswer.candidateProposals.length,
        loopIterations: result.loopIterations,
        toolsInvoked: result.toolsInvoked,
        hasWorkoutCalorieEstimate:
          result.domainAnswer.workoutCalorieEstimate !== undefined,
        hasWorkoutCaloriePerHourRate:
          result.domainAnswer.workoutCaloriePerHourRate !== undefined,
      });
    }

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
    const decisionStart = Date.now();
    const decisionResult = await this.decisionMakerExecutorService.execute({
      userMessage: input.userMessage,
      domainOutputs,
      actionVariantCatalog,
      safetyFlags,
      safetyConstraints,
      provider: this.provider,
      responseLanguage,
    });
    const decisionLatencyMs = Date.now() - decisionStart;

    // Structured log: decision stage done (counts/ids/flags only — no text/health content).
    this.logger.log({
      stage: "decision_done",
      degraded: decisionResult.degraded,
      degradedReasonCount: decisionResult.degradedReasons.length,
      selectedAction: decisionResult.output.selectedAction ?? null,
      proposalCount: decisionResult.output.proposals.length,
      consentRequired: decisionResult.output.consentRequired,
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
    // allowedProposalIntents. consentRequired is a forwarded LLM boolean — there
    // is no consent-gated action variant currently in the catalog (medical-save is
    // deferred). When a workout calorie estimate or rate is present, it is stamped
    // onto workout proposals with provenance 'workout_llm' (R1/S8).
    const resolved = this.actionResolverService.resolveFinalDecisionOutput({
      finalDecision: decisionResult.output,
      selectedDomains,
      planRequestSignal,
      workoutCalorieEstimate,
      workoutCaloriePerHourRate,
    });

    // Safety floor: validate the decision-maker's synthesized reply for diagnosis/treatment language.
    // This covers all turn types now (revision, explainer, fallback, confident multi-domain) — S9/R2.
    // On failure, replace the reply with a safe fallback and drop all proposals (reply_blocked).
    const replySafetyErrors = validateReplySafety(resolved.reply);
    const replyBlocked = replySafetyErrors.length > 0;

    // Carry the consent-required flag from ActionResolver: this is the LLM boolean
    // forwarded from the decision-maker output (consentRequired). No consent-gated
    // action variant currently exists in the catalog — medical-save is deferred.
    // Surface it to ChatService for the ChatTurnResponse flag; nothing is auto-persisted.
    const consentRequired = replyBlocked ? false : resolved.consentRequired;

    const finalOutput: AiStructuredOutput = replyBlocked
      ? { reply: FAN_OUT_SAFE_FALLBACK_REPLY, proposals: [] }
      : { reply: resolved.reply, proposals: resolved.proposals };

    // droppedByAllowlist = proposals the decision-maker emitted but ActionResolver filtered out.
    // Clamped >=0 in case of unexpected shape mismatch.
    const decisionProposalCount = decisionResult.output.proposals.length;
    const resolvedProposalCount = resolved.proposals.length;
    const droppedByAllowlist = Math.max(0, decisionProposalCount - resolvedProposalCount);
    const finalProposalCount = finalOutput.proposals.length;

    // Structured log: resolution stage done (counts/flags only — no text/health content).
    this.logger.log({
      stage: "resolution_done",
      resolvedProposalCount,
      droppedByAllowlist,
      replyBlocked,
      finalProposalCount,
    });

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

    const totalLatencyMs = Date.now() - turnStart;

    const fanOutMetadata = buildFanOutTurnMetadata({
      plan,
      contextPacket,
      capabilityTurnMetadata,
      routerResult,
      domainResults,
      decisionResult,
      resolvedProposalCount,
      droppedByAllowlist,
      replyBlocked,
      finalProposalCount,
      routerLatencyMs,
      contextLatencyMs,
      domainsLatencyMs,
      decisionLatencyMs,
      totalLatencyMs,
    });

    // ---------------------------------------------------------------------------
    // Slice D: per-turn telemetry — one structured log per eligible turn.
    // Safety floor: no user message text, no reply text, no health data.
    // Counts, enums, and durations only.
    // ---------------------------------------------------------------------------
    const telemetry: AgentTurnTelemetry = {
      event: "ai.turn_summary",
      totalLatencyMs,
      routerLatencyMs,
      contextLatencyMs,
      decisionLatencyMs,
      domainLatencies: domainResults.map(({ domain, result }) => ({
        domain,
        latencyMs: result.latencyMs ?? 0,
      })),
      selectedDomains: selectedDomains.map((d) => d.domain),
      routerConfidence: routerResult?.output.confidence,
      routerSource: routerResult?.source,
      toolsRequestedPerDomain: domainResults.map(({ domain, result }) => ({
        domain,
        toolsInvoked: result.toolsInvoked,
        toolsDeniedCount: result.toolsDeniedCount ?? 0,
      })),
      degradedDomains,
      finalActionType: decisionResult.output.selectedAction ?? null,
      proposalCount: finalProposalCount,
      validationFailureClasses: [],
    };
    // Runtime-validate telemetry before logging to catch schema drift early.
    // safeParse: a mismatch emits a warning but never fails the turn.
    const telemetryValidation = agentTurnTelemetrySchema.safeParse(telemetry);
    if (!telemetryValidation.success) {
      this.logger.warn({
        stage: "telemetry_validation_failed",
        issues: telemetryValidation.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      });
      this.logger.log(telemetry);
    } else {
      this.logger.log(telemetryValidation.data);
    }

    return {
      output: finalOutput,
      parseErrors,
      replySafetyErrors,
      consentRequired,
      agentMetadata: {
        ...fanOutMetadata,
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
    responseLanguage: string | null,
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
                toolsDeniedCount: 0,
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
            responseLanguage,
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
          toolsDeniedCount: 0,
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
 *
 * Supports revision/explainer turns where routerResult is undefined (router
 * was skipped). In those cases, the router-derived fields default to
 * `ran: false` / `llmRouterInvoked: false` so metadata parity is preserved
 * without fabricating router data (R3).
 *
 * The `fanOut` diagnostics block records per-stage structural counts/ids/flags only
 * (never message text or health content — safety floor). The same data is used for
 * structured per-stage logs by the caller; this function builds it once so both
 * the persisted metadata and logs share a single derivation.
 */
function buildFanOutTurnMetadata(params: {
  plan: DomainFanoutPlan;
  contextPacket: AgentContextPacket;
  capabilityTurnMetadata: AgentTurnCapabilityPresentation;
  /** undefined for revision/explainer turns where the router was skipped */
  routerResult: RouterLlmResult | undefined;
  domainResults: Array<{ domain: DomainFanoutEntry["domain"]; result: DomainLlmExecutorResult }>;
  /** The full decision-maker result (output + degraded flag). */
  decisionResult: DecisionMakerResult;
  /** Proposal count after ActionResolver (union-allowlist filtering applied). */
  resolvedProposalCount: number;
  /** Proposals emitted by decision-maker but dropped by ActionResolver allowlist. */
  droppedByAllowlist: number;
  /** True when reply safety validation blocked the reply. */
  replyBlocked: boolean;
  /** Final proposal count after reply-block zeroing. */
  finalProposalCount: number;
  /** Router LLM latency in ms. Absent when router was skipped. */
  routerLatencyMs: number | undefined;
  /** Context loading latency in ms. */
  contextLatencyMs: number;
  /** Combined domain LLMs latency in ms (parallel wall-clock time). */
  domainsLatencyMs: number;
  /** Decision-maker LLM latency in ms. */
  decisionLatencyMs: number;
  /** Total turn wall-clock latency in ms. */
  totalLatencyMs: number;
}): AgentTurnMetadata {
  const {
    plan,
    contextPacket,
    capabilityTurnMetadata,
    routerResult,
    domainResults,
    decisionResult,
    resolvedProposalCount,
    droppedByAllowlist,
    replyBlocked,
    finalProposalCount,
    routerLatencyMs,
    contextLatencyMs,
    domainsLatencyMs,
    decisionLatencyMs,
    totalLatencyMs,
  } = params;
  const { route } = plan;

  const providerMode = resolveAiCoachProviderMode();
  const totalIterations = domainResults.reduce((sum, r) => sum + r.result.loopIterations, 0);
  const allToolsInvoked = domainResults.flatMap((r) => r.result.toolsInvoked);
  const degradedDomains = domainResults
    .filter((r) => r.result.degraded)
    .map((r) => r.domain);

  // Router-derived metadata: only set when the router actually ran.
  // For revision/explainer turns (routerResult=undefined), emit ran:false so
  // telemetry correctly records that the router was not invoked (R3 metadata parity).
  const llmRouterInvoked = routerResult !== undefined && routerResult.source === "llm";
  const unifiedTurnDecisionInvoked = routerResult !== undefined;

  const unifiedTurnDecision: AgentTurnMetadata["unifiedTurnDecision"] = routerResult
    ? {
        ran: true,
        source: routerResult.source,
        confidence: routerResult.output.confidence,
        routingMethod: "unified_turn_decision" as const,
        ...(routerResult.validationErrors.length > 0
          ? { validationErrorCount: routerResult.validationErrors.length }
          : {}),
        ...(degradedDomains.length > 0 ? { blockedFallback: false } : {}),
      }
    : { ran: false };

  // ---------------------------------------------------------------------------
  // Build fan-out diagnostics (structural fields only — no text/health content).
  // Reused in persisted metadata; caller emits per-stage logs from the same data.
  // ---------------------------------------------------------------------------
  const fanOut: AgentFanOutDiagnostics = {
    router: routerResult !== undefined
      ? {
          ran: true,
          source: routerResult.source,
          confidence: routerResult.output.confidence,
          selectedDomains: routerResult.output.selectedDomains.map((d) => ({
            domain: d.domain,
            confidence: d.confidence,
          })),
          blockedFallback: degradedDomains.length === domainResults.length && domainResults.length > 0,
          latencyMs: routerLatencyMs,
        }
      : {
          ran: false,
          selectedDomains: [],
        },
    domains: domainResults.map(({ domain, result }) => ({
      domain,
      degraded: result.degraded,
      degradedReasons: result.degradedReasons,
      candidateProposalCount: result.domainAnswer.candidateProposals.length,
      loopIterations: result.loopIterations,
      toolsInvoked: result.toolsInvoked,
      toolsDeniedCount: result.toolsDeniedCount ?? 0,
      hasWorkoutCalorieEstimate: result.domainAnswer.workoutCalorieEstimate !== undefined,
      latencyMs: result.latencyMs,
    })),
    decision: {
      degraded: decisionResult.degraded,
      selectedAction: decisionResult.output.selectedAction ?? null,
      proposalCount: decisionResult.output.proposals.length,
      consentRequired: decisionResult.output.consentRequired,
      latencyMs: decisionLatencyMs,
    },
    resolution: {
      resolvedProposalCount,
      droppedByAllowlist,
      replyBlocked,
      finalProposalCount,
      validationFailureClasses: [],
    },
    totalLatencyMs,
    contextLatencyMs,
    domainsLatencyMs,
  };

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
      llmRouterInvoked,
      unifiedTurnDecisionInvoked,
      catalogIntentId: route.catalogIntentId,
      safetyFlags: route.safetyFlags,
      expectedResponseMode: route.expectedResponseMode,
      contextSliceCount: route.requiredContextSlices.length,
      loopIterations: totalIterations,
      maxLoopIterations: domainResults.length * 3, // 3 per domain (DOMAIN_MAX_LOOP_ITERATIONS)
    },
    unifiedTurnDecision,
    missingContextNotes: contextPacket.missingContextNotes,
    responseModeExecution: {
      executorMode: plan.executorMode,
      llmInvoked: true,
      expectedResponseMode: route.expectedResponseMode,
      delegatedToPreAiGate: false,
      preAiGateDelegationMissed: false,
    },
    fanOut,
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
 * the workout calorie estimate. The domainLlmStepOutputSchema superRefine
 * guarantees workoutCalorieEstimate is absent on non-workout answers at the Zod level.
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
 * the workout calorie per hour rate. The domainLlmStepOutputSchema superRefine
 * guarantees workoutCaloriePerHourRate is absent on non-workout answers at the Zod level.
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
