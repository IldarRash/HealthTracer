import { describe, expect, it } from "vitest";
import {
  createFallbackPreprocessorResult,
  detectPreprocessorLanguage,
  detectPreprocessorSimpleSignals,
  extractMentionedPreprocessorDates,
  messagePreprocessorInputSchema,
  messagePreprocessorResultSchema,
  normalizePreprocessorText,
  preprocessMessage,
  resolvePreprocessorResponseLanguage,
} from "./message-preprocessor.js";

describe("message preprocessor contracts", () => {
  it("parses valid preprocessor input and output schemas", () => {
    const input = messagePreprocessorInputSchema.parse({
      userMessage: "Should I train today?",
      hasAttachments: false,
    });

    const output = messagePreprocessorResultSchema.parse({
      originalText: input.userMessage,
      normalizedText: input.userMessage,
      detectedLanguage: "en",
      responseLanguage: "en",
      hasAttachments: false,
      mentionedDates: ["today"],
      simpleSignals: {
        workout: true,
        nutrition: false,
        today: true,
        sleep: false,
        fatigue: false,
        pain: false,
        document: false,
        attachment: false,
        plan_request: false,
      },
      directPathCandidate: null,
    });

    expect(output.simpleSignals.workout).toBe(true);
  });

  it("normalizes whitespace without changing meaning", () => {
    expect(normalizePreprocessorText("  Should   I   train?  ")).toBe("Should I train?");
  });

  it("detects Russian and English best-effort", () => {
    expect(detectPreprocessorLanguage("Я плохо спал")).toBe("ru");
    expect(detectPreprocessorLanguage("Should I train today?")).toBe("en");
    expect(detectPreprocessorLanguage("12345")).toBeNull();
  });

  it("extracts relative and ISO mentioned dates", () => {
    expect(extractMentionedPreprocessorDates("Plan for today and 2026-05-27")).toEqual([
      "today",
      "2026-05-27",
    ]);
    expect(extractMentionedPreprocessorDates("Сделай на завтра")).toEqual(["tomorrow"]);
    expect(extractMentionedPreprocessorDates("2026-13-40")).toEqual([]);
  });

  it("detects simple wellness signals deterministically", () => {
    const signals = detectPreprocessorSimpleSignals(
      "Я плохо спал, стоит ли делать тренировку сегодня?",
      false,
    );

    expect(signals.sleep).toBe(true);
    expect(signals.workout).toBe(true);
    expect(signals.today).toBe(true);
    expect(signals.attachment).toBe(false);
  });

  it("marks attachment signal when attachments are present", () => {
    const signals = detectPreprocessorSimpleSignals("Thanks", true);

    expect(signals.attachment).toBe(true);
  });

  it("prefers response language hint over detected language", () => {
    expect(resolvePreprocessorResponseLanguage("ru", "en")).toBe("en");
    expect(resolvePreprocessorResponseLanguage("ru", null)).toBe("ru");
  });

  it("preprocesses a Russian workout question turn", () => {
    const result = preprocessMessage({
      userMessage: "  Я плохо спал, стоит ли делать тренировку сегодня?  ",
      hasAttachments: false,
    });

    expect(result.originalText).toBe("  Я плохо спал, стоит ли делать тренировку сегодня?  ");
    expect(result.normalizedText).toBe("Я плохо спал, стоит ли делать тренировку сегодня?");
    expect(result.detectedLanguage).toBe("ru");
    expect(result.responseLanguage).toBe("ru");
    expect(result.mentionedDates).toEqual(["today"]);
    expect(result.simpleSignals.sleep).toBe(true);
    expect(result.simpleSignals.workout).toBe(true);
    expect(result.simpleSignals.today).toBe(true);
  });

  it("returns safe fallback output for invalid input", () => {
    const fallback = createFallbackPreprocessorResult({
      userMessage: "   ",
      hasAttachments: true,
      responseLanguageHint: "en",
    });

    expect(fallback.normalizedText).toBe("");
    expect(fallback.detectedLanguage).toBeNull();
    expect(fallback.responseLanguage).toBe("en");
    expect(fallback.hasAttachments).toBe(true);
    expect(fallback.mentionedDates).toEqual([]);
    expect(fallback.simpleSignals.attachment).toBe(true);
  });

  it("falls back when preprocess input fails schema validation", () => {
    const result = preprocessMessage({
      userMessage: "hello",
      hasAttachments: false,
      responseLanguageHint: "english" as "en",
    });

    expect(result.normalizedText).toBe("hello");
    expect(result.detectedLanguage).toBe("en");
    expect(result.responseLanguage).toBe("en");
    expect(result.directPathCandidate).toBeNull();
  });

  it("includes direct path candidate for explicit today summary asks", () => {
    const result = preprocessMessage({
      userMessage: "What is today?",
      hasAttachments: false,
    });

    expect(result.directPathCandidate).toEqual({
      kind: "today_summary_read",
      confidence: 0.95,
      routingMethod: "rule_based",
    });
  });

  it("leaves direct path candidate null for advice questions", () => {
    const result = preprocessMessage({
      userMessage: "Should I train today after poor sleep?",
      hasAttachments: false,
    });

    expect(result.directPathCandidate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// i18n — responseLanguageHint precedence + detection edge cases
// ---------------------------------------------------------------------------

describe("responseLanguage — hint precedence and detection", () => {
  it("responseLanguageHint 'ru' overrides English/Latin text detection (preference wins)", () => {
    // Cyrillic hint wins even when the message body is pure English letters.
    const result = preprocessMessage({
      userMessage: "Should I train today?",
      hasAttachments: false,
      responseLanguageHint: "ru",
    });

    expect(result.detectedLanguage).toBe("en");
    expect(result.responseLanguage).toBe("ru");
  });

  it("no hint + Cyrillic text → responseLanguage === 'ru' (falls back to detection)", () => {
    const result = preprocessMessage({
      userMessage: "Я плохо спал, стоит ли делать тренировку?",
      hasAttachments: false,
    });

    expect(result.detectedLanguage).toBe("ru");
    expect(result.responseLanguage).toBe("ru");
  });

  it("no hint + no letters (digits only) → responseLanguage === null", () => {
    const result = preprocessMessage({
      userMessage: "12345 67890",
      hasAttachments: false,
    });

    expect(result.detectedLanguage).toBeNull();
    expect(result.responseLanguage).toBeNull();
  });

  it("responseLanguageHint 'en' overrides Cyrillic text detection (preference wins)", () => {
    const result = preprocessMessage({
      userMessage: "Составь мне план тренировок",
      hasAttachments: false,
      responseLanguageHint: "en",
    });

    expect(result.detectedLanguage).toBe("ru");
    expect(result.responseLanguage).toBe("en");
  });
});

// ---------------------------------------------------------------------------
// Slice C5 — plan_request signal detection (EN + RU)
// ---------------------------------------------------------------------------

describe("plan_request signal detection (Slice C5)", () => {
  function signals(userMessage: string) {
    return detectPreprocessorSimpleSignals(userMessage, false);
  }

  describe("English plan-creation phrases", () => {
    it.each([
      "Create a workout plan for me",
      "Make me a training plan",
      "Build a fitness plan",
      "Generate a workout plan",
      "Write me a nutrition plan",
      "Give me a meal plan",
      "Create a workout program",
      "Make a training program",
      "Give me a plan",
      "create a plan",
    ])("detects plan_request for: %s", (msg) => {
      expect(signals(msg).plan_request).toBe(true);
    });
  });

  describe("English plan-modification phrases", () => {
    it.each([
      "Update my workout plan",
      "Change my training plan",
      "Modify my nutrition plan",
      "Adjust my meal plan",
      "Adapt my fitness plan",
      "Revise my diet plan",
      "Redo my workout plan",
      "update my workout",
      "change my nutrition",
      "modify my training",
    ])("detects plan_request for: %s", (msg) => {
      expect(signals(msg).plan_request).toBe(true);
    });
  });

  describe("Russian plan-creation phrases", () => {
    it.each([
      "составь мне план тренировок",
      "Составь план питания",
      "сделай мне программу тренировок",
      "Сделай план питания на неделю",
      "создай программу тренировок",
      "напиши мне план тренировок",
      "напиши рацион питания",
    ])("detects plan_request for: %s", (msg) => {
      expect(signals(msg).plan_request).toBe(true);
    });
  });

  describe("Russian plan-modification phrases", () => {
    it.each([
      "обнови мой план тренировок",
      "Обнови план питания",
      "измени мою программу",
      "поменяй мой план тренировок",
      "скорректируй питание",
      "подправь мою программу",
      "Измени план тренировок",
    ])("detects plan_request for: %s", (msg) => {
      expect(signals(msg).plan_request).toBe(true);
    });
  });

  describe("plain chat messages that must NOT trigger plan_request", () => {
    it.each([
      "How many calories did I eat today?",
      "Should I train today?",
      "What is today?",
      "Я плохо спал сегодня",
      "Hello, how are you?",
      "Tell me about my progress",
      "What exercises can I do for back pain?",
    ])("does NOT detect plan_request for: %s", (msg) => {
      expect(signals(msg).plan_request).toBe(false);
    });
  });

  it("plan_request is false in EMPTY_MESSAGE_PREPROCESSOR_SIMPLE_SIGNALS", () => {
    // Regression: empty/fallback signals must not fire plan_request.
    const fallback = createFallbackPreprocessorResult({
      userMessage: "   ",
      hasAttachments: false,
    });

    expect(fallback.simpleSignals.plan_request).toBe(false);
  });

  it("preprocessMessage includes plan_request in the result", () => {
    const result = preprocessMessage({
      userMessage: "Create a workout plan",
      hasAttachments: false,
    });

    expect(result.simpleSignals.plan_request).toBe(true);
  });

  it("messagePreprocessorResultSchema accepts plan_request field", () => {
    const parsed = messagePreprocessorResultSchema.parse({
      originalText: "составь план",
      normalizedText: "составь план",
      detectedLanguage: "ru",
      responseLanguage: "ru",
      hasAttachments: false,
      mentionedDates: [],
      simpleSignals: {
        workout: false,
        nutrition: false,
        today: false,
        sleep: false,
        fatigue: false,
        pain: false,
        document: false,
        attachment: false,
        plan_request: true,
      },
      directPathCandidate: null,
    });

    expect(parsed.simpleSignals.plan_request).toBe(true);
  });
});
