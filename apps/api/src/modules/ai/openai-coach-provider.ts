import type {
  CoachAiProvider,
  ProviderCallResult,
  ProviderUsage,
} from "@health/ai";
import type {
  CompiledPromptTemplates,
  DomainLlmStepOutputInput,
  DomainLlmStepRequest,
  FinalDecisionOutputInput,
  FinalDecisionRequest,
  RouterDecisionOutputInput,
  RouterDecisionRequest,
} from "@health/types";
import {
  clampRouterDecisionOutput,
  createFallbackRouterDecision,
  domainLlmStepOutputSchema,
  finalDecisionOutputSchema,
  getDefaultCompiledPromptTemplates,
  routerDecisionOutputSchema,
  validateDomainLlmStepOutputShape,
  validateFinalDecisionOutputShape,
  validateRouterDecisionOutputShape,
} from "@health/types";
import {
  DOMAIN_LLM_STEP_SCHEMA_NAME,
  FINAL_DECISION_SCHEMA_NAME,
  ROUTER_DECISION_SCHEMA_NAME,
  domainLlmStepWireSchema,
  finalDecisionWireSchema,
  routerDecisionWireSchema,
} from "./openai-wire-schemas.js";

export class OpenAiCoachProviderMissingKeyError extends Error {
  constructor() {
    super(
      "OpenAI coach provider requires OPENAI_API_KEY, but it is not configured. Set OPENAI_API_KEY.",
    );
    this.name = "OpenAiCoachProviderMissingKeyError";
  }
}

/** Per-stage model overrides. Each field falls back to the top-level `model` when absent. */
export interface OpenAiCoachProviderStageModels {
  router: string;
  domain: string;
  decision: string;
}

export interface OpenAiCoachProviderOptions {
  apiKey: string;
  /** Default model used for any stage that lacks an explicit override. */
  model: string;
  /**
   * Resolved per-stage models (router / domain / decision).
   * When absent, all stages fall back to `model`. Built by the factory for the
   * live provider; omitted when the options object is reused by other providers
   * (e.g. OpenAiContextCompressionProvider) that don't need per-stage routing.
   */
  models?: OpenAiCoachProviderStageModels;
  promptTemplates?: CompiledPromptTemplates;
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

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class OpenAiCoachProvider implements CoachAiProvider {
  private readonly promptTemplates: CompiledPromptTemplates;
  private readonly stageModels: OpenAiCoachProviderStageModels;

  constructor(private readonly options: OpenAiCoachProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new OpenAiCoachProviderMissingKeyError();
    }

    this.promptTemplates = options.promptTemplates ?? getDefaultCompiledPromptTemplates();
    // Default all stages to the top-level model when per-stage overrides are absent.
    this.stageModels = options.models ?? {
      router: options.model,
      domain: options.model,
      decision: options.model,
    };
  }

  // ---------------------------------------------------------------------------
  // Fan-out pipeline methods
  // ---------------------------------------------------------------------------

