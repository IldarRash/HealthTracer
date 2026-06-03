import { describe, expect, it } from "vitest";
import { MessagePreprocessorService } from "./message-preprocessor.service.js";
import { createDefaultAiBehaviorConfigService } from "./test-ai-behavior-fixtures.js";
import { DirectChatPathMatcherService } from "./direct-chat-path-matcher.service.js";

describe("MessagePreprocessorService", () => {
  const service = new MessagePreprocessorService(
    new DirectChatPathMatcherService(createDefaultAiBehaviorConfigService()),
  );

  it("returns typed preprocessor output for a workout question", () => {
    const result = service.preprocess({
      userMessage: "Should I train today after poor sleep?",
      hasAttachments: false,
    });

    expect(result.detectedLanguage).toBe("en");
    expect(result.responseLanguage).toBe("en");
    expect(result.mentionedDates).toContain("today");
    expect(result.simpleSignals.workout).toBe(true);
    expect(result.simpleSignals.sleep).toBe(true);
    expect(result.simpleSignals.today).toBe(true);
    expect(result.directPathCandidate).toBeNull();
  });

  it("reflects attachment presence without making product decisions", () => {
    const result = service.preprocess({
      userMessage: "Here is my lunch",
      hasAttachments: true,
    });

    expect(result.hasAttachments).toBe(true);
    expect(result.simpleSignals.attachment).toBe(true);
    expect(result.simpleSignals.nutrition).toBe(true);
  });

  it("honors response language hint for downstream generation", () => {
    const result = service.preprocess({
      userMessage: "Я плохо спал",
      hasAttachments: false,
      responseLanguageHint: "en",
    });

    expect(result.detectedLanguage).toBe("ru");
    expect(result.responseLanguage).toBe("en");
  });

  it("returns safe fallback for invalid input", () => {
    const result = service.preprocess({
      userMessage: "hello",
      hasAttachments: false,
      responseLanguageHint: "not-a-language" as "en",
    });

    expect(result.normalizedText).toBe("hello");
    expect(result.detectedLanguage).toBe("en");
    expect(result.responseLanguage).toBe("en");
    expect(result.mentionedDates).toEqual([]);
  });

  it("detects explicit direct path candidates without executing them", () => {
    const readResult = service.preprocess({
      userMessage: "What's my plan for today?",
      hasAttachments: false,
    });

    expect(readResult.directPathCandidate).toEqual({
      kind: "today_summary_read",
      confidence: 0.95,
      routingMethod: "rule_based",
    });

    const actionResult = service.preprocess({
      userMessage: "Mark today's workout done",
      hasAttachments: false,
    });

    expect(actionResult.directPathCandidate).toEqual({
      kind: "mark_today_workout_done",
      confidence: 0.95,
      routingMethod: "rule_based",
    });
  });
});
