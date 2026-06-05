import type {
  CoachAiProvider,
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
  createFallbackFinalDecision,
  createFallbackRouterDecision,
  domainLlmStepOutputSchema,
  finalDecisionOutputSchema,
  getDefaultCompiledPromptTemplates,
  routerDecisionOutputSchema,
  validateDomainLlmStepOutputShape,
  validateFinalDecisionOutputShape,
  validateRouterDecisionOutputShape,
} from "@health/types";

export class OpenAiCoachProviderMissingKeyError extends Error {
  constructor() {
    super(
      "OpenAI coach provider requires OPENAI_API_KEY, but it is not configured. Set OPENAI_API_KEY.",
    );
    this.name = "OpenAiCoachProviderMissingKeyError";
  }
}

export interface OpenAiCoachProviderOptions {
  apiKey: string;
  model: string;
  promptTemplates?: CompiledPromptTemplates;
}

interface OpenAiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

export class OpenAiCoachProvider implements CoachAiProvider {
  private readonly promptTemplates: CompiledPromptTemplates;

  constructor(private readonly options: OpenAiCoachProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new OpenAiCoachProviderMissingKeyError();
    }

    this.promptTemplates = options.promptTemplates ?? getDefaultCompiledPromptTemplates();
  }

  // ---------------------------------------------------------------------------
  // Fan-out pipeline methods — live via the fan-out path
  // (RouterLlm → parallel domain LLMs → DecisionMaker).
  // ---------------------------------------------------------------------------

  async generateRouterDecision(request: RouterDecisionRequest): Promise<RouterDecisionOutputInput> {
    const systemPrompt = buildOpenAiRouterDecisionPrompt(request, this.promptTemplates);
    const payload = await this.requestJsonCompletion(
      systemPrompt,
      request.normalizedText,
      request.recentMessageHints,
    );

    const shapeErrors = validateRouterDecisionOutputShape(payload);

    if (shapeErrors.length > 0) {
      // Fail-safe: fall back to an empty router decision rather than throwing
      return createFallbackRouterDecision();
    }

    return clampRouterDecisionOutput(routerDecisionOutputSchema.parse(payload));
  }

  async generateDomainStep(request: DomainLlmStepRequest): Promise<DomainLlmStepOutputInput> {
    const systemPrompt = buildOpenAiDomainStepPrompt(request, this.promptTemplates);

    // Step 7b: for nutrition and health domains, resolve any image attachments as
    // multimodal content. The imageDataUri field is populated by
    // DomainLlmExecutorService.buildAttachmentContextWithImages before the provider
    // is called; here we check if any item carries a data URI and route to the
    // vision endpoint. If no data URIs are present, falls back to text-only.
    //
    // Safety floor: medical_document items only reach here with consentState === "granted"
    // (enforced in buildDomainAttachmentContext in domain-llm-executor.service.ts).
    const imageDataUris = resolveImageDataUrisFromAttachmentContext(request);

    const payload =
      imageDataUris.length > 0
        ? await this.requestMultimodalJsonCompletion(
            systemPrompt,
            request.userMessage,
            request.recentMessages,
            imageDataUris,
          )
        : await this.requestJsonCompletion(
            systemPrompt,
            request.userMessage,
            request.recentMessages,
          );

    const shapeErrors = validateDomainLlmStepOutputShape(payload);

    if (shapeErrors.length > 0) {
      throw new Error(
        `OpenAI domain step (${request.domain}) returned invalid output: ${shapeErrors.join(" ")}`,
      );
    }

    return domainLlmStepOutputSchema.parse(payload);
  }

  async generateFinalDecision(request: FinalDecisionRequest): Promise<FinalDecisionOutputInput> {
    const systemPrompt = buildOpenAiFinalDecisionPrompt(request, this.promptTemplates);
    // Use the user message as the user turn; no separate recentMessages on FinalDecisionRequest
    const payload = await this.requestJsonCompletion(systemPrompt, request.userMessage, []);

    const shapeErrors = validateFinalDecisionOutputShape(payload);

    if (shapeErrors.length > 0) {
      // Fail-safe: return a safe fallback rather than exposing internal errors
      return createFallbackFinalDecision();
    }

    return finalDecisionOutputSchema.parse(payload);
  }

  private async requestJsonCompletion(
    systemPrompt: string,
    userMessage: string,
    recentMessages: ReadonlyArray<{
      role: "user" | "assistant" | "system";
      content: string;
    }>,
  ): Promise<unknown> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          ...recentMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          { role: "user", content: userMessage },
        ],
      }),
    });

    const payload = (await response.json()) as OpenAiChatCompletionResponse;

    if (!response.ok) {
      throw new Error(
        payload.error?.message ??
          `OpenAI coach provider request failed with status ${response.status}.`,
      );
    }

    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI coach provider returned an empty response.");
    }

    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new Error("OpenAI coach provider returned non-JSON content.");
    }
  }

  /**
   * Multimodal completion — sends the user message alongside one or more image
   * data URIs. Used by generateDomainStep when a food_photo or consented medical
   * image is present in the domain attachment context.
   *
   * The user message content is an array combining the text part and one image_url
   * part per data URI. Only image/* MIME types are sent as vision content;
   * non-image MIMEs (e.g. application/pdf) are excluded (they cannot be rendered
   * by the vision endpoint).
   *
   * Safety: the imageDataUris are already filtered by the caller so only
   * consented medical content and food photos are included.
   */
  private async requestMultimodalJsonCompletion(
    systemPrompt: string,
    userMessage: string,
    recentMessages: ReadonlyArray<{
      role: "user" | "assistant" | "system";
      content: string;
    }>,
    imageDataUris: readonly string[],
  ): Promise<unknown> {
    // Build the user message content array: text first, then images.
    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "low" } }
    > = [
      { type: "text", text: userMessage },
      ...imageDataUris.map((uri) => ({
        type: "image_url" as const,
        image_url: { url: uri, detail: "low" as const },
      })),
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          ...recentMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          { role: "user", content: userContent },
        ],
      }),
    });

    const payload = (await response.json()) as OpenAiChatCompletionResponse;

    if (!response.ok) {
      throw new Error(
        payload.error?.message ??
          `OpenAI multimodal coach provider request failed with status ${response.status}.`,
      );
    }

    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI multimodal coach provider returned an empty response.");
    }

    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new Error("OpenAI multimodal coach provider returned non-JSON content.");
    }
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
 * sent to the vision endpoint. Items without an imageDataUri are skipped
 * (e.g. when the storage ref was null after consent purge).
 *
 * Safety floors (already enforced by buildDomainAttachmentContext):
 *  - medical_document items only present when consentState === "granted".
 *  - imageDataUri is set by DomainLlmExecutorService.buildAttachmentContextWithImages
 *    only when the domain is nutrition/health AND the attachment is an image MIME.
 */
