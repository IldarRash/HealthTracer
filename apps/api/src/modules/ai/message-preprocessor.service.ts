import {
  createFallbackPreprocessorResult,
  messagePreprocessorInputSchema,
  preprocessMessage,
  type MessagePreprocessorInput,
  type MessagePreprocessorResult,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { DirectChatPathMatcherService } from "./direct-chat-path-matcher.service.js";

@Injectable()
export class MessagePreprocessorService {
  constructor(private readonly directChatPathMatcherService: DirectChatPathMatcherService) {}

  preprocess(input: MessagePreprocessorInput): MessagePreprocessorResult {
    const parsedInput = messagePreprocessorInputSchema.safeParse(input);

    if (!parsedInput.success) {
      return createFallbackPreprocessorResult(input);
    }

    const result = preprocessMessage(parsedInput.data);

    return {
      ...result,
      directPathCandidate: this.directChatPathMatcherService.detect(result.normalizedText, {
        hasAttachments: result.hasAttachments,
      }),
    };
  }
}
