/**
 * OpenAiProposalRepairProvider unit tests — no live network calls.
 *
 * fetch() is replaced by vi.stubGlobal so no real HTTP calls are made.
 *
 * Covers:
 *  - request shape: json_schema response_format (strict:false, proposedChanges root),
 *    temperature 0, model, system prompt naming the intent, user message carrying the
 *    exact validation error strings + the original payload JSON
 *  - response parsing: wrapped {proposedChanges} unwrap, flat-payload fallback,
 *    explicit-null stripping
 *  - failure: non-object payload → throws WITHOUT payload contents in the message;
 *    API error → throws; missing key → constructor throws
 *  - privacy: the provider performs no logging (payloads never reach a logger)
 */

import type { ProposalRepairRequest } from "@health/ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OpenAiProposalRepairProvider,
  PROPOSAL_REPAIR_SCHEMA_NAME,
} from "./openai-proposal-repair-provider.js";

const TEST_API_KEY = "sk-test-key";
const TEST_MODEL = "gpt-4o-mini";

const repairRequest: ProposalRepairRequest = {
  intent: "log_nutrition_incident",
  proposedChanges: {
    description: "Breakfast bowl",
    provenance: { source: "image_estimate" },
  },
  validationErrors: [
    'provenance.source: Invalid enum value. Expected "vision_llm_estimate", received "image_estimate"',
    "imageRefs.0: Expected object, received string",
  ],
};

function makeProvider(apiKey = TEST_API_KEY): OpenAiProposalRepairProvider {
  return new OpenAiProposalRepairProvider({ apiKey, model: TEST_MODEL });
}

function makeOpenAiResponse(content: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function stubFetchWith(response: Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function capturedRequestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenAiProposalRepairProvider", () => {
  it("throws on construction when the API key is missing", () => {
    expect(() => makeProvider("")).toThrow("OPENAI_API_KEY");
    expect(() => makeProvider("   ")).toThrow("OPENAI_API_KEY");
  });

  it("sends a strict:false json_schema request with the proposedChanges root schema", async () => {
    const fetchMock = stubFetchWith(makeOpenAiResponse({ proposedChanges: { fixed: true } }));

    await makeProvider().repairProposal(repairRequest);

    const body = capturedRequestBody(fetchMock);
    expect(body.model).toBe(TEST_MODEL);
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: PROPOSAL_REPAIR_SCHEMA_NAME,
        strict: false,
        schema: {
          type: "object",
          properties: {
            proposedChanges: { type: "object", additionalProperties: true },
          },
          required: ["proposedChanges"],
          additionalProperties: false,
        },
      },
    });
  });

  it("puts the intent in the system prompt and the exact errors + original payload JSON in the user message", async () => {
    const fetchMock = stubFetchWith(makeOpenAiResponse({ proposedChanges: { fixed: true } }));

    await makeProvider().repairProposal(repairRequest);

    const body = capturedRequestBody(fetchMock);
    const messages = body.messages as Array<{ role: string; content: string }>;

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[0]?.content).toContain('intent "log_nutrition_incident"');
    expect(messages[0]?.content).toContain("corrected JSON payload");

    expect(messages[1]?.role).toBe("user");
    for (const error of repairRequest.validationErrors) {
      expect(messages[1]?.content).toContain(error);
    }
    expect(messages[1]?.content).toContain(JSON.stringify(repairRequest.proposedChanges));
  });

  it("unwraps the proposedChanges wrapper and strips explicit nulls", async () => {
    stubFetchWith(
      makeOpenAiResponse({
        proposedChanges: { description: "Breakfast bowl", incidentDateTime: null, fixed: true },
      }),
    );

    const result = await makeProvider().repairProposal(repairRequest);

    expect(result.proposedChanges).toEqual({ description: "Breakfast bowl", fixed: true });
    expect(result.usage).toMatchObject({
      promptTokens: 11,
      completionTokens: 7,
      totalTokens: 18,
      model: TEST_MODEL,
    });
  });

  it("tolerates a flat payload emitted without the proposedChanges wrapper", async () => {
    stubFetchWith(makeOpenAiResponse({ description: "Breakfast bowl", fixed: true }));

    const result = await makeProvider().repairProposal(repairRequest);

    expect(result.proposedChanges).toEqual({ description: "Breakfast bowl", fixed: true });
  });

  it("throws without payload contents when the model returns a non-object payload", async () => {
    stubFetchWith(makeOpenAiResponse({ proposedChanges: "secret-string-payload" }));

    await expect(makeProvider().repairProposal(repairRequest)).rejects.toThrow(
      "OpenAI proposal repair provider returned a non-object payload.",
    );
    await expect(makeProvider().repairProposal(repairRequest)).rejects.not.toThrow(
      /secret-string-payload/,
    );
  });

  it("never logs payload contents (the provider performs no logging at all)", async () => {
    const consoleSpies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "debug"),
    ];
    stubFetchWith(makeOpenAiResponse({ proposedChanges: { fixed: true } }));

    await makeProvider().repairProposal(repairRequest);

    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it("throws the OpenAI error message on a non-retryable API error", async () => {
    stubFetchWith(
      new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(makeProvider().repairProposal(repairRequest)).rejects.toThrow(
      "Incorrect API key",
    );
  });
});
