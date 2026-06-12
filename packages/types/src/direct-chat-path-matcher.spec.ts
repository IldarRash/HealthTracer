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

  describe("weekly_progress_read pattern matching", () => {
    const config = buildDefaultAiBehaviorConfig().directPaths;

    it.each([
      "Show my weekly progress",
      "show me my weekly progress",
      "Weekly progress",
      "My weekly progress?",
      "Show my progress for this week",
      "My progress this week",
      "How was my week?",
      "How did the week go?",
    ])("matches EN pattern: %s", (message) => {
      const candidate = detectDirectChatPathCandidateFromConfig(config, message);
      expect(candidate).not.toBeNull();
      expect(candidate?.kind).toBe("weekly_progress_read");
    });

    it.each([
      "Мой прогресс за неделю",
      "Покажи мой прогресс за неделю",
      "Прогресс за эту неделю",
      "Как прошла неделя?",
      "Недельный прогресс",
    ])("matches RU pattern: %s", (message) => {
      const candidate = detectDirectChatPathCandidateFromConfig(config, message);
      expect(candidate).not.toBeNull();
      expect(candidate?.kind).toBe("weekly_progress_read");
    });

    it.each([
      "Проанализируй мой прогресс за неделю",
      "Разбор моей недели",
      "Почему мой прогресс за неделю такой слабый",
      "Как тренировки повлияли на мой прогресс за неделю",
      "Что я делал не так на этой неделе",
      "Analyze my weekly progress",
      "Why is my weekly progress so slow",
      "How can I improve my weekly progress",
      "Compare my weekly progress to last week",
      "Give me advice on my weekly progress",
    ])("does NOT match analytic/advice phrasing (falls through to fan-out): %s", (message) => {
      const candidate = detectDirectChatPathCandidateFromConfig(config, message);
      expect(candidate?.kind ?? null).not.toBe("weekly_progress_read");
    });

    it.each([
      "Прогресс за полгода",
      "Прогресс за месяц",
      "Прогресс за год",
      "Мой прогресс за всё время",
      "Show my monthly progress",
      "My progress for the last 6 months",
      "Show my all-time progress",
    ])("does NOT match longer-than-week lookbacks (Tier 2 territory): %s", (message) => {
      const candidate = detectDirectChatPathCandidateFromConfig(config, message);
      expect(candidate).toBeNull();
    });

    it("returns null when attachments are present", () => {
      const candidate = detectDirectChatPathCandidateFromConfig(
        config,
        "Show my weekly progress",
        { hasAttachments: true },
      );
      expect(candidate).toBeNull();
    });
  });

  describe("workout_plan_read pattern matching", () => {
    const config = buildDefaultAiBehaviorConfig().directPaths;

    it.each([
      "What's my workout plan?",
      "What is my training plan?",
      "Show me my workout plan",
      "Show my training plan",
      "My workout plan",
      "workout plan",
      "training plan",
    ])("matches EN pattern: %s", (message) => {
      const candidate = detectDirectChatPathCandidateFromConfig(config, message);
      expect(candidate).not.toBeNull();
      expect(candidate?.kind).toBe("workout_plan_read");
    });

    it.each([
      "Покажи мой план тренировок",
      "Покажи план тренировок",
      "Мой план тренировок",
      "план тренировок",
    ])("matches RU pattern: %s", (message) => {
      const candidate = detectDirectChatPathCandidateFromConfig(config, message);
      expect(candidate).not.toBeNull();
      expect(candidate?.kind).toBe("workout_plan_read");
    });

    it.each([
      "Change my workout plan",
      "Update my training plan",
      "Create a workout plan for me",
      "Make my workout plan easier",
      "Improve my training plan",
      "Can I modify my workout plan?",
      "Should I follow a training plan?",
      "Recommend a workout plan",
      "Создай мне план тренировок",
      "Сделай план тренировок",
      "Измени мой план тренировок",
      "Адаптируй план тренировок",
      "Улучши мой план тренировок",
    ])("does NOT match mutation/advice phrasing (falls through to fan-out): %s", (message) => {
      const candidate = detectDirectChatPathCandidateFromConfig(config, message);
      expect(candidate?.kind ?? null).not.toBe("workout_plan_read");
    });

    it("returns null when attachments are present", () => {
      const candidate = detectDirectChatPathCandidateFromConfig(
        config,
        "Show my workout plan",
        { hasAttachments: true },
      );
      expect(candidate).toBeNull();
    });
  });

  describe("detection order regression", () => {
    const config = buildDefaultAiBehaviorConfig().directPaths;

    it("keeps the existing three kinds matching their canonical phrases first", () => {
      expect(
        detectDirectChatPathCandidateFromConfig(config, "Mark today's workout done")?.kind,
      ).toBe("mark_today_workout_done");
      expect(detectDirectChatPathCandidateFromConfig(config, "What is today?")?.kind).toBe(
        "today_summary_read",
      );
      expect(
        detectDirectChatPathCandidateFromConfig(config, "Show my nutrition plan")?.kind,
      ).toBe("nutrition_plan_read");
    });

    it("appends the new kinds after the existing three in detectionOrder", () => {
      expect(config.detectionOrder).toEqual([
        "mark_today_workout_done",
        "today_summary_read",
        "nutrition_plan_read",
        "weekly_progress_read",
        "workout_plan_read",
      ]);
    });
  });
});
