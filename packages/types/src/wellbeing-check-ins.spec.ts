import { describe, expect, it } from "vitest";
import { shiftIsoDate } from "./habits.js";
import {
  WELLBEING_CRISIS_SUPPORT_COPY,
  wellbeingCrisisSupportCopySchema,
  aiWellbeingContextSummarySchema,
  buildWellbeingCoachingSummary,
  containsWellbeingCrisisKeyword,
  evaluateWellbeingCrisisFlags,
  evaluateWellbeingCrisisFromText,
  formatWellbeingCrisisSupportReply,
  upsertWellbeingCheckInSchema,
  wellbeingCheckInAggregatesQuerySchema,
  wellbeingCheckInHistoryQuerySchema,
  wellbeingCheckInRecordSchema,
} from "./wellbeing-check-ins.js";

describe("wellbeing check-in schemas", () => {
  it("accepts valid upsert payloads", () => {
    const parsed = upsertWellbeingCheckInSchema.parse({
      moodScore: 4,
      stressScore: 2,
      tags: ["focused"],
      note: "Busy day, feeling okay.",
    });

    expect(parsed.moodScore).toBe(4);
    expect(parsed.tags).toEqual(["focused"]);
  });

  it("rejects out-of-range scores and oversized notes", () => {
    expect(() =>
      upsertWellbeingCheckInSchema.parse({
        moodScore: 6,
        stressScore: 2,
      }),
    ).toThrow();

    expect(() =>
      upsertWellbeingCheckInSchema.parse({
        moodScore: 3,
        stressScore: 3,
        note: "x".repeat(281),
      }),
    ).toThrow();
  });

  it("rejects unknown upsert payload fields and invalid query bounds", () => {
    expect(() =>
      upsertWellbeingCheckInSchema.parse({
        moodScore: 3,
        stressScore: 3,
        rawNoteForAi: "do not accept this field",
      }),
    ).toThrow();

    expect(() => wellbeingCheckInHistoryQuerySchema.parse({ limit: 31 })).toThrow();
    expect(() =>
      wellbeingCheckInAggregatesQuerySchema.parse({ periodType: "weekly", limit: 7 }),
    ).toThrow();
  });

  it("defaults history and aggregate query limits", () => {
    expect(wellbeingCheckInHistoryQuerySchema.parse({})).toEqual({ limit: 14 });
    expect(wellbeingCheckInAggregatesQuerySchema.parse({})).toEqual({
      periodType: "daily",
      limit: 30,
    });
  });

  it("parses stored check-in records", () => {
    const record = wellbeingCheckInRecordSchema.parse({
      id: "a1000001-0000-4000-8000-000000000001",
      userId: "5d6e7f84-5334-4c2f-85f8-6e7a1dff2b81",
      date: "2026-05-25",
      moodScore: 3,
      stressScore: 4,
      tags: [],
      note: null,
      source: "user_entry",
      crisisFlagReasons: [],
      createdAt: "2026-05-25T12:00:00.000Z",
      updatedAt: "2026-05-25T12:00:00.000Z",
    });

    expect(record.moodScore).toBe(3);
  });
});

