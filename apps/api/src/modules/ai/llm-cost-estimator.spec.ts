import { describe, expect, it } from "vitest";
import {
  aggregateUsageTotals,
  estimateUsageCostUsd,
  toUsageLogFields,
  type UsageTokenCounts,
} from "./llm-cost-estimator.js";

const PRICED_USAGE: UsageTokenCounts = {
  promptTokens: 1_000_000,
  completionTokens: 1_000_000,
  totalTokens: 2_000_000,
  model: "gpt-4o-mini",
};

describe("estimateUsageCostUsd", () => {
  it("derives the estimate from the per-1M price map for a known model", () => {
    // gpt-4o-mini: 0.15 input + 0.6 output per 1M tokens.
    expect(estimateUsageCostUsd(PRICED_USAGE)).toBe(0.75);
  });

  it("rounds small estimates to 6 decimal places", () => {
    expect(
      estimateUsageCostUsd({
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        model: "gpt-4o-mini",
      }),
    ).toBe(0.000027);
  });

  it("returns undefined for an unknown model — never guesses", () => {
    expect(
      estimateUsageCostUsd({
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120,
        model: "some-future-model",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when the model is absent or the usage is missing", () => {
    expect(
      estimateUsageCostUsd({ promptTokens: 100, completionTokens: 20, totalTokens: 120 }),
    ).toBeUndefined();
    expect(estimateUsageCostUsd(undefined)).toBeUndefined();
  });
});

describe("aggregateUsageTotals", () => {
  it("sums tokens null-safely across present and missing stage usages", () => {
    const totals = aggregateUsageTotals([
      { promptTokens: 100, completionTokens: 20, totalTokens: 120, model: "gpt-4o-mini" },
      undefined, // degraded domain — contributes zero
      { promptTokens: 400, completionTokens: 90, totalTokens: 490, model: "unpriced-model" },
    ]);

    expect(totals.promptTokens).toBe(500);
    expect(totals.completionTokens).toBe(110);
    expect(totals.totalTokens).toBe(610);
    // Cost sums only the priced stage: (100 * 0.15 + 20 * 0.6) / 1e6.
    expect(totals.estimatedCostUsd).toBe(0.000027);
  });

  it("omits the cost estimate entirely when no stage had a priced model", () => {
    const totals = aggregateUsageTotals([
      undefined,
      { promptTokens: 10, completionTokens: 5, totalTokens: 15, model: "unpriced-model" },
      { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    ]);

    expect(totals).toEqual({ promptTokens: 20, completionTokens: 10, totalTokens: 30 });
    expect(totals.estimatedCostUsd).toBeUndefined();
  });

  it("returns zero totals for an all-degraded turn", () => {
    expect(aggregateUsageTotals([undefined, undefined])).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });
});

describe("toUsageLogFields", () => {
  it("flattens usage into stage-log fields with a cost estimate for a priced model", () => {
    expect(
      toUsageLogFields({
        promptTokens: 800,
        completionTokens: 150,
        totalTokens: 950,
        model: "gpt-4o-mini",
      }),
    ).toEqual({
      promptTokens: 800,
      completionTokens: 150,
      totalTokens: 950,
      model: "gpt-4o-mini",
      estimatedCostUsd: 0.00021,
    });
  });

  it("fills every field with null for a missing usage so stage lines keep stable keys", () => {
    expect(toUsageLogFields(undefined)).toEqual({
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      model: null,
      estimatedCostUsd: null,
    });
  });
});
