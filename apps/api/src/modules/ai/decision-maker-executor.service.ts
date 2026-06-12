/**
 * DecisionMakerExecutorService
 *
 * Stage 9 of the unified LLM pipeline (see docs/architecture/llm-pipeline.md).
 *
 * Receives the selected domain LLM outputs + the bounded action-variant catalog
 * (from ActionVariantCatalogService), calls provider.generateFinalDecision, and
 * returns a validated FinalDecisionOutput.
 *
 * Safety invariants (must not be weakened):
 *
 *  1. The decision-maker emits TYPED PROPOSALS ONLY. It never writes domain tables.
 *
 *  2. The action-variant catalog is a CODE-OWNED FLOOR passed in from
 *     ActionVariantCatalogService. This service never widens it.
 *
 *  3. The provider output is validated with validateFinalDecisionOutputShape
 *     (forbidden-key guard) + finalDecisionOutputSchema (Zod) before use.
 *     Any validation failure degrades to createFallbackFinalDecision. The
 *     fallback is ALWAYS a safe coaching reply — never an error thrown to the user.
 *
 *  4. The decision-maker MUST NOT fabricate a workout calorie estimate or rate.
 *     `workoutCalorieEstimate` and `workoutCaloriePerHourRate` are sourced exclusively
 *     from the workout domain LLM's `domain_answer`. `AgentOrchestratorService` extracts
 *     them from the fan-out results and passes them to `ActionResolverService`, which
 *     scrubs any calorie fields from this service's output and re-stamps the trusted
 *     values with provenance `workout_llm`. This service does not copy or forward them.
 *
 *  5. There is currently no consent-gated action variant in the catalog.
 *     The `consentRequired` field is an LLM-set boolean forwarded by the decision-maker;
 *     it is surfaced to callers but not re-checked here. The deferred medical special-save
 *     flow (proposal-driven, domain-LLM recognition → consent-gated proposal → accept →
 *     persist health_document) will use a different mechanism when implemented.
 *
 *  6. This service NEVER calls the orchestrator, domain executors, or repositories.
 *     It is a pure synthesis step: domain outputs in, final decision out.
 */

import type { CoachAiProvider, ProviderUsage } from "@health/ai";
import type {
  AgentSafetyFlag,
  CandidateProposalSummary,
  DeepReviewPromptContext,
  DomainAnswer,
  FinalDecisionOutput,
  FinalDecisionRequest,
  ActionVariant,
} from "@health/types";
import {
  createFallbackFinalDecision,
  finalDecisionOutputSchema,
  validateFinalDecisionOutputShape,
} from "@health/types";
import { Injectable, Logger } from "@nestjs/common";

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface DecisionMakerInput {
  /**
   * The raw user message for this turn.
   */
  userMessage: string;

  /**
   * Resolved domain answers from the parallel domain LLM loops.
   * Only domain_answer entries reach the decision-maker — tool_request outputs
   * are resolved inside DomainLlmExecutorService before this stage runs.
   */
  domainOutputs: readonly DomainAnswer[];

  /**
   * The bounded action-variant catalog built by ActionVariantCatalogService.
   * This is the FLOOR: the decision-maker may only pick variants within it.
   * This service does not widen or mutate the catalog.
   */
  actionVariantCatalog: readonly ActionVariant[];

  /**
   * Candidate proposal summaries (id + intent + title + reason) for the
   * decision-maker to select from. Built by the orchestrator from domain results.
   * The decision-maker picks IDs from this list — it never fabricates payloads.
   */
  candidateProposalSummaries: readonly CandidateProposalSummary[];

  /**
   * Safety flags from the router and domain steps, forwarded to the LLM as
   * safety context. The decision-maker must not emit diagnosis or treatment.
   */
  safetyFlags: readonly AgentSafetyFlag[];

  /**
   * Safety constraints (prose rules) from the active context budget.
   */
  safetyConstraints: readonly string[];

  /**
   * The instantiated coach AI provider for this turn.
   */
  provider: CoachAiProvider;
  /**
   * Resolved response language (hint ?? detected). Null/absent = fall back to message detection.
   * Threaded into the final decision request so the decision-maker writes in the correct language.
   */
  responseLanguage?: string | null;
  /**
   * Recent messages from the conversation, capped at 6 / 4000 chars each (Change 2).
   * Gives the decision-maker conversation history context.
   */
  recentMessages?: ReadonlyArray<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  /**
   * True when the system planner took the low-confidence/general fallback route
   * for an LLM-routed turn. Threaded into FinalDecisionRequest so the template
   * can instruct the model to ask a clarifying question rather than guessing.
   * Defaults to false; must not be set for deterministic/revision/explainer routes.
   */
  lowConfidenceRoute?: boolean;
  /**
   * Deep-review sufficiency block (Phase 4). Present only on review-profile
   * turns whose context packet carries the progress_history_review slice.
   * Threaded into FinalDecisionRequest so the decision template's
   * {{deepReviewSuffix}} frames observed vs uncertain and the analyzed range.
   */
  deepReview?: DeepReviewPromptContext;
}

export interface DecisionMakerResult {
  /**
   * The final decision output (validated). Never null — degraded turns return
   * createFallbackFinalDecision().
   */
  output: FinalDecisionOutput;

  /**
   * True when the result is a fallback produced by validation failure or
   * provider error. Callers (orchestrator) should record this for observability.
   */
  degraded: boolean;

  /**
   * Reason(s) for degradation when degraded=true.
   */
  degradedReasons: string[];

