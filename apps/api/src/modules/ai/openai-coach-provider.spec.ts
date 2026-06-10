/**
 * OpenAiCoachProvider unit tests.
 *
 * Covers:
 *  1. Strict structured output: json_schema with strict:true in request body
 *  2. Bounded retries: 429 → retry → success; 5xx exhausts retries → throws;
 *     4xx (non-429) → no retry, immediate throw
 *  3. Usage parsing: token counts captured from response
 *  4. Schema name constants correct for all three methods
 *
 * fetch() is replaced by vi.stubGlobal so no real HTTP calls are made.
 * Tests are purely unit-level — no NestJS container, no DB.
 *
 * Security: provider must NEVER log prompt text or response content —
 * only numeric metadata. This is enforced by code review, not by tests.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOMAIN_LLM_STEP_SCHEMA_NAME,
  FINAL_DECISION_SCHEMA_NAME,
  ROUTER_DECISION_SCHEMA_NAME,
} from "./openai-wire-schemas.js";
import {
  OpenAiCoachProvider,
  OpenAiCoachProviderMissingKeyError,
} from "./openai-coach-provider.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEST_API_KEY = "sk-test-key";
const TEST_MODEL = "gpt-4o-mini";

function makeProvider(): OpenAiCoachProvider {
  return new OpenAiCoachProvider({ apiKey: TEST_API_KEY, model: TEST_MODEL });
}

/** Minimal valid OpenAI chat completion response body. */
function makeOpenAiResponse(content: unknown, status = 200, usage?: {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}) {
  const body = {
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: usage ?? { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeOpenAiErrorResponse(status: number, message: string) {
  const body = { error: { message } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Minimal valid provider outputs (must satisfy Zod contracts)
// ---------------------------------------------------------------------------

const validRouterOutput = {
  selectedDomains: [],
  contextNeeds: [],
  directCommand: null,
  safetyFlags: [],
  confidence: 0.8,
};

const validDomainOutput = {
  kind: "domain_answer" as const,
  domain: "workout" as const,
  summary: "Reviewed your workout.",
  candidateProposals: [],
  domainSignals: [],
  workoutCalorieEstimate: null,
  workoutCaloriePerHourRate: null,
};

const validFinalOutput = {
  reply: "Here is your coaching response.",
  selectedAction: null,
  selectedProposalIds: [],
  consentRequired: false,
};

const validRouterRequest = {
  originalText: "adjust my workout",
  normalizedText: "adjust my workout",
  preprocessor: {},
  attachmentHints: [],
  recentMessageHints: [],
  availableDomains: [],
  safetyGuardrails: [],
  detectedLanguage: "en",
};

const validDomainStepRequest = {
  domain: "workout" as const,
  maxIterations: 3,
  userMessage: "adjust my workout",
  recentMessages: [],
  coachingContext: {},
  allowedTools: [] as string[],
  allowedProposalIntents: [] as string[],
  safetyFlags: [],
  safetyConstraints: [],
  iteration: 1,
  priorToolResults: [],
};

const validFinalDecisionRequest = {
  userMessage: "adjust my workout",
  domainOutputs: [],
  actionVariantCatalog: [],
  safetyFlags: [],
  safetyConstraints: [],
};

// ---------------------------------------------------------------------------
// Helper: capture the fetch request body
// ---------------------------------------------------------------------------

function captureFetch(responseFactory: (calls: number) => Response): {
  fetchMock: ReturnType<typeof vi.fn>;
  getLastBody: () => Record<string, unknown>;
} {
  let calls = 0;
  const capturedBodies: unknown[] = [];

  const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    capturedBodies.push(JSON.parse(init?.body as string ?? "{}"));
    calls++;
    return responseFactory(calls);
  });

  return {
    fetchMock,
    getLastBody: () => capturedBodies[capturedBodies.length - 1] as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenAiCoachProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Strict structured output: json_schema present in request body
  // -------------------------------------------------------------------------

  describe("strict structured output", () => {
    it("generateRouterDecision sends json_schema response_format with strict:true and correct schema name", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validRouterOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      await provider.generateRouterDecision(validRouterRequest as never);

      const body = getLastBody();
      const responseFormat = body["response_format"] as Record<string, unknown>;

      expect(responseFormat["type"]).toBe("json_schema");

      const jsonSchema = responseFormat["json_schema"] as Record<string, unknown>;
      expect(jsonSchema["strict"]).toBe(true);
      expect(jsonSchema["name"]).toBe(ROUTER_DECISION_SCHEMA_NAME);
      expect(jsonSchema["schema"]).toBeDefined();
    });

    it("generateDomainStep sends json_schema response_format with strict:true and correct schema name", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validDomainOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      await provider.generateDomainStep(validDomainStepRequest as never);

      const body = getLastBody();
      const responseFormat = body["response_format"] as Record<string, unknown>;

      expect(responseFormat["type"]).toBe("json_schema");

      const jsonSchema = responseFormat["json_schema"] as Record<string, unknown>;
      expect(jsonSchema["strict"]).toBe(true);
      expect(jsonSchema["name"]).toBe(DOMAIN_LLM_STEP_SCHEMA_NAME);
      expect(jsonSchema["schema"]).toBeDefined();
    });

    it("generateFinalDecision sends json_schema response_format with strict:true and correct schema name", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validFinalOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      await provider.generateFinalDecision(validFinalDecisionRequest as never);

      const body = getLastBody();
      const responseFormat = body["response_format"] as Record<string, unknown>;

      expect(responseFormat["type"]).toBe("json_schema");

      const jsonSchema = responseFormat["json_schema"] as Record<string, unknown>;
      expect(jsonSchema["strict"]).toBe(true);
      expect(jsonSchema["name"]).toBe(FINAL_DECISION_SCHEMA_NAME);
      expect(jsonSchema["schema"]).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Retry behaviour
  // -------------------------------------------------------------------------

  describe("retry behaviour", () => {
    it("retries once on HTTP 429 then succeeds on second attempt", async () => {
      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return makeOpenAiErrorResponse(429, "rate limit exceeded");
        }
        return makeOpenAiResponse(validRouterOutput);
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      const result = await provider.generateRouterDecision(validRouterRequest as never);

      expect(callCount).toBe(2);
      expect(result.output).toBeDefined();
      // usage.retries should reflect one retry
      expect(result.usage?.retries).toBe(1);
    }, 10_000);

    it("throws after exhausting all retries on HTTP 5xx", async () => {
      const fetchMock = vi.fn().mockImplementation(async () => {
        return makeOpenAiErrorResponse(503, "service unavailable");
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      await expect(
        provider.generateRouterDecision(validRouterRequest as never),
      ).rejects.toThrow();

      // 3 total attempts (1 initial + 2 retries)
      expect(fetchMock).toHaveBeenCalledTimes(3);
    }, 10_000);

    it("does NOT retry on HTTP 400 (non-retryable 4xx)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        makeOpenAiErrorResponse(400, "bad request"),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      await expect(
        provider.generateRouterDecision(validRouterRequest as never),
      ).rejects.toThrow("bad request");

      // Only 1 attempt — no retry for 4xx
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry on HTTP 401 (auth failure)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        makeOpenAiErrorResponse(401, "Unauthorized"),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      await expect(
        provider.generateFinalDecision(validFinalDecisionRequest as never),
      ).rejects.toThrow("Unauthorized");

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retries on network error (TypeError) and then succeeds", async () => {
      let callCount = 0;
      const fetchMock = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new TypeError("fetch failed");
        }
        return makeOpenAiResponse(validFinalOutput);
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      const result = await provider.generateFinalDecision(validFinalDecisionRequest as never);

      expect(callCount).toBe(2);
      expect(result.output.reply).toBe("Here is your coaching response.");
    }, 10_000);
  });

  // -------------------------------------------------------------------------
  // Usage tracking
  // -------------------------------------------------------------------------

  describe("usage tracking", () => {
    it("captures prompt_tokens, completion_tokens, total_tokens from the response", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        makeOpenAiResponse(validRouterOutput, 200, {
          prompt_tokens: 150,
          completion_tokens: 75,
          total_tokens: 225,
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      const result = await provider.generateRouterDecision(validRouterRequest as never);

      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBe(150);
      expect(result.usage?.completionTokens).toBe(75);
      expect(result.usage?.totalTokens).toBe(225);
    });

    it("records retries=0 when no retries occurred", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        makeOpenAiResponse(validFinalOutput),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      const result = await provider.generateFinalDecision(validFinalDecisionRequest as never);

      expect(result.usage?.retries).toBe(0);
    });

    it("records latencyMs as a non-negative integer", async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeOpenAiResponse(validDomainOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      const result = await provider.generateDomainStep(validDomainStepRequest as never);

      expect(result.usage?.latencyMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.usage?.latencyMs)).toBe(true);
    });

    it("defaults missing token counts to 0", async () => {
      // OpenAI response without usage field
      const body = {
        choices: [{ message: { content: JSON.stringify(validRouterOutput) } }],
        // no usage field
      };
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      const result = await provider.generateRouterDecision(validRouterRequest as never);

      expect(result.usage?.promptTokens).toBe(0);
      expect(result.usage?.completionTokens).toBe(0);
      expect(result.usage?.totalTokens).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Constructor guard
  // -------------------------------------------------------------------------

  describe("constructor", () => {
    it("throws OpenAiCoachProviderMissingKeyError when apiKey is empty string", () => {
      expect(
        () => new OpenAiCoachProvider({ apiKey: "", model: TEST_MODEL }),
      ).toThrow(OpenAiCoachProviderMissingKeyError);
    });

    it("throws OpenAiCoachProviderMissingKeyError when apiKey is whitespace-only", () => {
      expect(
        () => new OpenAiCoachProvider({ apiKey: "   ", model: TEST_MODEL }),
      ).toThrow(OpenAiCoachProviderMissingKeyError);
    });
  });
});
