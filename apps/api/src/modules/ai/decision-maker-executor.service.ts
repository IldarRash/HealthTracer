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
   * Always resolves — never rejects. Any provider error, validation failure,
   * or shape guard violation degrades to createFallbackFinalDecision().
   */
  async execute(input: DecisionMakerInput): Promise<DecisionMakerResult> {
    try {
      return await this.executeInternal(input);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown decision-maker error.";

      this.logger.warn(`DecisionMakerExecutorService: degraded to fallback — ${message}`);

      return this.buildFallbackResult([`Decision-maker threw unexpectedly: ${message}`]);
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

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
