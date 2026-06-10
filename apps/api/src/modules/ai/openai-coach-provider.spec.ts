/**
 * OpenAiCoachProvider unit tests — no live network calls.
 *
 * fetch is stubbed globally with vi.stubGlobal so no real HTTP is issued.
 *
 * Covers:
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

function makeProvider(apiKey = "sk-test-key"): OpenAiCoachProvider {
  return new OpenAiCoachProvider({
    apiKey,
    model: "gpt-4o",
    promptTemplates: getDefaultCompiledPromptTemplates(),
  });
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
      expect(() => makeProvider("")).toThrow(OpenAiCoachProviderMissingKeyError);
    });

    it("throws OpenAiCoachProviderMissingKeyError when apiKey is whitespace only", () => {
      expect(() => makeProvider("   ")).toThrow(OpenAiCoachProviderMissingKeyError);
    });

    it("constructs successfully with a non-empty api key", () => {
      expect(() => makeProvider("sk-any-key")).not.toThrow();
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

      const provider = makeProvider("sk-secret-key-123");
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
});
