import type { ProposalRepairProvider, ProviderUsage } from "@health/ai";
import type { RawAiProposal } from "@health/types";
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { PROPOSAL_REPAIR_PROVIDER } from "./proposal-repair.tokens.js";

/** Hard wall-clock budget for one repair call, including its HTTP retries. */
const PROPOSAL_REPAIR_TIMEOUT_MS = 10_000;

/** Successful repair outcome: the repaired proposal plus the repair call's usage. */
export interface ProposalRepairOutcome {
  proposal: RawAiProposal;
  /** Token + latency usage for the repair LLM call. Absent when the provider reports none. */
  usage?: ProviderUsage;
}

/**
 * Proposal self-repair: one bounded, payload-only LLM call per invalid proposal.
 *
 * The provider is optional (mirrors `ContextCompressionService`): when no
 * OpenAI provider is configured, `isAvailable` is false and `tryRepair`
 * degrades to `null` without any call — the honest invalid card persists as
 * today. Any provider failure or timeout also degrades to `null`; repair never
 * blocks or breaks the turn.
 *
 * The repaired payload replaces ONLY `proposedChanges` — the envelope fields
 * (intent, targetDomain, title, reason, evidenceRefs) always stay from the
 * original proposal. The caller MUST re-run normalization and the FULL
 * validation stack on the returned proposal.
 *
 * Privacy floor: logs carry intent + error name only, never payload contents.
 */
@Injectable()
export class ProposalRepairService {
  private readonly logger = new Logger(ProposalRepairService.name);

  constructor(
    @Optional()
    @Inject(PROPOSAL_REPAIR_PROVIDER)
    private readonly provider?: ProposalRepairProvider,
  ) {}

  /** True when a repair provider is configured. Callers gate attempt telemetry on this. */
  get isAvailable(): boolean {
    return this.provider != null;
  }

  async tryRepair(
    rawProposal: RawAiProposal,
    validationErrors: readonly string[],
  ): Promise<ProposalRepairOutcome | null> {
    if (!this.provider) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, PROPOSAL_REPAIR_TIMEOUT_MS);

    try {
      const result = await this.provider.repairProposal(
        {
          intent: rawProposal.intent,
          proposedChanges: rawProposal.proposedChanges,
          validationErrors,
        },
        { signal: controller.signal },
      );

      if (
        result.proposedChanges === null ||
        typeof result.proposedChanges !== "object" ||
        Array.isArray(result.proposedChanges)
      ) {
        return null;
      }

      // Cast is safe: only the intent-owned payload is replaced, the envelope is
      // preserved, and the caller re-runs the full validation stack before persisting.
      // Usage is threaded through (tokens/model only) for daily usage telemetry.
      return {
        proposal: {
          ...rawProposal,
          proposedChanges: result.proposedChanges,
        } as RawAiProposal,
        ...(result.usage !== undefined ? { usage: result.usage } : {}),
      };
    } catch (error) {
      // Privacy floor: intent + error name only — never payload contents
      // (raw error messages from providers/drivers can embed payload values).
      this.logger.warn("proposal_repair.provider_failed", {
        intent: rawProposal.intent,
        error: error instanceof Error ? error.name : "unknown",
      });

      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
