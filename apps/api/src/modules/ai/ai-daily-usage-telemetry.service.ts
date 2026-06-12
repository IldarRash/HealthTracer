import { Injectable, Logger } from "@nestjs/common";
import { aggregateUsageTotals, type UsageTokenCounts } from "./llm-cost-estimator.js";

/** Running in-process totals for one user-day. */
interface DailyUsageTotals {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Unrounded running estimate; rounded only at log time. */
  estimatedCostUsd: number;
  /** True once at least one turn contributed a priced-model cost estimate. */
  hasEstimatedCost: boolean;
}

/**
 * Entries strictly older than this (vs the current usageDate) are pruned.
 * 48h, not 24h: timezone-local dates can span two calendar days at any instant
 * (UTC+14 vs UTC-12), so a 24h window could reset a still-current user-day.
 */
const PRUNE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Per-user-day AI usage telemetry: one `ai.daily_usage` stdout line per turn
 * with the day's running totals, so a runaway cost regression is visible from
 * the terminal alone.
 *
 * Sources of truth:
 * - `messageCount` is the DB-backed counter from the `chat_ai_usage_daily`
 *   upsert (the row the quota path already writes — no extra query).
 * - Token/cost running totals are IN-PROCESS ONLY (reset on API restart) and
 *   cost is an ESTIMATE from the code-owned price map — developer/owner
 *   observability, never billing.
 *
 * Privacy floor: numbers, dates, and the internal user id only — no message
 * text, prompts, or health data.
 */
@Injectable()
export class AiDailyUsageTelemetryService {
  private readonly logger = new Logger(AiDailyUsageTelemetryService.name);
  private readonly totalsByUserDay = new Map<string, DailyUsageTotals>();

  recordTurn(input: {
    userId: string;
    /** ISO date (YYYY-MM-DD) in the user's timezone — same key as chat_ai_usage_daily. */
    usageDate: string;
    /** Day's running message count from the usage upsert; null when the increment failed. */
    messageCount: number | null;
    /** All stage usages for this turn (router/domains/decision/repair); null-safe. */
    usages: ReadonlyArray<UsageTokenCounts | undefined>;
  }): void {
    this.pruneStaleEntries(input.usageDate);

    const turnTotals = aggregateUsageTotals(input.usages);
    const key = `${input.userId}:${input.usageDate}`;
    const previous = this.totalsByUserDay.get(key);
    const updated: DailyUsageTotals = {
      promptTokens: (previous?.promptTokens ?? 0) + turnTotals.promptTokens,
      completionTokens: (previous?.completionTokens ?? 0) + turnTotals.completionTokens,
      totalTokens: (previous?.totalTokens ?? 0) + turnTotals.totalTokens,
      estimatedCostUsd:
        (previous?.estimatedCostUsd ?? 0) + (turnTotals.estimatedCostUsd ?? 0),
      hasEstimatedCost:
        (previous?.hasEstimatedCost ?? false) || turnTotals.estimatedCostUsd !== undefined,
    };

    this.totalsByUserDay.set(key, updated);

    this.logger.log({
      event: "ai.daily_usage",
      usageDate: input.usageDate,
      userId: input.userId,
      messageCount: input.messageCount,
      promptTokens: updated.promptTokens,
      completionTokens: updated.completionTokens,
      totalTokens: updated.totalTokens,
      estimatedCostUsd: updated.hasEstimatedCost
        ? Math.round(updated.estimatedCostUsd * 1e6) / 1e6
        : null,
    });
  }

  /**
   * Drop user-day entries more than one day older than the current usageDate.
   * Keeps the map bounded without resetting same-day totals for users whose
   * timezone-local date lags by one day.
   */
  private pruneStaleEntries(currentUsageDate: string): void {
    const currentMs = Date.parse(currentUsageDate);

    if (Number.isNaN(currentMs)) {
      return;
    }

    for (const key of this.totalsByUserDay.keys()) {
      const entryDate = key.slice(key.indexOf(":") + 1);
      const entryMs = Date.parse(entryDate);

      if (!Number.isNaN(entryMs) && currentMs - entryMs > PRUNE_AFTER_MS) {
        this.totalsByUserDay.delete(key);
      }
    }
  }
}
