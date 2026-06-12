import { describe, expect, it } from "vitest";
import {
  createFallbackDomainAnswer,
  domainAnswerSchema,
  domainLlmStepOutputSchema,
  domainLlmStepRequestSchema,
  domainLlmToolRequestSchema,
  validateDomainLlmStepOutputShape,
} from "./domain-llm-step.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseRequest = {
  domain: "workout" as const,
  iteration: 0,
  maxIterations: 3,
  userMessage: "Can you reduce my workout load this week?",
  recentMessages: [],
  coachingContext: {},
  allowedTools: [],
  allowedProposalIntents: ["adapt_workout_plan"],
  safetyFlags: [],
  safetyConstraints: [],
};

// ---------------------------------------------------------------------------
// DomainLlmStepRequest schema
// ---------------------------------------------------------------------------

describe("DomainLlmStepRequest schema", () => {
  it("parses a minimal workout domain request", () => {
    const parsed = domainLlmStepRequestSchema.parse(baseRequest);

    expect(parsed.domain).toBe("workout");
    expect(parsed.iteration).toBe(0);
    expect(parsed.maxIterations).toBe(3);
    expect(parsed.priorToolResults).toEqual([]);
  });

  it("parses a nutrition domain request", () => {
    const parsed = domainLlmStepRequestSchema.parse({
      ...baseRequest,
      domain: "nutrition",
      userMessage: "Suggest a meal plan",
      allowedProposalIntents: ["create_nutrition_plan"],
    });

    expect(parsed.domain).toBe("nutrition");
  });

  it("parses a health domain request with safety flags", () => {
    const parsed = domainLlmStepRequestSchema.parse({
      ...baseRequest,
      domain: "health",
      userMessage: "I feel fatigued and my knee hurts",
      safetyFlags: ["fatigue", "pain"],
      safetyConstraints: ["Do not diagnose or prescribe."],
    });

    expect(parsed.domain).toBe("health");
    expect(parsed.safetyFlags).toEqual(["fatigue", "pain"]);
  });

  it("rejects invalid domain values", () => {
    const result = domainLlmStepRequestSchema.safeParse({
      ...baseRequest,
      domain: "medical",
    });

    expect(result.success).toBe(false);
  });

  it("rejects iteration above maxIterations bound", () => {
    const result = domainLlmStepRequestSchema.safeParse({
      ...baseRequest,
      iteration: 15,
    });

    expect(result.success).toBe(false);
  });

  it("deepReview is absent by default and round-trips when provided (Phase 4)", () => {
    expect(domainLlmStepRequestSchema.parse(baseRequest).deepReview).toBeUndefined();

    const parsed = domainLlmStepRequestSchema.parse({
      ...baseRequest,
      deepReview: {
        requestedPeriodDays: 365,
        grantedPeriodDays: 180,
        dataQuality: "partial",
      },
    });

    expect(parsed.deepReview).toEqual({
      requestedPeriodDays: 365,
      grantedPeriodDays: 180,
      dataQuality: "partial",
    });
  });

  it("accepts the full 6-tool review_progress allowlist (regression: cap matches capability config)", () => {
    const parsed = domainLlmStepRequestSchema.parse({
      ...baseRequest,
      allowedTools: [
        "getWeeklyProgressContext",
        "getUserContextSlice",
        "getRecentAdherence",
        "getActivePlanDetail",
        "searchExerciseCatalog",
        "getProgressHistory",
      ],
    });

    expect(parsed.allowedTools).toHaveLength(6);
  });

  it("rejects a deepReview block carrying free text", () => {
    const result = domainLlmStepRequestSchema.safeParse({
      ...baseRequest,
      deepReview: {
        requestedPeriodDays: 365,
        grantedPeriodDays: 180,
        dataQuality: "partial",
        summaryText: "user felt bad in March",
      },
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DomainLlmToolRequest variant
// ---------------------------------------------------------------------------

describe("domainLlmToolRequestSchema", () => {
  it("parses a valid tool_request", () => {
    const parsed = domainLlmToolRequestSchema.parse({
      kind: "tool_request",
      tool: "getUserContextSlice",
      input: { purpose: "workout_adaptation" },
      rationale: "Need workout context before answering",
    });

    expect(parsed.kind).toBe("tool_request");
    expect(parsed.tool).toBe("getUserContextSlice");
  });

  it("defaults input to {} when omitted", () => {
    const parsed = domainLlmToolRequestSchema.parse({
      kind: "tool_request",
      tool: "getWeeklyProgressContext",
    });

    expect(parsed.input).toEqual({});
  });

  it("rejects unknown extra fields (.strict())", () => {
    const result = domainLlmToolRequestSchema.safeParse({
      kind: "tool_request",
      tool: "getUserContextSlice",
      extraField: "should fail",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid tool name", () => {
    const result = domainLlmToolRequestSchema.safeParse({
      kind: "tool_request",
      tool: "dangerousTool",
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DomainAnswer variant
// ---------------------------------------------------------------------------

describe("domainAnswerSchema", () => {
  it("parses a valid workout domain_answer with calorie estimate", () => {
    const parsed = domainAnswerSchema.parse({
      kind: "domain_answer",
      domain: "workout",
      summary: "Reduced load plan candidate prepared.",
      candidateProposals: [
        {
          intent: "adapt_workout_plan",
          targetDomain: "workout",
          title: "Reduce load",
          reason: "Lighter week.",
          proposedChanges: {},
        },
      ],
      domainSignals: ["workout_plan_present"],
      workoutCalorieEstimate: 280,
    });

    expect(parsed.kind).toBe("domain_answer");
    expect(parsed.domain).toBe("workout");
    expect(parsed.workoutCalorieEstimate).toBe(280);
  });

  it("parses a valid nutrition domain_answer without calorie estimate", () => {
    const parsed = domainAnswerSchema.parse({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Nutrition plan candidate prepared.",
      candidateProposals: [],
      domainSignals: [],
    });

    expect(parsed.domain).toBe("nutrition");
    expect(parsed.workoutCalorieEstimate).toBeUndefined();
  });

  it("accepts absent workoutCalorieEstimate for workout domain", () => {
    const parsed = domainAnswerSchema.parse({
      kind: "domain_answer",
      domain: "workout",
      summary: "Context-only workout output.",
      candidateProposals: [],
      domainSignals: [],
    });

    expect(parsed.workoutCalorieEstimate).toBeUndefined();
  });

  it("defaults summary to empty string when omitted", () => {
    const parsed = domainAnswerSchema.parse({
      kind: "domain_answer",
      domain: "health",
    });

    expect(parsed.summary).toBe("");
    expect(parsed.candidateProposals).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// DomainLlmStepOutput discriminated union + superRefine enforcement
// ---------------------------------------------------------------------------

describe("domainLlmStepOutputSchema discriminated union", () => {
  it("parses a tool_request variant", () => {
    const parsed = domainLlmStepOutputSchema.parse({
      kind: "tool_request",
      tool: "getUserContextSlice",
      input: {},
    });

    expect(parsed.kind).toBe("tool_request");
  });

  it("parses a domain_answer variant for workout domain", () => {
    const parsed = domainLlmStepOutputSchema.parse({
      kind: "domain_answer",
      domain: "workout",
      summary: "Workout context reviewed.",
      candidateProposals: [],
      domainSignals: ["workout_plan_present"],
      workoutCalorieEstimate: 350,
    });

    expect(parsed.kind).toBe("domain_answer");
    if (parsed.kind === "domain_answer") {
      expect(parsed.workoutCalorieEstimate).toBe(350);
    }
  });

  it("parses a domain_answer variant for nutrition domain without calorie estimate", () => {
    const parsed = domainLlmStepOutputSchema.parse({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Nutrition advice.",
      candidateProposals: [],
      domainSignals: [],
    });

    expect(parsed.kind).toBe("domain_answer");
    if (parsed.kind === "domain_answer") {
      expect(parsed.workoutCalorieEstimate).toBeUndefined();
    }
  });

  it("REJECTS workoutCalorieEstimate when domain is nutrition", () => {
    const result = domainLlmStepOutputSchema.safeParse({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Nutrition advice.",
      candidateProposals: [],
      domainSignals: [],
      workoutCalorieEstimate: 300,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("workoutCalorieEstimate"))).toBe(true);
      expect(messages.some((m) => m.includes('"workout"'))).toBe(true);
    }
  });

  it("REJECTS workoutCalorieEstimate when domain is health", () => {
    const result = domainLlmStepOutputSchema.safeParse({
      kind: "domain_answer",
      domain: "health",
      summary: "Health context.",
      candidateProposals: [],
      domainSignals: [],
      workoutCalorieEstimate: 200,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("workoutCalorieEstimate"))).toBe(true);
    }
  });

  it("rejects a domain_answer with an unknown domain", () => {
    const result = domainLlmStepOutputSchema.safeParse({
      kind: "domain_answer",
      domain: "medical",
      summary: "",
      candidateProposals: [],
      domainSignals: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an unknown kind discriminant", () => {
    const result = domainLlmStepOutputSchema.safeParse({
      kind: "unknown_kind",
      tool: "getUserContextSlice",
    });

    expect(result.success).toBe(false);
  });

  // -------------------------------------------------------------------------
  // workoutCaloriePerHourRate source-exclusivity: only workout domain may set it
  // -------------------------------------------------------------------------

  it("REJECTS workoutCaloriePerHourRate on a nutrition domain_answer", () => {
    const result = domainLlmStepOutputSchema.safeParse({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Nutrition advice.",
      candidateProposals: [],
      domainSignals: [],
      workoutCaloriePerHourRate: 350,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("workoutCaloriePerHourRate"))).toBe(true);
      expect(messages.some((m) => m.includes('"workout"'))).toBe(true);
    }
  });

  it("REJECTS workoutCaloriePerHourRate on a health domain_answer", () => {
    const result = domainLlmStepOutputSchema.safeParse({
      kind: "domain_answer",
      domain: "health",
      summary: "Health context.",
      candidateProposals: [],
      domainSignals: [],
      workoutCaloriePerHourRate: 280,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("workoutCaloriePerHourRate"))).toBe(true);
    }
  });

  it("ACCEPTS workoutCaloriePerHourRate on a workout domain_answer", () => {
    const result = domainLlmStepOutputSchema.safeParse({
      kind: "domain_answer",
      domain: "workout",
      summary: "Workout plan reviewed.",
      candidateProposals: [],
      domainSignals: [],
      workoutCaloriePerHourRate: 280,
      workoutCalorieEstimate: 560,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      if (result.data.kind === "domain_answer") {
        expect(result.data.workoutCaloriePerHourRate).toBe(280);
        expect(result.data.workoutCalorieEstimate).toBe(560);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// validateDomainLlmStepOutputShape — forbidden-key guard
// ---------------------------------------------------------------------------

describe("validateDomainLlmStepOutputShape", () => {
  it("returns no errors for a valid tool_request", () => {
    const errors = validateDomainLlmStepOutputShape({
      kind: "tool_request",
      tool: "getUserContextSlice",
      input: {},
    });

    expect(errors).toEqual([]);
  });

  it("returns no errors for a valid workout domain_answer", () => {
    const errors = validateDomainLlmStepOutputShape({
      kind: "domain_answer",
      domain: "workout",
      summary: "Plan reviewed.",
      candidateProposals: [],
      domainSignals: [],
      workoutCalorieEstimate: 280,
    });

    expect(errors).toEqual([]);
  });

  it("rejects output containing 'reply' field", () => {
    const errors = validateDomainLlmStepOutputShape({
      kind: "domain_answer",
      domain: "workout",
      summary: "Plan reviewed.",
      candidateProposals: [],
      domainSignals: [],
      reply: "Here is your workout plan!",
    });

    expect(errors.some((e) => e.includes('forbidden field "reply"'))).toBe(true);
  });

  it("rejects output containing 'text' field", () => {
    const errors = validateDomainLlmStepOutputShape({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "Meal advice.",
      candidateProposals: [],
      domainSignals: [],
      text: "Eat more protein",
    });

    expect(errors.some((e) => e.includes('forbidden field "text"'))).toBe(true);
  });

  it("rejects output containing 'advice' field", () => {
    const errors = validateDomainLlmStepOutputShape({
      kind: "domain_answer",
      domain: "health",
      summary: "",
      candidateProposals: [],
      domainSignals: [],
      advice: "See a doctor",
    });

    expect(errors.some((e) => e.includes('forbidden field "advice"'))).toBe(true);
  });

  it("rejects output containing 'finalAnswer' field", () => {
    const errors = validateDomainLlmStepOutputShape({
      kind: "domain_answer",
      domain: "workout",
      summary: "",
      candidateProposals: [],
      domainSignals: [],
      finalAnswer: "done",
    });

    expect(errors.some((e) => e.includes('forbidden field "finalAnswer"'))).toBe(true);
  });

  it("returns error for null input", () => {
    const errors = validateDomainLlmStepOutputShape(null);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("must be an object");
  });

  it("accumulates forbidden-key AND schema errors", () => {
    // workoutCalorieEstimate on nutrition domain + forbidden reply field
    const errors = validateDomainLlmStepOutputShape({
      kind: "domain_answer",
      domain: "nutrition",
      summary: "",
      candidateProposals: [],
      domainSignals: [],
      workoutCalorieEstimate: 300,
      reply: "bad field",
    });

    expect(errors.some((e) => e.includes('forbidden field "reply"'))).toBe(true);
    expect(errors.some((e) => e.includes("workoutCalorieEstimate"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createFallbackDomainAnswer
// ---------------------------------------------------------------------------

describe("createFallbackDomainAnswer", () => {
  it("creates a valid fallback for workout domain", () => {
    const fallback = createFallbackDomainAnswer("workout");

    expect(fallback.kind).toBe("domain_answer");
    expect(fallback.domain).toBe("workout");
    expect(fallback.summary).toBe("");
    expect(fallback.candidateProposals).toEqual([]);
    expect(fallback.workoutCalorieEstimate).toBeUndefined();
  });

  it("creates a valid fallback for nutrition domain", () => {
    const fallback = createFallbackDomainAnswer("nutrition");

    expect(fallback.domain).toBe("nutrition");
  });

  it("creates a valid fallback for health domain", () => {
    const fallback = createFallbackDomainAnswer("health");

    expect(fallback.domain).toBe("health");
  });

  it("passes schema validation for all domains", () => {
    for (const domain of ["workout", "nutrition", "health"] as const) {
      const fallback = createFallbackDomainAnswer(domain);
      const result = domainLlmStepOutputSchema.safeParse(fallback);

      expect(result.success).toBe(true);
    }
  });
});
