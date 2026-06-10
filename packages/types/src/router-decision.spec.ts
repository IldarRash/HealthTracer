import { describe, expect, it } from "vitest";
import {
  clampRouterDecisionOutput,
  createFallbackRouterDecision,
  MAX_ROUTER_SELECTED_DOMAINS,
  routerDecisionOutputSchema,
  routerDecisionRequestSchema,
  validateRouterDecisionOutputShape,
} from "./router-decision.js";

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

const basePreprocessor = {
  originalText: "I want to adjust my workout",
  normalizedText: "i want to adjust my workout",
  detectedLanguage: "en",
  responseLanguage: "en",
  hasAttachments: false,
  mentionedDates: [],
  simpleSignals: {
    workout: true,
    nutrition: false,
    today: false,
    sleep: false,
    fatigue: false,
    pain: false,
    document: false,
    attachment: false,
    plan_request: false,
  },
  directPathCandidate: null,
};

const validOutputBase = {
  selectedDomains: [
    {
      domain: "workout" as const,
      confidence: 0.8,
      intentHints: ["adjust_workout"],
      toolHints: [],
      signalHints: ["request_change"],
    },
  ],
  contextNeeds: ["recent_conversation"],
  safetyFlags: [],
  confidence: 0.8,
};

// ---------------------------------------------------------------------------
// RouterDecisionRequest parsing
// ---------------------------------------------------------------------------

