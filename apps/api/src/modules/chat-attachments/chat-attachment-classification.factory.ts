import { env } from "../../env.js";
import type { ChatAttachmentClassificationProvider } from "./chat-attachment-classification.provider.js";
import { DevChatAttachmentClassificationProvider } from "./dev-chat-attachment-classification.provider.js";
import {
  createOpenAiChatAttachmentClassificationProvider,
  OpenAiAttachmentClassificationMissingKeyError,
} from "./openai-chat-attachment-classification.provider.js";

export function createChatAttachmentClassificationProvider(): ChatAttachmentClassificationProvider {
  if (env.AI_COACH_PROVIDER === "openai") {
    return createOpenAiChatAttachmentClassificationProvider(
      env.OPENAI_API_KEY,
      env.OPENAI_MODEL,
    );
  }

  return new DevChatAttachmentClassificationProvider();
}

export { OpenAiAttachmentClassificationMissingKeyError };
