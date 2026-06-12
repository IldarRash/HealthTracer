import { describe, it, expect } from "vitest";
import {
  MAX_CHAT_USER_MESSAGE_CHARS,
  ROUTER_TEXT_MAX_CHARS,
  truncateForRouter,
} from "./message-limits.js";
import {
  sendChatMessageSchema,
} from "./index.js";
import { domainLlmStepRequestSchema } from "./domain-llm-step.js";
import { finalDecisionRequestSchema } from "./final-decision.js";
import { routerDecisionRequestSchema } from "./router-decision.js";

// ---------------------------------------------------------------------------
// Constant sanity checks
// ---------------------------------------------------------------------------

describe("message-limits constants", () => {
  it("MAX_CHAT_USER_MESSAGE_CHARS is 20 000", () => {
    expect(MAX_CHAT_USER_MESSAGE_CHARS).toBe(20_000);
  });

  it("ROUTER_TEXT_MAX_CHARS is 4 000", () => {
    expect(ROUTER_TEXT_MAX_CHARS).toBe(4_000);
  });
});

// ---------------------------------------------------------------------------
// truncateForRouter
// ---------------------------------------------------------------------------

describe("truncateForRouter", () => {
  it("returns short text unchanged", () => {
    const short = "Составь мне план тренировок";
    expect(truncateForRouter(short)).toBe(short);
  });

  it("truncates text that exceeds ROUTER_TEXT_MAX_CHARS to exactly 4000 chars", () => {
    const long = "a".repeat(10_000);
    const result = truncateForRouter(long);
    expect(result.length).toBe(ROUTER_TEXT_MAX_CHARS);
  });

  it("preserves the head (first chars) of the original text", () => {
    const prefix = "Save this workout program: ";
    const body = "x".repeat(10_000);
    const result = truncateForRouter(prefix + body);
    expect(result.startsWith(prefix)).toBe(true);
  });

  it("returns text of exactly ROUTER_TEXT_MAX_CHARS unchanged", () => {
    const exact = "b".repeat(ROUTER_TEXT_MAX_CHARS);
    expect(truncateForRouter(exact)).toBe(exact);
    expect(truncateForRouter(exact).length).toBe(ROUTER_TEXT_MAX_CHARS);
  });

  it("returns empty string for empty input", () => {
    expect(truncateForRouter("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// sendChatMessageSchema — content cap raised to 20 000
// ---------------------------------------------------------------------------

describe("sendChatMessageSchema content length", () => {
  it("accepts a message of exactly 20 000 chars", () => {
    const result = sendChatMessageSchema.safeParse({ content: "x".repeat(20_000) });
    expect(result.success).toBe(true);
  });

  it("rejects a message of 20 001 chars", () => {
    const result = sendChatMessageSchema.safeParse({ content: "x".repeat(20_001) });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// domainLlmStepRequestSchema — userMessage cap raised to 20 000
// ---------------------------------------------------------------------------

describe("domainLlmStepRequestSchema userMessage length", () => {
  const BASE_VALID = {
    domain: "workout" as const,
    iteration: 0,
    maxIterations: 3,
    priorToolResults: [],
    userMessage: "x",
    recentMessages: [],
    coachingContext: {},
    allowedTools: [],
    allowedProposalIntents: [],
    safetyFlags: [],
    safetyConstraints: [],
  };

  it("accepts userMessage of exactly 20 000 chars", () => {
    const result = domainLlmStepRequestSchema.safeParse({
      ...BASE_VALID,
      userMessage: "x".repeat(20_000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects userMessage of 20 001 chars", () => {
    const result = domainLlmStepRequestSchema.safeParse({
      ...BASE_VALID,
      userMessage: "x".repeat(20_001),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// finalDecisionRequestSchema — userMessage cap raised to 20 000
// ---------------------------------------------------------------------------

describe("finalDecisionRequestSchema userMessage length", () => {
  const BASE_DECISION = {
    domainOutputs: [],
    candidateProposalSummaries: [],
    actionVariantCatalog: [],
    safetyFlags: [],
    safetyConstraints: [],
  };

  it("accepts userMessage of exactly 20 000 chars", () => {
    const result = finalDecisionRequestSchema.safeParse({
      ...BASE_DECISION,
      userMessage: "x".repeat(20_000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects userMessage of 20 001 chars", () => {
    const result = finalDecisionRequestSchema.safeParse({
      ...BASE_DECISION,
      userMessage: "x".repeat(20_001),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// routerDecisionRequestSchema — originalText/normalizedText still capped at 4000
// ---------------------------------------------------------------------------

describe("routerDecisionRequestSchema text length", () => {
  const BASE_ROUTER = {
    originalText: "x",
    normalizedText: "x",
    preprocessor: {
      originalText: "x",
      normalizedText: "x",
      detectedLanguage: null,
      responseLanguage: null,
      hasAttachments: false,
      mentionedDates: [],
      simpleSignals: {
        workout: false,
        nutrition: false,
        today: false,
        sleep: false,
        fatigue: false,
        pain: false,
        document: false,
        attachment: false,
        plan_request: false,
        review_request: false,
      },
      directPathCandidate: null,
      requestedLookbackDays: null,
    },
    attachmentHints: [],
    recentMessageHints: [],
    availableDomains: [],
    safetyGuardrails: [],
  };

  it("accepts originalText and normalizedText of exactly 4000 chars", () => {
    const result = routerDecisionRequestSchema.safeParse({
      ...BASE_ROUTER,
      originalText: "x".repeat(4_000),
      normalizedText: "x".repeat(4_000),
    });
    expect(result.success).toBe(true);
  });

  it("rejects originalText of 4001 chars (router schema stays at 4000)", () => {
    const result = routerDecisionRequestSchema.safeParse({
      ...BASE_ROUTER,
      originalText: "x".repeat(4_001),
    });
    expect(result.success).toBe(false);
  });
});
