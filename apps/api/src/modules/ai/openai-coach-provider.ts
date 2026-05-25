import type { CoachAiProvider, CoachAiRequest } from "@health/ai";
import type { AiStructuredOutputInput } from "@health/types";
import { aiStructuredOutputSchema } from "@health/types";

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

  async generateCoachResponse(request: CoachAiRequest): Promise<AiStructuredOutputInput> {
    const systemPrompt = buildOpenAiSystemPrompt(request);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          ...request.recentMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          { role: "user", content: request.userMessage },
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

    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(content);
    } catch {
      throw new Error("OpenAI coach provider returned non-JSON content.");
    }

    return coerceOpenAiStructuredOutput(parsedJson);
  }
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
