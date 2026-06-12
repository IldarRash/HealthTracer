import type {
  CatalogIntentId,
  ContextBudgetPolicy,
  ContextSliceRequest,
  ContextTimeRange,
  IntentRouteResult,
  UserContextSlice,
} from "@health/types";
import {
  clampContextDepth,
  clampContextBudgetPolicy,
  buildDefaultAiBehaviorConfig,
  resolveContextBudgetPolicyForProfile,
  resolveContextBudgetProfilePolicy,
  tryCompileContextBudgetMessagePattern,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";

const CONTEXT_TIME_RANGE_DAYS: Record<ContextTimeRange, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

const ORDERED_TIME_RANGES: readonly ContextTimeRange[] = ["7d", "14d", "30d", "90d", "1y"];

export interface ContextPlanReviewSignals {
  isMonthlyReview: boolean;
  isMultiDomainReview: boolean;
  isProgressReview: boolean;
  hasExtendedLookback: boolean;
}

export interface ContextBudgetPlanMetadata extends ContextPlanReviewSignals {
  contextBudget: ContextBudgetPolicy;
  requiresCompression: boolean;
}

export interface ApplyContextBudgetResult {
  slicePlan: ContextSliceRequest[];
  notes: string[];
}

@Injectable()
export class ContextBudgetPolicyService {
  private readonly extendedLookbackTimeRanges: ReadonlySet<ContextTimeRange>;
  private readonly monthlyReviewMessagePattern: RegExp;
  private readonly multiDomainMessagePattern: RegExp;
  private readonly multiDomainSlicePurposes: ReadonlySet<ContextSliceRequest["type"]>;
  private readonly multiDomainSliceCountThreshold: number;
  private readonly multiDomainCapabilityCountThreshold: number;
  private readonly progressReviewCatalogIntentIds: ReadonlySet<CatalogIntentId>;
  private readonly progressReviewAgentIntents: ReadonlySet<IntentRouteResult["intent"]>;
  private readonly progressReviewSlicePurposes: ReadonlySet<ContextSliceRequest["type"]>;
  private readonly monthlyReviewCatalogIntentIds: ReadonlySet<CatalogIntentId>;
  private readonly monthlyReviewAgentIntents: ReadonlySet<IntentRouteResult["intent"]>;

  constructor(private readonly aiBehaviorConfigService: AiBehaviorConfigService) {
    const triggers = this.aiBehaviorConfigService.getContextBudgets().triggers;
    const defaults = buildDefaultAiBehaviorConfig().contextBudgets.triggers;

    this.extendedLookbackTimeRanges = new Set(triggers.extendedLookbackTimeRanges);
    this.monthlyReviewMessagePattern = compileContextBudgetTriggerPattern(
      triggers.monthlyReviewMessagePattern,
      defaults.monthlyReviewMessagePattern,
    );
    this.multiDomainMessagePattern = compileContextBudgetTriggerPattern(
      triggers.multiDomainMessagePattern,
      defaults.multiDomainMessagePattern,
    );
    this.multiDomainSlicePurposes = new Set(triggers.multiDomainSlicePurposes);
    this.multiDomainSliceCountThreshold = triggers.multiDomainSliceCountThreshold;
    this.multiDomainCapabilityCountThreshold = triggers.multiDomainCapabilityCountThreshold;
    this.progressReviewCatalogIntentIds = new Set(triggers.progressReviewCatalogIntentIds);
    this.progressReviewAgentIntents = new Set(triggers.progressReviewAgentIntents);
    this.progressReviewSlicePurposes = new Set(triggers.progressReviewSlicePurposes);
    this.monthlyReviewCatalogIntentIds = new Set(triggers.monthlyReviewCatalogIntentIds);
    this.monthlyReviewAgentIntents = new Set(triggers.monthlyReviewAgentIntents);
  }

  detectReviewSignals(input: {
    userMessage: string;
    route: IntentRouteResult;
    selectedCapabilities?: readonly CatalogIntentId[];
  }): ContextPlanReviewSignals {
    const slicePlan = input.route.requiredContextSlices;
    const isProgressReview =
      this.progressReviewAgentIntents.has(input.route.intent) ||
      this.progressReviewCatalogIntentIds.has(input.route.catalogIntentId) ||
      slicePlan.some((slice) => this.progressReviewSlicePurposes.has(slice.type));
    const hasExtendedLookback = slicePlan.some(
      (slice) =>
        slice.timeRange != null && this.extendedLookbackTimeRanges.has(slice.timeRange),
    );
    const isMonthlyReview =
      this.monthlyReviewCatalogIntentIds.has(input.route.catalogIntentId) ||
      this.monthlyReviewAgentIntents.has(input.route.intent) ||
      this.monthlyReviewMessagePattern.test(input.userMessage) ||
      (isProgressReview && hasExtendedLookback);
    const multiDomainSliceCount = slicePlan.filter((slice) =>
      this.multiDomainSlicePurposes.has(slice.type),
    ).length;
    const isMultiDomainReview =
      multiDomainSliceCount >= this.multiDomainSliceCountThreshold ||
      this.multiDomainMessagePattern.test(input.userMessage) ||
      (input.selectedCapabilities?.length ?? 0) >= this.multiDomainCapabilityCountThreshold;

    return {
      isMonthlyReview,
      isMultiDomainReview,
      isProgressReview,
      hasExtendedLookback,
    };
  }

  resolveBudgetForTurn(signals: ContextPlanReviewSignals): ContextBudgetPolicy {
    const contextBudgets = this.aiBehaviorConfigService.getContextBudgets();
    const useDeepReview =
      signals.isMonthlyReview ||
      signals.isMultiDomainReview ||
      (signals.isProgressReview && signals.hasExtendedLookback);

    return clampContextBudgetPolicy(
      useDeepReview
        ? resolveContextBudgetProfilePolicy(contextBudgets, "deep_review")
        : resolveContextBudgetProfilePolicy(contextBudgets, "default"),
    );
  }

  buildPlanMetadata(input: {
    userMessage: string;
    route: IntentRouteResult;
    selectedCapabilities?: readonly CatalogIntentId[];
  }): ContextBudgetPlanMetadata {
    const signals = this.detectReviewSignals(input);
    const contextBudget = this.resolveBudgetForTurn(signals);

    return {
      ...signals,
      contextBudget,
      requiresCompression: contextBudget.requiresCompression,
    };
  }

  applyBudgetToSlicePlan(
    slicePlan: readonly ContextSliceRequest[],
    budget: ContextBudgetPolicy,
  ): ApplyContextBudgetResult {
    const notes: string[] = [];
    const maxSlices = Math.min(budget.maxSlices, slicePlan.length);
    const truncatedPlan = slicePlan.slice(0, maxSlices);

    if (truncatedPlan.length < slicePlan.length) {
      notes.push(
        `Context slice plan truncated to ${truncatedPlan.length} slice(s) (budget maxSlices=${budget.maxSlices}).`,
      );
    }

    const enforcedPlan = truncatedPlan.map((slice) => {
      const enforced = this.enforceSliceRequest(slice, budget);
      const sliceNotes = this.describeSliceClamp(slice, enforced, budget);

      for (const note of sliceNotes) {
        if (!notes.includes(note)) {
          notes.push(note);
        }
      }

      return enforced;
    });

    return {
      slicePlan: enforcedPlan,
      notes,
    };
  }

  enforceSliceRequest(
    slice: ContextSliceRequest,
    budget: ContextBudgetPolicy,
  ): ContextSliceRequest {
    const depth = slice.depth
      ? clampContextDepth(slice.depth, budget.maxDepth)
      : undefined;
    const timeRange =
      slice.timeRange != null
        ? clampTimeRangeToLookback(slice.timeRange, budget.maxLookbackDays)
        : undefined;

    return {
      type: slice.type,
      ...(depth ? { depth } : {}),
      ...(timeRange ? { timeRange } : {}),
    };
  }

  applyBudgetToBuiltSlice(slice: UserContextSlice, budget: ContextBudgetPolicy): UserContextSlice {
    let next: UserContextSlice = { ...slice };

    if (!budget.allowSensitiveHealthContext) {
      next = {
        ...next,
        wellbeingSummary: undefined,
        recoveryContext: undefined,
      };
    }

    const rawItemCount = countRawItemsInSlice(next);

    if (rawItemCount <= budget.maxRawItems) {
      return next;
    }

    return truncateSliceRawItems(next, budget.maxRawItems);
  }

  private describeSliceClamp(
    before: ContextSliceRequest,
    after: ContextSliceRequest,
    budget: ContextBudgetPolicy,
  ): string[] {
    const notes: string[] = [];

    if (before.depth && after.depth && before.depth !== after.depth) {
      notes.push(`Slice "${before.type}" depth clamped from ${before.depth} to ${after.depth}.`);
    }

    if (before.timeRange && after.timeRange && before.timeRange !== after.timeRange) {
      notes.push(
        `Slice "${before.type}" lookback clamped from ${before.timeRange} to ${after.timeRange} (maxLookbackDays=${budget.maxLookbackDays}).`,
      );
    }

    return notes;
  }
}

export function clampTimeRangeToLookback(
  timeRange: ContextTimeRange,
  maxLookbackDays: number,
): ContextTimeRange {
  const requestedDays = CONTEXT_TIME_RANGE_DAYS[timeRange];

  if (requestedDays <= maxLookbackDays) {
    return timeRange;
  }

  let best: ContextTimeRange = "7d";

  for (const candidate of ORDERED_TIME_RANGES) {
    if (CONTEXT_TIME_RANGE_DAYS[candidate] <= maxLookbackDays) {
      best = candidate;
    }
  }

  return best;
}

export function resolveContextBudgetProfileForSignals(
  signals: ContextPlanReviewSignals,
): ContextBudgetPolicy["profile"] {
  return signals.isMonthlyReview ||
    signals.isMultiDomainReview ||
    (signals.isProgressReview && signals.hasExtendedLookback)
    ? "deep_review"
    : "default";
}

export function resolveContextBudgetPolicyForSignals(
  signals: ContextPlanReviewSignals,
): ContextBudgetPolicy {
  return resolveContextBudgetPolicyForProfile(resolveContextBudgetProfileForSignals(signals));
}

function countRawItemsInSlice(slice: UserContextSlice): number {
  return (
    (slice.activeGoals?.length ?? 0) +
    (slice.relevantMemories?.length ?? 0) +
    (slice.snapshots?.length ?? 0) +
    (slice.weeklyProgress?.trends?.length ?? 0) +
    (slice.biomarkerContext?.items.length ?? 0)
  );
}

function truncateSliceRawItems(slice: UserContextSlice, maxRawItems: number): UserContextSlice {
  let remaining = maxRawItems;
  const next: UserContextSlice = { ...slice };

  const take = <T>(items: readonly T[] | undefined): T[] | undefined => {
    if (!items?.length) {
      return items ? [...items] : undefined;
    }

    const taken = items.slice(0, Math.max(0, remaining));
    remaining -= taken.length;
    return taken;
  };

  if (next.activeGoals) {
    next.activeGoals = take(next.activeGoals);
  }

  if (next.relevantMemories) {
    next.relevantMemories = take(next.relevantMemories) ?? [];
  }

  if (next.snapshots) {
    next.snapshots = take(next.snapshots) ?? [];
  }

  if (next.weeklyProgress?.trends) {
    next.weeklyProgress = {
      ...next.weeklyProgress,
      trends: take(next.weeklyProgress.trends) ?? [],
    };
  }

  if (next.biomarkerContext?.items) {
    next.biomarkerContext = {
      ...next.biomarkerContext,
      items: take(next.biomarkerContext.items) ?? [],
    };
  }

  return next;
}

function compileContextBudgetTriggerPattern(source: string, fallbackSource: string): RegExp {
  const compiled =
    tryCompileContextBudgetMessagePattern(source) ??
    tryCompileContextBudgetMessagePattern(fallbackSource);

  return compiled ?? /(?!)/;
}
