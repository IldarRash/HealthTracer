import { describe, expect, it } from "vitest";
import {
  clampContextBudgetPolicy,
  clampContextDepth,
  CONTEXT_BUDGET_ABSOLUTE_LIMITS,
  DEFAULT_CONTEXT_BUDGET_POLICY,
  DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
  denyContextExpansionRequest,
  evaluateContextExpansionRequest,
  resolveContextBudgetPolicyForProfile,
  safeParseContextBudgetPolicy,
  safeParseContextCompressionSummary,
  tryCompileContextBudgetMessagePattern,
  validateContextBudgetPolicy,
  validateContextCompressionOutputShape,
} from "./context-budget.js";

describe("context budget policy", () => {
  it("exposes conservative default and deep review profiles", () => {
    expect(DEFAULT_CONTEXT_BUDGET_POLICY).toMatchObject({
      profile: "default",
      maxSlices: 3,
      maxDepth: "medium",
      allowDocuments: false,
      requiresCompression: false,
      maxExpansionRounds: 0,
    });

    expect(DEEP_REVIEW_CONTEXT_BUDGET_POLICY).toMatchObject({
      profile: "deep_review",
      maxSlices: 5,
      maxDepth: "large",
      requiresCompression: true,
      maxExpansionRounds: 2,
      allowDocuments: false,
    });
  });

  it("resolves profile presets deterministically", () => {
    expect(resolveContextBudgetPolicyForProfile("default")).toEqual(DEFAULT_CONTEXT_BUDGET_POLICY);
    expect(resolveContextBudgetPolicyForProfile("deep_review")).toEqual(
      DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
    );
  });

  it("validates well-formed budget policies", () => {
    expect(validateContextBudgetPolicy(DEFAULT_CONTEXT_BUDGET_POLICY)).toEqual([]);
    expect(safeParseContextBudgetPolicy(DEFAULT_CONTEXT_BUDGET_POLICY).success).toBe(true);
  });

  it("rejects malformed budget policies", () => {
    const errors = validateContextBudgetPolicy({
      ...DEFAULT_CONTEXT_BUDGET_POLICY,
      maxSlices: 0,
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.includes("maxSlices"))).toBe(true);
  });

  it("clamps budget overrides to absolute limits", () => {
    const clamped = clampContextBudgetPolicy({
      profile: "default",
      maxSlices: 999,
      maxRawItems: 999,
      maxLookbackDays: 999,
      maxExpansionRounds: 999,
      maxSlicesPerExpansionRound: 999,
    });

    expect(clamped.maxSlices).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlices);
    expect(clamped.maxRawItems).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxRawItems);
    expect(clamped.maxLookbackDays).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxLookbackDays);
    expect(clamped.maxExpansionRounds).toBe(CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxExpansionRounds);
    expect(clamped.maxSlicesPerExpansionRound).toBe(
      CONTEXT_BUDGET_ABSOLUTE_LIMITS.maxSlicesPerExpansionRound,
    );
  });

  it("forces document and sensitive-health flags off regardless of input", () => {
    const clamped = clampContextBudgetPolicy({
      profile: "deep_review",
      allowDocuments: true,
      allowSensitiveHealthContext: true,
    });

    expect(clamped.allowDocuments).toBe(false);
    expect(clamped.allowSensitiveHealthContext).toBe(false);
  });

  it("rejects invalid context budget trigger regex at compile time", () => {
    expect(tryCompileContextBudgetMessagePattern("(unclosed")).toBeNull();
    expect(tryCompileContextBudgetMessagePattern("\\bmonthly\\b")).not.toBeNull();
  });

  it("clamps requested depth to policy max depth", () => {
    expect(clampContextDepth("large", "medium")).toBe("medium");
    expect(clampContextDepth("small", "large")).toBe("small");
  });
});

