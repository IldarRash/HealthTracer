import type {
  DomainLlmStepOutputInput,
  DomainLlmStepRequest,
  FinalDecisionOutputInput,
  FinalDecisionRequest,
  RouterDecisionOutputInput,
  RouterDecisionRequest,
} from "@health/types";

// ---------------------------------------------------------------------------
// Per-call usage and latency metadata
// ---------------------------------------------------------------------------

export interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Wall-clock time of the provider call in milliseconds (including retries). */
  latencyMs: number;
  /** Number of retries consumed (0 = first attempt succeeded). */
  retries: number;
  /** Model id used for this call (e.g. "gpt-4o-mini"). Absent on fallback/non-LLM paths. */
  model?: string;
}

/**
 * Wraps the domain output from a provider method with optional per-call usage.
 *
 * Callers unwrap `.output` for domain logic and may forward `.usage` to
 * per-stage diagnostics without coupling domain types to telemetry concerns.
 */
export interface ProviderCallResult<T> {
  output: T;
  usage?: ProviderUsage;
}

// ---------------------------------------------------------------------------
// Provider interface — exactly three fan-out methods (no others)
// ---------------------------------------------------------------------------

export interface CoachAiProvider {
  generateRouterDecision(
    request: RouterDecisionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderCallResult<RouterDecisionOutputInput>>;
  generateDomainStep(
    request: DomainLlmStepRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderCallResult<DomainLlmStepOutputInput>>;
  generateFinalDecision(
    request: FinalDecisionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderCallResult<FinalDecisionOutputInput>>;
}
