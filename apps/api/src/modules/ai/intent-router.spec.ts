import { describe, expect, it } from "vitest";
import { WEEKLY_REVIEW_CHAT_PROMPT } from "@health/types";
import { routeAgentIntent } from "./intent-router.js";

describe("routeAgentIntent", () => {
  it("routes workout adaptation messages conservatively", () => {
    const route = routeAgentIntent("I feel tired today. Should I train?");

    expect(route.intent).toBe("adjust_workout");
    expect(route.purpose).toBe("workout_adaptation");
    expect(route.includeDocuments).toBe(false);
    expect(route.routingMethod).toBe("rule_based");
    expect(route.isConfident).toBe(true);
    expect(route.confidence).toBeGreaterThanOrEqual(0.75);
    expect(route.requiredContextSlices).toHaveLength(1);
    expect(route.requiredContextSlices[0]?.type).toBe("workout_adaptation");
  });

  it("routes nutrition messages to nutrition adaptation", () => {
    const route = routeAgentIntent("What should I eat for dinner tonight?");

    expect(route.intent).toBe("adjust_nutrition");
    expect(route.purpose).toBe("nutrition_adaptation");
  });

  it("routes explicit health document requests to health context", () => {
    const route = routeAgentIntent("Can you consider my blood test results?");

    expect(route.intent).toBe("ask_health_context");
    expect(route.purpose).toBe("health_context");
    expect(route.includeDocuments).toBe(true);
  });

  it("routes weekly review prompt to review progress", () => {
    const route = routeAgentIntent(WEEKLY_REVIEW_CHAT_PROMPT);

    expect(route.intent).toBe("review_progress");
    expect(route.purpose).toBe("weekly_review");
  });

  it("defaults unknown messages to general chat without confident routing", () => {
    const route = routeAgentIntent("Thanks for the encouragement!");

    expect(route.intent).toBe("general");
    expect(route.purpose).toBe("general_chat");
    expect(route.depth).toBe("small");
    expect(route.isConfident).toBe(false);
    expect(route.confidence).toBeLessThan(0.75);
    expect(route.expectedResponseMode).toBe("advice_only");
  });

  it("marks ambiguous multi-domain messages as uncertain", () => {
    const route = routeAgentIntent("I feel tired and hungry all the time. What should I do?");

    expect(route.isConfident).toBe(false);
    expect(route.safetyFlags).toEqual(
      expect.arrayContaining(["fatigue", "hunger"]),
    );
  });

  it("marks vague off-day messages as uncertain even when partially matched", () => {
    const route = routeAgentIntent("I feel completely off today. What should I do?");

    expect(route.isConfident).toBe(false);
  });

  it("routes today check-in cues separately from workout adaptation", () => {
    const todayRoute = routeAgentIntent("What should I do today?");
    const workoutRoute = routeAgentIntent("Should I train today? I feel sore.");

    expect(todayRoute.intent).toBe("ask_about_today");
    expect(todayRoute.purpose).toBe("daily_checkin");
    expect(workoutRoute.intent).toBe("adjust_workout");
    expect(workoutRoute.purpose).toBe("workout_adaptation");
  });

  it("routes nutrition questions without opening document context", () => {
    const route = routeAgentIntent("How much protein should I eat at dinner?");

    expect(route.intent).toBe("adjust_nutrition");
    expect(route.purpose).toBe("nutrition_adaptation");
    expect(route.includeDocuments).toBe(false);
  });

  it("prefers health document routing when nutrition and lab context overlap", () => {
    const route = routeAgentIntent(
      "My blood test says I need more protein. Can you consider my lab results?",
    );

    expect(route.intent).toBe("ask_health_context");
    expect(route.purpose).toBe("health_context");
    expect(route.includeDocuments).toBe(true);
  });

  it("routes informal weekly review phrases to review progress", () => {
    const route = routeAgentIntent("Can you review my week and summarize progress?");

    expect(route.intent).toBe("review_progress");
    expect(route.purpose).toBe("weekly_review");
    expect(route.timeRange).toBe("7d");
  });

  it("prefers nutrition when food or macro terms are the primary ask", () => {
    const route = routeAgentIntent("How much protein should I eat after training?");

    expect(route.intent).toBe("adjust_nutrition");
    expect(route.purpose).toBe("nutrition_adaptation");
  });

  it("routes Russian strength training messages to workout adaptation", () => {
    const route = routeAgentIntent("я хочу сосредоточится на силовых тренировках");

    expect(route.intent).toBe("adjust_workout");
    expect(route.purpose).toBe("workout_adaptation");
  });

  it("routes Russian nutrition plan messages to nutrition adaptation", () => {
    const route = routeAgentIntent("а подбери и запиши мне план питания");

    expect(route.intent).toBe("adjust_nutrition");
    expect(route.purpose).toBe("nutrition_adaptation");
    expect(route.includeDocuments).toBe(false);
  });

  it("keeps workout priority for fatigue and should-i-train adaptation asks", () => {
    const route = routeAgentIntent(
      "I trained yesterday and feel sore. Should I train today?",
    );

    expect(route.intent).toBe("adjust_workout");
    expect(route.purpose).toBe("workout_adaptation");
  });
});
