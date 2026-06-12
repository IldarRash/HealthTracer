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
  CandidateProposalSummary,
  ChatAttachmentCategory,
  ChatProposalRevisionOriginal,
  ContextCompressionQuality,
  ContextDepth,
  ContextTimeRange,
  DeepReviewPromptContext,
  ProposalExplainerTurnContext,
  ProgressHistoryReviewSummary,
  ProgressReporter,
  ResolvedCapabilityPresentationMetadata,
  UserLocale,
} from "@health/types";
import {
  agentTurnTelemetrySchema,
  createFallbackDomainAnswer,
  deriveDeepReviewDataQuality,
} from "@health/types";
import { Injectable, Logger } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import {
  CoachingContextService,
  type ProgressHistoryLookbackOptions,
} from "../coaching-context/coaching-context.service.js";
import { ContextCompressionService } from "../coaching-context/context-compression.service.js";
import { ContextExpansionPolicyService } from "../coaching-context/context-expansion-policy.service.js";
import { ProgressHistoryAggregateService } from "../progress/progress-history-aggregate.service.js";
import { mapContextSourceRefsToAgentCitations } from "../coaching-context/agent-prompt-context.js";
import { AttachmentTextExtractionService } from "../chat-attachments/attachment-text-extraction.service.js";
import type { AttachmentTextExtractionResult } from "../chat-attachments/attachment-text-extraction.service.js";
import { ActionResolverService } from "./action-resolver.service.js";
import { ActionVariantCatalogService } from "./action-variant-catalog.service.js";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { createCoachAiProvider, resolveAiCoachProviderMode } from "./coach-provider.factory.js";
import { DecisionMakerExecutorService } from "./decision-maker-executor.service.js";
import type { DecisionMakerResult } from "./decision-maker-executor.service.js";
import { DomainLlmExecutorService } from "./domain-llm-executor.service.js";
import type { DomainLlmExecutorResult } from "./domain-llm-executor.service.js";
import { aggregateUsageTotals, toUsageLogFields } from "./llm-cost-estimator.js";
import { MessagePreprocessorService } from "./message-preprocessor.service.js";
import { RouterLlmService } from "./router-llm.service.js";
import type { RouterLlmResult } from "./router-llm.service.js";
import { SystemPlannerService } from "./system-planner.service.js";
import type { DomainFanoutEntry, DomainFanoutPlan } from "./system-planner.service.js";

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
  /** Original filename (e.g. "training-plan.pdf"). Used by text-extraction path for all domains. */
  filename: string;
}

export interface AttachmentTurnContext {
  attachments: ReadonlyArray<AttachmentTurnContextItem>;
}

export interface ProposalRevisionContext {
  supersededProposalId: string;
  /**
   * Loose snapshot of the proposal being revised (proposedChanges is untyped).
   * Modify must also work for proposals persisted as invalid; the payload is
   * read-only LLM context here and is never applied without full validation.
   */
  originalProposal: ChatProposalRevisionOriginal;
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
  /**
   * Optional progress reporter for SSE streaming. Called at each coarse pipeline
   * stage (routing, domains_running, synthesis). Failures are caught and swallowed —
   * a throwing callback must never break the turn.
   */
  onProgress?: ProgressReporter;
}

