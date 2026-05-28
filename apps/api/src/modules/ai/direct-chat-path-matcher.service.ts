import {
  compileDirectPathMatcher,
  detectDirectChatPathCandidateFromConfig,
  type CompiledDirectPathMatcher,
  type DetectDirectChatPathCandidateOptions,
  type DirectChatPathCandidate,
  type DirectPathsBehaviorConfig,
} from "@health/types";
import { Injectable } from "@nestjs/common";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";

@Injectable()
export class DirectChatPathMatcherService {
  private compiledMatcher: CompiledDirectPathMatcher;

  constructor(private readonly aiBehaviorConfigService: AiBehaviorConfigService) {
    this.compiledMatcher = compileDirectPathMatcher(
      this.aiBehaviorConfigService.getDirectPaths(),
    );
  }

  refresh(): void {
    this.compiledMatcher = compileDirectPathMatcher(
      this.aiBehaviorConfigService.getDirectPaths(),
    );
  }

  detect(
    normalizedText: string,
    options: DetectDirectChatPathCandidateOptions = {},
  ): DirectChatPathCandidate | null {
    return this.compiledMatcher.detect(normalizedText, options);
  }

  detectWithConfig(
    config: DirectPathsBehaviorConfig,
    normalizedText: string,
    options: DetectDirectChatPathCandidateOptions = {},
  ): DirectChatPathCandidate | null {
    return detectDirectChatPathCandidateFromConfig(config, normalizedText, options);
  }
}