  /**
   * When set, the decision-maker failed after one retry and no honest reply is
   * available. The orchestrator threads this into the turn result so ChatService
   * can persist an error marker instead of fake coach text.
   */
  turnError?: { reason: "decision_failed" };

  /**
   * Token + latency usage for the decision-maker LLM call.
   * Absent on fallback paths where the provider was never called successfully.
   */
  usage?: ProviderUsage;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DecisionMakerExecutorService {
  private readonly logger = new Logger(DecisionMakerExecutorService.name);

  /**
   * Run the decision-maker LLM for this turn.
   *
   * Always resolves — never rejects. On first failure (provider error,
   * shape guard, or Zod parse failure), retries once with the same inputs.
   * If the retry also fails, returns a typed degraded outcome with
   * turnError.reason="decision_failed" so the caller can persist an error
   * marker instead of fake coach text.
   */
  async execute(input: DecisionMakerInput): Promise<DecisionMakerResult> {
    // First attempt
    const firstResult = await this.tryExecuteInternal(input);

    if (!firstResult.degraded) {
      return firstResult;
    }

    // First attempt failed — retry once
    this.logger.warn({
      event: "decision_maker.retry",
      firstDegradedReasons: firstResult.degradedReasons,
    });

    const retryResult = await this.tryExecuteInternal(input);

    if (!retryResult.degraded) {
      return retryResult;
    }

    // Both attempts failed — produce typed degraded result with decision_failed marker
    this.logger.warn({
      event: "decision_maker.failed_after_retry",
      firstDegradedReasons: firstResult.degradedReasons,
      retryDegradedReasons: retryResult.degradedReasons,
    });

    return {
      ...this.buildFallbackResult([
        ...firstResult.degradedReasons.map((r) => `attempt1: ${r}`),
        ...retryResult.degradedReasons.map((r) => `attempt2: ${r}`),
      ]),
      turnError: { reason: "decision_failed" },
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Single attempt at running the decision-maker.
   * Always resolves — catches provider errors and validation failures internally.
   * Returns a degraded result (never throws) so the caller can decide whether to retry.
   */
  private async tryExecuteInternal(input: DecisionMakerInput): Promise<DecisionMakerResult> {
    try {
      return await this.executeInternal(input);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown decision-maker error.";

      this.logger.warn(`DecisionMakerExecutorService: attempt degraded — ${message}`);

      return this.buildFallbackResult([`Decision-maker threw unexpectedly: ${message}`]);
    }
  }

  private async executeInternal(input: DecisionMakerInput): Promise<DecisionMakerResult> {
    // Build the typed request object (Zod-validated by finalDecisionRequestSchema in the
    // provider call; we construct the plain object here for readability and let the
    // provider surface validate the round-trip).
    const request: FinalDecisionRequest = {
      userMessage: input.userMessage,
      domainOutputs: [...input.domainOutputs],
      candidateProposalSummaries: [...input.candidateProposalSummaries],
      // ActionVariant satisfies the finalDecisionRequestSchema.actionVariantCatalog
      // element shape; the cast resolves the readonly-array type mismatch.
      actionVariantCatalog: input.actionVariantCatalog as ActionVariant[],
      safetyFlags: [...input.safetyFlags],
      safetyConstraints: [...input.safetyConstraints],
      recentMessages: input.recentMessages != null ? [...input.recentMessages] : [],
      ...(input.responseLanguage != null ? { responseLanguage: input.responseLanguage } : {}),
      lowConfidenceRoute: input.lowConfidenceRoute === true,
      ...(input.deepReview !== undefined ? { deepReview: input.deepReview } : {}),
    };

    let rawOutput: unknown;
    let providerUsage: ProviderUsage | undefined;

    try {
      // Provider returns ProviderCallResult; unwrap the output for validation.
      const result = await input.provider.generateFinalDecision(request);
      rawOutput = result.output;
      providerUsage = result.usage;
    } catch (providerError) {
      const message =
        providerError instanceof Error
          ? providerError.message
          : "Provider threw during generateFinalDecision.";

      this.logger.warn(`DecisionMakerExecutorService: provider error — ${message}`);

      return this.buildFallbackResult([`Provider error: ${message}`]);
    }

    // Shape guard: rejects forbidden fields (mirrors turn-decision/router pattern).
    const shapeErrors = validateFinalDecisionOutputShape(rawOutput);

    if (shapeErrors.length > 0) {
      this.logger.warn(
        `DecisionMakerExecutorService: shape validation failed — ${shapeErrors.join("; ")}`,
      );

      return this.buildFallbackResult(shapeErrors);
    }

    // Zod parse: ensures the output conforms to the finalDecisionOutputSchema.
    const parsed = finalDecisionOutputSchema.safeParse(rawOutput);

    if (!parsed.success) {
      const zodErrors = parsed.error.issues.map((issue) => issue.message);

      this.logger.warn(
        `DecisionMakerExecutorService: Zod parse failed — ${zodErrors.join("; ")}`,
      );

      return this.buildFallbackResult(zodErrors);
    }

    return {
      output: parsed.data,
      degraded: false,
      degradedReasons: [],
      ...(providerUsage !== undefined ? { usage: providerUsage } : {}),
    };
  }

  private buildFallbackResult(reasons: string[]): DecisionMakerResult {
    return {
      output: createFallbackFinalDecision(),
      degraded: true,
      degradedReasons: reasons,
    };
  }
}
