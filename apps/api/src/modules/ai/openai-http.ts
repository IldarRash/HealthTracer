import type { ProviderUsage } from "@health/ai";

/**
 * Shared OpenAI chat-completions HTTP helpers.
 *
 * Extracted from `openai-coach-provider.ts` so every OpenAI-backed provider in
 * this module (coach fan-out stages, proposal repair) shares one retry/backoff
 * and payload-normalization implementation. Behavior is pinned by the existing
 * `openai-coach-provider.spec.ts` retry/usage/error tests.
 *
 * Security note: this module never logs request or response payload contents.
 */

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

/** Maximum total attempts (1 initial + up to MAX_RETRIES retries). */
const MAX_RETRIES = 2 as const;

/** Base delay in ms for exponential backoff: attempt 1 ≈ 300ms, attempt 2 ≈ 1200ms. */
const RETRY_BASE_DELAY_MS = 300 as const;

/**
 * Returns true for conditions that should trigger a retry.
 * ONLY retries on network failures (fetch rejection) or HTTP 429/5xx.
 * Does NOT retry on 4xx (except 429) or parse failures.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelayMs(attempt: number): number {
  // attempt is 1-based: first retry = 300ms, second retry = 1200ms (4×base)
  return RETRY_BASE_DELAY_MS * Math.pow(4, attempt - 1);
}

/** Returns true when the error looks like a network/transport failure (not an HTTP/parse error). */
function isNetworkError(error: Error): boolean {
  // fetch() rejects with a TypeError on network failures; other errors (protocol,
  // CORS, etc.) may also surface this way. This is a heuristic — it prevents retrying
  // application-level 4xx JSON errors masquerading as thrown errors.
  return error instanceof TypeError || error.name === "TypeError";
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };

    const id = setTimeout(() => {
      // Detach the abort listener so repeated sleeps on one long-lived signal
      // don't accumulate listeners after the timeout resolves.
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
  error?: {
    message?: string;
  };
}

export interface OpenAiJsonCompletionRequest {
  apiKey: string;
  /** Full chat-completions request body (model, messages, response_format, ...). */
  body: Record<string, unknown>;
  /** Model id recorded on the returned usage metadata. */
  model: string;
  /** Optional per-call abort signal so retries stay within the caller's timeout budget. */
  signal?: AbortSignal;
  /** Label used in error messages (e.g. "OpenAI coach provider"). Never includes payloads. */
  errorLabel: string;
}

/**
 * Executes a fetch against the OpenAI chat-completions endpoint with bounded
 * retries and returns the parsed JSON content payload plus usage metadata.
 *
 * Retry policy:
 *  - Network errors (fetch rejection): retry
 *  - HTTP 429 (rate limit): retry with backoff
 *  - HTTP 5xx: retry with backoff
 *  - HTTP 4xx other than 429: throw immediately (no retry)
 *  - Schema/parse failures (content parse): throw immediately (no retry)
 */
export async function fetchOpenAiJsonCompletionWithRetry(
  request: OpenAiJsonCompletionRequest,
): Promise<{ payload: unknown; usage: ProviderUsage }> {
  const { apiKey, body, model, signal, errorLabel } = request;
  const startMs = Date.now();
  let retries = 0;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      const delay = retryDelayMs(attempt - 1);
      await sleep(delay, signal);
    }

    try {
      const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal,
      });

      const completionResponse = (await response.json()) as OpenAiChatCompletionResponse;

      if (!response.ok) {
        const message =
          completionResponse.error?.message ??
          `${errorLabel} request failed with status ${response.status}.`;

        if (!isRetryableStatus(response.status)) {
          throw new Error(message);
        }

        // Retryable HTTP error — track and loop
        lastError = new Error(message);
        retries++;
        continue;
      }

      const content = completionResponse.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error(`${errorLabel} returned an empty response.`);
      }

      let parsedPayload: unknown;

      try {
        parsedPayload = JSON.parse(content) as unknown;
      } catch {
        throw new Error(`${errorLabel} returned non-JSON content.`);
      }

      const latencyMs = Date.now() - startMs;
      const usage: ProviderUsage = {
        promptTokens: completionResponse.usage?.prompt_tokens ?? 0,
        completionTokens: completionResponse.usage?.completion_tokens ?? 0,
        totalTokens: completionResponse.usage?.total_tokens ?? 0,
        latencyMs,
        retries,
        model,
      };

      return { payload: parsedPayload, usage };
    } catch (error) {
      // On the last attempt, rethrow. For network errors on non-final attempts, retry.
      if (attempt >= 1 + MAX_RETRIES) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      if (!(error instanceof Error) || !isNetworkError(error)) {
        // Non-network JS error (including parse failures) — do not retry
        throw error;
      }

      // Network error on a non-final attempt: retry
      lastError = error;
      retries++;
    }
  }

  // Exhausted all attempts
  throw lastError ?? new Error(`${errorLabel}: all retry attempts exhausted.`);
}

// ---------------------------------------------------------------------------
// Payload normalization
// ---------------------------------------------------------------------------

/**
 * Recursively strip object properties whose value is exactly `null`.
 *
 * OpenAI strict mode forces every field to appear in `required`, so optional
 * fields are declared as nullable-required (type: ["T","null"]) in the wire
 * schema. Zod `.optional()` fields accept `undefined` but not `null`, so we
 * strip all explicit nulls before the Zod parse.
 *
 * Rules:
 *  - Only removes properties whose value is exactly `null` from plain objects.
 *  - Recurses into object property values and array element objects.
 *  - Never removes array elements themselves (only their null-valued properties).
 *  - Fields that are `.nullable()` WITHOUT `.optional()` and have a `.default(null)`
 *    in Zod (e.g. `selectedAction`) are safe to strip: the Zod default re-applies
 *    null when the field is absent.
 *
 * Security note: MUST NOT log payload content.
 */
export function stripExplicitNulls(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stripExplicitNulls(item));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== null) {
        result[k] = stripExplicitNulls(v);
      }
    }

    return result;
  }

  return value;
}
