import { describe, expect, it } from "vitest";
import { StubCoachAiProvider } from "./stub-provider.js";

describe("StubCoachAiProvider", () => {
  const provider = new StubCoachAiProvider();

  it("returns typed llm router output without user-facing advice or proposals", async () => {
    const route = await provider.generateIntentRoute({
      userMessage: "I feel completely off today. What should I do?",
      recentMessages: [],
    });

    expect(route.routingMethod).toBe("llm_router");
    expect(route.requiredContextSlices.length).toBeGreaterThan(0);
    expect(route.requiredContextSlices.length).toBeLessThanOrEqual(3);
    expect(route).not.toHaveProperty("reply");
    expect(route).not.toHaveProperty("proposals");
    expect(route).not.toHaveProperty("advice");
  });

  it("selects nutrition and weekly review slices for ambiguous weight-loss messages", async () => {
    const route = await provider.generateIntentRoute({
      userMessage: "Why am I not losing weight?",
      recentMessages: [],
    });

    expect(route.catalogIntentId).toBe("adjust_nutrition");
    expect(route.requiredContextSlices.map((slice) => slice.type)).toEqual(
      expect.arrayContaining(["nutrition_adaptation", "weekly_review"]),
    );
  });

  it("returns user-facing coaching replies from generateCoachResponse only", async () => {
    const output = await provider.generateCoachResponse({
      userMessage: "Explain progressive overload.",
      recentMessages: [],
      coachingContext: {},
      agentMetadata: {
        purpose: "general_chat",
        intent: "general",
        depth: "small",
        timeRange: "7d",
        safetyConstraints: ["Do not diagnose."],
      },
    });

    expect(typeof output.reply).toBe("string");
    expect(output.reply.length).toBeGreaterThan(0);
    expect(Array.isArray(output.proposals)).toBe(true);
  });
});
