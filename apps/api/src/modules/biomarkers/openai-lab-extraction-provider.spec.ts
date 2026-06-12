/**
 * OpenAiLabExtractionProvider unit tests — no live network calls.
 *
 * fetch() is replaced via vi.stubGlobal (mirrors openai-coach-provider.spec.ts).
 *
 * Covers:
 *  - strict structured output: json_schema with strict:true, the lab schema name,
 *    and temperature 0
 *  - privacy: document text appears ONLY in the user message, never in the
 *    (static, cacheable) system prompt
 *  - bounded retries: 429/5xx/network error → retry; non-429 4xx → immediate throw;
 *    content parse failure → immediate throw (no retry)
 *  - AbortSignal propagation to fetch
 *  - usage population: token counts, retries, latency, model
 *  - factory: missing key → null (no boot crash); OPENAI_MODEL_LAB_EXTRACTION
 *    override honored with OPENAI_MODEL fallback
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { createLabExtractionProviderFromEnv } from "./lab-extraction-provider.factory.js";
import { LAB_EXTRACTION_SCHEMA_NAME } from "./lab-extraction-wire-schema.js";
import {
  LAB_EXTRACTION_SYSTEM_PROMPT,
  OpenAiLabExtractionProvider,
  OpenAiLabExtractionProviderMissingKeyError,
} from "./openai-lab-extraction-provider.js";

const TEST_API_KEY = "sk-test-key";
const TEST_MODEL = "gpt-4o-mini";
const DOCUMENT_TEXT = "Glucose: 92 mg/dL (70 - 99)\nCollected 2026-05-20";

const validOutput = {
  isLabReport: true,
  observedAt: "2026-05-20",
  readings: [
    {
      biomarkerKey: "fasting_glucose",
      valueNumeric: 92,
      valueText: null,
      unit: "mg/dL",
      referenceRangeText: "70 - 99",
      observedAt: null,
      confidence: 0.93,
    },
  ],
  unmappedMarkerCount: 0,
};

function makeProvider(opts?: { apiKey?: string; model?: string }): OpenAiLabExtractionProvider {
  return new OpenAiLabExtractionProvider({
    apiKey: opts?.apiKey ?? TEST_API_KEY,
    model: opts?.model ?? TEST_MODEL,
  });
}

function makeOpenAiResponse(
  content: unknown,
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
): Response {
  const body = {
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: usage ?? { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeRawContentResponse(content: string): Response {
  const body = { choices: [{ message: { content } }] };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeOpenAiErrorResponse(status: number): Response {
  return new Response(JSON.stringify({ error: { message: "upstream error" } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function captureFetch(responseFactory: (calls: number) => Response): {
  fetchMock: ReturnType<typeof vi.fn>;
  getLastBody: () => Record<string, unknown>;
} {
  let calls = 0;
  const capturedBodies: unknown[] = [];

  const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    capturedBodies.push(JSON.parse((init?.body as string) ?? "{}"));
    calls++;
    return responseFactory(calls);
  });

  return {
    fetchMock,
    getLastBody: () => capturedBodies[capturedBodies.length - 1] as Record<string, unknown>,
  };
}

describe("OpenAiLabExtractionProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("throws OpenAiLabExtractionProviderMissingKeyError for an empty api key", () => {
      expect(() => makeProvider({ apiKey: "  " })).toThrow(
        OpenAiLabExtractionProviderMissingKeyError,
      );
    });
  });

  describe("request structure", () => {
    it("sends strict json_schema structured output with the lab schema name and temperature 0", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validOutput));
      vi.stubGlobal("fetch", fetchMock);

      await makeProvider().extractBiomarkers({ documentText: DOCUMENT_TEXT });

      const body = getLastBody();
      expect(body["temperature"]).toBe(0);
      expect(body["model"]).toBe(TEST_MODEL);

      const responseFormat = body["response_format"] as Record<string, unknown>;
      expect(responseFormat["type"]).toBe("json_schema");

      const jsonSchema = responseFormat["json_schema"] as Record<string, unknown>;
      expect(jsonSchema["strict"]).toBe(true);
      expect(jsonSchema["name"]).toBe(LAB_EXTRACTION_SCHEMA_NAME);
      expect(jsonSchema["schema"]).toBeDefined();
    });

    it("puts the document text ONLY in the user message — never in the system prompt", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validOutput));
      vi.stubGlobal("fetch", fetchMock);

      await makeProvider().extractBiomarkers({ documentText: DOCUMENT_TEXT });

      const messages = getLastBody()["messages"] as Array<{ role: string; content: string }>;
      expect(messages).toHaveLength(2);
      expect(messages[0]?.role).toBe("system");
      expect(messages[0]?.content).toBe(LAB_EXTRACTION_SYSTEM_PROMPT);
      expect(messages[0]?.content).not.toContain(DOCUMENT_TEXT);
      expect(messages[1]?.role).toBe("user");
      expect(messages[1]?.content).toBe(DOCUMENT_TEXT);
    });

    it("keeps the system prompt static (catalog lines, no per-request content)", async () => {
      expect(LAB_EXTRACTION_SYSTEM_PROMPT).toContain("fasting_glucose");
      expect(LAB_EXTRACTION_SYSTEM_PROMPT).toContain("Глюкоза натощак");
      expect(LAB_EXTRACTION_SYSTEM_PROMPT).toContain("unmappedMarkerCount");
      expect(LAB_EXTRACTION_SYSTEM_PROMPT).not.toMatch(/\{\{/);
    });

    it("instructs the model on the four structured-range fields, in the value's unit", () => {
      for (const field of [
        "referenceRangeLow",
        "referenceRangeHigh",
        "optimalRangeLow",
        "optimalRangeHigh",
      ]) {
        expect(LAB_EXTRACTION_SYSTEM_PROMPT).toContain(field);
      }

      // Same-unit-as-the-value rule appears for both ranges.
      expect(LAB_EXTRACTION_SYSTEM_PROMPT).toMatch(/SAME unit as the value/);
      // One-sided/qualitative reference ranges null out.
      expect(LAB_EXTRACTION_SYSTEM_PROMPT.toLowerCase()).toContain("one-sided");
    });

    it("frames the optimal range as wellness from general knowledge, never diagnostic", () => {
      const prompt = LAB_EXTRACTION_SYSTEM_PROMPT;

      expect(prompt).toMatch(/general knowledge/i);
      expect(prompt).toMatch(/wellness/i);
      // Safety floor: the optimal-range instruction must explicitly forbid
      // diagnostic / treatment / medical-certainty framing.
      expect(prompt).toMatch(/NEVER a diagnostic threshold/);
      expect(prompt).not.toMatch(/\b(diagnose the patient|treat with|prescribe|dosage)\b/i);
    });

    it("sends the Authorization bearer header to the OpenAI endpoint", async () => {
      const capturedUrls: string[] = [];
      const capturedHeaders: Array<Record<string, string>> = [];
      const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrls.push(url);
        capturedHeaders.push((init?.headers ?? {}) as Record<string, string>);
        return makeOpenAiResponse(validOutput);
      });
      vi.stubGlobal("fetch", fetchMock);

      await makeProvider().extractBiomarkers({ documentText: DOCUMENT_TEXT });

      expect(capturedUrls[0]).toBe("https://api.openai.com/v1/chat/completions");
      expect(capturedHeaders[0]?.["Authorization"]).toBe(`Bearer ${TEST_API_KEY}`);
    });
  });

  describe("retry behaviour", () => {
    it("retries on HTTP 429 and succeeds on the second attempt (usage.retries = 1)", async () => {
      const { fetchMock } = captureFetch((calls) =>
        calls === 1 ? makeOpenAiErrorResponse(429) : makeOpenAiResponse(validOutput),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await makeProvider().extractBiomarkers({ documentText: DOCUMENT_TEXT });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.usage?.retries).toBe(1);
      expect(result.output).toEqual(validOutput);
    }, 10_000);

    it("throws after exhausting all retries on HTTP 5xx (3 total attempts)", async () => {
      const { fetchMock } = captureFetch(() => makeOpenAiErrorResponse(503));
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        makeProvider().extractBiomarkers({ documentText: DOCUMENT_TEXT }),
      ).rejects.toThrow("status 503");
      expect(fetchMock).toHaveBeenCalledTimes(3);
    }, 10_000);

    it("does NOT retry on HTTP 400", async () => {
      const { fetchMock } = captureFetch(() => makeOpenAiErrorResponse(400));
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        makeProvider().extractBiomarkers({ documentText: DOCUMENT_TEXT }),
      ).rejects.toThrow("status 400");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retries on a network error (TypeError) and then succeeds", async () => {
      let calls = 0;
      const fetchMock = vi.fn().mockImplementation(async () => {
        calls++;
        if (calls === 1) {
          throw new TypeError("fetch failed");
        }
        return makeOpenAiResponse(validOutput);
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await makeProvider().extractBiomarkers({ documentText: DOCUMENT_TEXT });

      expect(calls).toBe(2);
      expect(result.output).toEqual(validOutput);
    }, 10_000);

    it("does NOT retry when the response content is non-JSON (parse failure throws immediately)", async () => {
      const { fetchMock } = captureFetch(() => makeRawContentResponse("not json {"));
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        makeProvider().extractBiomarkers({ documentText: DOCUMENT_TEXT }),
      ).rejects.toThrow("non-JSON content");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws when the API returns empty content", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        makeProvider().extractBiomarkers({ documentText: DOCUMENT_TEXT }),
      ).rejects.toThrow("empty response");
    });
  });

  describe("abort propagation", () => {
    it("forwards the AbortSignal to fetch and rejects when already aborted", async () => {
      const receivedSignals: Array<AbortSignal | null | undefined> = [];
      const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        receivedSignals.push(init?.signal);
        if (init?.signal?.aborted) {
          throw new DOMException("This operation was aborted", "AbortError");
        }
        return makeOpenAiResponse(validOutput);
      });
      vi.stubGlobal("fetch", fetchMock);

      const controller = new AbortController();
      controller.abort();

      await expect(
        makeProvider().extractBiomarkers(
          { documentText: DOCUMENT_TEXT },
          { signal: controller.signal },
        ),
      ).rejects.toThrow();

      // Aborts are not retried.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(receivedSignals[0]).toBe(controller.signal);
    });
  });

  describe("usage tracking", () => {
    it("captures token counts, latency, retries, and the model id", async () => {
      const { fetchMock } = captureFetch(() =>
        makeOpenAiResponse(validOutput, {
          prompt_tokens: 150,
          completion_tokens: 75,
          total_tokens: 225,
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await makeProvider({ model: "gpt-4o" }).extractBiomarkers({
        documentText: DOCUMENT_TEXT,
      });

      expect(result.usage?.promptTokens).toBe(150);
      expect(result.usage?.completionTokens).toBe(75);
      expect(result.usage?.totalTokens).toBe(225);
      expect(result.usage?.retries).toBe(0);
      expect(result.usage?.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.usage?.model).toBe("gpt-4o");
    });
  });

  describe("createLabExtractionProviderFromEnv", () => {
    it("returns null when OPENAI_API_KEY is missing (typed llm_unavailable instead of a boot crash)", () => {
      expect(
        createLabExtractionProviderFromEnv({ OPENAI_MODEL: TEST_MODEL }),
      ).toBeNull();
      expect(
        createLabExtractionProviderFromEnv({
          OPENAI_API_KEY: "   ",
          OPENAI_MODEL: TEST_MODEL,
        }),
      ).toBeNull();
    });

    it("honors the OPENAI_MODEL_LAB_EXTRACTION override", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = createLabExtractionProviderFromEnv({
        OPENAI_API_KEY: TEST_API_KEY,
        OPENAI_MODEL: TEST_MODEL,
        OPENAI_MODEL_LAB_EXTRACTION: "gpt-4o",
      });

      await provider?.extractBiomarkers({ documentText: DOCUMENT_TEXT });

      expect(getLastBody()["model"]).toBe("gpt-4o");
    });

    it("falls back to OPENAI_MODEL when no lab-extraction override is set", async () => {
      const { fetchMock, getLastBody } = captureFetch(() => makeOpenAiResponse(validOutput));
      vi.stubGlobal("fetch", fetchMock);

      const provider = createLabExtractionProviderFromEnv({
        OPENAI_API_KEY: TEST_API_KEY,
        OPENAI_MODEL: TEST_MODEL,
      });

      await provider?.extractBiomarkers({ documentText: DOCUMENT_TEXT });

      expect(getLastBody()["model"]).toBe(TEST_MODEL);
    });
  });
});
