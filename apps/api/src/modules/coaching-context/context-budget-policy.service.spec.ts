import { describe, expect, it } from "vitest";
import {
  buildLookbackClampNote,
  DEEP_HISTORY_CONTEXT_BUDGET_POLICY,
  DEFAULT_CONTEXT_BUDGET_POLICY,
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
  type UserContextSlice,
  type UserMemoryItem,
} from "@health/types";
import {
  clampTimeRangeToLookback,
  ContextBudgetPolicyService,
  resolveGrantedLookbackDays,
  shouldInjectProgressHistoryReview,
} from "./context-budget-policy.service.js";
import { normalizeAiBehaviorConfig } from "@health/types";
import { buildDefaultAiBehaviorConfig } from "@health/types";
import { createDefaultAiBehaviorConfigService } from "../ai/test-ai-behavior-fixtures.js";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";

function buildRoute(
  overrides: {
    intent?: "review_progress" | "general" | "longevity_overview";
    catalogIntentId?: "review_progress" | "general" | "longevity_overview";
    requiredContextSlices?: Array<{
      type: "weekly_review" | "workout_adaptation" | "nutrition_adaptation" | "health_context";
      depth?: "small" | "medium" | "large";
      timeRange?: "7d" | "14d" | "30d" | "90d" | "1y";
    }>;
  } = {},
) {
  const slices = overrides.requiredContextSlices ?? [
    { type: "workout_adaptation" as const, depth: "small" as const, timeRange: "7d" as const },
  ];

  return {
    intent: overrides.intent ?? ("general" as const),
    catalogIntentId: overrides.catalogIntentId ?? ("general" as const),
    confidence: 0.9,
    isConfident: true,
    purpose: slices[0]!.type,
    depth: slices[0]!.depth ?? ("small" as const),
    timeRange: slices[0]!.timeRange ?? ("7d" as const),
    routingMethod: "unified_turn_decision" as const,
    requiredContextSlices: slices,
    safetyFlags: [],
    expectedResponseMode: "advice_only" as const,
  };
}