  async generateRouterDecision(
    request: RouterDecisionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderCallResult<RouterDecisionOutputInput>> {
    const systemPrompt = buildOpenAiRouterDecisionPrompt(request, this.promptTemplates);
    const { payload, usage } = await this.requestJsonCompletion(
      systemPrompt,
      request.normalizedText,
      request.recentMessageHints,
      { name: ROUTER_DECISION_SCHEMA_NAME, schema: routerDecisionWireSchema },
      this.stageModels.router,
      options?.signal,
    );

    const normalizedPayload = stripExplicitNulls(payload);

    const shapeErrors = validateRouterDecisionOutputShape(normalizedPayload);

    if (shapeErrors.length > 0) {
      return { output: createFallbackRouterDecision(), usage };
    }

    return {
      output: clampRouterDecisionOutput(routerDecisionOutputSchema.parse(normalizedPayload)),
      usage,
    };
  }

  async generateDomainStep(
    request: DomainLlmStepRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderCallResult<DomainLlmStepOutputInput>> {
    const systemPrompt = buildOpenAiDomainStepPrompt(request, this.promptTemplates);
    const imageDataUris = resolveImageDataUrisFromAttachmentContext(request);
    const textBlocks = resolveTextAttachmentBlocks(request);

    // Route to multimodal completion when images OR text blocks are present.
    // Text blocks appear as labeled user content — never in the system prompt
    // (preserves the cacheable static prefix).
    const hasMultimodalContent = imageDataUris.length > 0 || textBlocks.length > 0;

    // strict:false — the domain step schema has open-ended objects (tool input,
    // per-intent candidateProposals) and OpenAI strict mode rejects any object
    // with additionalProperties:true. The schema still guides generation; Zod
    // validates post-receive and the executor degrades safely on mismatch.
    const domainStepSchema = {
      name: DOMAIN_LLM_STEP_SCHEMA_NAME,
      schema: domainLlmStepWireSchema,
      strict: false,
    };

    const { payload, usage } =
      hasMultimodalContent
        ? await this.requestMultimodalJsonCompletion(
            systemPrompt,
            request.userMessage,
            request.recentMessages,
            imageDataUris,
            textBlocks,
            domainStepSchema,
            this.stageModels.domain,
            options?.signal,
          )
        : await this.requestJsonCompletion(
            systemPrompt,
            request.userMessage,
            request.recentMessages,
            domainStepSchema,
            this.stageModels.domain,
            options?.signal,
          );

    // The wire schema wraps the tool_request/domain_answer union in a root
    // `result` object (OpenAI requires a type:"object" root). Unwrap it, with a
    // flat-payload fallback for models/tests that emit the union directly.
    const unwrappedPayload =
      payload !== null &&
      typeof payload === "object" &&
      "result" in payload
        ? (payload as { result: unknown }).result
        : payload;

    // Strip OpenAI strict-mode explicit nulls so all three methods' payloads are
    // normalised consistently before Zod parse. This covers every nullable-required
    // wire field (directCommand, calorie fields, tool_request.rationale, etc.).
    const normalizedPayload = stripExplicitNulls(unwrappedPayload);

    const shapeErrors = validateDomainLlmStepOutputShape(normalizedPayload);

    if (shapeErrors.length > 0) {
      throw new Error(
        `OpenAI domain step (${request.domain}) returned invalid output: ${shapeErrors.join(" ")}`,
      );
    }

    return { output: domainLlmStepOutputSchema.parse(normalizedPayload), usage };
  }

  async generateFinalDecision(
    request: FinalDecisionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderCallResult<FinalDecisionOutputInput>> {
    const systemPrompt = buildOpenAiFinalDecisionPrompt(request, this.promptTemplates);
    const recentMessages = request.recentMessages ?? [];
    const { payload, usage } = await this.requestJsonCompletion(
      systemPrompt,
      request.userMessage,
      recentMessages,
      { name: FINAL_DECISION_SCHEMA_NAME, schema: finalDecisionWireSchema },
      this.stageModels.decision,
      options?.signal,
    );

    // Strip explicit nulls — selectedAction: null is .nullable().default(null), so
    // stripping null is safe: the Zod default re-applies null after undefined is seen.
    const normalizedPayload = stripExplicitNulls(payload);

    const shapeErrors = validateFinalDecisionOutputShape(normalizedPayload);

    if (shapeErrors.length > 0) {
      // Throw rather than returning a fallback so that DecisionMakerExecutorService's
      // catch → retry-once → turnError path owns the degradation. This mirrors the
      // malformed-JSON path below (line ~237) which also throws.
      // The "[degraded]" fallback reply must never reach persisted/streamed output;
      // the orchestrator substitutes " " content when turnError is set.
      throw new Error(
        `OpenAI final-decision returned forbidden-key shape: ${shapeErrors.join(" ")}`,
      );
    }

    return { output: finalDecisionOutputSchema.parse(normalizedPayload), usage };
  }

  // ---------------------------------------------------------------------------
  // Private — HTTP fetch with retry + strict structured output
  // ---------------------------------------------------------------------------

  /**
   * Fetch a JSON-mode chat completion with strict structured output.
   *
   * Retries up to MAX_RETRIES times on network errors, HTTP 429, or HTTP 5xx.
   * Does NOT retry on other 4xx or parse failures.
   * Respects a per-call AbortSignal so retries stay within the domain timeout budget.
   */
  private async requestJsonCompletion(
    systemPrompt: string,
    userMessage: string,
    recentMessages: ReadonlyArray<{
      role: "user" | "assistant" | "system";
      content: string;
    }>,
    jsonSchema: { name: string; schema: unknown; strict?: boolean },
    model: string,
    signal?: AbortSignal,
  ): Promise<{ payload: unknown; usage: ProviderUsage }> {
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userMessage },
    ];

    return this.fetchWithRetry(
      {
        model,
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: jsonSchema.name,
            strict: jsonSchema.strict ?? true,
            schema: jsonSchema.schema,
          },
        },
        messages,
      },
      model,
      signal,
    );
  }

  /**
   * Multimodal completion — sends the user message alongside image data URIs and/or
   * labeled text file content blocks. Used by generateDomainStep when image or document
   * attachments are present.
   *
   * Safety:
   *  - Images reach the LLM without a pre-upload consent gate (temporary relaxation; see pipeline docs).
   *  - Text file content appears as labeled user-content text blocks — NEVER in the system prompt
   *    (preserves the cacheable static prefix and prevents accidental system-prompt contamination).
   *  - The imageDataUris and textBlocks arrays are pre-filtered by the caller; this method trusts them.
   */
  private async requestMultimodalJsonCompletion(
    systemPrompt: string,
    userMessage: string,
    recentMessages: ReadonlyArray<{
      role: "user" | "assistant" | "system";
      content: string;
    }>,
    imageDataUris: readonly string[],
    textBlocks: readonly string[],
    jsonSchema: { name: string; schema: unknown; strict?: boolean },
    model: string,
    signal?: AbortSignal,
  ): Promise<{ payload: unknown; usage: ProviderUsage }> {
    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "low" } }
    > = [
      // Text blocks (extracted document file content) come first so the user message follows.
      ...textBlocks.map((block) => ({ type: "text" as const, text: block })),
      { type: "text", text: userMessage },
      ...imageDataUris.map((uri) => ({
        type: "image_url" as const,
        image_url: { url: uri, detail: "low" as const },
      })),
    ];

    return this.fetchWithRetry(
      {
        model,
        temperature: 0.2,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: jsonSchema.name,
            strict: jsonSchema.strict ?? true,
            schema: jsonSchema.schema,
          },
        },
        messages: [
          { role: "system" as const, content: systemPrompt },
          ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: userContent },
        ],
      },
      model,
      signal,
    );
  }

  /**
   * Executes a single fetch against the OpenAI completions endpoint with
   * bounded retries and returns the parsed JSON payload plus usage metadata.
   *
   * Retry policy:
   *  - Network errors (fetch rejection): retry
   *  - HTTP 429 (rate limit): retry with backoff
   *  - HTTP 5xx: retry with backoff
   *  - HTTP 4xx other than 429: throw immediately (no retry)
   *  - Schema/parse failures (content parse): throw immediately (no retry)
   */
  private async fetchWithRetry(
    body: Record<string, unknown>,
    model: string,
    signal?: AbortSignal,
  ): Promise<{ payload: unknown; usage: ProviderUsage }> {
    const startMs = Date.now();
    let retries = 0;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 1 + MAX_RETRIES; attempt++) {
      if (attempt > 1) {
        const delay = retryDelayMs(attempt - 1);
        await sleep(delay, signal);
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

        const completionResponse = (await response.json()) as OpenAiChatCompletionResponse;

        if (!response.ok) {
          const message =
            completionResponse.error?.message ??
            `OpenAI coach provider request failed with status ${response.status}.`;

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
          throw new Error("OpenAI coach provider returned an empty response.");
        }

        let parsedPayload: unknown;

        try {
          parsedPayload = JSON.parse(content) as unknown;
        } catch {
          throw new Error("OpenAI coach provider returned non-JSON content.");
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
    throw lastError ?? new Error("OpenAI coach provider: all retry attempts exhausted.");
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

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

    const id = setTimeout(resolve, ms);

    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

// ---------------------------------------------------------------------------
// Step 7b — multimodal helpers
// ---------------------------------------------------------------------------

/**
 * Extract image data URIs from the domain step request's attachment context.
 *
 * Returns an array of data URIs ready for the OpenAI vision endpoint. Only
 * image/* MIME types are included — PDFs and other non-image MIMEs cannot be
 * sent to the vision endpoint. Items without an imageDataUri are skipped.
 *
 * Note: imageDataUri is set by DomainLlmExecutorService.buildAttachmentContext
 * only when the domain is nutrition/health AND the attachment is an image MIME.
 * There is no consent filter — all images reach the LLM regardless of category.
 */
function resolveImageDataUrisFromAttachmentContext(request: DomainLlmStepRequest): string[] {
  const items = request.attachmentContext?.items;

  if (!items || items.length === 0) {
    return [];
  }

  return items
    .filter((item) => {
      if (!item.mimeType.startsWith("image/")) {
        return false;
      }

      return typeof item.imageDataUri === "string" && item.imageDataUri.length > 0;
    })
    .map((item) => item.imageDataUri as string);
}

/**
 * Resolve labeled text content blocks from document_file attachments in the request.
 *
 * Each block is a labeled user-content text string:
 *   `ATTACHED FILE "<filename>" (user-provided context, may be truncated):\n<textContent>`
 *
 * These go into the user message content array — NEVER into the system prompt.
 * Preserves the static prefix/suffix structure for prompt-cache hits.
 *
 * Safety:
 *  - Only items with textContent set are included (document_file MIMEs with successful extraction).
 *  - Text content is ephemeral — not persisted or logged beyond this call.
 *  - File content never touches the system prompt.
 */
function resolveTextAttachmentBlocks(request: DomainLlmStepRequest): string[] {
  const items = request.attachmentContext?.items;

  if (!items || items.length === 0) {
    return [];
  }

  const blocks: string[] = [];

  for (const item of items) {
    if (typeof item.textContent === "string" && item.textContent.length > 0) {
      const label = item.filename ?? item.attachmentRefId;
      blocks.push(
        `ATTACHED FILE "${label}" (user-provided context, may be truncated):\n${item.textContent}`,
      );
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Fan-out prompt builders
// ---------------------------------------------------------------------------

function buildOpenAiRouterDecisionPrompt(
  request: RouterDecisionRequest,
  promptTemplates: CompiledPromptTemplates,
): string {
  return promptTemplates.renderRouterDecision({
    normalizedText: request.normalizedText,
    originalText: request.originalText,
    detectedLanguage: request.detectedLanguage ?? "en",
    preprocessorJson: JSON.stringify(request.preprocessor),
    attachmentHintsJson: JSON.stringify(request.attachmentHints),
    recentMessageHintsJson: JSON.stringify(request.recentMessageHints),
    availableDomainsJson: JSON.stringify(request.availableDomains),
    safetyGuardrailsJson: JSON.stringify(request.safetyGuardrails),
  });
}

function buildOpenAiDomainStepPrompt(
  request: DomainLlmStepRequest,
  promptTemplates: CompiledPromptTemplates,
): string {
  const attachmentContextSummary = buildAttachmentContextSummary(request);

  return promptTemplates.renderDomainStep(request.domain, {
    domain: request.domain,
    userMessage: request.userMessage,
    iteration: String(request.iteration),
    maxIterations: String(request.maxIterations),
    priorToolResultsJson: request.priorToolResults.length
      ? JSON.stringify(request.priorToolResults)
      : "none",
    coachingContextJson: JSON.stringify(request.coachingContext),
    allowedTools: request.allowedTools.length ? request.allowedTools.join(", ") : "none",
    allowedProposalIntents: request.allowedProposalIntents.length
      ? request.allowedProposalIntents.join(", ")
      : "none",
    safetyFlags: request.safetyFlags.length ? request.safetyFlags.join(", ") : "none",
    safetyConstraints: request.safetyConstraints.length
      ? request.safetyConstraints.join("\n- ")
      : "Do not diagnose, prescribe, or claim to treat diseases.",
    attachmentContextJson: attachmentContextSummary,
    responseLanguage: request.responseLanguage ?? "",
  });
}

/**
 * Build a compact JSON summary of the attachment context for inclusion in the
 * domain system prompt. The summary omits imageDataUri and textContent (too large
 * for system prompt) and focuses on structural metadata so the LLM knows what
 * attachments are present and whether content was extracted.
 *
 * - hasImage: true when an image MIME with imageDataUri is present (multimodal content
 *   follows in the user message content array).
 * - hasText: true when textContent was extracted and included in the user message
 *   as a labeled text block.
 * - filename: the original filename of the document (e.g. "training-plan.pdf").
 *
 * Safety: textContent and imageDataUri are NEVER included in the system prompt.
 */
function buildAttachmentContextSummary(request: DomainLlmStepRequest): string {
  if (!request.attachmentContext?.items.length) {
    return "none";
  }

  const summary = request.attachmentContext.items.map((item) => ({
    category: item.category,
    mimeType: item.mimeType,
    consentState: item.consentState,
    hasImage: item.mimeType.startsWith("image/") && !!item.imageDataUri,
    hasText: typeof item.textContent === "string" && item.textContent.length > 0,
    ...(item.filename ? { filename: item.filename } : {}),
  }));

  return JSON.stringify(summary);
}

/**
 * Instruction injected into the decision-maker prompt suffix when routing
 * confidence was low. Instructs the model to ask one short clarifying question
 * in the response language rather than guessing the user's intent.
 *
 * Placed in the DYNAMIC SUFFIX only so the static prefix remains unchanged
 * (preserves prompt-cache hits for the cached prefix segment).
 */
const LOW_CONFIDENCE_ROUTE_INSTRUCTION =
  "ROUTING NOTE: The router had low confidence routing this message to a specific domain. " +
  "If the user's goal is ambiguous, ask ONE short clarifying question in the response language " +
  "to understand what they need, rather than guessing. Do not make assumptions about domain.";

function buildOpenAiFinalDecisionPrompt(
  request: FinalDecisionRequest,
  promptTemplates: CompiledPromptTemplates,
): string {
  const candidateSummaries = request.candidateProposalSummaries ?? [];
  const recentMessages = request.recentMessages ?? [];
  const lowConfidenceRouteSuffix =
    request.lowConfidenceRoute === true ? LOW_CONFIDENCE_ROUTE_INSTRUCTION : "";

  return promptTemplates.renderFinalDecision({
    userMessage: request.userMessage,
    domainOutputsJson: JSON.stringify(request.domainOutputs),
    actionVariantCatalogJson: JSON.stringify(request.actionVariantCatalog),
    candidateProposalSummariesJson: candidateSummaries.length
      ? JSON.stringify(candidateSummaries)
      : "[]",
    recentMessagesJson: recentMessages.length ? JSON.stringify(recentMessages) : "[]",
    safetyFlags: request.safetyFlags.length ? request.safetyFlags.join(", ") : "none",
    safetyConstraints: request.safetyConstraints.length
      ? request.safetyConstraints.join("\n- ")
      : "Do not diagnose, prescribe, or claim to treat diseases.",
    responseLanguage: request.responseLanguage ?? "",
    lowConfidenceRouteSuffix,
  });
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
function stripExplicitNulls(value: unknown): unknown {
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

export function createOpenAiCoachProvider(
  apiKey: string | undefined,
  model: string,
  stageModelOverrides: { router?: string; domain?: string; decision?: string } = {},
  promptTemplates?: CompiledPromptTemplates,
): OpenAiCoachProvider {
  if (!apiKey?.trim()) {
    throw new OpenAiCoachProviderMissingKeyError();
  }

  const models: OpenAiCoachProviderStageModels = {
    router: stageModelOverrides.router ?? model,
    domain: stageModelOverrides.domain ?? model,
    decision: stageModelOverrides.decision ?? model,
  };

  return new OpenAiCoachProvider({ apiKey, model, models, promptTemplates });
}
