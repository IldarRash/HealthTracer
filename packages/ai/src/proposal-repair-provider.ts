import type { ProposalIntent } from "@health/types";
import type { ProviderUsage } from "./coach-ai-provider.js";

/**
 * Request for a single bounded proposal payload repair.
 *
 * The repair stage is payload-only: the envelope (intent, targetDomain, title,
 * reason) is never rewritten — only `proposedChanges` may be corrected, and only
 * as far as the validation errors require.
 */
export interface ProposalRepairRequest {
  intent: ProposalIntent;
  /** The original (invalid) proposal payload. */
  proposedChanges: unknown;
  /** Exact validation error strings produced by the validation stack. */
  validationErrors: readonly string[];
}

export interface ProposalRepairResult {
  /** The corrected payload. The FULL validation stack re-runs on it afterwards. */
  proposedChanges: unknown;
  usage?: ProviderUsage;
}

/**
 * Optional provider for the proposal self-repair retry (one bounded LLM call
 * per invalid proposal). Distinct from `CoachAiProvider` — it is never part of
 * the three-method fan-out surface. Wired via an optional DI token, mirroring
 * `ContextCompressionProvider`: when no provider is configured, the repair
 * service degrades to "no repair" and the honest invalid card persists as-is.
 */
export interface ProposalRepairProvider {
  repairProposal(
    request: ProposalRepairRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProposalRepairResult>;
}
