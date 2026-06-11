import {
  loadAiBehaviorConfig,
  loadAttachmentBehaviorConfig,
  loadDomainConfigs,
} from "@health/ai-behavior";
import type {
  AiBehaviorConfig,
  AiBehaviorConfigLoadResult,
  AiBehaviorConfigLoadSource,
  ChatBehaviorConfig,
  AttachmentBehaviorConfig,
  AttachmentBehaviorConfigLoadResult,
  AttachmentBehaviorConfigLoadSource,
  CompiledPromptTemplates,
  ContextBudgetsBehaviorConfig,
  DeterministicProposalTriggersConfig,
  DirectPathsBehaviorConfig,
  DomainConfigBundle,
  DomainConfigLoadResult,
  DomainConfigLoadSource,
  PromptTemplatesBehaviorConfig,
  ProposalExplainerBehaviorConfig,
  ProposalRevisionRoutingConfig,
  ResponseModesBehaviorConfig,
  SuggestedQuickActionsConfig,
} from "@health/types";
import { compilePromptTemplates } from "@health/types";
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";

export const AI_BEHAVIOR_CONFIG_PRELOAD = Symbol("AI_BEHAVIOR_CONFIG_PRELOAD");
export const ATTACHMENT_BEHAVIOR_CONFIG_PRELOAD = Symbol("ATTACHMENT_BEHAVIOR_CONFIG_PRELOAD");
export const DOMAIN_CONFIG_PRELOAD = Symbol("DOMAIN_CONFIG_PRELOAD");

@Injectable()
export class AiBehaviorConfigService {
  private readonly logger = new Logger(AiBehaviorConfigService.name);
  readonly loadResult: AiBehaviorConfigLoadResult;
  readonly attachmentLoadResult: AttachmentBehaviorConfigLoadResult;
  readonly domainConfigLoadResult: DomainConfigLoadResult;
  private compiledPromptTemplates: CompiledPromptTemplates;

  constructor(
    @Optional()
    @Inject(AI_BEHAVIOR_CONFIG_PRELOAD)
    preload?: AiBehaviorConfigLoadResult,
    @Optional()
    @Inject(ATTACHMENT_BEHAVIOR_CONFIG_PRELOAD)
    attachmentPreload?: AttachmentBehaviorConfigLoadResult,
    @Optional()
    @Inject(DOMAIN_CONFIG_PRELOAD)
    domainConfigPreload?: DomainConfigLoadResult,
  ) {
    this.loadResult =
      preload ??
      loadAiBehaviorConfig({
        configPath: process.env.AI_BEHAVIOR_CONFIG_PATH,
      });
    this.attachmentLoadResult =
      attachmentPreload ??
      loadAttachmentBehaviorConfig({
        configPath: process.env.ATTACHMENT_BEHAVIOR_CONFIG_PATH,
      });
    this.domainConfigLoadResult =
      domainConfigPreload ??
      loadDomainConfigs({
        configDir: process.env.DOMAIN_CONFIG_DIR,
      });
    this.compiledPromptTemplates = compilePromptTemplates(this.loadResult.config.promptTemplates);

    for (const warning of this.loadResult.warnings) {
      this.logger.warn(warning);
    }

    for (const error of this.loadResult.errors) {
      this.logger.error(error);
    }

    for (const warning of this.attachmentLoadResult.warnings) {
      this.logger.warn(warning);
    }

    for (const error of this.attachmentLoadResult.errors) {
      this.logger.error(error);
    }

    for (const warning of this.domainConfigLoadResult.warnings) {
      this.logger.warn(warning);
    }

    for (const error of this.domainConfigLoadResult.errors) {
      this.logger.error(error);
    }

    if (this.loadResult.source === "file") {
      this.logger.log("Loaded repo-backed AI behavior config from file.");
    }

    if (this.attachmentLoadResult.source === "file") {
      this.logger.log("Loaded repo-backed attachment behavior config from file.");
    }

    if (this.domainConfigLoadResult.source === "file") {
      this.logger.log("Loaded repo-backed domain configs from file.");
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

  getChat(): ChatBehaviorConfig {
    return this.loadResult.config.chat;
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

  getAttachmentBehavior(): AttachmentBehaviorConfig {
    return this.attachmentLoadResult.config;
  }

  getAttachmentLoadSource(): AttachmentBehaviorConfigLoadSource {
    return this.attachmentLoadResult.source;
  }

  getAttachmentLoadErrors(): readonly string[] {
    return this.attachmentLoadResult.errors;
  }

  getAttachmentLoadWarnings(): readonly string[] {
    return this.attachmentLoadResult.warnings;
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

  getSuggestedQuickActions(): SuggestedQuickActionsConfig {
    return this.loadResult.config.suggestedQuickActions;
  }

  getDomainConfigs(): DomainConfigBundle {
    return this.domainConfigLoadResult.configs;
  }

  getDomainConfigLoadSource(): DomainConfigLoadSource {
    return this.domainConfigLoadResult.source;
  }

  getDomainConfigLoadErrors(): readonly string[] {
    return this.domainConfigLoadResult.errors;
  }

  getDomainConfigLoadWarnings(): readonly string[] {
    return this.domainConfigLoadResult.warnings;
  }
}
