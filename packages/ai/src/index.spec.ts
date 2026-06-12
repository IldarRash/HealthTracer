import { describe, expect, it } from "vitest";
import {
  containsUnsafeMedicalLanguage,
  parseAiStructuredOutput,
  validateProposalSafety,
  validateReplySafety,
} from "./index.js";

describe("ai structured output", () => {
  it("parses valid coach output", () => {
    const result = parseAiStructuredOutput({
      reply: "Here is a suggestion to review.",
      proposals: [],
    });

    expect(result.ok).toBe(true);
  });

  it("rejects malformed coach output", () => {
    const result = parseAiStructuredOutput({
      reply: "",
      proposals: [],
    });

    expect(result.ok).toBe(false);
  });
});

describe("ai safety helpers", () => {
  it("flags diagnosis wording", () => {
    expect(
      containsUnsafeMedicalLanguage("This sounds like a clinical diagnosis."),
    ).toBe(true);
  });

  it("flags unsafe proposals and replies", () => {
    expect(
      validateProposalSafety({
        intent: "summarize_progress",
        targetDomain: "general",
        title: "Treatment plan",
        reason: "You should take medication for this.",
        proposedChanges: {},
      }),
    ).toHaveLength(1);

    expect(
      validateReplySafety("I can prescribe a treatment for your symptoms."),
    ).toHaveLength(1);
  });

  // Phase 4 adversarial regression — deep-review prompts must never let a
  // diagnostic/treatment reply or proposal through, in EN or RU.
  it("rejects a reply answering «какая болезнь это вызвала» with a disease attribution", () => {
    expect(
      validateReplySafety(
        "Болезнь, которая это вызвала — скорее всего гипотиреоз. Мой диагноз: гипотиреоз.",
      ),
    ).toHaveLength(1);
  });

  it("rejects a reply answering 'what treatment should I start' with treatment guidance", () => {
    expect(
      validateReplySafety(
        "Based on your six-month trends, you should start treatment with anti-inflammatory medication.",
      ),
    ).toHaveLength(1);
  });

  it("rejects a progress-review proposal whose reason carries treatment wording", () => {
    expect(
      validateProposalSafety({
        intent: "adapt_workout_plan_from_progress",
        targetDomain: "workout",
        title: "Recovery block",
        reason: "Adherence fell to 40% in May, so begin a treatment course for your condition.",
        proposedChanges: {},
      }),
    ).toHaveLength(1);
  });

  it("allows an honest non-diagnostic deep-review reply over the same trends", () => {
    expect(
      validateReplySafety(
        "Over the last 180 days your workout adherence dropped from 85% to 40% while average " +
          "fatigue rose — the data does not show why you feel unwell. Would you like to focus " +
          "on the last 6 weeks of recovery?",
      ),
    ).toEqual([]);
  });

  it("flags therapy and therapist wording", () => {
    expect(containsUnsafeMedicalLanguage("A therapist can help you process this.")).toBe(
      true,
    );
    expect(containsUnsafeMedicalLanguage("Try CBT exercises for anxiety.")).toBe(true);
    expect(containsUnsafeMedicalLanguage("This may indicate mental illness.")).toBe(true);
  });

  it("allows normal wellness wording without therapy blocks", () => {
    expect(
      containsUnsafeMedicalLanguage(
        "Your stress and motivation look lower this week, so recovery habits may help.",
      ),
    ).toBe(false);
    expect(validateReplySafety("Recovery and stress check-ins can guide wellness habits.")).toEqual(
      [],
    );
  });

  it("flags unsafe wording inside serialized proposed changes", () => {
    expect(
      validateProposalSafety({
        intent: "create_workout_plan",
        targetDomain: "workout",
        title: "Strength plan",
        reason: "Build consistency.",
        proposedChanges: {
          title: "Plan",
          summary: "Follow this clinical treatment protocol.",
          days: [{ day: "Day 1", focus: "Strength" }],
        },
      }),
    ).toHaveLength(1);
  });

  it("rejects save_body_analysis proposal whose reason contains unsafe medical wording", () => {
    // The body analysis is wellness/visual only — medical-certainty language in the
    // proposal reason must be flagged before the proposal can be accepted.
    const errors = validateProposalSafety({
      intent: "save_body_analysis",
      targetDomain: "body",
      title: "Анализ тела",
      reason: "This confirms a diagnosis of high body fat disorder.",
      proposedChanges: {
        date: "2026-06-08",
        source: "chat",
        fatPctMin: 28,
        fatPctMax: 32,
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts save_body_analysis proposal with wellness-only reason", () => {
    // A correctly framed body analysis proposal must pass safety validation.
    const errors = validateProposalSafety({
      intent: "save_body_analysis",
      targetDomain: "body",
      title: "Анализ тела",
      reason:
        "Примерная визуальная оценка по трём фото: жировая масса около 18–22%, тонус средний.",
      proposedChanges: {
        date: "2026-06-08",
        source: "chat",
        fatPctMin: 18,
        fatPctMax: 22,
        muscleTone: "average",
        strongGroups: ["chest"],
        weakGroups: ["lower_back"],
        muscleMap: { chest: "strong", lower_back: "weak" },
      },
    });
    expect(errors).toEqual([]);
  });

  it("rejects save_body_analysis proposal whose title contains diagnostic language", () => {
    const errors = validateProposalSafety({
      intent: "save_body_analysis",
      targetDomain: "body",
      title: "Metabolic disorder treatment plan",
      reason: "Visual assessment.",
      proposedChanges: {
        date: "2026-06-08",
        source: "chat",
        fatPctMin: 30,
        fatPctMax: 35,
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  // ── C2 nutrition + weeklyPlan safety ───────────────────────────────

  it("rejects create_nutrition_plan proposal whose summary contains medical wording", () => {
    // A plan proposal carrying medical-certainty language in its summary must be
    // caught before it can be accepted and create a new revision.
    const errors = validateProposalSafety({
      intent: "create_nutrition_plan",
      targetDomain: "nutrition",
      title: "Питание на неделю",
      reason: "Coach set the weekly structure.",
      proposedChanges: {
        title: "Weekly plan",
        summary: "Follow this clinical treatment protocol for weight loss.",
        caloriesPerDay: 2000,
        mealStructure: [{ label: "Breakfast", timingHint: null }],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects adjust_nutrition_plan proposal whose weeklyPlan meal text contains medical wording", () => {
    // Medical-certainty language embedded inside weeklyPlan meal strings is
    // serialized into proposedChanges and must trigger the safety check.
    const errors = validateProposalSafety({
      intent: "adjust_nutrition_plan",
      targetDomain: "nutrition",
      title: "Plan adjustment",
      reason: "Adjust based on adherence.",
      proposedChanges: {
        title: "Adjusted plan",
        summary: "Adjusted for adherence.",
        caloriesPerDay: 2200,
        mealStructure: [{ label: "Breakfast", timingHint: null }],
        weeklyPlan: [
          {
            weekday: 1,
            breakfast: "Oatmeal",
            lunch: "Salad",
            snack: "Fruit",
            dinner: "Prescribe medication with dinner",
            kcal: 2000,
          },
        ],
      },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  // ── Russian unsafe medical language patterns ──────────────────────────────

  describe("Russian-language unsafe medical language detection", () => {
    it("flags диагноз (direct diagnosis)", () => {
      expect(containsUnsafeMedicalLanguage("поставлю вам диагноз: ожирение")).toBe(true);
    });

    it("flags диагностирую", () => {
      expect(containsUnsafeMedicalLanguage("диагностирую у вас нарушение")).toBe(true);
    });

    it("flags назначаю + pharmaceutical co-occurrence (prescribing)", () => {
      // Requires a pharmaceutical co-occurrence noun within 60 chars after назначаю.
      expect(containsUnsafeMedicalLanguage("назначаю вам препарат")).toBe(true);
      expect(containsUnsafeMedicalLanguage("назначаю дозу антибиотиков")).toBe(true);
      expect(containsUnsafeMedicalLanguage("назначаю курс лекарств")).toBe(true);
      expect(containsUnsafeMedicalLanguage("назначаю таблетки от давления")).toBe(true);
    });

    it("does NOT flag назначаю for coaching scheduling language (false-positive regression)", () => {
      // "назначаю вам встречу в зале" is scheduling / coaching language, not prescribing.
      // The narrowed pattern requires a pharmaceutical noun within 60 chars after назначаю.
      expect(containsUnsafeMedicalLanguage("назначаю вам встречу в зале")).toBe(false);
      expect(containsUnsafeMedicalLanguage("назначаю тренировку на понедельник")).toBe(false);
    });

    it("flags рецепт на + pharmaceutical word (prescription for a drug)", () => {
      expect(containsUnsafeMedicalLanguage("выпишу рецепт на антибиотики")).toBe(true);
      expect(containsUnsafeMedicalLanguage("дам рецепт на препарат")).toBe(true);
    });

    it("flags принимайте по … таблетки (dosing instruction)", () => {
      expect(
        containsUnsafeMedicalLanguage("принимайте по 2 таблетки в день"),
      ).toBe(true);
    });

    it("flags дозировка препарата (pharmaceutical dosing)", () => {
      expect(containsUnsafeMedicalLanguage("дозировка препарата — 500 мг")).toBe(true);
      expect(containsUnsafeMedicalLanguage("уточните дозировка лекарства у врача")).toBe(true);
    });

    it("flags лечение заболевания in prescriptive context", () => {
      expect(containsUnsafeMedicalLanguage("курс лечения заболевания почек")).toBe(true);
      expect(containsUnsafeMedicalLanguage("лечу это заболевание витаминами")).toBe(true);
    });

    it("flags психотерапия / психотерапевт", () => {
      expect(containsUnsafeMedicalLanguage("рекомендую курс психотерапии")).toBe(true);
      expect(containsUnsafeMedicalLanguage("психотерапевт поможет вам")).toBe(true);
    });

    it("is case-insensitive for Cyrillic (match via toLower normalization)", () => {
      expect(containsUnsafeMedicalLanguage("НАЗНАЧАЮ ВАМ ПРЕПАРАТ")).toBe(true);
      expect(containsUnsafeMedicalLanguage("Диагноз: диабет второго типа")).toBe(true);
    });

    it("does NOT flag general wellness coaching text in Russian", () => {
      // Metaphorical use of терапия in wellness context
      expect(
        containsUnsafeMedicalLanguage("план тренировок — лучшая терапия от стресса"),
      ).toBe(false);
      // Physical rehabilitation phrasing (лечение without заболевание co-present)
      expect(containsUnsafeMedicalLanguage("лечение растяжкой помогает восстановиться")).toBe(
        false,
      );
      // Protein dosing — nutrition, not pharmaceutical
      expect(
        containsUnsafeMedicalLanguage("дозировка белка: 2 г на кг тела"),
      ).toBe(false);
      // принимайте without tablet dosing
      expect(
        containsUnsafeMedicalLanguage("принимайте участие в марафоне каждую неделю"),
      ).toBe(false);
      // рецепт in culinary context
      expect(containsUnsafeMedicalLanguage("рецепт на ужин — куриная грудка")).toBe(false);
      // General wellness discussion with лечение but not заболевание
      expect(
        containsUnsafeMedicalLanguage(
          "лечение спортивных травм включает покой и растяжку",
        ),
      ).toBe(false);
      // Fitness plan without medical language
      expect(
        containsUnsafeMedicalLanguage(
          "составляю тренировочный план для набора мышечной массы",
        ),
      ).toBe(false);
      // Negated disclaimer — "не диагноз" must not trigger (lookbehind for "не ")
      expect(
        containsUnsafeMedicalLanguage(
          "примерная визуальная оценка по фото, не замер состава тела и не диагноз.",
        ),
      ).toBe(false);
      expect(containsUnsafeMedicalLanguage("это не диагноз и не медицинское заключение")).toBe(
        false,
      );
    });

    it("validateReplySafety catches Russian unsafe medical language", () => {
      expect(
        validateReplySafety("я ставлю вам диагноз: метаболический синдром"),
      ).toHaveLength(1);
      expect(
        validateReplySafety("назначаю вам курс лечения заболевания"),
      ).toHaveLength(1);
    });

    it("validateReplySafety passes normal Russian coaching replies", () => {
      expect(
        validateReplySafety(
          "хорошо, вот план тренировок на три дня, подобранный под твои цели",
        ),
      ).toEqual([]);
      expect(
        validateReplySafety(
          "план питания — лучшая терапия от хронического стресса",
        ),
      ).toEqual([]);
    });
  });

  it("accepts create_nutrition_plan proposal with weeklyPlan and wellness-only copy", () => {
    // A correctly-framed weekly plan proposal must pass safety validation.
    const errors = validateProposalSafety({
      intent: "create_nutrition_plan",
      targetDomain: "nutrition",
      title: "Рацион на неделю",
      reason: "Примерный план питания на неделю, ккал — оценочно.",
      proposedChanges: {
        title: "Weekly balanced plan",
        summary: "Balanced macros across 7 days, calories approximate.",
        caloriesPerDay: 2200,
        mealStructure: [{ label: "Breakfast", timingHint: "07:30" }],
        weeklyPlan: [
          { weekday: 1, breakfast: "Овсянка + яйца", lunch: "Индейка, гречка", snack: "Творог", dinner: "Треска, овощи", kcal: 2040 },
          { weekday: 2, breakfast: "Яичница, тост", lunch: "Куриный суп", snack: "Яблоко", dinner: "Говядина, рис", kcal: 2100 },
          { weekday: 3, breakfast: "Гречка, яйца", lunch: "Лосось, овощи", snack: "Кефир", dinner: "Куриная грудка", kcal: 2050 },
          { weekday: 4, breakfast: "Омлет, хлеб", lunch: "Тефтели", snack: "Творог", dinner: "Минтай, брокколи", kcal: 2200 },
          { weekday: 5, breakfast: "Овсянка, банан", lunch: "Индейка, булгур", snack: "Орех-микс", dinner: "Куриное филе", kcal: 2080 },
          { weekday: 6, breakfast: "Блины, ягоды", lunch: "Говядина, гречка", snack: "Батончик", dinner: "Лосось, рис", kcal: 2400 },
          { weekday: 7, breakfast: "Яичница, томаты", lunch: "Куриный бульон", snack: "Кефир, фрукты", dinner: "Запечённые овощи", kcal: 1950 },
        ],
      },
    });
    expect(errors).toEqual([]);
  });
});
