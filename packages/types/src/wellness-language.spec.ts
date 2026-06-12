import { describe, expect, it } from "vitest";
import { containsUnsafeWellnessInsightLanguage } from "./wellness-language.js";

describe("containsUnsafeWellnessInsightLanguage", () => {
  it("flags medical wording", () => {
    expect(containsUnsafeWellnessInsightLanguage("This confirms a diagnosis.")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Your level is deficient.")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Abnormal lab marker")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Outside the normal range")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Increase the dose")).toBe(true);
  });

  it("allows wellness coaching wording", () => {
    expect(
      containsUnsafeWellnessInsightLanguage("Sleep and training completion may be linked"),
    ).toBe(false);
    expect(
      containsUnsafeWellnessInsightLanguage("Vitamin D reading from your lab report"),
    ).toBe(false);
  });

  it("flags Russian medical wording", () => {
    expect(containsUnsafeWellnessInsightLanguage("Это подтверждает диагноз.")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Требуется диагностика щитовидной железы")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Рекомендуется лечение дефицита")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Это нужно лечить")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Назначаю витамин D")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Назначено врачом")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Нужен рецепт от врача")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Увеличьте дозировку")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Увеличьте дозу")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Принимайте препарат")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Подберите медикаменты")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Поможет психотерапия")).toBe(true);
    expect(containsUnsafeWellnessInsightLanguage("Отклонение от нормы")).toBe(true);
  });

  it("allows Russian wellness coaching wording", () => {
    expect(
      containsUnsafeWellnessInsightLanguage("уровень энергии в типичном диапазоне"),
    ).toBe(false);
    expect(
      containsUnsafeWellnessInsightLanguage("Сон и восстановление могут быть связаны"),
    ).toBe(false);
    expect(
      containsUnsafeWellnessInsightLanguage("Показатель витамина D из вашего отчёта"),
    ).toBe(false);
  });
});
