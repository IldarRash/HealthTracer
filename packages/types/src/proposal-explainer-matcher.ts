import type { ProposalExplainerBehaviorConfig } from "./ai-behavior-config.js";
import { buildDefaultAiBehaviorConfig } from "./ai-behavior-config.js";
import {
  compileRegexPatternRule,
  type CompiledRegexPatternRule,
} from "./direct-chat-path-matcher.js";

export type DetectProposalExplainerRequestOptions = {
  hasAttachments?: boolean;
  hasProposalRevision?: boolean;
};

export type CompiledProposalExplainerMatcher = {
  readonly config: ProposalExplainerBehaviorConfig;
  readonly positivePatterns: readonly CompiledRegexPatternRule[];
  readonly negativePatterns: readonly CompiledRegexPatternRule[];
  detect(
    normalizedText: string,
    options?: DetectProposalExplainerRequestOptions,
  ): boolean;
};

function matchesAnyCompiledPattern(
  text: string,
  patterns: readonly CompiledRegexPatternRule[],
): boolean {
  return patterns.some((pattern) => pattern.regex.test(text));
}

export function compileProposalExplainerMatcher(
  config: ProposalExplainerBehaviorConfig,
): CompiledProposalExplainerMatcher {
  const positivePatterns = config.detectionPatterns.positivePatterns
    .map(compileRegexPatternRule)
    .filter((entry): entry is CompiledRegexPatternRule => entry != null);
  const negativePatterns = config.detectionPatterns.negativePatterns
    .map(compileRegexPatternRule)
    .filter((entry): entry is CompiledRegexPatternRule => entry != null);

  return {
    config,
    positivePatterns,
    negativePatterns,
    detect(normalizedText, options = {}) {
      return detectProposalExplainerRequestWithCompiledMatcher(this, normalizedText, options);
    },
  };
}

export function detectProposalExplainerRequestWithCompiledMatcher(
  matcher: CompiledProposalExplainerMatcher,
  normalizedText: string,
  options: DetectProposalExplainerRequestOptions = {},
): boolean {
  const config = matcher.config;

  if (options.hasAttachments === true && config.blockWhenAttachments) {
    return false;
  }

  if (options.hasProposalRevision === true && config.blockWhenProposalRevision) {
    return false;
  }

  const text = normalizedText.trim();

  if (text.length === 0) {
    return false;
  }

  if (
    matcher.positivePatterns.length === 0 ||
    !matchesAnyCompiledPattern(text, matcher.positivePatterns)
  ) {
    return false;
  }

  if (matchesAnyCompiledPattern(text, matcher.negativePatterns)) {
    return false;
  }

  return true;
}

export function detectProposalExplainerRequestFromConfig(
  config: ProposalExplainerBehaviorConfig,
  normalizedText: string,
  options: DetectProposalExplainerRequestOptions = {},
): boolean {
  return compileProposalExplainerMatcher(config).detect(normalizedText, options);
}

let cachedDefaultMatcher: CompiledProposalExplainerMatcher | null = null;

export function getDefaultCompiledProposalExplainerMatcher(): CompiledProposalExplainerMatcher {
  if (cachedDefaultMatcher == null) {
    cachedDefaultMatcher = compileProposalExplainerMatcher(
      buildDefaultAiBehaviorConfig().proposalExplainer,
    );
  }

  return cachedDefaultMatcher;
}

export function detectProposalExplainerRequest(
  normalizedText: string,
  options: DetectProposalExplainerRequestOptions = {},
): boolean {
  return getDefaultCompiledProposalExplainerMatcher().detect(normalizedText, options);
}
