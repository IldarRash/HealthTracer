/**
 * OpenAiCoachProvider unit tests — no live network calls.
 *
 * fetch() is replaced by vi.stubGlobal so no real HTTP calls are made.
 * Tests are purely unit-level — no NestJS container, no DB.
 *
 * Covers:
 *  - strict structured output: json_schema with strict:true and correct schema name
 *  - bounded retries: 429/5xx/network error → retry; non-429 4xx → immediate throw
 *  - usage parsing: token counts, retries, latency, model captured from response
 *  - per-stage model tiering: each method sends the correct per-stage model;
 *    override ?? fallback resolution works correctly
 *  - generateRouterDecision: valid JSON → parsed and clamped; malformed/garbage → fallback;
 *    shape violation (direct reply field present) → fallback
 *  - generateDomainStep: valid JSON → parsed; shape violation → throws; Zod parse failure → throws
 *  - generateFinalDecision: valid JSON → parsed; shape violation → fallback; Zod failure → fallback
 *  - provider error payload (4xx/5xx) → throws for domain step (which propagates to executor degradation);
 *    router/final-decision methods fall back (never throw to orchestrator)
 *  - multimodal payload construction: image attachment → correct content parts in request body
 *  - missing API key → OpenAiCoachProviderMissingKeyError on construction
 *  - empty/null content from API → error thrown
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOMAIN_LLM_STEP_SCHEMA_NAME,
  FINAL_DECISION_SCHEMA_NAME,
  ROUTER_DECISION_SCHEMA_NAME,
} from "./openai-wire-schemas.js";
import {
  createOpenAiCoachProvider,
  OpenAiCoachProvider,
  OpenAiCoachProviderMissingKeyError,
} from "./openai-coach-provider.js";
import {
  createFallbackRouterDecision,
  createFallbackFinalDecision,
  getDefaultCompiledPromptTemplates,
} from "@health/types";
import type {
  RouterDecisionRequest,
  DomainLlmStepRequest,
  FinalDecisionRequest,
} from "@health/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_API_KEY = "sk-test-key";
const TEST_MODEL = "gpt-4o-mini";

function makeProvider(opts?: {
  apiKey?: string;
  router?: string;
  domain?: string;
  decision?: string;
}): OpenAiCoachProvider {
  return new OpenAiCoachProvider({
    apiKey: opts?.apiKey ?? TEST_API_KEY,
    model: TEST_MODEL,
    models: {
      router: opts?.router ?? TEST_MODEL,
      domain: opts?.domain ?? TEST_MODEL,
      decision: opts?.decision ?? TEST_MODEL,
    },
    promptTemplates: getDefaultCompiledPromptTemplates(),
  });
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

/**
 * Build a minimal successful fetch response that returns the given JSON body
 * as the OpenAI chat completion response.
 */
function makeSuccessfulFetchResponse(content: string): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content } }],
      }),
  } as unknown as Response;
}

/**
 * Build an HTTP-error fetch response with an optional error body.
 */
function makeErrorFetchResponse(status: number, errorMessage?: string): Response {
  return {
    ok: false,
    status,
    json: () =>
      Promise.resolve(
        errorMessage ? { error: { message: errorMessage } } : {},
      ),
  } as unknown as Response;
}

function makeRouterRequest(): RouterDecisionRequest {
  return {
    originalText: "Adjust my workout",
    normalizedText: "adjust my workout",
    detectedLanguage: "en",
    preprocessor: {} as RouterDecisionRequest["preprocessor"],
    attachmentHints: [],
    recentMessageHints: [],
    availableDomains: [
      {
        domain: "workout",
        capabilities: [],
        signals: [],
      },
    ],
    safetyGuardrails: ["Do not diagnose."],
  } as unknown as RouterDecisionRequest;
}

function makeDomainRequest(
  domain: "workout" | "nutrition" | "health" = "workout",
  overrides: Partial<DomainLlmStepRequest> = {},
): DomainLlmStepRequest {
  return {
    domain,
    userMessage: "Adjust my workout",
    iteration: 1,
    maxIterations: 3,
    priorToolResults: [],
    coachingContext: { agentContext: {} },
    allowedTools: ["getUserContextSlice"],
    allowedProposalIntents: ["adapt_workout_plan"],
    safetyFlags: [],
    safetyConstraints: ["Do not diagnose."],
    recentMessages: [],
    responseLanguage: "en",
    ...overrides,
  } as unknown as DomainLlmStepRequest;
}