describe("wellbeing crisis evaluation", () => {
  it("keeps crisis support copy static, parseable, and wellness-safe", () => {
    expect(wellbeingCrisisSupportCopySchema.parse(WELLBEING_CRISIS_SUPPORT_COPY)).toEqual(
      WELLBEING_CRISIS_SUPPORT_COPY,
    );
    expect(WELLBEING_CRISIS_SUPPORT_COPY.resources).toHaveLength(2);
    expect(WELLBEING_CRISIS_SUPPORT_COPY.resources.map((resource) => resource.url)).toEqual([
      "tel:988",
      "https://www.crisistextline.org/",
    ]);

    const copyText = JSON.stringify(WELLBEING_CRISIS_SUPPORT_COPY).toLowerCase();
    expect(copyText).toContain("not a crisis service");
    expect(copyText).not.toContain("diagnosis");
    expect(copyText).not.toContain("treatment");
    expect(copyText).not.toContain("therapy");
  });

  it("flags lowest mood tier with static support copy", () => {
    const evaluation = evaluateWellbeingCrisisFlags({
      moodScore: 1,
      note: "Rough morning.",
    });

    expect(evaluation.shouldShowCrisisSupport).toBe(true);
    expect(evaluation.reasons).toEqual(["lowest_mood"]);
    expect(evaluation.copy).toEqual(WELLBEING_CRISIS_SUPPORT_COPY);
  });

  it("flags crisis keywords without requiring lowest mood", () => {
    const evaluation = evaluateWellbeingCrisisFlags({
      moodScore: 3,
      note: "I do not want to hurt myself, just tired.",
    });

    expect(evaluation.shouldShowCrisisSupport).toBe(true);
    expect(evaluation.reasons).toEqual(["keyword_match"]);
    expect(containsWellbeingCrisisKeyword("Please help, I want to die")).toBe(true);
  });

  it("returns no crisis support for typical wellness entries", () => {
    const evaluation = evaluateWellbeingCrisisFlags({
      moodScore: 4,
      note: "Work stress but manageable.",
    });

    expect(evaluation.shouldShowCrisisSupport).toBe(false);
    expect(evaluation.reasons).toEqual([]);
    expect(evaluation.copy).toBeNull();
  });

  it("evaluates crisis keywords from free text for chat entrypoints", () => {
    const evaluation = evaluateWellbeingCrisisFromText("I want to die and need help");

    expect(evaluation.shouldShowCrisisSupport).toBe(true);
    expect(evaluation.reasons).toEqual(["keyword_match"]);
    expect(evaluation.copy).toEqual(WELLBEING_CRISIS_SUPPORT_COPY);
  });

  describe("Russian-language crisis keyword detection", () => {
    it("flags direct suicide keyword суицид (base form, lowercase)", () => {
      expect(containsWellbeingCrisisKeyword("у меня суицидальные мысли")).toBe(true);
      expect(containsWellbeingCrisisKeyword("суицид — это не выход")).toBe(true);
    });

    it("flags самоубийство and its forms", () => {
      expect(containsWellbeingCrisisKeyword("думаю о самоубийстве")).toBe(true);
      expect(containsWellbeingCrisisKeyword("самоубийства не желаю никому")).toBe(true);
    });

    it("flags убить себя", () => {
      expect(containsWellbeingCrisisKeyword("хочу убить себя")).toBe(true);
    });

    it("flags покончить с собой / с жизнью", () => {
      expect(containsWellbeingCrisisKeyword("хочу покончить с собой")).toBe(true);
      expect(containsWellbeingCrisisKeyword("думаю покончить с жизнью")).toBe(true);
    });

    it("flags не хочу жить variants", () => {
      expect(containsWellbeingCrisisKeyword("я не хочу жить")).toBe(true);
      expect(containsWellbeingCrisisKeyword("не хочу больше жить")).toBe(true);
      expect(containsWellbeingCrisisKeyword("не хочу уже жить")).toBe(true);
    });

    it("flags не хочу жить with up to 2 inserted words (broadened pattern)", () => {
      // "я не хочу так жить" — one inserted word "так"
      expect(containsWellbeingCrisisKeyword("я не хочу так жить")).toBe(true);
      // "не хочу уже так жить" — two inserted words "уже так"
      expect(containsWellbeingCrisisKeyword("не хочу уже так жить")).toBe(true);
    });

    it("flags не хочу жить в этом районе (safe-side over-trigger is intentional for crisis gate)", () => {
      // This phrase is benign in isolation but we deliberately over-trigger here
      // because missing a genuine crisis signal is worse than a false positive.
      // The crisis gate exists to surface support resources, not to diagnose.
      expect(containsWellbeingCrisisKeyword("не хочу жить в этом районе")).toBe(true);
    });

    it("flags свести счёты с жизнью", () => {
      expect(containsWellbeingCrisisKeyword("хочу свести счёты с жизнью")).toBe(true);
    });

    it("flags self-harm verbs порезать себя / навредить себе / причинить себе вред", () => {
      expect(containsWellbeingCrisisKeyword("хочу порезать себя")).toBe(true);
      expect(containsWellbeingCrisisKeyword("хочу навредить себе")).toBe(true);
      expect(containsWellbeingCrisisKeyword("причинить себе вред")).toBe(true);
    });

    it("is case-insensitive for Cyrillic (match via toLowerCase normalization)", () => {
      expect(containsWellbeingCrisisKeyword("Суицид — это больно")).toBe(true);
      expect(containsWellbeingCrisisKeyword("ХОЧУ УБИТЬ СЕБЯ")).toBe(true);
      expect(containsWellbeingCrisisKeyword("Не хочу Жить")).toBe(true);
    });

    it("detects crisis phrase embedded in a longer sentence", () => {
      expect(
        containsWellbeingCrisisKeyword("мне так плохо, я думаю о суициде каждый день"),
      ).toBe(true);
      expect(
        containsWellbeingCrisisKeyword("просто устал, иногда не хочу жить уже"),
      ).toBe(true);
    });

    it("does NOT flag benign fitness/wellness phrases with similar roots", () => {
      // "убиться на тренировке" is colloquial for "train super hard"
      expect(containsWellbeingCrisisKeyword("хочу убиться на тренировке")).toBe(false);
      // general mood without ideation
      expect(containsWellbeingCrisisKeyword("сегодня плохое настроение")).toBe(false);
      // stress without crisis language
      expect(containsWellbeingCrisisKeyword("я очень устал от работы")).toBe(false);
      // вред in non-self context
      expect(containsWellbeingCrisisKeyword("стресс причиняет вред здоровью")).toBe(false);
    });

    it("evaluateWellbeingCrisisFromText returns crisis support for RU phrases", () => {
      const ev = evaluateWellbeingCrisisFromText("мне очень плохо, я хочу покончить с собой");
      expect(ev.shouldShowCrisisSupport).toBe(true);
      expect(ev.reasons).toEqual(["keyword_match"]);
      expect(ev.copy).toEqual(WELLBEING_CRISIS_SUPPORT_COPY);
    });

    it("evaluateWellbeingCrisisFromText returns no crisis support for benign RU fitness message", () => {
      const ev = evaluateWellbeingCrisisFromText("хочу убиться на тренировке, сделай план");
      expect(ev.shouldShowCrisisSupport).toBe(false);
    });
  });

  it("formats static crisis support copy for chat replies", () => {
    const reply = formatWellbeingCrisisSupportReply(WELLBEING_CRISIS_SUPPORT_COPY);

    expect(reply).toContain(WELLBEING_CRISIS_SUPPORT_COPY.title);
    expect(reply).toContain(WELLBEING_CRISIS_SUPPORT_COPY.message);
    expect(reply).toContain("tel:988");
    expect(reply.toLowerCase()).not.toContain("therapy");
  });
});

