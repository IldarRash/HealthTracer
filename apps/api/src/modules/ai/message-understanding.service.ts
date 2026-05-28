import type { CoachAiProvider } from "@health/ai";
import type {
  MessageUnderstandingAttachmentContextSummary,
  MessageUnderstandingRequest,
  MessageUnderstandingResult,
} from "@health/types";
import {
  createFallbackMessageUnderstandingResult,
  messageUnderstandingOutputSchema,
  messageUnderstandingRequestSchema,
  messageUnderstandingResultSchema,
  truncateRecentMessagesForUnderstandingHints,
  validateMessageUnderstandingOutputShape,
  type MessagePreprocessorResult,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { createCoachAiProvider } from "./coach-provider.factory.js";

export interface MessageUnderstandingServiceInput {
  preprocessorResult: MessagePreprocessorResult;
  attachmentContextSummaries?: ReadonlyArray<MessageUnderstandingAttachmentContextSummary>;
  recentMessages?: ReadonlyArray<{
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
  }>;
}

@Injectable()
export class MessageUnderstandingService {
  private readonly provider: CoachAiProvider;

  constructor(
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
    private readonly capabilityRegistryService: CapabilityRegistryService,
  ) {
    this.provider = createCoachAiProvider(
      this.aiBehaviorConfigService.getCompiledPromptTemplates(),
    );
  }

  async understand(input: MessageUnderstandingServiceInput): Promise<MessageUnderstandingResult> {
    const request = this.buildRequest(input);

    try {
      const rawOutput = await this.provider.generateMessageUnderstanding(request);
      const shapeErrors = validateMessageUnderstandingOutputShape(rawOutput);

      if (shapeErrors.length > 0) {
        return createFallbackMessageUnderstandingResult(request, shapeErrors);
      }

      return messageUnderstandingResultSchema.parse({
        output: messageUnderstandingOutputSchema.parse(rawOutput),
        source: "llm",
        validationErrors: [],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Message understanding provider call failed.";

      return createFallbackMessageUnderstandingResult(request, [message]);
    }
  }

  buildRequest(input: MessageUnderstandingServiceInput): MessageUnderstandingRequest {
    const recentMessageHints = truncateRecentMessagesForUnderstandingHints(
      input.recentMessages ?? [],
    );
    const catalogHints = this.capabilityRegistryService.serializeForRouter().map((entry) => ({
      id: entry.id,
      description: entry.description,
      routerGuidance: entry.routerGuidance,
    }));

    return messageUnderstandingRequestSchema.parse({
      originalText: input.preprocessorResult.originalText,
      normalizedText: input.preprocessorResult.normalizedText,
      preprocessor: input.preprocessorResult,
      attachmentContextSummaries: [...(input.attachmentContextSummaries ?? [])],
      recentMessageHints,
      catalogHints,
    });
  }
}
