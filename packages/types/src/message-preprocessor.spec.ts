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