describe("buildWellbeingCoachingSummary", () => {
  it("builds a note-free coaching summary with trend and sufficiency metadata", () => {
    const summary = buildWellbeingCoachingSummary({
      anchorDate: "2026-05-25",
      generatedAt: "2026-05-25T18:00:00.000Z",
      checkIns: [
        { date: "2026-05-19", moodScore: 2, stressScore: 4 },
        { date: "2026-05-20", moodScore: 3, stressScore: 4 },
        { date: "2026-05-21", moodScore: 3, stressScore: 3 },
        { date: "2026-05-22", moodScore: 4, stressScore: 3 },
        { date: "2026-05-23", moodScore: 4, stressScore: 2 },
        { date: "2026-05-24", moodScore: 4, stressScore: 2 },
        { date: "2026-05-25", moodScore: 5, stressScore: 2 },
      ],
    });

    expect(aiWellbeingContextSummarySchema.parse(summary)).toEqual(summary);
    expect(summary.latestMoodScore).toBe(5);
    expect(summary.latestStressScore).toBe(2);
    expect(summary.checkInCount).toBe(7);
    expect(summary.dataSufficiency).toBe("sufficient");
    expect(summary.moodTrendDirection).toBe("up");
    expect(summary.currentStreak).toBe(7);
    expect(summary).not.toHaveProperty("note");
  });

  it("marks sparse windows as partial or insufficient", () => {
    const partial = buildWellbeingCoachingSummary({
      anchorDate: "2026-05-25",
      checkIns: [
        { date: "2026-05-24", moodScore: 3, stressScore: 3 },
        { date: "2026-05-25", moodScore: 4, stressScore: 2 },
      ],
    });

    expect(partial.dataSufficiency).toBe("partial");
    expect(partial.checkInCount).toBe(2);

    const insufficient = buildWellbeingCoachingSummary({
      anchorDate: "2026-05-25",
      checkIns: [],
    });

    expect(insufficient.dataSufficiency).toBe("insufficient");
    expect(insufficient.latestDate).toBeNull();
  });

  it("uses only the seven-day window for sufficiency and trends", () => {
    const summary = buildWellbeingCoachingSummary({
      anchorDate: "2026-05-25",
      generatedAt: "2026-05-25T18:00:00.000Z",
      checkIns: [
        { date: "2026-05-10", moodScore: 1, stressScore: 5 },
        { date: "2026-05-22", moodScore: 3, stressScore: 3 },
        { date: "2026-05-24", moodScore: 3, stressScore: 3 },
        { date: "2026-05-30", moodScore: 5, stressScore: 1 },
      ],
    });

    expect(summary.latestDate).toBe("2026-05-24");
    expect(summary.checkInCount).toBe(2);
    expect(summary.dataSufficiency).toBe("partial");
    expect(summary.moodTrendDirection).toBe("stable");
    expect(summary.stressTrendDirection).toBe("stable");
  });

  it("shifts iso dates for rolling windows", () => {
    expect(shiftIsoDate("2026-05-25", -6)).toBe("2026-05-19");
  });
});