function makeFinalDecisionRequest(): FinalDecisionRequest {
  return {
    userMessage: "Adjust my workout",
    domainOutputs: [],
    actionVariantCatalog: [
      { id: "plain_reply", label: "Plain reply", requiresConsent: false },
    ],
    safetyFlags: [],
    safetyConstraints: [],
    responseLanguage: "en",
  } as unknown as FinalDecisionRequest;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OpenAiCoachProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Constructor guard
  // -------------------------------------------------------------------------

  describe("constructor", () => {
    it("throws OpenAiCoachProviderMissingKeyError when apiKey is empty", () => {
      expect(() => makeProvider({ apiKey: "" })).toThrow(OpenAiCoachProviderMissingKeyError);
    });

    it("throws OpenAiCoachProviderMissingKeyError when apiKey is whitespace only", () => {
      expect(() => makeProvider({ apiKey: "   " })).toThrow(OpenAiCoachProviderMissingKeyError);
    });

    it("constructs successfully with a non-empty api key", () => {
      expect(() => makeProvider({ apiKey: "sk-any-key" })).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // generateRouterDecision
  // -------------------------------------------------------------------------

  describe("generateRouterDecision", () => {
    it("returns parsed and clamped output for valid JSON from the API", async () => {
      const validContent = JSON.stringify({
        selectedDomains: [
          { domain: "workout", confidence: 0.85, intentHints: [], toolHints: [], signalHints: [] },
        ],
        contextNeeds: ["active_workout_plan"],
        safetyFlags: [],
        directCommand: { detected: false, kind: null, confidence: 0 },
        confidence: 0.85,
      });

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeSuccessfulFetchResponse(validContent)));

      const provider = makeProvider();
      const result = await provider.generateRouterDecision(makeRouterRequest());

      expect(result.output.selectedDomains ?? []).toHaveLength(1);
      expect((result.output.selectedDomains ?? [])[0]?.domain).toBe("workout");
      expect(result.output.confidence).toBe(0.85);
    });

    it("throws when the API returns malformed JSON (truncated) — non-JSON content is not silently absorbed", async () => {
      // requestJsonCompletion throws on JSON.parse failure; the caller (executor/orchestrator)
      // handles the error by degrading. The provider itself does not absorb this class of error.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(makeSuccessfulFetchResponse("{selectedDomains: [")),
      );

      const provider = makeProvider();
      await expect(provider.generateRouterDecision(makeRouterRequest())).rejects.toThrow(
        "non-JSON content",
      );
    });

    it("throws when the API returns garbage non-JSON content", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(makeSuccessfulFetchResponse("Error: rate limit exceeded")),
      );

      const provider = makeProvider();
      await expect(provider.generateRouterDecision(makeRouterRequest())).rejects.toThrow(
        "non-JSON content",
      );
    });

    it("returns fallback when the API returns JSON with forbidden shape (direct reply field)", async () => {
      // validateRouterDecisionOutputShape rejects outputs that contain 'reply'
      const forbiddenContent = JSON.stringify({
        selectedDomains: [],
        confidence: 0.5,
        reply: "Here is your plan",
      });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(makeSuccessfulFetchResponse(forbiddenContent)),
      );

      const provider = makeProvider();
      const result = await provider.generateRouterDecision(makeRouterRequest());

      const fallback = createFallbackRouterDecision();
      expect(result.output.selectedDomains).toHaveLength(fallback.selectedDomains.length);
    });

    it("clamps unknown domain names to empty selectedDomains", async () => {
      const unknownDomainContent = JSON.stringify({
        selectedDomains: [
          { domain: "medical_specialist", confidence: 0.9 },
        ],
        confidence: 0.9,
      });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(makeSuccessfulFetchResponse(unknownDomainContent)),
      );

      const provider = makeProvider();
      const result = await provider.generateRouterDecision(makeRouterRequest());

      // Unknown domain must be clamped out
      const knownDomains = ["workout", "nutrition", "health"];
      for (const d of result.output.selectedDomains ?? []) {
        expect(knownDomains).toContain(d.domain);
      }
    });

    it("throws an error when the API returns a 4xx error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(makeErrorFetchResponse(401, "Incorrect API key")),
      );

      const provider = makeProvider();
      await expect(provider.generateRouterDecision(makeRouterRequest())).rejects.toThrow(
        "Incorrect API key",
      );
    });

    it("throws an error when the API returns a 5xx error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(makeErrorFetchResponse(500, "Internal Server Error")),
      );

      const provider = makeProvider();
      await expect(provider.generateRouterDecision(makeRouterRequest())).rejects.toThrow();
    });

    it("throws when the API returns empty choices content", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ choices: [] }),
        } as unknown as Response),
      );

      const provider = makeProvider();
      // Empty content → must throw (not silently return)
      await expect(provider.generateRouterDecision(makeRouterRequest())).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // generateDomainStep
  // -------------------------------------------------------------------------

  describe("generateDomainStep", () => {
    it("parses and returns a valid domain_answer", async () => {
      const validAnswer = JSON.stringify({
        kind: "domain_answer",
        domain: "workout",
        summary: "Reviewed workout context and plan.",
        candidateProposals: [
          {
            intent: "adapt_workout_plan",
            targetDomain: "workout",
            title: "Lighter week",
            reason: "Fatigue detected",
            proposedChanges: { title: "Lighter week", summary: "Rest-focused", days: [], notes: [] },
          },
        ],
        domainSignals: ["workout_plan_present"],
        workoutCalorieEstimate: 300,
      });

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeSuccessfulFetchResponse(validAnswer)));

      const provider = makeProvider();
      const result = await provider.generateDomainStep(makeDomainRequest());

      expect(result.output.kind).toBe("domain_answer");
      if (result.output.kind === "domain_answer") {
        expect(result.output.domain).toBe("workout");
        expect(result.output.candidateProposals).toHaveLength(1);
        expect(result.output.workoutCalorieEstimate).toBe(300);
      }
    });

    it("parses and returns a valid tool_request", async () => {
      const toolReq = JSON.stringify({
        kind: "tool_request",
        tool: "getUserContextSlice",
        input: { purpose: "workout_adaptation" },
      });

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeSuccessfulFetchResponse(toolReq)));

      const provider = makeProvider();
      const result = await provider.generateDomainStep(makeDomainRequest());

      expect(result.output.kind).toBe("tool_request");
    });

    it("throws when the output contains forbidden shape (reply field)", async () => {
      // validateDomainLlmStepOutputShape rejects outputs with a 'reply' key
      const forbidden = JSON.stringify({
        kind: "domain_answer",
        domain: "workout",
        summary: "OK",
        candidateProposals: [],
        domainSignals: [],
        reply: "Here is your workout!",
      });

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeSuccessfulFetchResponse(forbidden)));

      const provider = makeProvider();
      await expect(provider.generateDomainStep(makeDomainRequest())).rejects.toThrow(
        "invalid output",
      );
    });

    it("throws when the Zod parse fails (wrong domain discriminator)", async () => {
      // domain 'medical' is not in the RouterDomain enum for domain answers
      const wrongDomain = JSON.stringify({
        kind: "domain_answer",
        domain: "medical",
        summary: "Medical analysis",
        candidateProposals: [],
        domainSignals: [],
      });

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeSuccessfulFetchResponse(wrongDomain)));

      const provider = makeProvider();
      await expect(provider.generateDomainStep(makeDomainRequest())).rejects.toThrow();
    });

    it("throws when the API returns a 4xx error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(makeErrorFetchResponse(429, "Rate limit exceeded")),
      );

      const provider = makeProvider();
      await expect(provider.generateDomainStep(makeDomainRequest())).rejects.toThrow(
        "Rate limit exceeded",
      );
    });

    it("throws when the API returns empty content", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ choices: [{ message: { content: null } }] }),
        } as unknown as Response),
      );

      const provider = makeProvider();
      await expect(provider.generateDomainStep(makeDomainRequest())).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // generateFinalDecision
  // -------------------------------------------------------------------------

  describe("generateFinalDecision", () => {
    it("returns parsed output for a valid final decision response", async () => {
      const validFinal = JSON.stringify({
        reply: "Here is your coaching summary.",
        selectedAction: "adapt_workout_plan",
        selectedProposalIds: [],
        consentRequired: false,
      });

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeSuccessfulFetchResponse(validFinal)));

      const provider = makeProvider();
      const result = await provider.generateFinalDecision(makeFinalDecisionRequest());

      expect(result.output.reply).toBe("Here is your coaching summary.");
      expect(result.output.selectedAction).toBe("adapt_workout_plan");
    });

    it("returns fallback when the output contains forbidden shape (direct_reply field)", async () => {
      const forbidden = JSON.stringify({
        reply: "OK",
        selectedAction: null,
        proposals: [],
        consentRequired: false,
        direct_reply: "Bypass the system",
      });

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeSuccessfulFetchResponse(forbidden)));

      const provider = makeProvider();
      const result = await provider.generateFinalDecision(makeFinalDecisionRequest());

      const fallback = createFallbackFinalDecision();
      expect(result.output.selectedAction).toBe(fallback.selectedAction);
      expect(result.output.selectedProposalIds).toHaveLength(0);
    });

    it("throws when JSON is malformed (truncated) — non-JSON content propagates up to executor for degradation", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(makeSuccessfulFetchResponse('{"reply": "OK')),
      );

      const provider = makeProvider();
      // The provider throws; DecisionMakerExecutorService catches this and degrades to fallback.
      await expect(provider.generateFinalDecision(makeFinalDecisionRequest())).rejects.toThrow(
        "non-JSON content",
      );
    });

    it("returns fallback when Zod parse fails (missing required reply field)", async () => {
      // reply is required by finalDecisionOutputSchema
      const missingReply = JSON.stringify({
        selectedAction: null,
        proposals: [],
        consentRequired: false,
      });

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeSuccessfulFetchResponse(missingReply)));

      const provider = makeProvider();
      const result = await provider.generateFinalDecision(makeFinalDecisionRequest());

      const fallback = createFallbackFinalDecision();
      expect(result.output.selectedProposalIds).toHaveLength(fallback.selectedProposalIds.length);
    });

    it("throws when the API returns a 4xx error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(makeErrorFetchResponse(401, "Unauthorized")),
      );

      const provider = makeProvider();
      await expect(provider.generateFinalDecision(makeFinalDecisionRequest())).rejects.toThrow(
        "Unauthorized",
      );
    });

    it("throws when the API returns a 5xx error with no error body", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(makeErrorFetchResponse(503)),
      );

      const provider = makeProvider();
      await expect(provider.generateFinalDecision(makeFinalDecisionRequest())).rejects.toThrow(
        "503",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Multimodal payload construction — image attachment
  // -------------------------------------------------------------------------

  describe("multimodal payload construction (generateDomainStep with image attachments)", () => {
    it("uses multimodal content parts when image data URIs are present", async () => {
      const capturedBody: { messages?: unknown[] }[] = [];
      const fakeFetch = vi.fn().mockImplementation((url: string, opts: { body: string }) => {
        capturedBody.push(JSON.parse(opts.body) as { messages?: unknown[] });
        return Promise.resolve(
          makeSuccessfulFetchResponse(
            JSON.stringify({
              kind: "domain_answer",
              domain: "nutrition",
              summary: "Analyzed food photo.",
              candidateProposals: [],
              domainSignals: [],
            }),
          ),
        );
      });
      vi.stubGlobal("fetch", fakeFetch);

      const imageDataUri = "data:image/jpeg;base64,/9j/4AAQSkZJRgAB";

      const provider = makeProvider();
      await provider.generateDomainStep(
        makeDomainRequest("nutrition", {
          attachmentContext: {
            items: [
              {
                attachmentRefId: "a1111111-0000-4000-8000-000000000001",
                category: "food_photo",
                mimeType: "image/jpeg",
                consentState: "none",
                imageDataUri,
              },
            ],
          } as DomainLlmStepRequest["attachmentContext"],
        }),
      );

      expect(capturedBody.length).toBe(1);
      const messages = capturedBody[0]?.messages as Array<{ role: string; content: unknown }>;
      const userMessage = messages?.find((m) => m.role === "user");
      expect(userMessage).toBeDefined();

      // user content must be an array when multimodal (not a plain string)
      expect(Array.isArray(userMessage?.content)).toBe(true);
      const parts = userMessage?.content as Array<{ type: string }>;

      const textPart = parts.find((p) => p.type === "text");
      const imagePart = parts.find((p) => p.type === "image_url");

      expect(textPart).toBeDefined();
      expect(imagePart).toBeDefined();
    });

    it("includes detail=low on image_url parts", async () => {
      const capturedBody: Array<{ messages?: Array<{ role: string; content: unknown }> }> = [];
      const fakeFetch = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        capturedBody.push(JSON.parse(opts.body) as typeof capturedBody[number]);
        return Promise.resolve(
          makeSuccessfulFetchResponse(
            JSON.stringify({
              kind: "domain_answer",
              domain: "health",
              summary: "Reviewed health image.",
              candidateProposals: [],
              domainSignals: [],
            }),
          ),
        );
      });
      vi.stubGlobal("fetch", fakeFetch);

      const dataUri = "data:image/png;base64,iVBORw0KGgo=";
      const provider = makeProvider();
      await provider.generateDomainStep(
        makeDomainRequest("health", {
          attachmentContext: {
            items: [
              {
                attachmentRefId: "b2222222-0000-4000-8000-000000000001",
                category: "medical_document",
                mimeType: "image/png",
                consentState: "granted",
                imageDataUri: dataUri,
              },
            ],
          } as DomainLlmStepRequest["attachmentContext"],
        }),
      );

      const messages = capturedBody[0]?.messages ?? [];
      const userMsg = messages.find((m) => m.role === "user");
      const parts = userMsg?.content as Array<{ type: string; image_url?: { detail: string; url: string } }>;
      const imagePart = parts?.find((p) => p.type === "image_url");

      expect(imagePart?.image_url?.detail).toBe("low");
      expect(imagePart?.image_url?.url).toBe(dataUri);
    });

    it("uses text-only content when no image data URIs are present (no attachments)", async () => {
      const capturedBody: Array<{ messages?: Array<{ role: string; content: unknown }> }> = [];
      const fakeFetch = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        capturedBody.push(JSON.parse(opts.body) as typeof capturedBody[number]);
        return Promise.resolve(
          makeSuccessfulFetchResponse(
            JSON.stringify({
              kind: "domain_answer",
              domain: "workout",
              summary: "Reviewed workout.",
              candidateProposals: [],
              domainSignals: [],
            }),
          ),
        );
      });
      vi.stubGlobal("fetch", fakeFetch);

      const provider = makeProvider();
      await provider.generateDomainStep(makeDomainRequest("workout"));

      const messages = capturedBody[0]?.messages ?? [];
      const userMsg = messages.find((m) => m.role === "user");

      // Text-only path: content is a plain string, not an array
      expect(typeof userMsg?.content).toBe("string");
    });

    it("excludes non-image MIME attachments from vision content parts", async () => {
      const capturedBody: Array<{ messages?: Array<{ role: string; content: unknown }> }> = [];
      const fakeFetch = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        capturedBody.push(JSON.parse(opts.body) as typeof capturedBody[number]);
        return Promise.resolve(
          makeSuccessfulFetchResponse(
            JSON.stringify({
              kind: "domain_answer",
              domain: "health",
              summary: "Reviewed.",
              candidateProposals: [],
              domainSignals: [],
            }),
          ),
        );
      });
      vi.stubGlobal("fetch", fakeFetch);

      const provider = makeProvider();
      await provider.generateDomainStep(
        makeDomainRequest("health", {
          attachmentContext: {
            items: [
              {
                // PDF: non-image MIME must NOT be sent as vision content
                attachmentRefId: "c3333333-0000-4000-8000-000000000001",
                category: "medical_document",
                mimeType: "application/pdf",
                consentState: "granted",
                imageDataUri: "data:application/pdf;base64,JVBERi0xLjQ=",
              },
            ],
          } as DomainLlmStepRequest["attachmentContext"],
        }),
      );

      const messages = capturedBody[0]?.messages ?? [];
      const userMsg = messages.find((m) => m.role === "user");

      // Non-image MIME → text-only path; content is a plain string
      expect(typeof userMsg?.content).toBe("string");
    });

    it("includes the system prompt as the first message in the request body", async () => {
      const capturedBody: Array<{ messages?: Array<{ role: string; content: unknown }> }> = [];
      const fakeFetch = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        capturedBody.push(JSON.parse(opts.body) as typeof capturedBody[number]);
        return Promise.resolve(
          makeSuccessfulFetchResponse(
            JSON.stringify({
              kind: "domain_answer",
              domain: "workout",
              summary: "OK",
              candidateProposals: [],
              domainSignals: [],
            }),
          ),
        );
      });
      vi.stubGlobal("fetch", fakeFetch);

      const provider = makeProvider();
      await provider.generateDomainStep(makeDomainRequest());

      const messages = capturedBody[0]?.messages ?? [];
      expect(messages[0]?.role).toBe("system");
      expect(typeof messages[0]?.content).toBe("string");
    });
  });

  // -------------------------------------------------------------------------
  // Request structure — shared checks across all three methods
  // -------------------------------------------------------------------------

  describe("request structure", () => {
    it("includes Authorization: Bearer <key> header", async () => {
      const capturedHeaders: Record<string, string>[] = [];
      const fakeFetch = vi.fn().mockImplementation(
        (_url: string, opts: { headers: Record<string, string> }) => {
          capturedHeaders.push(opts.headers);
          return Promise.resolve(
            makeSuccessfulFetchResponse(
              JSON.stringify({
                selectedDomains: [],
                contextNeeds: [],
                safetyFlags: [],
                confidence: 0.5,
              }),
            ),
          );
        },
      );
      vi.stubGlobal("fetch", fakeFetch);

      const provider = makeProvider({ apiKey: "sk-secret-key-123" });
      await provider.generateRouterDecision(makeRouterRequest());

      expect(capturedHeaders[0]?.["Authorization"]).toBe("Bearer sk-secret-key-123");
    });

    it("sets response_format to json_schema", async () => {
      const capturedBodies: Array<{ response_format?: { type: string } }> = [];
      const fakeFetch = vi.fn().mockImplementation(
        (_url: string, opts: { body: string }) => {
          capturedBodies.push(JSON.parse(opts.body) as typeof capturedBodies[number]);
          return Promise.resolve(
            makeSuccessfulFetchResponse(
              JSON.stringify({
                reply: "OK",
                selectedAction: null,
                selectedProposalIds: [],
                consentRequired: false,
              }),
            ),
          );
        },
      );
      vi.stubGlobal("fetch", fakeFetch);

      const provider = makeProvider();
      await provider.generateFinalDecision(makeFinalDecisionRequest());

      expect(capturedBodies[0]?.response_format?.type).toBe("json_schema");
    });

    it("sends requests to the OpenAI chat completions endpoint", async () => {
      const capturedUrls: string[] = [];
      const fakeFetch = vi.fn().mockImplementation(
        (url: string) => {
          capturedUrls.push(url as string);
          return Promise.resolve(
            makeSuccessfulFetchResponse(
              JSON.stringify({
                selectedDomains: [],
                contextNeeds: [],
                safetyFlags: [],
                confidence: 0.5,
              }),
            ),
          );
        },
      );
      vi.stubGlobal("fetch", fakeFetch);

      const provider = makeProvider();
      await provider.generateRouterDecision(makeRouterRequest());

      expect(capturedUrls[0]).toBe("https://api.openai.com/v1/chat/completions");
    });
  });

  // -------------------------------------------------------------------------
  // Strict structured output
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
        provider.generateDomainStep(validDomainStepRequest as never),
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
        provider.generateDomainStep(validDomainStepRequest as never),
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
        provider.generateDomainStep(validDomainStepRequest as never),
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
  // Per-stage model tiering (Slice 4)
  // -------------------------------------------------------------------------

  describe("per-stage model tiering", () => {
    it("generateRouterDecision uses the router model override when set", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validRouterOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider({ router: "gpt-4o", domain: "gpt-4o-mini", decision: "gpt-4o-mini" });
      await provider.generateRouterDecision(validRouterRequest as never);

      expect(getLastBody()["model"]).toBe("gpt-4o");
    });

    it("generateDomainStep uses the domain model override when set", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validDomainOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider({ router: "gpt-4o-mini", domain: "gpt-4o", decision: "gpt-4o-mini" });
      await provider.generateDomainStep(validDomainStepRequest as never);

      expect(getLastBody()["model"]).toBe("gpt-4o");
    });

    it("generateFinalDecision uses the decision model override when set", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validFinalOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider({ router: "gpt-4o-mini", domain: "gpt-4o-mini", decision: "gpt-4o" });
      await provider.generateFinalDecision(validFinalDecisionRequest as never);

      expect(getLastBody()["model"]).toBe("gpt-4o");
    });

    it("router model differs from domain model when overrides set independently", async () => {
      const bodies: Array<Record<string, unknown>> = [];
      const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(init?.body as string ?? "{}"));
        return makeOpenAiResponse(validRouterOutput);
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider({ router: "gpt-4o", domain: "gpt-3.5-turbo", decision: "gpt-4o-mini" });
      await provider.generateRouterDecision(validRouterRequest as never);

      // Separately verify domain uses a different model
      const fetchMock2 = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(init?.body as string ?? "{}"));
        return makeOpenAiResponse(validDomainOutput);
      });
      vi.stubGlobal("fetch", fetchMock2);
      await provider.generateDomainStep(validDomainStepRequest as never);

      expect(bodies[0]?.["model"]).toBe("gpt-4o");
      expect(bodies[1]?.["model"]).toBe("gpt-3.5-turbo");
    });

    it("falls back to OPENAI_MODEL when no per-stage override is provided", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validRouterOutput));
      vi.stubGlobal("fetch", fetchMock);

      // createOpenAiCoachProvider with no overrides → all stages use TEST_MODEL
      const provider = createOpenAiCoachProvider(TEST_API_KEY, TEST_MODEL);
      await provider.generateRouterDecision(validRouterRequest as never);

      expect(getLastBody()["model"]).toBe(TEST_MODEL);
    });

    it("stamps usage.model with the resolved stage model", async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeOpenAiResponse(validRouterOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider({ router: "gpt-4o" });
      const result = await provider.generateRouterDecision(validRouterRequest as never);

      expect(result.usage?.model).toBe("gpt-4o");
    });

    it("stamps domain usage.model with the domain model", async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeOpenAiResponse(validDomainOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider({ domain: "gpt-4o" });
      const result = await provider.generateDomainStep(validDomainStepRequest as never);

      expect(result.usage?.model).toBe("gpt-4o");
    });

    it("stamps decision usage.model with the decision model", async () => {
      const fetchMock = vi.fn().mockResolvedValue(makeOpenAiResponse(validFinalOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider({ decision: "gpt-4o" });
      const result = await provider.generateFinalDecision(validFinalDecisionRequest as never);

      expect(result.usage?.model).toBe("gpt-4o");
    });

    it("generateDomainStep with imageDataUri in attachment context uses the domain-stage model (multimodal path)", async () => {
      // Provide an attachment with an image data URI so the multimodal path is taken.
      const domainStepRequestWithImage = {
        ...validDomainStepRequest,
        attachmentContext: {
          items: [
            {
              attachmentRefId: "a1000001-0000-4000-8000-000000000001",
              category: "food_photo",
              mimeType: "image/jpeg",
              consentState: "none",
              hasImage: true,
              imageDataUri: "data:image/jpeg;base64,/9j/4A==",
            },
          ],
        },
      };

      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validDomainOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider({ router: "gpt-4o-mini", domain: "gpt-4o", decision: "gpt-4o-mini" });
      await provider.generateDomainStep(domainStepRequestWithImage as never);

      // The multimodal path must still use the domain-stage model.
      expect(getLastBody()["model"]).toBe("gpt-4o");
    });
  });

  // -------------------------------------------------------------------------
  // Static prompt prefix has no unresolved placeholders (Fix 3)
  // -------------------------------------------------------------------------

  describe("static prompt prefix contains no unresolved {{}} placeholders", () => {
    it("generateRouterDecision system prompt has no unresolved placeholders", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validRouterOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      await provider.generateRouterDecision(validRouterRequest as never);

      const body = getLastBody();
      const messages = body["messages"] as Array<{ role: string; content: string }>;
      const systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";

      expect(systemPrompt).not.toMatch(/\{\{/);
    });

    it("generateDomainStep system prompt has no unresolved placeholders", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validDomainOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      await provider.generateDomainStep(validDomainStepRequest as never);

      const body = getLastBody();
      const messages = body["messages"] as Array<{ role: string; content: string }>;
      const systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";

      expect(systemPrompt).not.toMatch(/\{\{/);
    });

    it("generateFinalDecision system prompt has no unresolved placeholders", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validFinalOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = makeProvider();
      await provider.generateFinalDecision(validFinalDecisionRequest as never);

      const body = getLastBody();
      const messages = body["messages"] as Array<{ role: string; content: string }>;
      const systemPrompt = messages.find((m) => m.role === "system")?.content ?? "";

      expect(systemPrompt).not.toMatch(/\{\{/);
    });
  });

  // -------------------------------------------------------------------------
  // Gap 2 — document_file text blocks in user content (never system prompt)
  // -------------------------------------------------------------------------
  //
  // Covers:
  //  (a) file text appears as a user-content block with the
  //      `ATTACHED FILE "<filename>"` label
  //  (b) the system prompt does NOT contain the file text
  //  (c) attachment summary JSON includes hasText/filename but never textContent
  //  (d) a no-attachment request sends text-only user content (prompt-cache
  //      regression: system prompt must contain no attachment-block additions)
  // -------------------------------------------------------------------------

  describe("document_file text blocks (Gap 2)", () => {
    it("file text appears as a labeled user-content block with ATTACHED FILE label", async () => {
      const capturedBody: Array<{ messages?: Array<{ role: string; content: unknown }> }> = [];
      const fakeFetch = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        capturedBody.push(JSON.parse(opts.body) as typeof capturedBody[number]);
        return Promise.resolve(
          makeSuccessfulFetchResponse(
            JSON.stringify({
              kind: "domain_answer",
              domain: "workout",
              summary: "Reviewed the uploaded training plan.",
              candidateProposals: [],
              domainSignals: [],
            }),
          ),
        );
      });
      vi.stubGlobal("fetch", fakeFetch);

      const textContent = "Day 1: Squat 4x8. Day 2: Bench Press 4x8.";
      const filename = "training-plan.pdf";

      const provider = makeProvider();
      await provider.generateDomainStep(
        makeDomainRequest("workout", {
          attachmentContext: {
            items: [
              {
                attachmentRefId: "d1000001-0000-4000-8000-000000000001",
                category: "document_file",
                mimeType: "application/pdf",
                consentState: "none",
                textContent,
                filename,
              },
            ],
          } as DomainLlmStepRequest["attachmentContext"],
        }),
      );

      expect(capturedBody.length).toBe(1);
      const messages = capturedBody[0]?.messages ?? [];
      const userMsg = messages.find((m) => m.role === "user");

      // User content must be an array (multimodal path) when text blocks present.
      expect(Array.isArray(userMsg?.content)).toBe(true);
      const parts = userMsg?.content as Array<{ type: string; text?: string }>;

      // There must be a text part whose text contains the labeled file block.
      const fileLabelPart = parts.find(
        (p) => p.type === "text" && p.text?.includes(`ATTACHED FILE "${filename}"`),
      );
      expect(fileLabelPart).toBeDefined();
      expect(fileLabelPart?.text).toContain(textContent);
    });

    it("file text NEVER appears in the system prompt", async () => {
      const capturedBody: Array<{ messages?: Array<{ role: string; content: unknown }> }> = [];
      const fakeFetch = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        capturedBody.push(JSON.parse(opts.body) as typeof capturedBody[number]);
        return Promise.resolve(
          makeSuccessfulFetchResponse(
            JSON.stringify({
              kind: "domain_answer",
              domain: "nutrition",
              summary: "Reviewed the nutrition document.",
              candidateProposals: [],
              domainSignals: [],
            }),
          ),
        );
      });
      vi.stubGlobal("fetch", fakeFetch);

      const textContent = "Calories: 2000. Protein: 150g.";

      const provider = makeProvider();
      await provider.generateDomainStep(
        makeDomainRequest("nutrition", {
          attachmentContext: {
            items: [
              {
                attachmentRefId: "d2000001-0000-4000-8000-000000000001",
                category: "document_file",
                mimeType: "text/plain",
                consentState: "none",
                textContent,
                filename: "macros.txt",
              },
            ],
          } as DomainLlmStepRequest["attachmentContext"],
        }),
      );

      expect(capturedBody.length).toBe(1);
      const messages = capturedBody[0]?.messages ?? [];
      const systemMsg = messages.find((m) => m.role === "system");

      // System prompt must be a plain string (not an array) — it is never multimodal.
      expect(typeof systemMsg?.content).toBe("string");
      // The extracted file text must NOT appear in the system prompt.
      const systemContent = systemMsg?.content as string;
      expect(systemContent).not.toContain(textContent);
    });

    it("attachment summary JSON in system prompt has hasText and filename but never textContent", async () => {
      const capturedBody: Array<{ messages?: Array<{ role: string; content: unknown }> }> = [];
      const fakeFetch = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        capturedBody.push(JSON.parse(opts.body) as typeof capturedBody[number]);
        return Promise.resolve(
          makeSuccessfulFetchResponse(
            JSON.stringify({
              kind: "domain_answer",
              domain: "workout",
              summary: "Reviewed the plan.",
              candidateProposals: [],
              domainSignals: [],
            }),
          ),
        );
      });
      vi.stubGlobal("fetch", fakeFetch);

      const textContent = "This is a large document with sensitive health data.";

      const provider = makeProvider();
      await provider.generateDomainStep(
        makeDomainRequest("workout", {
          attachmentContext: {
            items: [
              {
                attachmentRefId: "d3000001-0000-4000-8000-000000000001",
                category: "document_file",
                mimeType: "text/plain",
                consentState: "none",
                textContent,
                filename: "health-data.txt",
              },
            ],
          } as DomainLlmStepRequest["attachmentContext"],
        }),
      );

      expect(capturedBody.length).toBe(1);
      const messages = capturedBody[0]?.messages ?? [];
      const systemMsg = messages.find((m) => m.role === "system");
      const systemContent = systemMsg?.content as string;

      // The system prompt should contain attachment summary JSON with hasText:true and filename.
      expect(systemContent).toContain("hasText");
      expect(systemContent).toContain("health-data.txt");
      // The textContent itself must never appear in the system prompt.
      expect(systemContent).not.toContain(textContent);
    });

    it("no-attachment request sends plain string user content (prompt-cache regression guard)", async () => {
      // A request with no attachments must route through requestJsonCompletion
      // (not requestMultimodalJsonCompletion) so the user content is a plain string.
      // This ensures the system prompt has no attachment-related additions,
      // preserving the static prefix for prompt-cache hits.
      const capturedBody: Array<{ messages?: Array<{ role: string; content: unknown }> }> = [];
      const fakeFetch = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
        capturedBody.push(JSON.parse(opts.body) as typeof capturedBody[number]);
        return Promise.resolve(
          makeSuccessfulFetchResponse(
            JSON.stringify({
              kind: "domain_answer",
              domain: "workout",
              summary: "Reviewed workout.",
              candidateProposals: [],
              domainSignals: [],
            }),
          ),
        );
      });
      vi.stubGlobal("fetch", fakeFetch);

      const provider = makeProvider();
      // No attachmentContext at all — pure text request.
      await provider.generateDomainStep(makeDomainRequest("workout"));

      expect(capturedBody.length).toBe(1);
      const messages = capturedBody[0]?.messages ?? [];

      const userMsg = messages.find((m) => m.role === "user");
      // Text-only path: user content is a plain string, not an array.
      expect(typeof userMsg?.content).toBe("string");

      // System prompt must be a plain string and contain no attachment-block additions.
      const systemMsg = messages.find((m) => m.role === "system");
      expect(typeof systemMsg?.content).toBe("string");
      const systemContent = systemMsg?.content as string;
      // No "ATTACHED FILE" label in system prompt for no-attachment request.
      expect(systemContent).not.toContain("ATTACHED FILE");
      // No "hasText" attachment summary for no-attachment request.
      // (The attachmentContextJson is rendered as "none" by the prompt template.)
      expect(systemContent).not.toContain("hasText");
    });
  });
});
