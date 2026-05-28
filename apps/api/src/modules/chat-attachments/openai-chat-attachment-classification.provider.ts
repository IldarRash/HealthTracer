import type { ChatAttachmentClassificationResult } from "@health/types";
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

const ALLOWED_CATEGORIES = [
  "food_photo",
  "workout_attachment",
  "medical_document",
] as const;

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
    const systemPrompt = buildAttachmentClassifierPrompt();
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
      "Classify this chat attachment into exactly one allowed category.",
      `Allowed categories: ${ALLOWED_CATEGORIES.join(", ")}.`,
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

function buildAttachmentClassifierPrompt(): string {
  return [
    "You classify wellness coaching chat attachments.",
    "Return JSON only. Do not answer the user or provide coaching advice.",
    "Allowed categories: food_photo, workout_attachment, medical_document.",
    "Allowed suggestedAction values: run_category_recognition, request_medical_consent, manual_fallback, unsupported.",
    "Use request_medical_consent for medical_document when explicit consent would be required before review.",
    "Use manual_fallback when the attachment is ambiguous, unrelated, or low confidence.",
    "Never default ambiguous images to food_photo. Prefer manual_fallback over guessing nutrition.",
    "Allowed JSON shape:",
    '{"category":"food_photo|workout_attachment|medical_document","confidence":"low|medium|high","rationale":"short reason","suggestedAction":"run_category_recognition|request_medical_consent|manual_fallback|unsupported","mealContextLabel":null|string}',
    "mealContextLabel is optional and only for food_photo when meal timing is evident from the message.",
  ].join("\n");
}

export function createOpenAiChatAttachmentClassificationProvider(
  apiKey: string | undefined,
  model: string,
): OpenAiChatAttachmentClassificationProvider {
  if (!apiKey?.trim()) {
    throw new OpenAiAttachmentClassificationMissingKeyError();
  }

  return new OpenAiChatAttachmentClassificationProvider({ apiKey, model });
}
