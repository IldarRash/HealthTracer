import type { CoachAiProvider, CoachAiRequest, IntentRouterRequest } from "@health/ai";
import type { AiStructuredOutputInput, LlmIntentRouterOutputInput } from "@health/types";
import {
  aiStructuredOutputSchema,
  llmIntentRouterOutputSchema,
  normalizeContextSlicePlan,
  validateLlmRouterOutputShape,
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
  constructor(private readonly options: OpenAiCoachProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new OpenAiCoachProviderMissingKeyError();
    }
  }

  async generateIntentRoute(request: IntentRouterRequest): Promise<LlmIntentRouterOutputInput> {
    const systemPrompt = buildOpenAiIntentRouterPrompt(request);
    const payload = await this.requestJsonCompletion(systemPrompt, request.userMessage, request.recentMessages);
    const shapeErrors = validateLlmRouterOutputShape(payload);

    if (shapeErrors.length > 0) {
      throw new Error(
        `OpenAI intent router returned invalid structured output: ${shapeErrors.join(" ")}`,
      );
    }

    const validated = llmIntentRouterOutputSchema.parse(payload);

    return {
      ...validated,
      requiredContextSlices: normalizeContextSlicePlan(validated.requiredContextSlices),
    };
  }

  async generateCoachResponse(request: CoachAiRequest): Promise<AiStructuredOutputInput> {
    const systemPrompt = buildOpenAiSystemPrompt(request);
    const payload = await this.requestJsonCompletion(
      systemPrompt,
      request.userMessage,
      request.recentMessages,
    );

    return coerceOpenAiStructuredOutput(payload);
  }

  private async requestJsonCompletion(
    systemPrompt: string,
    userMessage: string,
    recentMessages: IntentRouterRequest["recentMessages"],
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

function buildOpenAiIntentRouterPrompt(request: IntentRouterRequest): string {
  return [
    "You are an internal intent router for a wellness coaching product.",
    "Return JSON only. Do not answer the user. Do not provide advice, proposals, or coaching text.",
    "Allowed JSON shape:",
    '{"intent":"general|ask_about_today|adjust_workout|adjust_nutrition|review_progress|longevity_overview|ask_health_context","confidence":0.0-1.0,"routingMethod":"llm_router","requiredContextSlices":[{"type":"general_chat|daily_checkin|workout_adaptation|nutrition_adaptation|weekly_review|longevity_overview|health_context","depth":"small|medium|large","timeRange":"7d|14d|30d|90d|1y","includeDocuments":false}],"safetyFlags":["fatigue|pain|sleep_issue|stress|hunger|schedule_conflict|health_context"],"expectedResponseMode":"advice_only|recommendation_with_optional_proposal|clarification_question"}',
    "Use at most 3 context slices. Prefer medium depth. Disable documents unless health context is explicit.",
    "Never include reply, advice, answer, response, proposals, or user-facing text fields.",
    request.ruleRouteHint
      ? `Rule-router hint: ${JSON.stringify(request.ruleRouteHint)}`
      : "Rule-router hint: none",
  ].join("\n");
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

function buildOpenAiSystemPrompt(request: CoachAiRequest): string {
  const metadata = request.agentMetadata;
  const constraints =
    metadata?.safetyConstraints?.join("\n- ") ??
    "Do not diagnose, prescribe, or claim to treat diseases.";

  return [
    "You are an AI wellness coach for fitness, habits, nutrition, and recovery.",
    "Respond in the same language as the user's latest message.",
    "Return JSON only with this shape: {\"reply\": string, \"proposals\": array}.",
    "For normal coaching advice, set proposals to an empty array.",
    "Only include proposals when you can produce an exact typed proposal that matches one of the allowed intents.",
    "Allowed proposal intents: update_profile, create_goal, update_goal, create_workout_plan, adapt_workout_plan, adapt_workout_plan_from_progress, create_nutrition_plan, adjust_nutrition_plan, recommend_recipes, create_today_checklist, create_habit_plan, adapt_habit_plan, summarize_progress.",
    "Never invent proposal intents. Never return more than 5 proposals.",
    "Proposals must remain pending until the user approves them.",
    "Never mutate structured state directly. Suggest plan changes only through proposals.",
    `Task purpose: ${metadata?.purpose ?? "general_chat"}`,
    `Task intent: ${metadata?.intent ?? "general"}`,
    `Expected response mode: ${metadata?.expectedResponseMode ?? "recommendation_with_optional_proposal"}`,
    metadata?.safetyFlags?.length
      ? `Safety flags: ${metadata.safetyFlags.join(", ")}`
      : "Safety flags: none",
    metadata?.missingContextNotes?.length
      ? `Missing context notes: ${metadata.missingContextNotes.join(" | ")}`
      : "Missing context notes: none",
    "Safety constraints:",
    `- ${constraints}`,
    "Structured coaching context:",
    JSON.stringify(request.coachingContext),
  ].join("\n");
}

export function createOpenAiCoachProvider(
  apiKey: string | undefined,
  model: string,
): OpenAiCoachProvider {
  if (!apiKey?.trim()) {
    throw new OpenAiCoachProviderMissingKeyError();
  }

  return new OpenAiCoachProvider({ apiKey, model });
}
