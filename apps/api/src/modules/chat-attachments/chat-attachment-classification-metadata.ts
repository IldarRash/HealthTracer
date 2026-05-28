import type {
  ChatAttachmentClassificationMethod,
  ChatAttachmentClassificationResult,
} from "@health/types";
import type { ChatAttachmentClassificationProvider } from "./chat-attachment-classification.provider.js";
import { DevChatAttachmentClassificationProvider } from "./dev-chat-attachment-classification.provider.js";
import { OpenAiChatAttachmentClassificationProvider } from "./openai-chat-attachment-classification.provider.js";

export function resolveAttachmentClassificationProviderId(
  provider: ChatAttachmentClassificationProvider,
): string {
  if (provider instanceof OpenAiChatAttachmentClassificationProvider) {
    return "openai";
  }

  if (provider instanceof DevChatAttachmentClassificationProvider) {
    return "dev_heuristic";
  }

  return "unknown";
}

export function withAttachmentClassificationMetadata(input: {
  result: ChatAttachmentClassificationResult;
  providerId: string;
  method: ChatAttachmentClassificationMethod;
}): ChatAttachmentClassificationResult {
  return {
    ...input.result,
    classificationProviderId: input.providerId,
    classificationMethod: input.method,
  };
}
