import { describe, expect, it } from "vitest";
import {
  createFallbackFinalDecision,
  finalDecisionOutputSchema,
  finalDecisionRequestSchema,
  validateFinalDecisionOutputShape,
} from "./final-decision.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const baseDomainAnswer = {
  kind: "domain_answer" as const,
  domain: "workout" as const,
  summary: "Reviewed your workout context and drafted a candidate plan.",
  candidateProposals: [
    {
      intent: "adapt_workout_plan",
      targetDomain: "workout",
      title: "Reduce load",
      reason: "Lighter week for recovery.",
      proposedChanges: {},
    },
  ],
  domainSignals: ["workout_plan_present"],
};

const validOutput = {
  reply: "Here is your workout adjustment proposal. Nothing changes until you accept.",
  selectedAction: null,
  selectedProposalIds: [],
  consentRequired: false,
};

// ---------------------------------------------------------------------------
// FinalDecisionRequest schema
// ---------------------------------------------------------------------------

describe("FinalDecisionRequest schema", () => {
  it("parses a minimal valid request", () => {
    const parsed = finalDecisionRequestSchema.parse({
      userMessage: "Reduce my workout load",
    });

    expect(parsed.domainOutputs).toEqual([]);
    expect(parsed.actionVariantCatalog).toEqual([]);
    expect(parsed.safetyFlags).toEqual([]);
    expect(parsed.safetyConstraints).toEqual([]);
  });

  it("parses a request with domain outputs and action catalog", () => {
    const parsed = finalDecisionRequestSchema.parse({
      userMessage: "Reduce my workout load",
      domainOutputs: [baseDomainAnswer],
      actionVariantCatalog: [
        {
          id: "adapt_workout",
          label: "Adapt your current plan",
          description: "Reduce load for this week",
          requiresConsent: false,
        },
      ],
      safetyFlags: ["fatigue"],
    });

    expect(parsed.domainOutputs).toHaveLength(1);
    expect(parsed.domainOutputs[0]?.domain).toBe("workout");
    expect(parsed.actionVariantCatalog[0]?.id).toBe("adapt_workout");
  });

  it("parses a request with health domain requiring consent", () => {
    const parsed = finalDecisionRequestSchema.parse({
      userMessage: "My knee has been hurting",
      domainOutputs: [
        {
          kind: "domain_answer",
          domain: "health",
          summary: "Health context noted.",
          candidateProposals: [],
          domainSignals: [],
        },
      ],
      safetyFlags: ["pain"],
      safetyConstraints: ["Do not diagnose or prescribe treatment."],
    });

    expect(parsed.domainOutputs[0]?.domain).toBe("health");
    expect(parsed.safetyFlags).toContain("pain");
  });

  it("rejects domainOutputs exceeding 3 entries", () => {
    const result = finalDecisionRequestSchema.safeParse({
      userMessage: "multi-domain query",
      domainOutputs: [
        { kind: "domain_answer", domain: "workout", summary: "", candidateProposals: [], domainSignals: [] },
        { kind: "domain_answer", domain: "nutrition", summary: "", candidateProposals: [], domainSignals: [] },
        { kind: "domain_answer", domain: "health", summary: "", candidateProposals: [], domainSignals: [] },
        { kind: "domain_answer", domain: "workout", summary: "", candidateProposals: [], domainSignals: [] },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty userMessage", () => {
    const result = finalDecisionRequestSchema.safeParse({
      userMessage: "",
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FinalDecisionOutput schema
// ---------------------------------------------------------------------------

describe("FinalDecisionOutput schema", () => {
  it("parses a valid output with reply and no selected proposal ids", () => {
    const parsed = finalDecisionOutputSchema.parse(validOutput);

    expect(parsed.reply).toBe(validOutput.reply);
    expect(parsed.selectedAction).toBeNull();
    expect(parsed.selectedProposalIds).toEqual([]);
    expect(parsed.consentRequired).toBe(false);
  });

  it("parses an output with selectedProposalIds and a selected action", () => {
    const parsed = finalDecisionOutputSchema.parse({
      reply: "I drafted a workout adjustment you can review.",
      selectedAction: "adapt_workout",
      selectedProposalIds: ["cand_workout_0", "cand_workout_1"],
      consentRequired: false,
    });

    expect(parsed.selectedAction).toBe("adapt_workout");
    expect(parsed.selectedProposalIds).toHaveLength(2);
    expect(parsed.selectedProposalIds[0]).toBe("cand_workout_0");
  });

  it("consentRequired is present and defaults to false", () => {
    const parsed = finalDecisionOutputSchema.parse({
      reply: "Here is your plan.",
    });

    expect(parsed.consentRequired).toBe(false);
  });

  it("consentRequired can be set to true", () => {
    const parsed = finalDecisionOutputSchema.parse({
      reply: "I found some relevant health context. Do you consent to saving it?",
      consentRequired: true,
    });

    expect(parsed.consentRequired).toBe(true);
  });

  it("selectedAction defaults to null when not provided", () => {
    const parsed = finalDecisionOutputSchema.parse({
      reply: "Here is some general advice.",
    });

    expect(parsed.selectedAction).toBeNull();
  });

  it("rejects an empty reply", () => {
    const result = finalDecisionOutputSchema.safeParse({
      reply: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects selectedProposalIds exceeding 5 entries", () => {
    const result = finalDecisionOutputSchema.safeParse({
      reply: "Too many ids",
      selectedProposalIds: Array.from({ length: 6 }, (_, i) => `cand_workout_${i}`),
    });

    expect(result.success).toBe(false);
  });

  it("rejects reply exceeding 8000 characters", () => {
    const result = finalDecisionOutputSchema.safeParse({
      reply: "x".repeat(8001),
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateFinalDecisionOutputShape — forbidden-key guard
// ---------------------------------------------------------------------------

describe("validateFinalDecisionOutputShape", () => {
  it("returns no errors for a valid output", () => {
    const errors = validateFinalDecisionOutputShape(validOutput);

    expect(errors).toEqual([]);
  });

  it("rejects output containing 'advice' field", () => {
    const errors = validateFinalDecisionOutputShape({
      ...validOutput,
      advice: "You should eat more protein",
    });

    expect(errors.some((e) => e.includes('forbidden field "advice"'))).toBe(true);
  });

  it("rejects output containing 'recommendation' field", () => {
    const errors = validateFinalDecisionOutputShape({
      ...validOutput,
      recommendation: "Train 3x/week",
    });

    expect(errors.some((e) => e.includes('forbidden field "recommendation"'))).toBe(true);
  });

  it("rejects output containing 'coachingText' field", () => {
    const errors = validateFinalDecisionOutputShape({
      ...validOutput,
      coachingText: "some coaching text",
    });

    expect(errors.some((e) => e.includes('forbidden field "coachingText"'))).toBe(true);
  });

  it("rejects output containing 'userMessage' field", () => {
    const errors = validateFinalDecisionOutputShape({
      ...validOutput,
      userMessage: "the user's message",
    });

    expect(errors.some((e) => e.includes('forbidden field "userMessage"'))).toBe(true);
  });

  it("rejects output containing 'tool' field", () => {
    const errors = validateFinalDecisionOutputShape({
      ...validOutput,
      tool: "getUserContextSlice",
    });

    expect(errors.some((e) => e.includes('forbidden field "tool"'))).toBe(true);
  });

  it("rejects output containing 'tool_request' field", () => {
    const errors = validateFinalDecisionOutputShape({
      ...validOutput,
      tool_request: { tool: "getUserContextSlice" },
    });

    expect(errors.some((e) => e.includes('forbidden field "tool_request"'))).toBe(true);
  });

  it("rejects output containing 'kind' field", () => {
    const errors = validateFinalDecisionOutputShape({
      ...validOutput,
      kind: "final_answer",
    });

    expect(errors.some((e) => e.includes('forbidden field "kind"'))).toBe(true);
  });

  it("rejects output containing 'domain' field", () => {
    const errors = validateFinalDecisionOutputShape({
      ...validOutput,
      domain: "workout",
    });

    expect(errors.some((e) => e.includes('forbidden field "domain"'))).toBe(true);
  });

  it("rejects output containing 'summary' field", () => {
    const errors = validateFinalDecisionOutputShape({
      ...validOutput,
      summary: "domain summary",
    });

    expect(errors.some((e) => e.includes('forbidden field "summary"'))).toBe(true);
  });

  it("rejects output containing 'proposals' field (Slice 2: selection-by-ID)", () => {
    const errors = validateFinalDecisionOutputShape({
      ...validOutput,
      proposals: [{ intent: "create_workout_plan", targetDomain: "workout" }],
    });

    expect(errors.some((e) => e.includes('forbidden field "proposals"'))).toBe(true);
  });

  it("returns error for null input", () => {
    const errors = validateFinalDecisionOutputShape(null);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("must be an object");
  });

  it("returns error for non-object input", () => {
    const errors = validateFinalDecisionOutputShape("a string reply");

    expect(errors.length).toBeGreaterThan(0);
  });

  it("accumulates both forbidden-key and schema validation errors", () => {
    const errors = validateFinalDecisionOutputShape({
      reply: "",
      kind: "domain_answer",
    });

    expect(errors.some((e) => e.includes('forbidden field "kind"'))).toBe(true);
    // Empty reply fails schema validation
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// createFallbackFinalDecision
// ---------------------------------------------------------------------------

describe("createFallbackFinalDecision", () => {
  it("returns a valid output with a safe reply", () => {
    const fallback = createFallbackFinalDecision();

    expect(fallback.reply.length).toBeGreaterThan(0);
    expect(fallback.selectedAction).toBeNull();
    expect(fallback.selectedProposalIds).toEqual([]);
    expect(fallback.consentRequired).toBe(false);
  });

  it("passes schema validation", () => {
    const fallback = createFallbackFinalDecision();
    const result = finalDecisionOutputSchema.safeParse(fallback);

    expect(result.success).toBe(true);
  });

  it("does not contain medical or diagnosis language in the fallback reply", () => {
    const fallback = createFallbackFinalDecision();
    const lower = fallback.reply.toLowerCase();

    expect(lower).not.toContain("diagnos");
    expect(lower).not.toContain("treat");
    expect(lower).not.toContain("prescri");
  });
});
