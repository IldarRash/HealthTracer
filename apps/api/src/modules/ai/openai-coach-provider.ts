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
import { fetchOpenAiJsonCompletionWithRetry, stripExplicitNulls } from "./openai-http.js";
import {
  DOMAIN_LLM_STEP_SCHEMA_NAME,
  FINAL_DECISION_SCHEMA_NAME,
  ROUTER_DECISION_SCHEMA_NAME,
  buildDomainStepWireSchema,
  finalDecisionWireSchema,
  routerDecisionWireSchema,
} from "./openai-wire-schemas.js";

/** Error-message label threaded into the shared OpenAI HTTP helper. */
const PROVIDER_ERROR_LABEL = "OpenAI coach provider";

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

    // Per-turn wire schema: strict:true with typed per-intent candidate
    // envelopes when every allowed proposal intent has an LLM emission schema
    // (packages/types/src/llm-emission); otherwise the permissive shape with
    // strict:false — a graceful fallback with no behavior change. Zod still
    // validates post-receive and the executor degrades safely on mismatch.
    const domainStepWireSchema = buildDomainStepWireSchema(
      request.allowedProposalIntents,
    );
    const domainStepSchema = {
      name: DOMAIN_LLM_STEP_SCHEMA_NAME,
      schema: domainStepWireSchema.schema,
      strict: domainStepWireSchema.strict,
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
   * Delegates to the shared OpenAI HTTP helper (`openai-http.ts`) with this
   * provider's API key and error label. Retry/backoff policy lives there.
   */
  private async fetchWithRetry(
    body: Record<string, unknown>,
    model: string,
    signal?: AbortSignal,
  ): Promise<{ payload: unknown; usage: ProviderUsage }> {
    return fetchOpenAiJsonCompletionWithRetry({
      apiKey: this.options.apiKey,
      body,
      model,
      signal,
      errorLabel: PROVIDER_ERROR_LABEL,
    });
  }
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
  const deepReviewSuffix =
    request.deepReview !== undefined
      ? buildDeepReviewSuffix(request.deepReview, DEEP_REVIEW_DOMAIN_INSTRUCTION)
      : "";

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
    deepReviewSuffix,
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

// ---------------------------------------------------------------------------
// Deep-review sufficiency framing (Phase 4)
//
// Injected into the {{deepReviewSuffix}} placeholder of the decision/domain
// templates ONLY when the request carries a deepReview block — mirrors the
// lowConfidenceRoute → LOW_CONFIDENCE_ROUTE_INSTRUCTION wiring exactly.
// Placed in the DYNAMIC SUFFIX only so the static prefix stays cache-stable.
// ---------------------------------------------------------------------------

/**
 * Decision-maker deep-review instruction: separate observed from uncertain,
 * name the analyzed range in the user-facing reply, never diagnostic/treatment
 * wording. The analyzed-range and follow-up sentences are appended by
 * buildDeepReviewSuffix from the typed deepReview block.
 */
export const DEEP_REVIEW_DECISION_INSTRUCTION =
  "DEEP REVIEW NOTE: This turn is a long-range progress review over aggregated history buckets. " +
  "In your reply, clearly separate what is OBSERVED in the provided progress history (cite concrete bucket dates and numbers) " +
  "from what is UNCERTAIN — never present an interpretation as established fact. " +
  "Explicitly name the analyzed time range in the reply. " +
  "Never use diagnosis, disease, or medical-care wording — describe wellness trends only.";

/**
 * Domain-LLM deep-review instruction: ground the summary and candidate reasons
 * in the progress-history buckets; same observed-vs-uncertain and analyzed-range
 * framing as the decision instruction.
 */
export const DEEP_REVIEW_DOMAIN_INSTRUCTION =
  "DEEP REVIEW NOTE: This turn is a long-range progress review over aggregated history buckets. " +
  "Ground your summary in the provided progressHistory buckets: state what is OBSERVED (cite concrete bucket dates and numbers) " +
  "and what is UNCERTAIN — never present an interpretation as established fact. " +
  "Candidate proposal reasons MUST cite specific bucket evidence (dates and numbers). " +
  "Explicitly name the analyzed time range. " +
  "Never use diagnosis, disease, or medical-care wording — describe wellness trends only.";

/**
 * Compose the full deep-review suffix from the typed deepReview block:
 *  - the stage instruction (decision/domain constant above),
 *  - the analyzed range (granted period; mentions the requested period when clamped),
 *  - when dataQuality is not "sufficient": exactly ONE narrowing follow-up
 *    (period or domain — never both, never more than one question).
 *
 * Numbers come from the validated deepReview block only — no user text, no health data.
 */
function buildDeepReviewSuffix(
  deepReview: NonNullable<FinalDecisionRequest["deepReview"]>,
  instruction: string,
): string {
  const clamped =
    deepReview.requestedPeriodDays !== null &&
    deepReview.requestedPeriodDays > deepReview.grantedPeriodDays;

  const analyzedRangeSentence = clamped
    ? `The analyzed range is the last ${deepReview.grantedPeriodDays} days: the user asked for ` +
      `${deepReview.requestedPeriodDays} days, which was clamped to ${deepReview.grantedPeriodDays} days — say so honestly.`
    : `The analyzed range is the last ${deepReview.grantedPeriodDays} days.`;

  const followUpSentence =
    deepReview.dataQuality === "sufficient"
      ? ""
      : ` Data quality for this period is ${deepReview.dataQuality}: state plainly what the data does not show, ` +
        "and offer exactly ONE narrowing follow-up — either a shorter period or a single domain " +
        "(training, nutrition, or recovery) — never both and never more than one question.";

  return `${instruction} ${analyzedRangeSentence}${followUpSentence}`;
}

function buildOpenAiFinalDecisionPrompt(
  request: FinalDecisionRequest,
  promptTemplates: CompiledPromptTemplates,
): string {
  const candidateSummaries = request.candidateProposalSummaries ?? [];
  const recentMessages = request.recentMessages ?? [];
  const lowConfidenceRouteSuffix =
    request.lowConfidenceRoute === true ? LOW_CONFIDENCE_ROUTE_INSTRUCTION : "";
  const deepReviewSuffix =
    request.deepReview !== undefined
      ? buildDeepReviewSuffix(request.deepReview, DEEP_REVIEW_DECISION_INSTRUCTION)
      : "";

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
    deepReviewSuffix,
  });
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
