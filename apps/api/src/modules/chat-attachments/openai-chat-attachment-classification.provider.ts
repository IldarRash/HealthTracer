import type {
  AttachmentClassificationConfig,
  ChatAttachmentClassificationResult,
} from "@health/types";
import {
  isChatAttachmentImageMimeType,
  llmAttachmentClassifierOutputSchema,
  mapLlmAttachmentClassifierOutput,
} from "@health/types";
import { buildNonImageClassificationPromptParts } from "./chat-attachment-classification-content.js";
import { Injectable } from "@nestjs/common";

import type {
  ChatAttachmentClassificationProvider,
  ChatAttachmentClassificationRequest,
} from "./chat-attachment-classification.provider.js";

export class OpenAiAttachmentClassificationMissingKeyError extends Error {
  constructor() {
    super(
      "OpenAI attachment classifier is selected but OPENAI_API_KEY is not configured. Set OPENAI_API_KEY or use AI_COACH_PROVIDER=stub.",
    );
    this.name = "OpenAiAttachmentClassificationMissingKeyError";
  }
}

export interface OpenAiChatAttachmentClassificationProviderOptions {
  apiKey: string;
  model: string;
  classification: AttachmentClassificationConfig;
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

@Injectable()
export class OpenAiChatAttachmentClassificationProvider
  implements ChatAttachmentClassificationProvider
{
  constructor(private readonly options: OpenAiChatAttachmentClassificationProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new OpenAiAttachmentClassificationMissingKeyError();
    }
  }

  async classify(
    request: ChatAttachmentClassificationRequest,
  ): Promise<ChatAttachmentClassificationResult> {
    const systemPrompt = this.options.classification.llmClassifierPrompt;
    const userContent = this.buildUserContent(request);
    const payload = await this.requestJsonCompletion(systemPrompt, userContent);
    const parsed = llmAttachmentClassifierOutputSchema.safeParse(payload);

    if (!parsed.success) {
      return mapLlmAttachmentClassifierOutput({
        category: "food_photo",
        confidence: "low",
        rationale: "Attachment classification returned an invalid structured result.",
        suggestedAction: "manual_fallback",
        mealContextLabel: null,
      });
    }

    return mapLlmAttachmentClassifierOutput(parsed.data);
  }

  private buildUserContent(
    request: ChatAttachmentClassificationRequest,
  ): Array<Record<string, unknown>> {
    const boundedMessage = request.message.trim().slice(0, 500);
    const metadataPrompt = [
      this.options.classification.llmUserPromptIntro,
      `User message: ${boundedMessage || "(empty)"}`,
      `Filename: ${request.filename}`,
      `MIME type: ${request.mimeType}`,
      "Return JSON only.",
    ].join("\n");

    if (!isChatAttachmentImageMimeType(request.mimeType)) {
      return buildNonImageClassificationPromptParts({
        metadataPrompt,
        mimeType: request.mimeType,
        content: request.content,
      });
    }

    const dataUrl = `data:${request.mimeType};base64,${request.content.toString("base64")}`;

    return [
      { type: "text", text: metadataPrompt },
      {
        type: "image_url",
        image_url: {
          url: dataUrl,
          detail: "low",
        },
      },
    ];
  }

  private async requestJsonCompletion(
    systemPrompt: string,
    userContent: Array<Record<string, unknown>>,
  ): Promise<unknown> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    const payload = (await response.json()) as OpenAiChatCompletionResponse;

    if (!response.ok) {
      throw new Error(
        payload.error?.message ??
          `OpenAI attachment classifier request failed with status ${response.status}.`,
      );
    }

    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI attachment classifier returned an empty response.");
    }

    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new Error("OpenAI attachment classifier returned non-JSON content.");
    }
  }
}

export function createOpenAiChatAttachmentClassificationProvider(
  apiKey: string | undefined,
  model: string,
  classification: AttachmentClassificationConfig,
): OpenAiChatAttachmentClassificationProvider {
  if (!apiKey?.trim()) {
    throw new OpenAiAttachmentClassificationMissingKeyError();
  }

  return new OpenAiChatAttachmentClassificationProvider({ apiKey, model, classification });
}
