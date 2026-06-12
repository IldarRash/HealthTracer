/**
 * LLM cost estimation — ESTIMATES ONLY, never a billing source of truth.
 *
 * Code-owned price map for the models this product actually runs (see
 * `env.OPENAI_MODEL*`). Used exclusively for stdout observability (per-stage
 * logs, `ai.turn_summary`, `ai.daily_usage`); unknown models yield NO cost
 * (omitted/null), never a guess.
 *
 * Privacy floor: this module only ever sees token counts and model ids —
 * no prompts, message text, or health data.
 */

/**
 * Minimal structural usage shape accepted by the estimator. Both
 * `ProviderUsage` (packages/ai) and `AgentProviderUsage` (packages/types)
 * satisfy it, so callers never need to convert between the two.
 */
export interface UsageTokenCounts {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Model id used for the call (e.g. "gpt-4o-mini"). Absent on fallback paths. */
  model?: string;
}

/** Estimated USD prices per 1M tokens (input/output). ESTIMATES ONLY. */
const ESTIMATED_USD_PER_1M_TOKENS: Readonly<
  Record<string, { input: number; output: number }>
> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
};

/** Round a USD estimate to 6 decimal places to keep log lines readable. */
function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Estimate the USD cost of one provider call from its token usage.
 * Returns undefined when the usage is absent, the model is unknown, or the
 * model has no entry in the price map — never guesses.
 */
export function estimateUsageCostUsd(
  usage: UsageTokenCounts | undefined,
): number | undefined {
  if (usage?.model === undefined) {
    return undefined;
  }

  const price = ESTIMATED_USD_PER_1M_TOKENS[usage.model];

  if (price === undefined) {
    return undefined;
  }

  return roundUsd(
    (usage.promptTokens * price.input + usage.completionTokens * price.output) /
      1_000_000,
  );
}

/** Aggregated token totals (+ optional cost estimate) across several stage usages. */
export interface UsageTokenTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Sum of per-stage estimates. Absent when NO stage had a priced model. */
  estimatedCostUsd?: number;
}

/**
 * Null-safe aggregation across stage usages (router + domains + decision +
 * repair). Missing usages (degraded/fallback stages) contribute zero; cost is
 * summed only over stages whose model is in the price map.
 */
export function aggregateUsageTotals(
  usages: ReadonlyArray<UsageTokenCounts | undefined>,
): UsageTokenTotals {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let estimatedCostUsd: number | undefined;

  for (const usage of usages) {
    if (usage === undefined) {
      continue;
    }

    promptTokens += usage.promptTokens;
    completionTokens += usage.completionTokens;
    totalTokens += usage.totalTokens;

    const stageCost = estimateUsageCostUsd(usage);

    if (stageCost !== undefined) {
      estimatedCostUsd = (estimatedCostUsd ?? 0) + stageCost;
    }
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    ...(estimatedCostUsd !== undefined
      ? { estimatedCostUsd: roundUsd(estimatedCostUsd) }
      : {}),
  };
}

/**
 * Flat token/model/cost fields for a structured stage log line
 * (`router_done` / `domain_done` / `decision_done`). Null (not omitted) when
 * the stage has no usage so every stage line carries the same keys.
 */
export function toUsageLogFields(usage: UsageTokenCounts | undefined): {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  model: string | null;
  estimatedCostUsd: number | null;
} {
  return {
    promptTokens: usage?.promptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    model: usage?.model ?? null,
    estimatedCostUsd: estimateUsageCostUsd(usage) ?? null,
  };
}
