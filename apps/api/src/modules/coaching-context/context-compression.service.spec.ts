import { describe, expect, it, vi } from "vitest";
import {
  contextCompressionSummarySchema,
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
  DEFAULT_CONTEXT_BUDGET_POLICY,
  type AgentContextPacket,
} from "@health/types";
import {
  buildContextCompressionRequest,
  ContextCompressionService,
  resolveReviewKind,
} from "./context-compression.service.js";
import type { ContextCompressionProvider } from "./context-compression.provider.js";
import { StubContextCompressionProvider } from "./stub-context-compression.provider.js";

function createPacket(overrides: Partial<AgentContextPacket> = {}): AgentContextPacket {
  return {
    purpose: "weekly_review",
    depth: "large",
    timeRange: "30d",
    intent: "review_progress",
    generatedAt: new Date().toISOString(),
    safetyConstraints: ["Do not diagnose medical conditions."],
    supplementarySlices: [],
    missingContextNotes: [],
    sourceRefs: [{ domain: "profile", label: "User profile summary" }],
    slice: {
      purpose: "weekly_review",
      depth: "large",
      timeRange: "30d",
      generatedAt: new Date().toISOString(),
      relevantMemories: [],
      snapshots: [],
      recommendationConstraints: [],
      sourceRefs: [],
      weeklyProgress: {
        weekStart: "2026-05-19",
        weekEnd: "2026-05-25",
        dataStatus: "sufficient",
        userMessage: "Training volume held steady this week.",
        trends: [
          {
            id: "a1000001-0000-4000-8000-000000000001",
            domain: "workout",
            direction: "stable",
            message: "Workout completion stayed consistent.",
          },
        ],
      },
    },
    ...overrides,
  };
}

describe("ContextCompressionService", () => {
  it("skips compression when budget does not require it", async () => {
    const service = new ContextCompressionService();
    const result = await service.compressForTurn({
      packet: createPacket(),
      reviewSignals: {
        isMonthlyReview: false,
        isMultiDomainReview: false,
        isProgressReview: false,
      },
      budget: DEFAULT_CONTEXT_BUDGET_POLICY,
    });

    expect(result.summary).toBeNull();
    expect(result.notes).toEqual([]);
  });

  it("returns a validated typed summary for compression-required turns", async () => {
    const service = new ContextCompressionService();
    const result = await service.compressForTurn({
      packet: createPacket(),
      reviewSignals: {
        isMonthlyReview: true,
        isMultiDomainReview: false,
        isProgressReview: true,
      },
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
    });

    expect(result.summary).not.toBeNull();
    expect(contextCompressionSummarySchema.safeParse(result.summary).success).toBe(true);
    expect(result.summary?.reviewKind).toBe("monthly_review");
    expect(result.summary?.keyFindings.length).toBeGreaterThan(0);
    expect(result.notes.some((note) => note.includes("typed summary"))).toBe(true);
  });

  it("falls back safely when the primary provider throws", async () => {
    const throwingProvider: ContextCompressionProvider = {
      compress: vi.fn().mockRejectedValue(new Error("Provider unavailable")),
    };
    const service = new ContextCompressionService(
      throwingProvider,
      new StubContextCompressionProvider(),
    );

    const result = await service.compressForTurn({
      packet: createPacket(),
      reviewSignals: {
        isMonthlyReview: true,
        isMultiDomainReview: false,
        isProgressReview: true,
      },
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
    });

    expect(result.summary).not.toBeNull();
    expect(contextCompressionSummarySchema.safeParse(result.summary).success).toBe(true);
    expect(result.notes.some((note) => note.includes("failed"))).toBe(true);
  });

  it("returns null summary when primary and fallback providers both fail", async () => {
    const failingProvider: ContextCompressionProvider = {
      compress: vi.fn().mockRejectedValue(new Error("Compression unavailable")),
    };
    const service = new ContextCompressionService(failingProvider, failingProvider);

    const result = await service.compressForTurn({
      packet: createPacket(),
      reviewSignals: {
        isMonthlyReview: true,
        isMultiDomainReview: false,
        isProgressReview: true,
      },
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
    });

    expect(result.summary).toBeNull();
    expect(result.notes.some((note) => note.includes("Unable to produce typed compression summary"))).toBe(
      true,
    );
  });

  it("falls back safely when the provider returns malformed output", async () => {
    const malformedProvider: ContextCompressionProvider = {
      compress: vi.fn().mockResolvedValue({
        reviewKind: "monthly_review",
        keyFindings: [],
        focusAreas: [],
        documentContent: "raw leak",
      }),
    };
    const service = new ContextCompressionService(
      malformedProvider,
      new StubContextCompressionProvider(),
    );

    const result = await service.compressForTurn({
      packet: createPacket(),
      reviewSignals: {
        isMonthlyReview: true,
        isMultiDomainReview: false,
        isProgressReview: true,
      },
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
    });

    expect(result.summary).not.toBeNull();
    expect(result.summary).not.toHaveProperty("documentContent");
    expect(result.notes.some((note) => note.includes("invalid output"))).toBe(true);
  });

  it("does not include raw document fields in stub summaries", async () => {
    const provider = new StubContextCompressionProvider();
    const packet = createPacket({
      sourceRefs: [
        { domain: "document", label: "Blood panel", referenceId: "d1000001-0000-4000-8000-000000000001" },
        { domain: "profile", label: "User profile summary" },
      ],
      slice: {
        ...createPacket().slice,
        documentContext: {
          items: [
            {
              documentId: "d1000001-0000-4000-8000-000000000001",
              summaryId: "s1000001-0000-4000-8000-000000000001",
              documentType: "lab_report",
              title: "Blood panel",
              summarySnippet: "Should never appear in compression output.",
              extractedConstraints: [],
            },
          ],
          generatedAt: new Date().toISOString(),
        },
        ragResults: [
          {
            documentId: "d1000001-0000-4000-8000-000000000001",
            summaryId: "s1000001-0000-4000-8000-000000000001",
            title: "Blood panel",
            snippet: "Should never appear in compression output.",
            provenance: "test",
            consentScope: "medical_review",
          },
        ],
      },
    });

    const summary = await provider.compress({
      packet,
      request: buildContextCompressionRequest({
        packet,
        reviewSignals: {
          isMonthlyReview: true,
          isMultiDomainReview: false,
          isProgressReview: true,
        },
        budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
      }),
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
    });

    expect(summary).not.toHaveProperty("documentContent");
    expect(summary).not.toHaveProperty("rawDocument");
    expect(JSON.stringify(summary)).not.toContain("Should never appear");
    expect(summary.sourceRefs.every((ref) => ref.domain !== "document")).toBe(true);
  });

  it("resolves review kinds from planner signals", () => {
    expect(
      resolveReviewKind({
        isMonthlyReview: true,
        isMultiDomainReview: false,
        isProgressReview: true,
      }),
    ).toBe("monthly_review");

    expect(
      resolveReviewKind({
        isMonthlyReview: false,
        isMultiDomainReview: true,
        isProgressReview: false,
      }),
    ).toBe("multi_domain_review");
  });
});
