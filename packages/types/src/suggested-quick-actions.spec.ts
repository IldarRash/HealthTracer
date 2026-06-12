import { describe, expect, it } from "vitest";
import { buildDefaultAiBehaviorConfig } from "./ai-behavior-config.js";
import { detectDirectChatPathCandidateFromConfig } from "./direct-chat-path-matcher.js";
import { deriveQuickActionsForTurn } from "./suggested-quick-actions.js";

const defaultConfig = buildDefaultAiBehaviorConfig();
const directPathsConfig = defaultConfig.directPaths;
const quickActionsConfig = defaultConfig.suggestedQuickActions;

describe("deriveQuickActionsForTurn", () => {
  it("always includes today_summary_read and weekly_progress_read regardless of selected domains", () => {
    const actions = deriveQuickActionsForTurn({
      selectedDomains: [],
      quickActionsConfig,
    });

    expect(actions.some((a) => a.id === "today_summary_read")).toBe(true);
    expect(actions.some((a) => a.id === "weekly_progress_read")).toBe(true);
  });

  it("includes mark_today_workout_done and workout_plan_read when workout domain is selected", () => {
    const actions = deriveQuickActionsForTurn({
      selectedDomains: ["workout"],
      quickActionsConfig,
    });

    expect(actions.some((a) => a.id === "today_summary_read")).toBe(true);
    expect(actions.some((a) => a.id === "mark_today_workout_done")).toBe(true);
    expect(actions.some((a) => a.id === "workout_plan_read")).toBe(true);
    expect(actions.some((a) => a.id === "nutrition_plan_read")).toBe(false);
  });

  it("includes nutrition_plan_read when nutrition domain is selected", () => {
    const actions = deriveQuickActionsForTurn({
      selectedDomains: ["nutrition"],
      quickActionsConfig,
    });

    expect(actions.some((a) => a.id === "today_summary_read")).toBe(true);
    expect(actions.some((a) => a.id === "nutrition_plan_read")).toBe(true);
    expect(actions.some((a) => a.id === "mark_today_workout_done")).toBe(false);
    expect(actions.some((a) => a.id === "workout_plan_read")).toBe(false);
  });

  it("includes both workout and nutrition quick actions on multi-domain fan-out", () => {
    const actions = deriveQuickActionsForTurn({
      selectedDomains: ["workout", "nutrition"],
      quickActionsConfig,
    });

    const ids = actions.map((a) => a.id);
    expect(ids).toContain("today_summary_read");
    expect(ids).toContain("weekly_progress_read");
    expect(ids).toContain("mark_today_workout_done");
    expect(ids).toContain("workout_plan_read");
    expect(ids).toContain("nutrition_plan_read");
  });

  it("health domain alone adds no domain-specific actions beyond the always-on reads", () => {
    const actions = deriveQuickActionsForTurn({
      selectedDomains: ["health"],
      quickActionsConfig,
    });

    const ids = actions.map((a) => a.id);
    expect(ids).toContain("today_summary_read");
    expect(ids).toContain("weekly_progress_read");
    expect(ids).not.toContain("mark_today_workout_done");
    expect(ids).not.toContain("workout_plan_read");
    expect(ids).not.toContain("nutrition_plan_read");
  });

  it("returns empty array when config has no actions", () => {
    const actions = deriveQuickActionsForTurn({
      selectedDomains: ["workout", "nutrition", "health"],
      quickActionsConfig: { actions: [] },
    });

    expect(actions).toHaveLength(0);
  });

  it("each returned action has required fields", () => {
    const actions = deriveQuickActionsForTurn({
      selectedDomains: ["workout", "nutrition"],
      quickActionsConfig,
    });

    for (const action of actions) {
      expect(action.id).toBeTruthy();
      expect(action.labelEn).toBeTruthy();
      expect(action.labelRu).toBeTruthy();
      expect(action.messageText.en).toBeTruthy();
      expect(action.messageText.ru).toBeTruthy();
    }
  });
});

describe("quick-action messageText round-trip through direct-path matcher", () => {
  it("today_summary_read messageText (EN) matches its own kind", () => {
    const action = quickActionsConfig.actions.find((a) => a.id === "today_summary_read");
    expect(action).toBeDefined();

    const candidate = detectDirectChatPathCandidateFromConfig(
      directPathsConfig,
      action!.messageText.en,
    );
    expect(candidate).not.toBeNull();
    expect(candidate?.kind).toBe("today_summary_read");
  });

  it("today_summary_read messageText (RU) matches its own kind", () => {
    const action = quickActionsConfig.actions.find((a) => a.id === "today_summary_read");
    expect(action).toBeDefined();

    const candidate = detectDirectChatPathCandidateFromConfig(
      directPathsConfig,
      action!.messageText.ru,
    );
    expect(candidate).not.toBeNull();
    expect(candidate?.kind).toBe("today_summary_read");
  });

  it("mark_today_workout_done messageText (EN) matches its own kind", () => {
    const action = quickActionsConfig.actions.find((a) => a.id === "mark_today_workout_done");
    expect(action).toBeDefined();

    const candidate = detectDirectChatPathCandidateFromConfig(
      directPathsConfig,
      action!.messageText.en,
    );
    expect(candidate).not.toBeNull();
    expect(candidate?.kind).toBe("mark_today_workout_done");
  });

  it("mark_today_workout_done messageText (RU) matches its own kind", () => {
    const action = quickActionsConfig.actions.find((a) => a.id === "mark_today_workout_done");
    expect(action).toBeDefined();

    const candidate = detectDirectChatPathCandidateFromConfig(
      directPathsConfig,
      action!.messageText.ru,
    );
    expect(candidate).not.toBeNull();
    expect(candidate?.kind).toBe("mark_today_workout_done");
  });

  it("nutrition_plan_read messageText (EN) matches its own kind", () => {
    const action = quickActionsConfig.actions.find((a) => a.id === "nutrition_plan_read");
    expect(action).toBeDefined();

    const candidate = detectDirectChatPathCandidateFromConfig(
      directPathsConfig,
      action!.messageText.en,
    );
    expect(candidate).not.toBeNull();
    expect(candidate?.kind).toBe("nutrition_plan_read");
  });

  it("nutrition_plan_read messageText (RU) matches its own kind", () => {
    const action = quickActionsConfig.actions.find((a) => a.id === "nutrition_plan_read");
    expect(action).toBeDefined();

    const candidate = detectDirectChatPathCandidateFromConfig(
      directPathsConfig,
      action!.messageText.ru,
    );
    expect(candidate).not.toBeNull();
    expect(candidate?.kind).toBe("nutrition_plan_read");
  });

  it.each(["en", "ru"] as const)(
    "weekly_progress_read messageText (%s) matches its own kind",
    (language) => {
      const action = quickActionsConfig.actions.find((a) => a.id === "weekly_progress_read");
      expect(action).toBeDefined();

      const candidate = detectDirectChatPathCandidateFromConfig(
        directPathsConfig,
        action!.messageText[language],
      );
      expect(candidate).not.toBeNull();
      expect(candidate?.kind).toBe("weekly_progress_read");
    },
  );

  it.each(["en", "ru"] as const)(
    "workout_plan_read messageText (%s) matches its own kind",
    (language) => {
      const action = quickActionsConfig.actions.find((a) => a.id === "workout_plan_read");
      expect(action).toBeDefined();

      const candidate = detectDirectChatPathCandidateFromConfig(
        directPathsConfig,
        action!.messageText[language],
      );
      expect(candidate).not.toBeNull();
      expect(candidate?.kind).toBe("workout_plan_read");
    },
  );
});