describe("context compression contracts", () => {
  const validSummary = {
    reviewKind: "monthly_review" as const,
    keyFindings: ["Workout adherence improved over the last month."],
    risks: ["Sleep consistency dipped in week three."],
    focusAreas: ["Recovery habits", "Protein consistency"],
    sourceRanges: [
      {
        domain: "workout",
        periodStart: "2026-04-27",
        periodEnd: "2026-05-27",
        slicePurpose: "weekly_review" as const,
      },
    ],
    sourceRefs: [
      {
        domain: "workout",
        label: "Weekly progress summary",
        referenceId: "11111111-1111-4111-8111-111111111111",
      },
    ],
    dataQuality: "partial" as const,
    confidence: "medium" as const,
  };

  it("accepts typed compression summaries with evidence refs", () => {
    expect(validateContextCompressionOutputShape(validSummary)).toEqual([]);

    const parsed = safeParseContextCompressionSummary(validSummary);
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed compression output", () => {
    const errors = validateContextCompressionOutputShape({
      ...validSummary,
      keyFindings: [],
    });

    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects raw document content fields in compression output", () => {
    for (const forbiddenKey of ["documentContent", "rawDocument", "fullText", "extractedText"]) {
      const errors = validateContextCompressionOutputShape({
        ...validSummary,
        [forbiddenKey]: "Full lab report text should never appear here.",
      });

      expect(errors.some((error) => error.includes(forbiddenKey))).toBe(true);
    }
  });
});

describe("context expansion contracts", () => {
  const budget = DEFAULT_CONTEXT_BUDGET_POLICY;

  it("approves in-policy expansion requests", () => {
    const result = evaluateContextExpansionRequest({
      budget: {
        ...budget,
        maxExpansionRounds: 2,
        maxSlicesPerExpansionRound: 2,
      },
      request: {
        roundIndex: 0,
        reason: "Need weekly review context for adaptation.",
        requestedSlices: [
          {
            type: "weekly_review",
            depth: "large",
          },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.decision.decision).toBe("approved");
      expect(result.decision.approvedSlices).toHaveLength(1);
      expect(result.decision.approvedSlices[0]?.depth).toBe("medium");
    }
  });

  it("rejects expansion round overrun", () => {
    const result = evaluateContextExpansionRequest({
      budget: {
        ...budget,
        maxExpansionRounds: 1,
      },
      request: {
        roundIndex: 1,
        reason: "Need more context.",
        requestedSlices: [{ type: "weekly_review" }],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("maxExpansionRounds"))).toBe(true);
    }
  });

  it("rejects slice count overrun per round", () => {
    const result = evaluateContextExpansionRequest({
      budget: {
        ...budget,
        maxExpansionRounds: 2,
        maxSlicesPerExpansionRound: 1,
      },
      request: {
        roundIndex: 0,
        reason: "Need multiple domains.",
        requestedSlices: [
          { type: "weekly_review" },
          { type: "longevity_overview" },
        ],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("maxSlicesPerExpansionRound"))).toBe(true);
    }
  });

  it("rejects document expansion when policy disallows documents", () => {
    const result = evaluateContextExpansionRequest({
      budget: {
        ...budget,
        maxExpansionRounds: 1,
      },
      request: {
        roundIndex: 0,
        reason: "Need medical documents.",
        requestedSlices: [
          {
            type: "health_context",
            includeDocuments: true,
          },
        ],
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("Document expansion"))).toBe(true);
    }
  });

  it("builds explicit denied expansion decisions", () => {
    const request = {
      roundIndex: 0,
      reason: "Need more history.",
      requestedSlices: [{ type: "weekly_review" as const }],
    };

    const denied = denyContextExpansionRequest({
      budget: { ...budget, maxExpansionRounds: 1 },
      request,
      denialReason: "Expansion rounds exhausted.",
    });

    expect(denied.decision).toBe("denied");
    expect(denied.denialReason).toBe("Expansion rounds exhausted.");
    expect(denied.approvedSlices).toEqual([]);
  });
});