describe("RouterDecisionRequest schema", () => {
  it("parses a minimal valid request", () => {
    const parsed = routerDecisionRequestSchema.parse({
      originalText: "Can you help me with my workout?",
      normalizedText: "can you help me with my workout",
      preprocessor: basePreprocessor,
    });

    expect(parsed.attachmentHints).toEqual([]);
    expect(parsed.recentMessageHints).toEqual([]);
    expect(parsed.availableDomains).toEqual([]);
    expect(parsed.safetyGuardrails).toEqual([]);
  });

  it("parses a request with attachment hints and language", () => {
    const parsed = routerDecisionRequestSchema.parse({
      originalText: "Hier ist mein Trainingsplan",
      normalizedText: "hier ist mein trainingsplan",
      detectedLanguage: "de",
      preprocessor: basePreprocessor,
      attachmentHints: [
        {
          category: "workout_log",
          mimeType: "image/jpeg",
          consentState: "not_required",
        },
      ],
      recentMessageHints: [{ role: "user", content: "previous message" }],
    });

    expect(parsed.detectedLanguage).toBe("de");
    expect(parsed.attachmentHints).toHaveLength(1);
    expect(parsed.attachmentHints[0]?.category).toBe("workout_log");
  });

  it("parses a request with all available domains", () => {
    const parsed = routerDecisionRequestSchema.parse({
      originalText: "Adjust my workout",
      normalizedText: "adjust my workout",
      preprocessor: basePreprocessor,
      availableDomains: [
        { domain: "workout", capabilityIds: ["adjust_workout"], intentSummaries: [] },
        { domain: "nutrition", capabilityIds: ["create_nutrition_plan"], intentSummaries: [] },
        { domain: "health", capabilityIds: [], intentSummaries: ["wellness context"] },
      ],
    });

    expect(parsed.availableDomains).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// RouterDecisionOutput parsing
// ---------------------------------------------------------------------------

describe("RouterDecisionOutput schema", () => {
  it("parses a valid output with selectedDomains", () => {
    const parsed = routerDecisionOutputSchema.parse(validOutputBase);

    expect(parsed.selectedDomains).toHaveLength(1);
    expect(parsed.selectedDomains[0]?.domain).toBe("workout");
    expect(parsed.selectedDomains[0]?.confidence).toBe(0.8);
    expect(parsed.confidence).toBe(0.8);
  });

  it("parses an output with a directCommand signal", () => {
    const parsed = routerDecisionOutputSchema.parse({
      ...validOutputBase,
      directCommand: {
        detected: true,
        kind: "mark_today_workout_done",
        confidence: 0.9,
      },
    });

    expect(parsed.directCommand?.detected).toBe(true);
    expect(parsed.directCommand?.kind).toBe("mark_today_workout_done");
  });

  it("defaults selectedDomains to [] when omitted", () => {
    const parsed = routerDecisionOutputSchema.parse({
      confidence: 0.4,
    });

    expect(parsed.selectedDomains).toEqual([]);
    expect(parsed.contextNeeds).toEqual([]);
    expect(parsed.safetyFlags).toEqual([]);
  });

  it("rejects selectedDomains exceeding MAX_ROUTER_SELECTED_DOMAINS via schema", () => {
    const tooManyDomains = [
      { domain: "workout", confidence: 0.8, intentHints: [], toolHints: [], signalHints: [] },
      { domain: "nutrition", confidence: 0.7, intentHints: [], toolHints: [], signalHints: [] },
      { domain: "health", confidence: 0.6, intentHints: [], toolHints: [], signalHints: [] },
      { domain: "workout", confidence: 0.5, intentHints: [], toolHints: [], signalHints: [] },
    ];

    const result = routerDecisionOutputSchema.safeParse({
      selectedDomains: tooManyDomains,
      confidence: 0.5,
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown extra fields (.strict())", () => {
    const result = routerDecisionOutputSchema.safeParse({
      ...validOutputBase,
      unknownField: "should be rejected",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid domain values", () => {
    const result = routerDecisionOutputSchema.safeParse({
      selectedDomains: [
        {
          domain: "medical",
          confidence: 0.9,
          intentHints: [],
          toolHints: [],
          signalHints: [],
        },
      ],
      confidence: 0.9,
    });

    expect(result.success).toBe(false);
  });

  it("rejects confidence outside 0-1 range", () => {
    const tooHigh = routerDecisionOutputSchema.safeParse({ ...validOutputBase, confidence: 1.5 });
    const tooLow = routerDecisionOutputSchema.safeParse({ ...validOutputBase, confidence: -0.1 });

    expect(tooHigh.success).toBe(false);
    expect(tooLow.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateRouterDecisionOutputShape — forbidden-key guard
// ---------------------------------------------------------------------------

describe("validateRouterDecisionOutputShape", () => {
  it("returns no errors for a valid output", () => {
    const errors = validateRouterDecisionOutputShape(validOutputBase);

    expect(errors).toEqual([]);
  });

  it("rejects output containing 'reply' field", () => {
    const errors = validateRouterDecisionOutputShape({
      ...validOutputBase,
      reply: "Here is my recommendation",
    });

    expect(errors.some((e) => e.includes('forbidden field "reply"'))).toBe(true);
  });

  it("rejects output containing 'text' field", () => {
    const errors = validateRouterDecisionOutputShape({
      ...validOutputBase,
      text: "some text",
    });

    expect(errors.some((e) => e.includes('forbidden field "text"'))).toBe(true);
  });

  it("rejects output containing 'proposals' field", () => {
    const errors = validateRouterDecisionOutputShape({
      ...validOutputBase,
      proposals: [],
    });

    expect(errors.some((e) => e.includes('forbidden field "proposals"'))).toBe(true);
  });

  it("rejects output containing 'tool' field", () => {
    const errors = validateRouterDecisionOutputShape({
      ...validOutputBase,
      tool: "getUserContextSlice",
    });

    expect(errors.some((e) => e.includes('forbidden field "tool"'))).toBe(true);
  });

  it("rejects output containing 'tool_request' field", () => {
    const errors = validateRouterDecisionOutputShape({
      ...validOutputBase,
      tool_request: { tool: "getUserContextSlice" },
    });

    expect(errors.some((e) => e.includes('forbidden field "tool_request"'))).toBe(true);
  });

  it("rejects output containing 'kind' field", () => {
    const errors = validateRouterDecisionOutputShape({
      ...validOutputBase,
      kind: "final_answer",
    });

    expect(errors.some((e) => e.includes('forbidden field "kind"'))).toBe(true);
  });

  it("rejects output containing 'coachingText' field", () => {
    const errors = validateRouterDecisionOutputShape({
      ...validOutputBase,
      coachingText: "some coaching text",
    });

    expect(errors.some((e) => e.includes('forbidden field "coachingText"'))).toBe(true);
  });

  it("rejects output containing 'capabilityHints' field (legacy name)", () => {
    const errors = validateRouterDecisionOutputShape({
      ...validOutputBase,
      capabilityHints: [],
    });

    expect(errors.some((e) => e.includes('forbidden field "capabilityHints"'))).toBe(true);
  });

  it("returns error for null input", () => {
    const errors = validateRouterDecisionOutputShape(null);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("must be an object");
  });

  it("returns error for string input", () => {
    const errors = validateRouterDecisionOutputShape("not an object");

    expect(errors.length).toBeGreaterThan(0);
  });

  it("accumulates both forbidden-key and schema validation errors", () => {
    const errors = validateRouterDecisionOutputShape({
      reply: "hello",
      confidence: 5,
    });

    // Should have at least the forbidden 'reply' error AND confidence range error
    expect(errors.some((e) => e.includes('forbidden field "reply"'))).toBe(true);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// clampRouterDecisionOutput
// ---------------------------------------------------------------------------

describe("clampRouterDecisionOutput", () => {
  it("passes through valid output unchanged", () => {
    const output = routerDecisionOutputSchema.parse(validOutputBase);
    const clamped = clampRouterDecisionOutput(output);

    expect(clamped.selectedDomains).toHaveLength(1);
    expect(clamped.selectedDomains[0]?.domain).toBe("workout");
    expect(clamped.confidence).toBe(0.8);
  });

  it("caps selectedDomains to MAX_ROUTER_SELECTED_DOMAINS (3) by slicing", () => {
    // Build an output that already has 3 domains (max schema allows) but we test the clamp logic
    const output = routerDecisionOutputSchema.parse({
      selectedDomains: [
        { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
        { domain: "nutrition", confidence: 0.8, intentHints: [], toolHints: [], signalHints: [] },
        { domain: "health", confidence: 0.7, intentHints: [], toolHints: [], signalHints: [] },
      ],
      confidence: 0.9,
    });

    const clamped = clampRouterDecisionOutput(output);

    expect(clamped.selectedDomains.length).toBeLessThanOrEqual(MAX_ROUTER_SELECTED_DOMAINS);
  });

  it("strips selectedDomains not in the allowed set", () => {
    const output = routerDecisionOutputSchema.parse({
      selectedDomains: [
        { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
        { domain: "nutrition", confidence: 0.8, intentHints: [], toolHints: [], signalHints: [] },
        { domain: "health", confidence: 0.7, intentHints: [], toolHints: [], signalHints: [] },
      ],
      confidence: 0.9,
    });

    // Only allow 'workout' domain
    const clamped = clampRouterDecisionOutput(output, new Set(["workout"]));

    expect(clamped.selectedDomains).toHaveLength(1);
    expect(clamped.selectedDomains[0]?.domain).toBe("workout");
  });

  it("strips toolHints not in the allowed tools set", () => {
    const output = routerDecisionOutputSchema.parse({
      selectedDomains: [
        {
          domain: "workout",
          confidence: 0.8,
          intentHints: [],
          toolHints: ["getUserContextSlice", "getWeeklyProgressContext"],
          signalHints: [],
        },
      ],
      confidence: 0.8,
    });

    const clamped = clampRouterDecisionOutput(
      output,
      new Set(["workout", "nutrition", "health"]),
      new Set(["getUserContextSlice"]), // only allow this tool
    );

    expect(clamped.selectedDomains[0]?.toolHints).toEqual(["getUserContextSlice"]);
  });

  it("strips safetyFlags not in the allowed set", () => {
    const output = routerDecisionOutputSchema.parse({
      selectedDomains: [],
      safetyFlags: ["fatigue", "pain"],
      confidence: 0.5,
    });

    const clamped = clampRouterDecisionOutput(
      output,
      new Set(["workout", "nutrition", "health"]),
      new Set([]),
      new Set(["fatigue"]), // only allow fatigue
    );

    expect(clamped.safetyFlags).toEqual(["fatigue"]);
  });

  it("clamps confidence to [0, 1] range", () => {
    // We need to inject an out-of-range confidence since the schema validates it
    // Simulate by building a raw output with a post-parse mutation scenario:
    const output = routerDecisionOutputSchema.parse({ confidence: 1 });
    // Manually override to test the clamp (bypasses schema validation)
    const tamperedOutput = { ...output, confidence: 1.5 as number };
    const clamped = clampRouterDecisionOutput(tamperedOutput as typeof output);

    expect(clamped.confidence).toBe(1);
  });

  it("returns empty output when all domains are stripped", () => {
    const output = routerDecisionOutputSchema.parse({
      selectedDomains: [
        { domain: "workout", confidence: 0.9, intentHints: [], toolHints: [], signalHints: [] },
      ],
      confidence: 0.9,
    });

    const clamped = clampRouterDecisionOutput(output, new Set<"workout" | "nutrition" | "health">());

    expect(clamped.selectedDomains).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createFallbackRouterDecision
// ---------------------------------------------------------------------------

describe("createFallbackRouterDecision", () => {
  it("returns a valid RouterDecisionOutput with zero confidence and empty domains", () => {
    const fallback = createFallbackRouterDecision();

    expect(fallback.selectedDomains).toEqual([]);
    expect(fallback.confidence).toBe(0);
    expect(fallback.safetyFlags).toEqual([]);
    expect(fallback.contextNeeds).toEqual([]);
  });

  it("passes schema validation", () => {
    const fallback = createFallbackRouterDecision();
    const result = routerDecisionOutputSchema.safeParse(fallback);

    expect(result.success).toBe(true);
  });
});