describe("ContextBudgetPolicyService", () => {
  const service = new ContextBudgetPolicyService(createDefaultAiBehaviorConfigService());

  it("uses default budget for routine coaching turns", () => {
    const metadata = service.buildPlanMetadata({
      userMessage: "Can you adapt my workout plan this week?",
      route: buildRoute({
        requiredContextSlices: [
          { type: "workout_adaptation", depth: "medium", timeRange: "14d" },
        ],
      }),
    });

    expect(metadata.contextBudget).toEqual(DEFAULT_CONTEXT_BUDGET_POLICY);
    expect(metadata.isMonthlyReview).toBe(false);
    expect(metadata.isMultiDomainReview).toBe(false);
    expect(metadata.isProgressReview).toBe(false);
    expect(metadata.requiresCompression).toBe(false);
  });

  it("falls back to default trigger patterns when config regex is invalid at service construction", () => {
    const defaults = buildDefaultAiBehaviorConfig();
    const service = new ContextBudgetPolicyService(
      new AiBehaviorConfigService({
        config: normalizeAiBehaviorConfig({
          contextBudgets: {
            triggers: {
              monthlyReviewMessagePattern: "(unclosed",
            },
          },
        } as Parameters<typeof normalizeAiBehaviorConfig>[0]),
        source: "defaults",
        errors: [],
        warnings: [],
      }),
    );

    const monthly = service.buildPlanMetadata({
      userMessage: "Give me a monthly review of my training.",
      route: buildRoute({
        intent: "review_progress",
        catalogIntentId: "review_progress",
        requiredContextSlices: [
          { type: "weekly_review", depth: "large", timeRange: "30d" },
        ],
      }),
    });

    expect(monthly.isMonthlyReview).toBe(true);

    const noMatch = service.buildPlanMetadata({
      userMessage: "totally-custom-review",
      route: buildRoute({
        intent: "general",
        catalogIntentId: "general",
        requiredContextSlices: [{ type: "workout_adaptation", depth: "small", timeRange: "7d" }],
      }),
    });

    expect(noMatch.isMonthlyReview).toBe(false);
    expect(defaults.contextBudgets.triggers.monthlyReviewMessagePattern).not.toBe("(unclosed");
  });

  it("forces document and sensitive-health flags off for malicious config profiles", () => {
    const maliciousService = new ContextBudgetPolicyService(
      new AiBehaviorConfigService({
        config: normalizeAiBehaviorConfig({
          contextBudgets: {
            profiles: {
              default: {
                profile: "default",
                maxSlices: 3,
                maxDepth: "medium",
                maxRawItems: 20,
                maxLookbackDays: 30,
                allowDocuments: true,
                allowSensitiveHealthContext: true,
                requiresCompression: false,
                maxExpansionRounds: 0,
                maxSlicesPerExpansionRound: 2,
              },
              deep_review: {
                profile: "deep_review",
                maxSlices: 5,
                maxDepth: "large",
                maxRawItems: 50,
                maxLookbackDays: 90,
                allowDocuments: true,
                allowSensitiveHealthContext: true,
                requiresCompression: true,
                maxExpansionRounds: 2,
                maxSlicesPerExpansionRound: 3,
              },
            },
          },
        } as Parameters<typeof normalizeAiBehaviorConfig>[0]),
        source: "defaults",
        errors: [],
        warnings: [],
      }),
    );

    const deepReview = maliciousService.buildPlanMetadata({
      userMessage: "Give me a monthly review of my training.",
      route: buildRoute({
        intent: "review_progress",
        catalogIntentId: "review_progress",
        requiredContextSlices: [
          { type: "weekly_review", depth: "large", timeRange: "30d" },
        ],
      }),
    });

    expect(deepReview.contextBudget.allowDocuments).toBe(false);
    expect(deepReview.contextBudget.allowSensitiveHealthContext).toBe(false);

    const { slicePlan } = maliciousService.applyBudgetToSlicePlan(
      [{ type: "health_context", depth: "large", timeRange: "30d" }],
      deepReview.contextBudget,
    );

    // The slice-request contract no longer carries a document flag at all.
    expect(slicePlan[0] && "includeDocuments" in slicePlan[0]).toBe(false);

    const builtSlice = maliciousService.applyBudgetToBuiltSlice(
      {
        purpose: "health_context",
        depth: "large",
        timeRange: "30d",
        generatedAt: new Date().toISOString(),
        wellbeingSummary: { windowDays: 7 } as UserContextSlice["wellbeingSummary"],
        recoveryContext: { band: "insufficient_data" } as UserContextSlice["recoveryContext"],
        relevantMemories: [],
        snapshots: [],
        recommendationConstraints: [],
        sourceRefs: [],
      } as UserContextSlice,
      deepReview.contextBudget,
    );

    expect(builtSlice.wellbeingSummary).toBeUndefined();
    expect(builtSlice.recoveryContext).toBeUndefined();
  });

  it("uses config-driven route signals for deep review without code changes", () => {
    const customService = new ContextBudgetPolicyService(
      new AiBehaviorConfigService({
        config: normalizeAiBehaviorConfig({
          contextBudgets: {
            triggers: {
              monthlyReviewMessagePattern: "^totally-custom-monthly$",
              progressReviewCatalogIntentIds: ["general"],
              progressReviewAgentIntents: ["general"],
              progressReviewSlicePurposes: ["weekly_review"],
              monthlyReviewCatalogIntentIds: ["general"],
              monthlyReviewAgentIntents: ["general"],
            },
          },
        } as Parameters<typeof normalizeAiBehaviorConfig>[0]),
        source: "defaults",
        errors: [],
        warnings: [],
      }),
    );

    const customMonthly = customService.buildPlanMetadata({
      userMessage: "totally-custom-monthly",
      route: buildRoute({
        intent: "general",
        catalogIntentId: "general",
        requiredContextSlices: [{ type: "weekly_review", depth: "small", timeRange: "7d" }],
      }),
    });

    expect(customMonthly.isMonthlyReview).toBe(true);
    expect(customMonthly.contextBudget.profile).toBe("deep_review");

    const defaultMonthly = service.buildPlanMetadata({
      userMessage: "routine check-in please",
      route: buildRoute({
        intent: "general",
        catalogIntentId: "general",
        requiredContextSlices: [{ type: "weekly_review", depth: "small", timeRange: "7d" }],
      }),
    });

    expect(defaultMonthly.isMonthlyReview).toBe(false);
  });

  it("uses deep review budget for monthly and multi-domain signals", () => {
    const monthly = service.buildPlanMetadata({
      userMessage: "Give me a monthly review of my training.",
      route: buildRoute({
        intent: "review_progress",
        catalogIntentId: "review_progress",
        requiredContextSlices: [
          { type: "weekly_review", depth: "large", timeRange: "30d" },
        ],
      }),
    });

    expect(monthly.contextBudget).toEqual(DEEP_REVIEW_CONTEXT_BUDGET_POLICY);
    expect(monthly.isMonthlyReview).toBe(true);
    expect(monthly.isProgressReview).toBe(true);
    expect(monthly.requiresCompression).toBe(true);

    const multiDomain = service.buildPlanMetadata({
      userMessage: "How are my workout and nutrition trends together?",
      route: buildRoute({
        requiredContextSlices: [
          { type: "workout_adaptation", depth: "medium", timeRange: "14d" },
          { type: "nutrition_adaptation", depth: "medium", timeRange: "14d" },
        ],
      }),
    });

    expect(multiDomain.contextBudget.profile).toBe("deep_review");
    expect(multiDomain.isMultiDomainReview).toBe(true);
  });

  it("clamps slice plan depth, lookback, slices, and documents", () => {
    const { slicePlan, notes } = service.applyBudgetToSlicePlan(
      [
        { type: "weekly_review", depth: "large", timeRange: "1y" },
        { type: "nutrition_adaptation", depth: "large", timeRange: "90d" },
        { type: "workout_adaptation", depth: "large", timeRange: "90d" },
        { type: "daily_checkin", depth: "small", timeRange: "7d" },
      ],
      DEFAULT_CONTEXT_BUDGET_POLICY,
    );

    expect(slicePlan).toHaveLength(DEFAULT_CONTEXT_BUDGET_POLICY.maxSlices);
    expect(slicePlan[0]).toMatchObject({
      type: "weekly_review",
      depth: "medium",
      timeRange: "30d",
    });
    expect(notes.some((note) => note.includes("truncated"))).toBe(true);
    expect(notes.some((note) => note.includes("depth clamped"))).toBe(true);
    expect(notes.some((note) => note.includes("lookback clamped"))).toBe(true);
  });

  it("truncates raw items when a built slice exceeds maxRawItems", () => {
    const service = new ContextBudgetPolicyService(createDefaultAiBehaviorConfigService());
    const memories: UserMemoryItem[] = Array.from({ length: 8 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      text: `Memory ${index}`,
      category: "preference",
      source: "user_stated",
      staleAfter: null,
      revokedAt: null,
    }));

    const slice = service.applyBudgetToBuiltSlice(
      {
        purpose: "weekly_review",
        depth: "large",
        timeRange: "30d",
        generatedAt: new Date().toISOString(),
        relevantMemories: memories,
        snapshots: Array.from({ length: 4 }, (_, index) => ({
          id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
          type: "weekly_review" as const,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-07",
          summary: `Snapshot ${index}`,
          generatedAt: new Date().toISOString(),
        })),
        recommendationConstraints: [],
        sourceRefs: [],
      } as UserContextSlice,
      {
        ...DEFAULT_CONTEXT_BUDGET_POLICY,
        maxRawItems: 5,
      },
    );

    const rawItemCount =
      (slice.relevantMemories?.length ?? 0) +
      (slice.snapshots?.length ?? 0) +
      (slice.weeklyProgress?.trends?.length ?? 0);

    expect(rawItemCount).toBeLessThanOrEqual(5);
    expect(slice.relevantMemories?.length).toBe(5);
    expect(slice.snapshots?.length ?? 0).toBe(0);
  });

  it("strips sensitive health fields from built slices by default", () => {
    const slice = service.applyBudgetToBuiltSlice(
      {
        purpose: "health_context",
        depth: "large",
        timeRange: "30d",
        generatedAt: new Date().toISOString(),
        wellbeingSummary: { windowDays: 7 } as UserContextSlice["wellbeingSummary"],
        recoveryContext: { band: "insufficient_data" } as UserContextSlice["recoveryContext"],
        relevantMemories: [],
        snapshots: [],
        recommendationConstraints: [],
        sourceRefs: [],
      } as UserContextSlice,
      DEFAULT_CONTEXT_BUDGET_POLICY,
    );

    expect(slice.wellbeingSummary).toBeUndefined();
    expect(slice.recoveryContext).toBeUndefined();
  });
});

