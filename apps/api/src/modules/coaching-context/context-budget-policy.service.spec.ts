import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTEXT_BUDGET_POLICY,
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
  type UserContextSlice,
  type UserMemoryItem,
} from "@health/types";
import {
  clampTimeRangeToLookback,
  ContextBudgetPolicyService,
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
      includeDocuments?: boolean;
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
    includeDocuments: slices[0]!.includeDocuments ?? false,
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
          { type: "weekly_review", depth: "large", timeRange: "30d", includeDocuments: true },
        ],
      }),
    });

    expect(deepReview.contextBudget.allowDocuments).toBe(false);
    expect(deepReview.contextBudget.allowSensitiveHealthContext).toBe(false);

    const { slicePlan } = maliciousService.applyBudgetToSlicePlan(
      [{ type: "health_context", depth: "large", timeRange: "30d", includeDocuments: true }],
      deepReview.contextBudget,
    );

    expect(slicePlan[0]?.includeDocuments).toBe(false);

    const builtSlice = maliciousService.applyBudgetToBuiltSlice(
      {
        purpose: "health_context",
        depth: "large",
        timeRange: "30d",
        generatedAt: new Date().toISOString(),
        documentContext: {
          generatedAt: new Date().toISOString(),
          items: [],
        },
        ragResults: [],
        wellbeingSummary: { windowDays: 7 } as UserContextSlice["wellbeingSummary"],
        recoveryContext: { band: "insufficient_data" } as UserContextSlice["recoveryContext"],
        relevantMemories: [],
        snapshots: [],
        recommendationConstraints: [],
        sourceRefs: [],
      } as UserContextSlice,
      deepReview.contextBudget,
    );

    expect(builtSlice.documentContext).toBeUndefined();
    expect(builtSlice.ragResults).toBeUndefined();
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
        { type: "weekly_review", depth: "large", timeRange: "1y", includeDocuments: true },
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
      includeDocuments: false,
    });
    expect(notes.some((note) => note.includes("truncated"))).toBe(true);
    expect(notes.some((note) => note.includes("document expansion denied"))).toBe(true);
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
      (slice.ragResults?.length ?? 0) +
      (slice.weeklyProgress?.trends?.length ?? 0) +
      (slice.documentContext?.items.length ?? 0);

    expect(rawItemCount).toBeLessThanOrEqual(5);
    expect(slice.relevantMemories?.length).toBe(5);
    expect(slice.snapshots?.length ?? 0).toBe(0);
  });

  it("strips documents and sensitive health fields from built slices by default", () => {
    const slice = service.applyBudgetToBuiltSlice(
      {
        purpose: "health_context",
        depth: "large",
        timeRange: "30d",
        generatedAt: new Date().toISOString(),
        documentContext: {
          generatedAt: new Date().toISOString(),
          items: [],
        },
        ragResults: [],
        wellbeingSummary: { windowDays: 7 } as UserContextSlice["wellbeingSummary"],
        recoveryContext: { band: "insufficient_data" } as UserContextSlice["recoveryContext"],
        relevantMemories: [],
        snapshots: [],
        recommendationConstraints: [],
        sourceRefs: [],
      } as UserContextSlice,
      DEFAULT_CONTEXT_BUDGET_POLICY,
    );

    expect(slice.documentContext).toBeUndefined();
    expect(slice.ragResults).toBeUndefined();
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
