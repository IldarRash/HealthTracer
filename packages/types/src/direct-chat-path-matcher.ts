import type {
  DirectPathsBehaviorConfig,
  RegexPatternRule,
} from "./ai-behavior-config.js";
import {
  directChatPathCandidateSchema,
  type DetectDirectChatPathCandidateOptions,
  type DirectChatPathCandidate,
} from "./direct-chat-path.js";
import { buildDefaultAiBehaviorConfig } from "./ai-behavior-config.js";

export type CompiledRegexPatternRule = {
  readonly source: string;
  readonly flags: string;
  readonly regex: RegExp;
};

export type CompiledDirectPathKindMatcher = {
  readonly kind: DirectChatPathCandidate["kind"];
  readonly matchPatterns: readonly CompiledRegexPatternRule[];
  readonly negativePatterns: readonly CompiledRegexPatternRule[];
  readonly requireTodayMention: boolean;
  readonly todayMentionPatterns: readonly CompiledRegexPatternRule[];
  readonly requireWorkoutLexeme: boolean;
  readonly workoutLexemePattern: CompiledRegexPatternRule | null;
};

export type CompiledDirectPathMatcher = {
  readonly config: DirectPathsBehaviorConfig;
  readonly kindsByOrder: readonly CompiledDirectPathKindMatcher[];
  detect(
    normalizedText: string,
    options?: DetectDirectChatPathCandidateOptions,
  ): DirectChatPathCandidate | null;
};

export function compileRegexPatternRule(rule: RegexPatternRule): CompiledRegexPatternRule | null {
  try {
    return {
      source: rule.source,
      flags: rule.flags,
      regex: new RegExp(rule.source, rule.flags),
    };
  } catch {
    return null;
  }
}

export function compileDirectPathMatcher(
  config: DirectPathsBehaviorConfig,
): CompiledDirectPathMatcher {
  const kindsById = new Map(
    config.kinds.map((kindConfig) => {
      const compiled: CompiledDirectPathKindMatcher = {
        kind: kindConfig.kind,
        matchPatterns: kindConfig.matchPatterns
          .map(compileRegexPatternRule)
          .filter((entry): entry is CompiledRegexPatternRule => entry != null),
        negativePatterns: kindConfig.negativePatterns
          .map(compileRegexPatternRule)
          .filter((entry): entry is CompiledRegexPatternRule => entry != null),
        requireTodayMention: kindConfig.requireTodayMention === true,
        todayMentionPatterns: (kindConfig.todayMentionPatterns ?? [])
          .map(compileRegexPatternRule)
          .filter((entry): entry is CompiledRegexPatternRule => entry != null),
        requireWorkoutLexeme: kindConfig.requireWorkoutLexeme === true,
        workoutLexemePattern:
          kindConfig.workoutLexemePattern != null
            ? compileRegexPatternRule({
                source: kindConfig.workoutLexemePattern,
                flags: "i",
              })
            : null,
      };

      return [kindConfig.kind, compiled] as const;
    }),
  );

  const kindsByOrder = config.detectionOrder
    .map((kind) => kindsById.get(kind))
    .filter((entry): entry is CompiledDirectPathKindMatcher => entry != null);

  return {
    config,
    kindsByOrder,
    detect(normalizedText, options = {}) {
      return detectDirectChatPathCandidateWithCompiledMatcher(this, normalizedText, options);
    },
  };
}

export function detectDirectChatPathCandidate(
  normalizedText: string,
  options: DetectDirectChatPathCandidateOptions = {},
): DirectChatPathCandidate | null {
  return getDefaultCompiledDirectPathMatcher().detect(normalizedText, options);
}

export function detectDirectChatPathCandidateFromConfig(
  config: DirectPathsBehaviorConfig,
  normalizedText: string,
  options: DetectDirectChatPathCandidateOptions = {},
): DirectChatPathCandidate | null {
  return compileDirectPathMatcher(config).detect(normalizedText, options);
}

export function detectDirectChatPathCandidateWithCompiledMatcher(
  matcher: CompiledDirectPathMatcher,
  normalizedText: string,
  options: DetectDirectChatPathCandidateOptions = {},
): DirectChatPathCandidate | null {
  const config = matcher.config;

  if (!config.enabled) {
    return null;
  }

  if (options.hasAttachments === true && config.blockWhenAttachments) {
    return null;
  }

  const text = normalizedText.trim();

  if (text.length === 0) {
    return null;
  }

  for (const kindMatcher of matcher.kindsByOrder) {
    if (matchesCompiledDirectPathKind(kindMatcher, text)) {
      return directChatPathCandidateSchema.parse({
        kind: kindMatcher.kind,
        confidence: config.confidence,
        routingMethod: config.routingMethod,
      });
    }
  }

  return null;
}

function matchesCompiledDirectPathKind(
  kindMatcher: CompiledDirectPathKindMatcher,
  text: string,
): boolean {
  if (kindMatcher.requireWorkoutLexeme) {
    if (
      kindMatcher.workoutLexemePattern == null ||
      !kindMatcher.workoutLexemePattern.regex.test(text)
    ) {
      return false;
    }
  }

  if (kindMatcher.requireTodayMention) {
    if (
      kindMatcher.todayMentionPatterns.length === 0 ||
      !kindMatcher.todayMentionPatterns.some((pattern) => pattern.regex.test(text))
    ) {
      return false;
    }
  }

  if (
    kindMatcher.matchPatterns.length === 0 ||
    !kindMatcher.matchPatterns.some((pattern) => pattern.regex.test(text))
  ) {
    return false;
  }

  if (kindMatcher.negativePatterns.some((pattern) => pattern.regex.test(text))) {
    return false;
  }

  return true;
}

let cachedDefaultMatcher: CompiledDirectPathMatcher | null = null;

export function getDefaultCompiledDirectPathMatcher(): CompiledDirectPathMatcher {
  if (cachedDefaultMatcher == null) {
    cachedDefaultMatcher = compileDirectPathMatcher(buildDefaultAiBehaviorConfig().directPaths);
  }

  return cachedDefaultMatcher;
}