function resolveImageDataUrisFromAttachmentContext(request: DomainLlmStepRequest): string[] {
  const items = request.attachmentContext?.items;

  if (!items || items.length === 0) {
    return [];
  }

  return items
    .filter((item) => {
      // Only image MIMEs work with the OpenAI vision endpoint.
      if (!item.mimeType.startsWith("image/")) {
        return false;
      }

      // imageDataUri must be present (set by the storage-reading layer).
      return typeof item.imageDataUri === "string" && item.imageDataUri.length > 0;
    })
    .map((item) => item.imageDataUri as string);
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
  // Build a compact attachment summary for the domain system prompt.
  // Full image content is sent separately via the multimodal user content array —
  // this text summary tells the LLM what attachments are present and their consent state.
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
  });
}

/**
 * Build a compact JSON summary of the attachment context for inclusion in the
 * domain system prompt. The summary omits imageDataUri (too large for system
 * prompt) and focuses on category, MIME, and consent state so the LLM knows
 * what attachments are present and which are consent-gated.
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
  }));

  return JSON.stringify(summary);
}

function buildOpenAiFinalDecisionPrompt(
  request: FinalDecisionRequest,
  promptTemplates: CompiledPromptTemplates,
): string {
  return promptTemplates.renderFinalDecision({
    userMessage: request.userMessage,
    domainOutputsJson: JSON.stringify(request.domainOutputs),
    actionVariantCatalogJson: JSON.stringify(request.actionVariantCatalog),
    safetyFlags: request.safetyFlags.length ? request.safetyFlags.join(", ") : "none",
    safetyConstraints: request.safetyConstraints.length
      ? request.safetyConstraints.join("\n- ")
      : "Do not diagnose, prescribe, or claim to treat diseases.",
  });
}

export function createOpenAiCoachProvider(
  apiKey: string | undefined,
  model: string,
  promptTemplates?: CompiledPromptTemplates,
): OpenAiCoachProvider {
  if (!apiKey?.trim()) {
    throw new OpenAiCoachProviderMissingKeyError();
  }

  return new OpenAiCoachProvider({ apiKey, model, promptTemplates });
}