describe("clampTimeRangeToLookback", () => {
  it("maps long ranges down to the budget lookback cap", () => {
    expect(clampTimeRangeToLookback("1y", 30)).toBe("30d");
    expect(clampTimeRangeToLookback("90d", 30)).toBe("30d");
    expect(clampTimeRangeToLookback("7d", 30)).toBe("7d");
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — adaptive budget profiles (deep_history selection + granted lookback)
// ---------------------------------------------------------------------------

describe("ContextBudgetPolicyService — deep_history selection (Phase 2)", () => {
  const service = new ContextBudgetPolicyService(createDefaultAiBehaviorConfigService());

  it("selects deep_history for «проанализируй последние полгода» (review + 180d)", () => {
    const metadata = service.buildPlanMetadata({
      userMessage: "проанализируй последние полгода",
      route: buildRoute(),
      preprocessor: { requestedLookbackDays: 180, reviewRequest: true },
    });

    expect(metadata.contextBudget.profile).toBe("deep_history");
    expect(metadata.contextBudget).toEqual(DEEP_HISTORY_CONTEXT_BUDGET_POLICY);
    expect(metadata.requiresCompression).toBe(true);
    expect(metadata.reviewRequest).toBe(true);
    expect(metadata.requestedLookbackDays).toBe(180);
    expect(metadata.grantedLookbackDays).toBe(180);
  });

  it("keeps «как прошёл месяц» on deep_review (monthly behavior unchanged)", () => {
    const metadata = service.buildPlanMetadata({
      userMessage: "как прошёл месяц",
      route: buildRoute(),
      preprocessor: { requestedLookbackDays: 30, reviewRequest: true },
    });

    expect(metadata.contextBudget.profile).toBe("deep_review");
    expect(metadata.contextBudget).toEqual(DEEP_REVIEW_CONTEXT_BUDGET_POLICY);
    expect(metadata.isMonthlyReview).toBe(true);
    expect(metadata.grantedLookbackDays).toBe(30);
  });

  it("keeps plan requests on the default budget («составь план тренировок»)", () => {
    const metadata = service.buildPlanMetadata({
      userMessage: "составь план тренировок",
      route: buildRoute(),
      preprocessor: { requestedLookbackDays: null, reviewRequest: false },
    });

    expect(metadata.contextBudget.profile).toBe("default");
    expect(metadata.requiresCompression).toBe(false);
    expect(metadata.requestedLookbackDays).toBeNull();
    expect(metadata.grantedLookbackDays).toBeNull();
  });

  it("does NOT select deep_history for a long lookback without any review signal", () => {
    const metadata = service.buildPlanMetadata({
      userMessage: "хочу абонемент на 2 года",
      route: buildRoute(),
      preprocessor: { requestedLookbackDays: 730, reviewRequest: false },
    });

    expect(metadata.contextBudget.profile).toBe("default");
  });

  it("clamps an over-ask («за 5 лет») to the deep_history grant and renders the config note", () => {
    const metadata = service.buildPlanMetadata({
      userMessage: "проанализируй мой прогресс за 5 лет",
      route: buildRoute(),
      preprocessor: { requestedLookbackDays: 1825, reviewRequest: true },
    });

    expect(metadata.contextBudget.profile).toBe("deep_history");
    expect(metadata.requestedLookbackDays).toBe(1825);
    expect(metadata.grantedLookbackDays).toBe(
      DEEP_HISTORY_CONTEXT_BUDGET_POLICY.maxLookbackDays,
    );

    const notes = buildDefaultAiBehaviorConfig().contextBudgets.degradationNotes;
    const en = buildLookbackClampNote(
      notes,
      metadata.grantedLookbackDays!,
      metadata.requestedLookbackDays!,
      "en",
    );
    const ru = buildLookbackClampNote(
      notes,
      metadata.grantedLookbackDays!,
      metadata.requestedLookbackDays!,
      "ru",
    );

    expect(en).toBe(
      "Showing the last 24 months of the requested 60 — older data is summarized monthly.",
    );
    expect(ru).toBe(
      "Показаны последние 24 мес. из запрошенных 60 — более старые данные сведены в помесячную сводку.",
    );
  });

  it("treats progress-review routes with a long lookback as deep_history even without review_request", () => {
    const metadata = service.buildPlanMetadata({
      userMessage: "покажи данные за 6 месяцев",
      route: buildRoute({
        intent: "review_progress",
        catalogIntentId: "review_progress",
        requiredContextSlices: [{ type: "weekly_review", depth: "large", timeRange: "90d" }],
      }),
      preprocessor: { requestedLookbackDays: 180, reviewRequest: false },
    });

    expect(metadata.contextBudget.profile).toBe("deep_history");
  });

  it("honors a configured deepHistoryMinLookbackDays threshold boundary", () => {
    const exactlyThreshold = service.buildPlanMetadata({
      userMessage: "итоги за квартал",
      route: buildRoute(),
      preprocessor: { requestedLookbackDays: 91, reviewRequest: true },
    });

    // 91 is NOT greater than the default threshold of 91 → stays deep_review (quarter case).
    expect(exactlyThreshold.contextBudget.profile).toBe("deep_review");

    const aboveThreshold = service.buildPlanMetadata({
      userMessage: "итоги за 4 месяца",
      route: buildRoute(),
      preprocessor: { requestedLookbackDays: 120, reviewRequest: true },
    });

    expect(aboveThreshold.contextBudget.profile).toBe("deep_history");
  });

  it("forces document and sensitive-health floors off for a malicious deep_history profile", () => {
    const maliciousService = new ContextBudgetPolicyService(
      new AiBehaviorConfigService({
        config: normalizeAiBehaviorConfig({
          contextBudgets: {
            profiles: {
              deep_history: {
                profile: "deep_history",
                maxSlices: 6,
                maxDepth: "large",
                maxRawItems: 60,
                maxLookbackDays: 731,
                allowDocuments: true,
                allowSensitiveHealthContext: true,
                requiresCompression: true,
                maxExpansionRounds: 2,
                maxSlicesPerExpansionRound: 3,
              },
            },
          },
        } as Parameters<typeof normalizeAiBehaviorConfig>[0]),
        source: "defaults",
        errors: [],
        warnings: [],
      }),
    );

    const metadata = maliciousService.buildPlanMetadata({
      userMessage: "проанализируй последние полгода",
      route: buildRoute(),
      preprocessor: { requestedLookbackDays: 180, reviewRequest: true },
    });

    expect(metadata.contextBudget.profile).toBe("deep_history");
    expect(metadata.contextBudget.allowDocuments).toBe(false);
    expect(metadata.contextBudget.allowSensitiveHealthContext).toBe(false);
  });
});

describe("resolveGrantedLookbackDays", () => {
  it("returns null when nothing was requested", () => {
    expect(resolveGrantedLookbackDays(null, DEEP_HISTORY_CONTEXT_BUDGET_POLICY)).toBeNull();
  });

  it("applies the granularity ladder before the profile cap", () => {
    expect(resolveGrantedLookbackDays(1825, DEEP_HISTORY_CONTEXT_BUDGET_POLICY)).toBe(731);
    expect(resolveGrantedLookbackDays(180, DEEP_HISTORY_CONTEXT_BUDGET_POLICY)).toBe(180);
    expect(resolveGrantedLookbackDays(180, DEEP_REVIEW_CONTEXT_BUDGET_POLICY)).toBe(90);
    expect(resolveGrantedLookbackDays(14, DEFAULT_CONTEXT_BUDGET_POLICY)).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — progress-history bucket budgeting + injection predicate
// ---------------------------------------------------------------------------

function buildProgressHistoryBucket(bucketStart: string) {
  return {
    bucketStart,
    workout: {
      plannedCount: 3,
      completedCount: 2,
      skippedCount: 1,
      adherencePercent: 66.7,
      activeDays: 2,
      avgFatigue: null,
    },
    habits: { adherencePercent: null },
    recovery: {
      wellSupportedDays: 1,
      moderateLoadDays: 2,
      prioritizeRecoveryDays: 0,
      insufficientDataDays: 4,
    },
    wellbeing: { avgMoodScore: null, avgStressScore: null, checkInCount: 0 },
  };
}

function buildProgressHistorySlice(bucketStarts: readonly string[]): UserContextSlice {
  return {
    purpose: "progress_history_review",
    depth: "large",
    timeRange: "90d",
    generatedAt: new Date().toISOString(),
    relevantMemories: [],
    snapshots: [],
    recommendationConstraints: [],
    sourceRefs: [],
    progressHistory: {
      requestedPeriodDays: bucketStarts.length * 7,
      grantedPeriodDays: bucketStarts.length * 7,
      granularity: "weekly",
      buckets: bucketStarts.map(buildProgressHistoryBucket),
      planChangeMarkers: [],
      dataSufficiency: {
        workout: "partial",
        habits: "insufficient",
        recovery: "insufficient",
        wellbeing: "insufficient",
      },
      coveredDays: bucketStarts.length * 7,
      noteCodes: [],
    },
  } as UserContextSlice;
}

describe("ContextBudgetPolicyService — progress-history buckets (Phase 3)", () => {
  const service = new ContextBudgetPolicyService(createDefaultAiBehaviorConfigService());

  it("counts buckets as raw items and keeps the slice intact under the cap", () => {
    const slice = service.applyBudgetToBuiltSlice(
      buildProgressHistorySlice(["2026-05-04", "2026-05-11", "2026-05-18"]),
      { ...DEEP_HISTORY_CONTEXT_BUDGET_POLICY, maxRawItems: 3 },
    );

    expect(slice.progressHistory?.buckets).toHaveLength(3);
  });

  it("drops the OLDEST buckets first when maxRawItems is exceeded", () => {
    const slice = service.applyBudgetToBuiltSlice(
      buildProgressHistorySlice(["2026-04-27", "2026-05-04", "2026-05-11", "2026-05-18"]),
      { ...DEEP_HISTORY_CONTEXT_BUDGET_POLICY, maxRawItems: 2 },
    );

    expect(slice.progressHistory?.buckets.map((bucket) => bucket.bucketStart)).toEqual([
      "2026-05-11",
      "2026-05-18",
    ]);
  });

  it("keeps the numeric progressHistory packet under the sensitive-context floor", () => {
    const base = buildProgressHistorySlice(["2026-05-18"]);
    const slice = service.applyBudgetToBuiltSlice(
      {
        ...base,
        wellbeingSummary: { windowDays: 7 } as UserContextSlice["wellbeingSummary"],
        recoveryContext: { band: "insufficient_data" } as UserContextSlice["recoveryContext"],
      },
      DEEP_HISTORY_CONTEXT_BUDGET_POLICY,
    );

    // Floors strip the free-text-bearing sensitive fields…
    expect(slice.wellbeingSummary).toBeUndefined();
    expect(slice.recoveryContext).toBeUndefined();
    // …while the numbers-only aggregate survives (structurally safe by schema).
    expect(slice.progressHistory?.buckets).toHaveLength(1);
  });
});

describe("shouldInjectProgressHistoryReview", () => {
  const service = new ContextBudgetPolicyService(createDefaultAiBehaviorConfigService());

  it("injects on a deep_history review turn", () => {
    const metadata = service.buildPlanMetadata({
      userMessage: "проанализируй последние полгода",
      route: buildRoute(),
      preprocessor: { requestedLookbackDays: 180, reviewRequest: true },
    });

    expect(shouldInjectProgressHistoryReview(metadata)).toBe(true);
  });

  it("injects on a deep_review progress-review turn", () => {
    const metadata = service.buildPlanMetadata({
      userMessage: "как прошёл месяц",
      route: buildRoute({ intent: "review_progress", catalogIntentId: "review_progress" }),
      preprocessor: { requestedLookbackDays: 30, reviewRequest: true },
    });

    expect(shouldInjectProgressHistoryReview(metadata)).toBe(true);
  });

  it("does NOT inject on a default-profile turn", () => {
    const metadata = service.buildPlanMetadata({
      userMessage: "составь план тренировок",
      route: buildRoute(),
      preprocessor: { requestedLookbackDays: null, reviewRequest: false },
    });

    expect(shouldInjectProgressHistoryReview(metadata)).toBe(false);
  });

  it("does NOT inject on a multi-domain deep_review turn without review signals", () => {
    const metadata = service.buildPlanMetadata({
      userMessage: "помоги с тренировками, питанием и привычками сразу",
      route: buildRoute({
        requiredContextSlices: [
          { type: "workout_adaptation", depth: "medium", timeRange: "14d" },
          { type: "nutrition_adaptation", depth: "medium", timeRange: "14d" },
          { type: "health_context", depth: "large", timeRange: "30d" },
        ],
      }),
      preprocessor: { requestedLookbackDays: null, reviewRequest: false },
    });

    // Multi-domain alone may select deep_review, but it is not review-ish.
    expect(metadata.isMultiDomainReview).toBe(true);
    expect(shouldInjectProgressHistoryReview(metadata)).toBe(false);
  });
});
