import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTEXT_BUDGET_POLICY,
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
} from "@health/types";
import { ContextExpansionPolicyService } from "./context-expansion-policy.service.js";

describe("ContextExpansionPolicyService", () => {
  const service = new ContextExpansionPolicyService();

  it("approves in-policy expansion requests within slice and round limits", () => {
    const result = service.evaluateRequest({
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
      request: {
        roundIndex: 0,
        reason: "Need one more weekly progress slice.",
        requestedSlices: [{ type: "weekly_review", depth: "medium", timeRange: "30d" }],
      },
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.decision.decision).toBe("approved");
      expect(result.decision.approvedSlices).toHaveLength(1);
      expect(result.decision.limits.maxExpansionRounds).toBe(2);
      expect(result.decision.limits.maxSlicesPerRound).toBe(3);
    }
  });

  it("denies document expansion when allowDocuments is false", () => {
    const denied = service.handleExpansionRequestOrDeny({
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
      request: {
        roundIndex: 0,
        reason: "Need attached lab document context.",
        requestedSlices: [
          {
            type: "health_context",
            depth: "large",
            timeRange: "30d",
            includeDocuments: true,
          },
        ],
      },
    });

    expect(denied.decision).toBe("denied");
    expect(denied.denialReason).toContain("Document expansion");
  });

  it("denies expansion immediately when maxExpansionRounds is zero", () => {
    const denied = service.handleExpansionRequestOrDeny({
      budget: DEFAULT_CONTEXT_BUDGET_POLICY,
      request: {
        roundIndex: 0,
        reason: "Need more context.",
        requestedSlices: [{ type: "weekly_review", depth: "medium", timeRange: "14d" }],
      },
    });

    expect(denied.decision).toBe("denied");
    expect(denied.denialReason).toContain("disabled");
    expect(denied.limits.remainingRounds).toBe(0);
  });

  it("rejects overrun round indexes safely", () => {
    const denied = service.handleExpansionRequestOrDeny({
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
      completedRounds: 2,
      request: {
        roundIndex: 2,
        reason: "Need another expansion round.",
        requestedSlices: [{ type: "weekly_review", depth: "medium", timeRange: "30d" }],
      },
    });

    expect(denied.decision).toBe("denied");
    expect(denied.denialReason).toContain("maxExpansionRounds");
  });

  it("rejects requests that exceed maxSlicesPerExpansionRound", () => {
    const denied = service.handleExpansionRequestOrDeny({
      budget: DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
      request: {
        roundIndex: 0,
        reason: "Need many slices at once.",
        requestedSlices: [
          { type: "weekly_review", depth: "medium", timeRange: "30d" },
          { type: "workout_adaptation", depth: "medium", timeRange: "30d" },
          { type: "nutrition_adaptation", depth: "medium", timeRange: "30d" },
          { type: "health_context", depth: "medium", timeRange: "30d" },
        ],
      },
    });

    expect(denied.decision).toBe("denied");
    expect(denied.denialReason).toContain("maxSlicesPerExpansionRound");
  });

  it("exposes remaining expansion rounds in policy snapshots", () => {
    expect(service.createPolicySnapshot(DEEP_REVIEW_CONTEXT_BUDGET_POLICY, 1)).toEqual({
      maxExpansionRounds: 2,
      maxSlicesPerRound: 3,
      remainingRounds: 1,
    });
  });
});
