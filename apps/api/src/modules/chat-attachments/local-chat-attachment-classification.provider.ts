import type { ChatAttachmentClassificationResult } from "@health/types";
import {
  compileAttachmentClassificationMatcher,
  type CompiledAttachmentClassificationMatcher,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import type {
  ChatAttachmentClassificationProvider,
  ChatAttachmentClassificationRequest,
} from "./chat-attachment-classification.provider.js";
import { AiBehaviorConfigService } from "../ai/ai-behavior-config.service.js";

@Injectable()
export class LocalChatAttachmentClassificationProvider
  implements ChatAttachmentClassificationProvider
{
  private readonly matcher: CompiledAttachmentClassificationMatcher;

  constructor(private readonly aiBehaviorConfigService: AiBehaviorConfigService) {
    this.matcher = compileAttachmentClassificationMatcher(
      this.aiBehaviorConfigService.getAttachmentBehavior().classification,
    );
  }

  async classify(
    request: ChatAttachmentClassificationRequest,
  ): Promise<ChatAttachmentClassificationResult> {
    return this.matcher.classifyDevAttachment({
      message: request.message,
      filename: request.filename,
      mimeType: request.mimeType,
    });
  }
}
