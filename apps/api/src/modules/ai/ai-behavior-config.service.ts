import { loadAiBehaviorConfig } from "@health/ai-behavior";
import type {
  AiBehaviorConfig,
  AiBehaviorConfigLoadResult,
  AiBehaviorConfigLoadSource,
  AttachmentRoutingConfig,
  CompiledPromptTemplates,
  ContextBudgetsBehaviorConfig,
  DeterministicProposalTriggersConfig,
  DirectPathsBehaviorConfig,
  PromptTemplatesBehaviorConfig,
  ProposalExplainerBehaviorConfig,
  ProposalRevisionRoutingConfig,
  ResponseModesBehaviorConfig,
} from "@health/types";
import { compilePromptTemplates } from "@health/types";
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";

export const AI_BEHAVIOR_CONFIG_PRELOAD = Symbol("AI_BEHAVIOR_CONFIG_PRELOAD");

@Injectable()
export class AiBehaviorConfigService {
  private readonly logger = new Logger(AiBehaviorConfigService.name);
  readonly loadResult: AiBehaviorConfigLoadResult;
  private compiledPromptTemplates: CompiledPromptTemplates;

  constructor(
    @Optional()
    @Inject(AI_BEHAVIOR_CONFIG_PRELOAD)
    preload?: AiBehaviorConfigLoadResult,
  ) {
    this.loadResult =
      preload ??
      loadAiBehaviorConfig({
        configPath: process.env.AI_BEHAVIOR_CONFIG_PATH,
      });
    this.compiledPromptTemplates = compilePromptTemplates(this.loadResult.config.promptTemplates);

    for (const warning of this.loadResult.warnings) {
      this.logger.warn(warning);
    }

    for (const error of this.loadResult.errors) {
      this.logger.error(error);
    }

    if (this.loadResult.source === "file") {
      this.logger.log("Loaded repo-backed AI behavior config from file.");
    }
  }

  getConfig(): AiBehaviorConfig {
    return this.loadResult.config;
  }

  getLoadSource(): AiBehaviorConfigLoadSource {
    return this.loadResult.source;
  }

  getLoadErrors(): readonly string[] {
    return this.loadResult.errors;
  }

  getLoadWarnings(): readonly string[] {
    return this.loadResult.warnings;
  }

  getDirectPaths(): DirectPathsBehaviorConfig {
    return this.loadResult.config.directPaths;
  }

  getProposalRevisionRouting(): ProposalRevisionRoutingConfig {
    return this.loadResult.config.proposalRevisionRouting;
  }

  getResponseModes(): ResponseModesBehaviorConfig {
    return this.loadResult.config.responseModes;
  }

  getContextBudgets(): ContextBudgetsBehaviorConfig {
    return this.loadResult.config.contextBudgets;
  }

  getAttachmentRouting(): AttachmentRoutingConfig {
    return this.loadResult.config.attachmentRouting;
  }

  getProposalExplainer(): ProposalExplainerBehaviorConfig {
    return this.loadResult.config.proposalExplainer;
  }

  getPromptTemplates(): PromptTemplatesBehaviorConfig {
    return this.loadResult.config.promptTemplates;
  }

  getCompiledPromptTemplates(): CompiledPromptTemplates {
    return this.compiledPromptTemplates;
  }

  getDeterministicProposalTriggers(): DeterministicProposalTriggersConfig {
    return this.loadResult.config.deterministicProposalTriggers;
  }
}
