import { env } from "../../env.js";
import type { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";
import type { ChatAttachmentClassificationProvider } from "./chat-attachment-classification.provider.js";
import { LocalChatAttachmentClassificationProvider } from "./local-chat-attachment-classification.provider.js";
import {
  createOpenAiChatAttachmentClassificationProvider,
  OpenAiAttachmentClassificationMissingKeyError,
} from "./openai-chat-attachment-classification.provider.js";

export function createChatAttachmentClassificationProvider(
  aiBehaviorConfigService: AiBehaviorConfigService,
): ChatAttachmentClassificationProvider {
  if (env.AI_COACH_PROVIDER === "openai") {
    return createOpenAiChatAttachmentClassificationProvider(
      env.OPENAI_API_KEY,
      env.OPENAI_MODEL,
      aiBehaviorConfigService.getAttachmentBehavior().classification,
    );
  }

  return new LocalChatAttachmentClassificationProvider(aiBehaviorConfigService);
}

export { OpenAiAttachmentClassificationMissingKeyError };
