import type { CoachAiProvider } from "@health/ai";
import type {
  MessageUnderstandingAttachmentContextSummary,
  TurnDecisionRequest,
  TurnDecisionResult,
} from "@health/types";
import {
  catalogIntentIdSchema,
  clampTurnDecisionOutput,
  createFallbackTurnDecisionResult,
  truncateRecentMessagesForUnderstandingHints,
  turnDecisionOutputSchema,
  turnDecisionRequestSchema,
  turnDecisionResultSchema,
  validateTurnDecisionOutputShape,
  type CatalogIntentId,
  type MessagePreprocessorResult,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { CapabilityRegistryService } from "./capability-registry.service.js";
import { createCoachAiProvider } from "./coach-provider.factory.js";

export interface TurnDecisionServiceInput {
  preprocessorResult: MessagePreprocessorResult;
  attachmentContextSummaries?: ReadonlyArray<MessageUnderstandingAttachmentContextSummary>;
  recentMessages?: ReadonlyArray<{
    readonly role: "user" | "assistant" | "system";
    readonly content: string;
  }>;
}

@Injectable()
export class TurnDecisionService {
  private readonly provider: CoachAiProvider;

  constructor(
    private readonly aiBehaviorConfigService: AiBehaviorConfigService,
    private readonly capabilityRegistryService: CapabilityRegistryService,
  ) {
    this.provider = createCoachAiProvider(
      this.aiBehaviorConfigService.getCompiledPromptTemplates(),
    );
  }

  async decide(input: TurnDecisionServiceInput): Promise<TurnDecisionResult> {
    const request = this.buildRequest(input);
    const allowedCatalogIds = new Set<CatalogIntentId>();

    for (const entry of this.capabilityRegistryService.serializeForRouter()) {
      const parsed = catalogIntentIdSchema.safeParse(entry.id);

      if (parsed.success) {
        allowedCatalogIds.add(parsed.data);
      }
    }

    for (const hint of request.catalogHints) {
      allowedCatalogIds.add(hint.id);
    }
    const allowedTools = new Set(request.availableTools);

    try {
      const rawOutput = await this.provider.generateTurnDecision(request);
      const shapeErrors = validateTurnDecisionOutputShape(rawOutput);

      if (shapeErrors.length > 0) {
        return createFallbackTurnDecisionResult(request, shapeErrors);
      }

      const parsedOutput = turnDecisionOutputSchema.parse(rawOutput);
      const clampedOutput = clampTurnDecisionOutput({
        output: parsedOutput,
        allowedCatalogIds,
        allowedTools,
      });

      return turnDecisionResultSchema.parse({
        output: clampedOutput,
        source: "llm",
        validationErrors: [],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Turn decision provider call failed.";

      return createFallbackTurnDecisionResult(request, [message]);
    }
  }

  buildRequest(input: TurnDecisionServiceInput): TurnDecisionRequest {
    const recentMessageHints = truncateRecentMessagesForUnderstandingHints(
      input.recentMessages ?? [],
    );
    const catalogHints = this.capabilityRegistryService.serializeForRouter().map((entry) => ({
      id: entry.id,
      description: entry.description,
      routerGuidance: entry.routerGuidance,
    }));
    const availableTools = this.capabilityRegistryService
      .serializeForRouter()
      .flatMap((entry) => {
        try {
          return this.capabilityRegistryService.getConfig(entry.id).allowedTools;
        } catch {
          return [];
        }
      });

    return turnDecisionRequestSchema.parse({
      originalText: input.preprocessorResult.originalText,
      normalizedText: input.preprocessorResult.normalizedText,
      preprocessor: input.preprocessorResult,
      attachmentContextSummaries: [...(input.attachmentContextSummaries ?? [])],
      recentMessageHints,
      catalogHints,
      availableTools: [...new Set(availableTools)],
    });
  }
}
