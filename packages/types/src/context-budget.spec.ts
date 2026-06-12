import { describe, expect, it } from "vitest";
import {
  buildLookbackClampNote,
  clampContextBudgetPolicy,
  clampContextDepth,
  CONTEXT_BUDGET_ABSOLUTE_LIMITS,
  DEEP_HISTORY_CONTEXT_BUDGET_POLICY,
  DEFAULT_CONTEXT_BUDGET_DEGRADATION_NOTES,
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
import { PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS } from "./progress-history.js";

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

    expect(DEEP_HISTORY_CONTEXT_BUDGET_POLICY).toEqual({
      profile: "deep_history",
      maxSlices: 6,
      maxDepth: "large",
      maxRawItems: 60,
      maxLookbackDays: PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS,
      allowDocuments: false,
      allowSensitiveHealthContext: false,
      requiresCompression: true,
      maxExpansionRounds: 2,
      maxSlicesPerExpansionRound: 3,
    });
  });

  it("resolves profile presets deterministically", () => {
    expect(resolveContextBudgetPolicyForProfile("default")).toEqual(DEFAULT_CONTEXT_BUDGET_POLICY);
    expect(resolveContextBudgetPolicyForProfile("deep_review")).toEqual(
      DEEP_REVIEW_CONTEXT_BUDGET_POLICY,
    );
    expect(resolveContextBudgetPolicyForProfile("deep_history")).toEqual(
      DEEP_HISTORY_CONTEXT_BUDGET_POLICY,
    );
  });

  it("forces safety floors off for deep_history regardless of input", () => {
    const clamped = clampContextBudgetPolicy({
      profile: "deep_history",
      allowDocuments: true,
      allowSensitiveHealthContext: true,
    });

    expect(clamped.allowDocuments).toBe(false);
    expect(clamped.allowSensitiveHealthContext).toBe(false);
    expect(clamped.maxLookbackDays).toBe(PROGRESS_HISTORY_MONTHLY_MAX_GRANTED_DAYS);
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

  it("slice requests cannot carry a document flag — includeDocuments is no longer part of the contract", () => {
    // Document expansion is structurally impossible now: the legacy
    // includeDocuments key is stripped by the slice-request schema.
    const result = evaluateContextExpansionRequest({
      budget: {
        ...budget,
        maxExpansionRounds: 1,
      },
      request: {
        roundIndex: 0,
        reason: "Need health context.",
        requestedSlices: [
          {
            type: "health_context",
            includeDocuments: true,
          } as Record<string, unknown> as { type: "health_context" },
        ],
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.decision.approvedSlices.every((slice) => !("includeDocuments" in slice)),
      ).toBe(true);
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

// ---------------------------------------------------------------------------
// Phase 2 — degradation notes (config-sourced clamp copy)
// ---------------------------------------------------------------------------

describe("buildLookbackClampNote", () => {
  const notes = DEFAULT_CONTEXT_BUDGET_DEGRADATION_NOTES;

  it("renders the English template with granted/requested months", () => {
    // 731 granted of 1825 requested (5 years) → 24 of 60 months.
    const note = buildLookbackClampNote(notes, 731, 1825, "en");

    expect(note).toBe(
      "Showing the last 24 months of the requested 60 — older data is summarized monthly.",
    );
  });

  it("renders the Russian template for ru language", () => {
    const note = buildLookbackClampNote(notes, 731, 1825, "ru");

    expect(note).toBe(
      "Показаны последние 24 мес. из запрошенных 60 — более старые данные сведены в помесячную сводку.",
    );
  });

  it("falls back to English for unknown or null languages", () => {
    expect(buildLookbackClampNote(notes, 90, 180, null)).toContain("Showing the last 3 months");
    expect(buildLookbackClampNote(notes, 90, 180, "de")).toContain("of the requested 6");
  });

  it("supports day placeholders from custom config copy", () => {
    const customNotes = {
      lookbackClamped: {
        en: "Granted {{grantedDays}} of {{requestedDays}} days.",
        ru: "Выдано {{grantedDays}} из {{requestedDays}} дней.",
      },
    };

    expect(buildLookbackClampNote(customNotes, 731, 1825, "en")).toBe(
      "Granted 731 of 1825 days.",
    );
    expect(buildLookbackClampNote(customNotes, 731, 1825, "ru")).toBe(
      "Выдано 731 из 1825 дней.",
    );
  });

  it("never renders below one month", () => {
    expect(buildLookbackClampNote(notes, 7, 14, "en")).toContain("last 1 months");
  });
});
