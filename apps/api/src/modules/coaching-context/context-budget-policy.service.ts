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
  clampProgressHistoryLookback,
  buildDefaultAiBehaviorConfig,
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
  /** Preprocessor review_request signal (deterministic; false when absent). */
  reviewRequest: boolean;
  /** Preprocessor-detected lookback ask in days (null when no period phrase matched). */
  requestedLookbackDays: number | null;
}

/** Deterministic preprocessor hints consumed by budget-profile selection. */
export interface ContextBudgetPreprocessorHints {
  requestedLookbackDays: number | null;
  reviewRequest: boolean;
}

export interface ContextBudgetPlanMetadata extends ContextPlanReviewSignals {
  contextBudget: ContextBudgetPolicy;
  requiresCompression: boolean;
  /**
   * Lookback actually granted for this turn: the Phase 1 granularity-ladder
   * clamp of requestedLookbackDays, further capped by the selected profile's
   * maxLookbackDays. Null when no lookback was requested. Phase 3 threads this
   * into the progress_history_review slice request.
   */
  grantedLookbackDays: number | null;
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
  private readonly deepHistoryMinLookbackDays: number;

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
    this.deepHistoryMinLookbackDays = triggers.deepHistoryMinLookbackDays;
  }

  detectReviewSignals(input: {
    userMessage: string;
    route: IntentRouteResult;
    selectedCapabilities?: readonly CatalogIntentId[];
    preprocessor?: ContextBudgetPreprocessorHints;
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
      reviewRequest: input.preprocessor?.reviewRequest ?? false,
      requestedLookbackDays: input.preprocessor?.requestedLookbackDays ?? null,
    };
  }

  /**
   * Deterministic budget-profile selection:
   * 1. review-ish turn (any review signal OR the preprocessor review_request)
   *    with a requested lookback beyond deepHistoryMinLookbackDays → deep_history;
   * 2. otherwise the existing deep_review triggers (monthly / multi-domain /
   *    progress review with extended lookback) → deep_review;
   * 3. everything else → default.
   */
  resolveBudgetForTurn(signals: ContextPlanReviewSignals): ContextBudgetPolicy {
    const contextBudgets = this.aiBehaviorConfigService.getContextBudgets();
    const useDeepReview =
      signals.isMonthlyReview ||
      signals.isMultiDomainReview ||
      (signals.isProgressReview && signals.hasExtendedLookback);
    const isReviewishTurn =
      useDeepReview || signals.isProgressReview || signals.reviewRequest;
    const useDeepHistory =
      isReviewishTurn &&
      signals.requestedLookbackDays !== null &&
      signals.requestedLookbackDays > this.deepHistoryMinLookbackDays;
    const profile = useDeepHistory ? "deep_history" : useDeepReview ? "deep_review" : "default";

    return clampContextBudgetPolicy(resolveContextBudgetProfilePolicy(contextBudgets, profile));
  }

  buildPlanMetadata(input: {
    userMessage: string;
    route: IntentRouteResult;
    selectedCapabilities?: readonly CatalogIntentId[];
    preprocessor?: ContextBudgetPreprocessorHints;
  }): ContextBudgetPlanMetadata {
    const signals = this.detectReviewSignals(input);
    const contextBudget = this.resolveBudgetForTurn(signals);

    return {
      ...signals,
      contextBudget,
      requiresCompression: contextBudget.requiresCompression,
      grantedLookbackDays: resolveGrantedLookbackDays(
        signals.requestedLookbackDays,
        contextBudget,
      ),
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
    const includeDocuments = budget.allowDocuments && slice.includeDocuments === true;

    return {
      type: slice.type,
      ...(depth ? { depth } : {}),
      ...(timeRange ? { timeRange } : {}),
      includeDocuments,
    };
  }

  applyBudgetToBuiltSlice(slice: UserContextSlice, budget: ContextBudgetPolicy): UserContextSlice {
    let next: UserContextSlice = { ...slice };

    if (!budget.allowSensitiveHealthContext) {
      next = {
        ...next,
        wellbeingSummary: undefined,
        recoveryContext: undefined,
        documentContext: undefined,
        ragResults: undefined,
      };
    }

    if (!budget.allowDocuments) {
      next = {
        ...next,
        documentContext: undefined,
        ragResults: undefined,
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

    if (before.includeDocuments === true && after.includeDocuments !== true) {
      notes.push(
        `Slice "${before.type}" document expansion denied by context budget (allowDocuments=false).`,
      );
    }

    return notes;
  }
}

/**
 * Granted lookback = Phase 1 granularity-ladder clamp, further capped by the
 * selected profile's maxLookbackDays. Null when nothing was requested.
 */
export function resolveGrantedLookbackDays(
  requestedLookbackDays: number | null,
  budget: ContextBudgetPolicy,
): number | null {
  if (requestedLookbackDays === null) {
    return null;
  }

  return Math.min(
    clampProgressHistoryLookback(requestedLookbackDays).grantedPeriodDays,
    budget.maxLookbackDays,
  );
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

function countRawItemsInSlice(slice: UserContextSlice): number {
  return (
    (slice.activeGoals?.length ?? 0) +
    (slice.relevantMemories?.length ?? 0) +
    (slice.snapshots?.length ?? 0) +
    (slice.ragResults?.length ?? 0) +
    (slice.weeklyProgress?.trends?.length ?? 0) +
    (slice.documentContext?.items.length ?? 0)
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

  if (next.ragResults) {
    next.ragResults = take(next.ragResults);
  }

  if (next.weeklyProgress?.trends) {
    next.weeklyProgress = {
      ...next.weeklyProgress,
      trends: take(next.weeklyProgress.trends) ?? [],
    };
  }

  if (next.documentContext?.items) {
    next.documentContext = {
      ...next.documentContext,
      items: take(next.documentContext.items) ?? [],
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
