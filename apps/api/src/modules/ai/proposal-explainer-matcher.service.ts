import {
  compileProposalExplainerMatcher,
  normalizePreprocessorText,
  type CompiledProposalExplainerMatcher,
  type DetectProposalExplainerRequestOptions,
  type ProposalExplainerBehaviorConfig,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";

@Injectable()
export class ProposalExplainerMatcherService {
  private compiledMatcher: CompiledProposalExplainerMatcher;

  constructor(private readonly aiBehaviorConfigService: AiBehaviorConfigService) {
    this.compiledMatcher = compileProposalExplainerMatcher(
      this.aiBehaviorConfigService.getProposalExplainer(),
    );
  }

  refresh(): void {
    this.compiledMatcher = compileProposalExplainerMatcher(
      this.aiBehaviorConfigService.getProposalExplainer(),
    );
  }

  detect(
    normalizedOrRawText: string,
    options: DetectProposalExplainerRequestOptions = {},
  ): boolean {
    const normalizedText = normalizePreprocessorText(normalizedOrRawText);
    return this.compiledMatcher.detect(normalizedText, options);
  }

  detectWithConfig(
    config: ProposalExplainerBehaviorConfig,
    normalizedText: string,
    options: DetectProposalExplainerRequestOptions = {},
  ): boolean {
    return compileProposalExplainerMatcher(config).detect(normalizedText, options);
  }
}
