import type {
  CoachAiProvider,
  CoachAiLoopRequest,
  CoachAiRequest,
} from "@health/ai";
import type {
  AgentLoopOutputInput,
  AiStructuredOutputInput,
  CompiledPromptTemplates,
  MessageUnderstandingOutputInput,
  MessageUnderstandingRequest,
  TurnDecisionOutputInput,
  TurnDecisionRequest,
} from "@health/types";
import {
  agentLoopOutputSchema,
  aiStructuredOutputSchema,
  getDefaultCompiledPromptTemplates,
  mapTurnDecisionOutputFromMessageUnderstanding,
  messageUnderstandingOutputSchema,
  validateAgentLoopOutputShape,
  turnDecisionOutputSchema,
  validateMessageUnderstandingOutputShape,
  validateTurnDecisionOutputShape,
} from "@health/types";

export class OpenAiCoachProviderMissingKeyError extends Error {
  constructor() {
    super(
      "OpenAI coach provider is selected but OPENAI_API_KEY is not configured. Set OPENAI_API_KEY or use AI_COACH_PROVIDER=stub.",
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

  async generateTurnDecision(request: TurnDecisionRequest): Promise<TurnDecisionOutputInput> {
    const systemPrompt = buildOpenAiTurnDecisionPrompt(request, this.promptTemplates);
    const payload = await this.requestJsonCompletion(
      systemPrompt,
      request.normalizedText,
      request.recentMessageHints,
    );

    const turnDecisionErrors = validateTurnDecisionOutputShape(payload);

    if (turnDecisionErrors.length === 0) {
      return turnDecisionOutputSchema.parse(payload);
    }

    const messageUnderstandingErrors = validateMessageUnderstandingOutputShape(payload);

    if (messageUnderstandingErrors.length > 0) {
      throw new Error(
        `OpenAI turn decision returned invalid structured output: ${turnDecisionErrors.join(" ")}`,
      );
    }

    return mapTurnDecisionOutputFromMessageUnderstanding(
      messageUnderstandingOutputSchema.parse(payload),
      request,
    );
  }

  async generateMessageUnderstanding(
    request: MessageUnderstandingRequest,
  ): Promise<MessageUnderstandingOutputInput> {
    const systemPrompt = buildOpenAiMessageUnderstandingPrompt(request, this.promptTemplates);
    const payload = await this.requestJsonCompletion(
      systemPrompt,
      request.normalizedText,
      request.recentMessageHints,
    );
    const shapeErrors = validateMessageUnderstandingOutputShape(payload);

    if (shapeErrors.length > 0) {
      throw new Error(
        `OpenAI message understanding returned invalid structured output: ${shapeErrors.join(" ")}`,
      );
    }

    return messageUnderstandingOutputSchema.parse(payload);
  }

  async generateAgentLoopStep(request: CoachAiLoopRequest): Promise<AgentLoopOutputInput> {
    const systemPrompt = buildOpenAiIntentLoopPrompt(request, this.promptTemplates);
    const payload = await this.requestJsonCompletion(
      systemPrompt,
      request.userMessage,
      request.recentMessages,
    );

    return coerceOpenAiLoopOutput(payload);
  }

  async generateCoachResponse(request: CoachAiRequest): Promise<AiStructuredOutputInput> {
    const loopStep = await this.generateAgentLoopStep({
      ...request,
      iteration: 1,
      maxIterations: 1,
      priorToolResults: [],
    });

    if (loopStep.kind === "final_answer") {
      return coerceOpenAiStructuredOutput({
        reply: loopStep.reply,
        proposals: loopStep.proposals ?? [],
      });
    }

    throw new Error("OpenAI coach provider returned a tool request during single-pass generation.");
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
}

function buildOpenAiTurnDecisionPrompt(
  request: TurnDecisionRequest,
  promptTemplates: CompiledPromptTemplates,
): string {
  return promptTemplates.renderMessageUnderstanding({
    normalizedText: request.normalizedText,
    originalText: request.originalText,
    preprocessorJson: JSON.stringify(request.preprocessor),
    attachmentContextSummariesJson: JSON.stringify(request.attachmentContextSummaries),
    recentMessageHintsJson: JSON.stringify(request.recentMessageHints),
    catalogHintsJson: JSON.stringify(request.catalogHints),
  });
}

function buildOpenAiMessageUnderstandingPrompt(
  request: MessageUnderstandingRequest,
  promptTemplates: CompiledPromptTemplates,
): string {
  return promptTemplates.renderMessageUnderstanding({
    normalizedText: request.normalizedText,
    originalText: request.originalText,
    preprocessorJson: JSON.stringify(request.preprocessor),
    attachmentContextSummariesJson: JSON.stringify(request.attachmentContextSummaries),
    recentMessageHintsJson: JSON.stringify(request.recentMessageHints),
    catalogHintsJson: JSON.stringify(request.catalogHints),
  });
}

function buildOpenAiIntentLoopPrompt(
  request: CoachAiLoopRequest,
  promptTemplates: CompiledPromptTemplates,
): string {
  const metadata = request.agentMetadata;
  const intentDefinition = metadata?.intentDefinition;

  return promptTemplates.renderCoachLoop({
    iteration: String(request.iteration),
    maxIterations: String(request.maxIterations),
    selectedIntentLabel: intentDefinition
      ? intentDefinition.id
      : (metadata?.catalogIntentId ?? metadata?.intent ?? "general"),
    intentInstructions: intentDefinition?.promptInstructions
      ? intentDefinition.promptInstructions
      : "Provide conservative wellness coaching.",
    intentSafetyGuidance: intentDefinition?.safetyGuidance?.length
      ? intentDefinition.safetyGuidance.join(" | ")
      : "none",
    allowedTools: metadata?.allowedTools?.length
      ? metadata.allowedTools.join(", ")
      : "getUserContextSlice",
    allowedProposalIntents: metadata?.allowedProposalIntents?.length
      ? metadata.allowedProposalIntents.join(", ")
      : "none",
    taskPurpose: metadata?.purpose ?? "general_chat",
    taskIntent: metadata?.intent ?? "general",
    expectedResponseMode:
      metadata?.expectedResponseMode ?? "recommendation_with_optional_proposal",
    safetyFlags: metadata?.safetyFlags?.length ? metadata.safetyFlags.join(", ") : "none",
    missingContextNotes: metadata?.missingContextNotes?.length
      ? metadata.missingContextNotes.join(" | ")
      : "none",
    priorToolResultsJson: request.priorToolResults.length
      ? JSON.stringify(request.priorToolResults)
      : "none",
    safetyConstraints:
      metadata?.safetyConstraints?.join("\n- ") ??
      "Do not diagnose, prescribe, or claim to treat diseases.",
    coachingContextJson: JSON.stringify(request.coachingContext),
  });
}

function coerceOpenAiLoopOutput(value: unknown): AgentLoopOutputInput {
  const shapeErrors = validateAgentLoopOutputShape(value);

  if (shapeErrors.length > 0) {
    throw new Error(
      `OpenAI coach provider returned invalid loop output: ${shapeErrors.join(" ")}`,
    );
  }

  return agentLoopOutputSchema.parse(value);
}

function coerceOpenAiStructuredOutput(value: unknown): AiStructuredOutputInput {
  const validated = aiStructuredOutputSchema.safeParse(value);

  if (validated.success) {
    return validated.data;
  }

  if (
    value &&
    typeof value === "object" &&
    "reply" in value &&
    typeof value.reply === "string" &&
    value.reply.trim().length > 0 &&
    value.reply.length <= 8000
  ) {
    return {
      reply: value.reply,
      proposals: [],
    };
  }

  throw new Error(
    `OpenAI coach provider returned invalid structured output: ${validated.error.message}`,
  );
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
