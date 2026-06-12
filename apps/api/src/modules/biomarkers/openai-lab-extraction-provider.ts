import type {
  LabExtractionProvider,
  LabExtractionRequest,
  ProviderCallResult,
  ProviderUsage,
} from "@health/ai";
import type { LabExtractionOutputInput } from "@health/types";
import { BIOMARKER_CATALOG } from "@health/types";
import {
  LAB_EXTRACTION_SCHEMA_NAME,
  labExtractionWireSchema,
} from "./lab-extraction-wire-schema.js";

/**
 * Live OpenAI implementation of the dedicated lab-extraction stage.
 *
 * This provider is OUT-OF-BAND from the chat fan-out pipeline: it mirrors the
 * HTTP/retry/strict-structured-output mechanics of
 * `../ai/openai-coach-provider.ts` (which the chat pipeline owns and this
 * module must not modify) but is otherwise independent.
 *
 * Privacy invariants:
 *  - `documentText` goes ONLY into the user message — never the system prompt
 *    (the system prompt stays static and prompt-cacheable) and never into any
 *    error message, log line, or persisted field.
 *  - All error messages thrown from this file are fixed strings (plus at most
 *    an HTTP status code) so no document fragment can leak through them.
 */

export class OpenAiLabExtractionProviderMissingKeyError extends Error {
  constructor() {
    super(
      "OpenAI lab-extraction provider requires OPENAI_API_KEY, but it is not configured.",
    );
    this.name = "OpenAiLabExtractionProviderMissingKeyError";
  }
}

export interface OpenAiLabExtractionProviderOptions {
  apiKey: string;
  model: string;
}

interface OpenAiUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: OpenAiUsage;
}

// ---------------------------------------------------------------------------
// Retry configuration — same policy as the coach provider:
// up to 2 retries with 300ms/1200ms exponential backoff, ONLY on network
// failures and HTTP 429/5xx. Never on other 4xx or content parse failures.
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2 as const;
const RETRY_BASE_DELAY_MS = 300 as const;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelayMs(attempt: number): number {
  return RETRY_BASE_DELAY_MS * Math.pow(4, attempt - 1);
}

/** fetch() rejects with a TypeError on network/transport failures. */
function isNetworkError(error: Error): boolean {
  return error instanceof TypeError || error.name === "TypeError";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const id = setTimeout(resolve, ms);

    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

// ---------------------------------------------------------------------------
// Static system prompt — built once from the biomarker catalog.
//
// The whole system prompt is static (no per-request content) so OpenAI can
// cache it as a prompt prefix. The document text goes ONLY in the user message.
// ---------------------------------------------------------------------------

function buildCatalogLine(entry: (typeof BIOMARKER_CATALOG)[number]): string {
  return `${entry.key} — ${entry.displayLabel} (${entry.canonicalUnit}; accepted: ${entry.acceptedUnits.join(", ")}) aliases: ${entry.aliases.join(", ")}`;
}

export const LAB_EXTRACTION_SYSTEM_PROMPT: string = [
  "You extract laboratory biomarker measurements into structured data for a wellness app.",
  "You receive the raw text of a user-uploaded document in the user message.",
  "",
  "BIOMARKER CATALOG — the ONLY allowed biomarkerKey values:",
  ...BIOMARKER_CATALOG.map(buildCatalogLine),
  "",
  "STRICT RULES:",
  "- Map a measurement to a catalog key ONLY when you are confident it matches the key, its display label, or one of its aliases (English or Russian).",
  "- Count every marker you cannot confidently map in unmappedMarkerCount. Never return unmapped marker names.",
  "- Never infer, compute, convert, or estimate values. Copy each value, unit, and reference range exactly as printed in the document.",
  "- Set observedAt (YYYY-MM-DD) only when a collection or report date is explicitly present in the document; otherwise use null.",
  "- Per-reading observedAt: only when that specific reading shows its own explicit date; otherwise null.",
  "- If the document is not laboratory test results, set isLabReport to false with an empty readings array.",
  "- Output structured data only: NO commentary, NO interpretation, NO diagnosis, treatment, or medication language anywhere in the output.",
].join("\n");

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class OpenAiLabExtractionProvider implements LabExtractionProvider {
  constructor(private readonly options: OpenAiLabExtractionProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new OpenAiLabExtractionProviderMissingKeyError();
    }
  }

  async extractBiomarkers(
    request: LabExtractionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderCallResult<LabExtractionOutputInput>> {
    const { payload, usage } = await this.fetchWithRetry(
      {
        model: this.options.model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: LAB_EXTRACTION_SCHEMA_NAME,
            strict: true,
            schema: labExtractionWireSchema,
          },
        },
        messages: [
          { role: "system", content: LAB_EXTRACTION_SYSTEM_PROMPT },
          // Document text goes ONLY here — never in the system prompt.
          { role: "user", content: request.documentText },
        ],
      },
      options?.signal,
    );

    // No null-stripping normalization: labExtractionOutputSchema is
    // nullable-required end-to-end (deliberately aligned with strict mode), so
    // explicit nulls are valid Zod input. The calling service owns the
    // safeParse and maps failure to the typed llm_invalid_output failure.
    return { output: payload as LabExtractionOutputInput, usage };
  }

  /**
   * Single OpenAI chat-completions call with bounded retries.
   *
   * Retry policy (same as the coach provider):
   *  - network errors (fetch rejection with TypeError): retry
   *  - HTTP 429 / 5xx: retry with backoff
   *  - other 4xx: throw immediately
   *  - content parse failures: throw immediately (NO retry)
   *
   * Privacy: error messages are fixed strings (+ HTTP status only). The
   * upstream error body and the request payload are never echoed.
   */
  private async fetchWithRetry(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ payload: unknown; usage: ProviderUsage }> {
    const startMs = Date.now();
    let retries = 0;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        await sleep(retryDelayMs(attempt - 1), signal);
      }

      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal,
        });

        const completionResponse =
          (await response.json()) as OpenAiChatCompletionResponse;

        if (!response.ok) {
          const message = `OpenAI lab-extraction request failed with status ${response.status}.`;

          if (!isRetryableStatus(response.status)) {
            throw new Error(message);
          }

          lastError = new Error(message);
          retries++;
          continue;
        }

        const content = completionResponse.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error("OpenAI lab-extraction returned an empty response.");
        }

        let parsedPayload: unknown;

        try {
          parsedPayload = JSON.parse(content) as unknown;
        } catch {
          throw new Error("OpenAI lab-extraction returned non-JSON content.");
        }

        const usage: ProviderUsage = {
          promptTokens: completionResponse.usage?.prompt_tokens ?? 0,
          completionTokens: completionResponse.usage?.completion_tokens ?? 0,
          totalTokens: completionResponse.usage?.total_tokens ?? 0,
          latencyMs: Date.now() - startMs,
          retries,
          model: this.options.model,
        };

        return { payload: parsedPayload, usage };
      } catch (error) {
        if (attempt >= 1 + MAX_RETRIES) {
          throw error instanceof Error ? error : new Error(String(error));
        }

        if (!(error instanceof Error) || !isNetworkError(error)) {
          // Non-network error (HTTP 4xx, parse failure, abort) — do not retry.
          throw error;
        }

        lastError = error;
        retries++;
      }
    }

    throw lastError ?? new Error("OpenAI lab-extraction: all retry attempts exhausted.");
  }
}
