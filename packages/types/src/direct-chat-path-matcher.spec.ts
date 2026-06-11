import { describe, expect, it } from "vitest";
import {
  buildDefaultAiBehaviorConfig,
  normalizeAiBehaviorConfig,
} from "./ai-behavior-config.js";
import { buildDefaultDirectPathKindMatchers } from "./direct-chat-path-default-patterns.js";
import {
  compileDirectPathMatcher,
  compileRegexPatternRule,
  detectDirectChatPathCandidate,
  detectDirectChatPathCandidateFromConfig,
} from "./direct-chat-path-matcher.js";

describe("detectDirectChatPathCandidateFromConfig", () => {
  it("preserves default parity with legacy detectDirectChatPathCandidate", () => {
    const config = buildDefaultAiBehaviorConfig().directPaths;

    expect(detectDirectChatPathCandidateFromConfig(config, "What is today?")).toEqual(
      detectDirectChatPathCandidate("What is today?"),
    );
    expect(
      detectDirectChatPathCandidateFromConfig(config, "Mark today's workout done"),
    ).toEqual(detectDirectChatPathCandidate("Mark today's workout done"));
    expect(
      detectDirectChatPathCandidateFromConfig(config, "Should I train today after poor sleep?"),
    ).toBeNull();
  });

  it("changes detection when config patterns are overridden", () => {
    const custom = normalizeAiBehaviorConfig({
      directPaths: {
        ...buildDefaultAiBehaviorConfig().directPaths,
        confidence: 0.5,
        kinds: [
          {
            kind: "today_summary_read",
            refreshHintsOnExecuted: ["today"],
            matchPatterns: [{ source: "^custom today ask$", flags: "i" }],
            negativePatterns: [],
            requireTodayMention: false,
          },
          ...buildDefaultDirectPathKindMatchers().filter(
            (kind) => kind.kind === "mark_today_workout_done",
          ),
        ],
      },
    }).directPaths;

    expect(detectDirectChatPathCandidateFromConfig(custom, "custom today ask")).toEqual({
      kind: "today_summary_read",
      confidence: 0.5,
      routingMethod: "rule_based",
    });
    expect(detectDirectChatPathCandidateFromConfig(custom, "What is today?")).toBeNull();
  });

  it("fails closed when direct-path match patterns are invalid regex", () => {
    expect(compileRegexPatternRule({ source: "(unclosed", flags: "i" })).toBeNull();

    const matcher = compileDirectPathMatcher(
      normalizeAiBehaviorConfig({
        directPaths: {
          kinds: [
            {
              kind: "today_summary_read",
              refreshHintsOnExecuted: [],
              matchPatterns: [{ source: "(unclosed", flags: "i" }],
              negativePatterns: [],
            },
          ],
          detectionOrder: ["today_summary_read"],
        },
      } as unknown as Parameters<typeof normalizeAiBehaviorConfig>[0]).directPaths,
    );

    expect(matcher.kindsByOrder[0]?.matchPatterns).toEqual([]);
    expect(detectDirectChatPathCandidateFromConfig(matcher.config, "What is today?")).toBeNull();
  });

  it("respects enabled and attachment block flags from config", () => {
    const disabled = normalizeAiBehaviorConfig({
      directPaths: { enabled: false },
    } as Parameters<typeof normalizeAiBehaviorConfig>[0]).directPaths;

    expect(detectDirectChatPathCandidateFromConfig(disabled, "What is today?")).toBeNull();

    const config = buildDefaultAiBehaviorConfig().directPaths;

    expect(
      detectDirectChatPathCandidateFromConfig(config, "What is today?", {
        hasAttachments: true,
      }),
    ).toBeNull();
  });

  describe("nutrition_plan_read pattern matching", () => {
    const config = buildDefaultAiBehaviorConfig().directPaths;

    it.each([
      "What's my nutrition plan?",
      "What is my nutrition plan?",
      "Show me my nutrition plan",
      "Show my meal plan",
      "My diet plan",
      "nutrition plan",
      "meal plan",
    ])("matches EN pattern: %s", (message) => {
      const candidate = detectDirectChatPathCandidateFromConfig(config, message);
      expect(candidate).not.toBeNull();
      expect(candidate?.kind).toBe("nutrition_plan_read");
    });

    it.each([
      "Покажи мой план питания",
      "Покажи план питания",
      "Мой план питания",
      "план питания",
    ])("matches RU pattern: %s", (message) => {
      const candidate = detectDirectChatPathCandidateFromConfig(config, message);
      expect(candidate).not.toBeNull();
      expect(candidate?.kind).toBe("nutrition_plan_read");
    });

    it.each([
      "Change my nutrition plan",
      "Update my meal plan",
      "Create a diet plan for me",
      "Can I modify my nutrition plan?",
      "Should I follow a meal plan?",
    ])("does NOT match mutation/advice queries: %s", (message) => {
      const candidate = detectDirectChatPathCandidateFromConfig(config, message);
      expect(candidate?.kind ?? null).not.toBe("nutrition_plan_read");
    });

    it("returns null when attachments are present", () => {
      const candidate = detectDirectChatPathCandidateFromConfig(
        config,
        "Show my nutrition plan",
        { hasAttachments: true },
      );
      expect(candidate).toBeNull();
    });
  });
});