export interface OrchestratedCoachTurnResult {
  output: AiStructuredOutput;
  parseErrors: string[];
  replySafetyErrors: string[];
  agentMetadata: AgentTurnMetadata;
  /**
   * COMPATIBILITY CODE (kept intentionally, per refactor-cleanup.md): plumbing
   * held for the deferred medical special-save flow (attachment recognition →
   * consent-gated save proposal → accept → persist health_document). When true,
   * the pipeline resolved a consent-gated outcome; no client consumes the flag
   * yet and nothing is auto-persisted — any proposal must still be accepted
   * through the normal proposal-accept flow. Removal condition: remove this
   * flag end-to-end if the special-save flow is descoped, or wire the client
   * consent prompt when it ships.
   */
  consentRequired?: boolean;
  /**
   * Present when the AI pipeline could not produce an honest reply.
   * reason=decision_failed: decision-maker failed after one retry.
   * reason=reply_blocked: reply safety validation blocked the synthesized reply.
   * When set, ChatService persists an empty message + turnError metadata instead
   * of fake coach text.
   */
  turnError?: { reason: "decision_failed" | "reply_blocked" };
}

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
    private readonly attachmentTextExtractionService: AttachmentTextExtractionService,
    private readonly progressHistoryAggregateService: ProgressHistoryAggregateService,
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
    const { onProgress } = input;
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

    // Emit routing stage before the router LLM call (pre-AI gate turns never reach
    // the orchestrator so they never emit stage events — handled in ChatService).
    if (shouldRunRouter) {
      emitProgress(onProgress, { kind: "stage", stage: "routing" });
    }

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
      preprocessorResult,
    });
    const { route } = plan;
    const capabilityTurnMetadata = toAgentTurnCapabilityPresentation(plan.presentationMetadata);

    // Build primary context packet for the current route (used as a fallback
    // for fan-out path metadata and for domain context building).
    // Turn-level lookback grant for the planner-injected progress_history_review
    // slice (Phase 3). The SAME options object (including the once-per-turn
    // precomputed summary on review turns) is threaded into every packet build
    // — primary + ≤3 domains — so the 6-query aggregation never runs per packet.
    const progressHistoryLookback: ProgressHistoryLookbackOptions = {
      requestedLookbackDays: plan.requestedLookbackDays,
      grantedLookbackDays: plan.grantedLookbackDays,
      responseLanguage: preprocessorResult.responseLanguage,
      precomputedSummary: await this.precomputeProgressHistorySummary(input.auth, plan),
    };

    const contextStart = Date.now();
    const contextPacket = await this.coachingContextService.buildAgentContext(
      input.auth,
      {
        userMessage: input.userMessage,
        intent: route.intent,
        purpose: route.purpose,
        depth: route.depth,
        timeRange: route.timeRange,
      },
      route,
      { contextBudget: plan.contextBudget, progressHistoryLookback },
    );
    const contextLatencyMs = Date.now() - contextStart;

    const coachingContext = this.coachingContextService.toAgentPromptContext(contextPacket);
    const expansionPolicy = this.contextExpansionPolicyService.createPolicySnapshot(
      plan.contextBudget,
    );

    // Compression dataQuality feeds the deepReview sufficiency block (worst-of).
    let compressionDataQuality: ContextCompressionQuality | undefined;

    if (plan.requiresCompression) {
      const compression = await this.contextCompressionService.compressForTurn({
        packet: contextPacket,
        reviewSignals: plan,
        budget: plan.contextBudget,
      });

      compressionDataQuality = compression.summary?.dataQuality;

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
          filename: attachment.filename,
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
    // All turns fan out through runFanOutTurn:
    //   - revision turns (router skipped; single-domain fan-out via the revision capability)
    //   - explainer-with-proposal turns (router skipped; read-only single-domain fan-out)
    //   - low-confidence / fallback turns (single-domain fan-out via "general" capability)
    //   - confident multi-domain turns (parallel fan-out; the primary case)
    //
    // Pre-AI gates (crisis, no-proposal explainer, direct-path, quota) never reach the
    // orchestrator — they return in ChatService before AiService is called.
    // SystemPlannerService guarantees plan.executorMode is never deterministic by
    // coercing any deterministic mode to the fan-out default (logged as pre_ai_gate.miss).
    // ---------------------------------------------------------------------------

    // Phase 4: deep-review sufficiency block — built only when the plan selected a
    // review budget profile AND the packet carries the progress_history_review slice.
    // Threaded into every domain request and the final-decision request so the
    // {{deepReviewSuffix}} instruction frames observed vs uncertain + analyzed range.
    const deepReview = buildDeepReviewPromptContext(plan, contextPacket, compressionDataQuality);

    return this.runFanOutTurn(input, {
      plan,
      contextPacket,
      primaryCoachingContext: coachingContext,
      capabilityTurnMetadata,
      routerResult,
      responseLanguage: preprocessorResult.responseLanguage,
      progressHistoryLookback,
      deepReview,
      onProgress,
      turnStart,
      routerLatencyMs,
      contextLatencyMs,
    });
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
      /** Shared per-turn lookback options (incl. the once-per-turn precomputed summary). */
      progressHistoryLookback: ProgressHistoryLookbackOptions;
      /** Deep-review sufficiency block (Phase 4). Undefined on non-review turns. */
      deepReview: DeepReviewPromptContext | undefined;
      onProgress?: ProgressReporter;
      /** Turn entry timestamp for total latency calculation. */
      turnStart: number;
      /** Router LLM latency in ms. Absent when router was skipped. */
      routerLatencyMs: number | undefined;
      /** Context loading latency in ms. */
      contextLatencyMs: number;
    },
  ): Promise<OrchestratedCoachTurnResult> {
    const { plan, contextPacket, primaryCoachingContext, capabilityTurnMetadata, routerResult, responseLanguage, progressHistoryLookback, deepReview, onProgress, turnStart, routerLatencyMs, contextLatencyMs } = params;
    const selectedDomains = plan.fanout.selectedDomains;

    // Emit domains_running stage with the selected domain names (structural info only,
    // no capabilities, intents, or content).
    emitProgress(onProgress, {
      kind: "stage",
      stage: "domains_running",
      selectedDomains: selectedDomains.map((d) => d.domain),
    });

    // Extract text from document_file attachments ONCE per turn, before the domain fan-out.
    // The result map is shared across all domain executors so text is extracted only once.
    // NEVER throws: extraction degrades gracefully per attachment.
    // SAFETY: extracted text is NEVER persisted or logged — ephemeral context-only.
    const attachmentTextMap = await this.attachmentTextExtractionService.extractTurnAttachmentTexts(
      (input.attachmentTurn?.attachments ?? []).map((a) => ({
        attachmentRefId: a.attachmentRefId,
        mimeType: a.mimeType,
        storageRef: a.storageRef,
      })),
    );

    // Build one bounded AgentContextPacket per selected domain.
    // Safety floors (documents/sensitive denied by default) are re-applied by
    // CoachingContextService per packet — we do not relax them here.
    const domainContextPackets = await this.buildDomainContextPackets(
      input,
      selectedDomains,
      contextPacket,
      progressHistoryLookback,
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
      attachmentTextMap,
      deepReview,
    );
    const domainsLatencyMs = Date.now() - domainsStart;

    // Structured log: router stage done (counts/ids/flags/tokens only — no message text).
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
        ...toUsageLogFields(routerResult.usage),
      });
    }

    // Structured log: each domain done (counts/ids/flags/tokens only — no health content).
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
        ...toUsageLogFields(result.usage),
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

    // Build the merged id→candidate map across all selected domains (Slice 2).
    // Keys are cand_<domain>_<index>; ActionResolver uses this to resolve
    // selectedProposalIds from the decision-maker into canonical payloads.
    const mergedCandidateMap = buildMergedCandidateMap(domainResults);

    // Build candidate summaries to pass to the decision-maker so it can pick
    // IDs without seeing full payloads (intent + title + reason are enough).
    const candidateProposalSummaries = buildCandidateProposalSummaries(domainResults);

    // Collect safety flags and constraints from the primary context packet.
    const safetyFlags = plan.route.safetyFlags ?? [];
    const safetyConstraints = contextPacket.safetyConstraints ?? [];

    // Recent messages for the decision-maker — capped at 6 / 4000 chars each (Change 2).
    const decisionRecentMessages = [...input.recentMessages]
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    // Emit synthesis stage before the decision-maker LLM call.
    emitProgress(onProgress, { kind: "stage", stage: "synthesis" });

    // Run the decision-maker LLM (Stage 9).
    // DecisionMakerExecutorService always resolves — degrades to fallback on error.
    const decisionStart = Date.now();
    const decisionResult = await this.decisionMakerExecutorService.execute({
      userMessage: input.userMessage,
      domainOutputs,
      candidateProposalSummaries,
      actionVariantCatalog,
      safetyFlags,
      safetyConstraints,
      provider: this.provider,
      responseLanguage,
      recentMessages: decisionRecentMessages,
      // Thread low-confidence flag from planner fanout so the decision template can
      // ask a clarifying question rather than guess the domain (Change 2 / Slice 5).
      lowConfidenceRoute: plan.fanout.lowConfidenceRoute,
      // Phase 4: deep-review sufficiency framing for the decision template.
      ...(deepReview !== undefined ? { deepReview } : {}),
    });
    const decisionLatencyMs = Date.now() - decisionStart;

    // Structured log: decision stage done (counts/ids/flags/tokens only — no text/health content).
    this.logger.log({
      stage: "decision_done",
      degraded: decisionResult.degraded,
      degradedReasonCount: decisionResult.degradedReasons.length,
      selectedAction: decisionResult.output.selectedAction ?? null,
      selectedProposalIdCount: decisionResult.output.selectedProposalIds.length,
      consentRequired: decisionResult.output.consentRequired,
      lowConfidenceRoute: plan.fanout.lowConfidenceRoute === true,
      deepReview: deepReview !== undefined,
      ...toUsageLogFields(decisionResult.usage),
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
    // ActionResolver resolves selectedProposalIds → canonical payloads from the
    // merged candidate map, then filters to the union allowlist. consentRequired
    // is a forwarded LLM boolean — no consent-gated action variant exists currently
    // (medical-save is deferred). Workout calorie fields are scrubbed/re-stamped
    // from the trusted workout domain answer only (R1/S8).
    const resolved = this.actionResolverService.resolveFinalDecisionOutput({
      finalDecision: decisionResult.output,
      selectedDomains,
      candidateMap: mergedCandidateMap,
      workoutCalorieEstimate,
      workoutCaloriePerHourRate,
    });

    // Decision-failed: decision-maker exhausted retries and could not produce an honest reply.
    // Skip reply safety check (there is no reply to validate) and produce a typed error outcome.
    const decisionFailed = Boolean(decisionResult.turnError?.reason === "decision_failed");

    // Safety floor: validate the decision-maker's synthesized reply for diagnosis/treatment language.
    // This covers all turn types (revision, explainer, fallback, confident multi-domain).
    // On failure: reply replaced with empty content, proposals dropped (reply_blocked).
    // Skip when decision already failed — there is no synthesized reply to validate.
    const replySafetyErrors = decisionFailed ? [] : validateReplySafety(resolved.reply);
    const replyBlocked = !decisionFailed && replySafetyErrors.length > 0;

    // COMPATIBILITY CODE (kept intentionally, per refactor-cleanup.md): carry the
    // consent-required flag from ActionResolver — the LLM boolean forwarded from the
    // decision-maker output (consentRequired). This is plumbing held for the deferred
    // medical special-save flow; no consent-gated action variant exists in the catalog
    // and no client consumes the flag yet. Nothing is auto-persisted. Removal
    // condition: remove end-to-end if the special-save flow is descoped, or wire the
    // client consent prompt when it ships.
    const consentRequired = (replyBlocked || decisionFailed) ? false : resolved.consentRequired;

    // S2: honest degradation — no fake coach reply.
    // - decision_failed: empty content marker (ChatService persists turnError metadata instead)
    // - reply_blocked: empty content marker + safety metadata preserved
    // - normal: the validated reply and proposals
    const finalOutput: AiStructuredOutput =
      decisionFailed || replyBlocked
        ? { reply: " ", proposals: [] }
        : { reply: resolved.reply, proposals: resolved.proposals };

    // Build the turn-level error for persistence.
    const turnError: OrchestratedCoachTurnResult["turnError"] = decisionFailed
      ? { reason: "decision_failed" }
      : replyBlocked
        ? { reason: "reply_blocked" }
        : undefined;

    // Separate the two drop categories:
    //  - idResolutionDropCount: ids selected by decision-maker that were unknown or duplicate
    //    in the candidate map (from resolved.parseErrors, produced by ActionResolverService).
    //  - droppedByAllowlist: proposals that DID resolve from the candidate map but were then
    //    filtered by the union allowlist (defense-in-depth). Computed as the difference between
    //    the number of resolved proposals and the final after-allowlist count.
    // These were previously conflated as a single droppedByAllowlist count.
    const idResolutionDropCount = resolved.idResolutionDropCount;
    const resolvedProposalCount = resolved.proposals.length;
    // droppedByAllowlist = ids that resolved successfully but were filtered by the allowlist.
    // decisionSelectedIdCount - idResolutionDropCount = count that reached the allowlist step.
    const decisionSelectedIdCount = decisionResult.output.selectedProposalIds.length;
    const droppedByAllowlist = Math.max(
      0,
      decisionSelectedIdCount - idResolutionDropCount - resolvedProposalCount,
    );
    const finalProposalCount = finalOutput.proposals.length;

    // Structured log: resolution stage done (counts/flags only — no text/health content).
    this.logger.log({
      stage: "resolution_done",
      resolvedProposalCount,
      droppedByAllowlist,
      idResolutionDropCount,
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

    // Surface resolver diagnostics: unknown/duplicate ids are a dead output channel
    // if not appended here. Append them to parseErrors so callers (ChatService) see them.
    if (resolved.parseErrors.length > 0) {
      parseErrors.push(...resolved.parseErrors.map((e) => `Resolver: ${e}`));
    }

    const safetyStatus = replyBlocked
      ? ("reply_blocked" as const)
      : decisionFailed
        ? ("provider_error" as const)
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
      deepReviewApplied: deepReview !== undefined,
      resolvedProposalCount,
      droppedByAllowlist,
      idResolutionDropCount,
      replyBlocked,
      finalProposalCount,
      contextLatencyMs,
      domainsLatencyMs,
      totalLatencyMs,
    });

    // ---------------------------------------------------------------------------
    // Slice D: per-turn telemetry — one structured log per eligible turn.
    // Safety floor: no user message text, no reply text, no health data.
    // Counts, enums, durations, and token numbers only.
    // ---------------------------------------------------------------------------
    // Null-safe turn token aggregation from the same per-stage usage values that
    // feed persisted metadata — no second usage source. Cost is an ESTIMATE from
    // the code-owned price map; absent when no stage reported a priced model.
    const turnUsageTotals = aggregateUsageTotals([
      routerResult?.usage,
      ...domainResults.map(({ result }) => result.usage),
      decisionResult.usage,
    ]);
    const telemetry: AgentTurnTelemetry = {
      event: "ai.turn_summary",
      totalLatencyMs,
      routerLatencyMs,
      contextLatencyMs,
      decisionLatencyMs,
      domainLatencies: domainResults.map(({ domain, result }) => ({
        domain,
        latencyMs: result.usage?.latencyMs ?? 0,
        ...(result.usage !== undefined ? { totalTokens: result.usage.totalTokens } : {}),
      })),
      totalPromptTokens: turnUsageTotals.promptTokens,
      totalCompletionTokens: turnUsageTotals.completionTokens,
      totalTokens: turnUsageTotals.totalTokens,
      ...(turnUsageTotals.estimatedCostUsd !== undefined
        ? { estimatedCostUsd: turnUsageTotals.estimatedCostUsd }
        : {}),
      selectedDomains: selectedDomains.map((d) => d.domain),
      routerConfidence: routerResult?.output.confidence,
      routerSource: routerResult?.source,
      toolsRequestedPerDomain: domainResults.map(({ domain, result }) => ({
        domain,
        toolsInvoked: result.toolsInvoked,
        toolsDeniedCount: 0,
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
      ...(turnError !== undefined ? { turnError } : {}),
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
   * Aggregate the deep-review progress history ONCE per turn.
   *
   * On review turns the planner injects the progress_history_review slice into
   * the primary route and into every fan-out domain entry — without this, each
   * of up to four buildAgentContext calls would re-run the identical 6-query
   * aggregation with its own `new Date()`. Non-review turns return undefined
   * (and CoachingContextService keeps its lazy compute path for other callers).
   */
  private async precomputeProgressHistorySummary(
    auth: ClerkAuthContext,
    plan: DomainFanoutPlan,
  ): Promise<ProgressHistoryReviewSummary | undefined> {
    const wantsProgressHistory =
      (plan.route.requiredContextSlices ?? []).some(
        (slice) => slice.type === "progress_history_review",
      ) ||
      plan.fanout.selectedDomains.some((entry) =>
        (entry.supplementaryContextSlices ?? []).some(
          (slice) => slice.type === "progress_history_review",
        ),
      );

    if (!wantsProgressHistory) {
      return undefined;
    }

    // Mirrors CoachingContextService's lazy fallback: the planner grant when
    // present, otherwise the plan budget's horizon.
    return this.progressHistoryAggregateService.buildReviewSummaryForAuth(
      auth,
      plan.grantedLookbackDays ?? plan.contextBudget.maxLookbackDays,
    );
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
    progressHistoryLookback: ProgressHistoryLookbackOptions,
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
            // Re-apply per-domain context budget (safety floors are enforced at build
            // time) and thread the planner-injected review slices + lookback grant.
            {
              contextBudget: domainEntry.contextBudget,
              supplementarySliceRequests: domainEntry.supplementaryContextSlices,
              progressHistoryLookback,
            },
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
    attachmentTextMap: ReadonlyMap<string, AttachmentTextExtractionResult>,
    deepReview: DeepReviewPromptContext | undefined,
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
                candidateMap: new Map(),
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
            responseLanguage,
            attachmentTextMap,
            // Phase 4: same deepReview block for every selected domain.
            ...(deepReview !== undefined ? { deepReview } : {}),
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
          candidateMap: new Map(),
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
  /** True when the turn carried a deepReview block (Phase 4). Boolean only — no health data. */
  deepReviewApplied: boolean;
  /** Proposal count after ActionResolver (union-allowlist filtering applied). */
  resolvedProposalCount: number;
  /** Proposals dropped by ActionResolver allowlist (resolved but outside union allowlist). */
  droppedByAllowlist: number;
  /** Proposals dropped because selectedProposalIds were unknown or duplicate in the candidate map. */
  idResolutionDropCount: number;
  /** True when reply safety validation blocked the reply. */
  replyBlocked: boolean;
  /** Final proposal count after reply-block zeroing. */
  finalProposalCount: number;
  /** Context loading latency in ms. */
  contextLatencyMs: number;
  /** Combined domain LLMs latency in ms (parallel wall-clock time). */
  domainsLatencyMs: number;
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
    deepReviewApplied,
    resolvedProposalCount,
    droppedByAllowlist,
    idResolutionDropCount,
    replyBlocked,
    finalProposalCount,
    contextLatencyMs,
    domainsLatencyMs,
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
          ...(routerResult.usage !== undefined ? { usage: routerResult.usage } : {}),
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
      toolsDeniedCount: 0,
      hasWorkoutCalorieEstimate: result.domainAnswer.workoutCalorieEstimate !== undefined,
      ...(result.usage !== undefined ? { usage: result.usage } : {}),
    })),
    decision: {
      degraded: decisionResult.degraded,
      selectedAction: decisionResult.output.selectedAction ?? null,
      selectedProposalIdCount: decisionResult.output.selectedProposalIds.length,
      consentRequired: decisionResult.output.consentRequired,
      ...(plan.fanout.lowConfidenceRoute === true
        ? { lowConfidenceRoute: true as const }
        : {}),
      // Phase 4: boolean-only deep-review marker (mirrors lowConfidenceRoute surfacing).
      ...(deepReviewApplied ? { deepReview: true as const } : {}),
      ...(decisionResult.usage !== undefined ? { usage: decisionResult.usage } : {}),
    },
    resolution: {
      resolvedProposalCount,
      droppedByAllowlist,
      idResolutionDropCount,
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
  };
}

/**
 * Build the deep-review sufficiency block for this turn (Phase 4).
 *
 * Built ONLY when:
 *  - the planner selected a review budget profile (deep_review / deep_history), AND
 *  - the primary context packet carries the progress_history_review slice
 *    (its numeric-only ProgressHistoryReviewSummary).
 *
 * Field sources (per the Phase 4 spec):
 *  - requestedPeriodDays ← plan.requestedLookbackDays (null when none was asked)
 *  - grantedPeriodDays   ← plan.grantedLookbackDays, falling back to the
 *    summary's own grantedPeriodDays when the plan grant is null (e.g. a review
 *    profile triggered without an explicit lookback phrase)
 *  - dataQuality         ← worst of the summary's per-domain dataSufficiency
 *    values and the compression summary's dataQuality when present
 *
 * Returns undefined on every non-review turn — the suffix stays empty and the
 * static prompt prefixes remain untouched.
 */
function buildDeepReviewPromptContext(
  plan: DomainFanoutPlan,
  contextPacket: AgentContextPacket,
  compressionDataQuality: ContextCompressionQuality | undefined,
): DeepReviewPromptContext | undefined {
  const profile = plan.contextBudget.profile;

  if (profile !== "deep_review" && profile !== "deep_history") {
    return undefined;
  }

  const progressHistory = [contextPacket.slice, ...contextPacket.supplementarySlices]
    .map((slice) => slice.progressHistory)
    .find((summary) => summary !== undefined);

  if (!progressHistory) {
    return undefined;
  }

  return {
    requestedPeriodDays: plan.requestedLookbackDays,
    grantedPeriodDays: plan.grantedLookbackDays ?? progressHistory.grantedPeriodDays,
    dataQuality: deriveDeepReviewDataQuality(
      progressHistory.dataSufficiency,
      compressionDataQuality ?? null,
    ),
  };
}

/**
 * Build the merged id→candidate map across all domain results (Slice 2).
 *
 * Merges each domain's candidateMap into one unified map. The IDs are
 * guaranteed unique by construction (`cand_<domain>_<index>`) — each domain
 * produces distinct key prefixes. The merged map is passed to ActionResolverService
 * to resolve selectedProposalIds into canonical payloads.
 *
 * Degraded domains contribute empty maps (no candidates available).
 */
function buildMergedCandidateMap(
  domainResults: Array<{ domain: DomainFanoutEntry["domain"]; result: DomainLlmExecutorResult }>,
): ReadonlyMap<string, Record<string, unknown>> {
  const merged = new Map<string, Record<string, unknown>>();

  for (const { result } of domainResults) {
    for (const [id, candidate] of result.candidateMap) {
      merged.set(id, candidate);
    }
  }

  return merged;
}

/**
 * Build CandidateProposalSummary[] for the decision-maker request (Slice 2).
 *
 * For each domain result, builds a summary entry per candidate: id + intent + title + reason.
 * The decision-maker picks IDs from this list without needing the full payload.
 * Degraded domains contribute no summaries.
 */
function buildCandidateProposalSummaries(
  domainResults: Array<{ domain: DomainFanoutEntry["domain"]; result: DomainLlmExecutorResult }>,
): CandidateProposalSummary[] {
  const summaries: CandidateProposalSummary[] = [];

  for (const { domain, result } of domainResults) {
    if (result.degraded) {
      continue;
    }

    result.domainAnswer.candidateProposals.forEach((candidate, index) => {
      const id = `cand_${domain}_${index}`;
      const intent = typeof candidate["intent"] === "string" ? candidate["intent"] : "";
      const title = typeof candidate["title"] === "string" ? candidate["title"] : "";
      const reason = typeof candidate["reason"] === "string" ? candidate["reason"] : "";

      // Only include summaries with both title and reason non-empty — this matches
      // candidateProposalSummarySchema which requires both fields as .min(1).
      // A candidate missing either field would fail Zod parse in the decision-maker request;
      // dropping it here is safer than letting it reach the decision-maker truncated or empty.
      if (intent && title && reason) {
        summaries.push({ id, intent, title: title.slice(0, 200), reason: reason.slice(0, 500) });
      }
    });
  }

  return summaries;
}

/**
 * Safely emit a progress event via the optional reporter.
 *
 * Failures are swallowed — a throwing callback must never break the turn.
 * Only structural stage events are emitted here; `turn_accepted` and `final`
 * are emitted by ChatService which holds the full response shape.
 */
function emitProgress(
  onProgress: ProgressReporter | undefined,
  event: Parameters<ProgressReporter>[0],
): void {
  if (!onProgress) {
    return;
  }

  try {
    onProgress(event);
  } catch {
    // Swallow — progress reporting must never affect turn correctness.
  }
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
