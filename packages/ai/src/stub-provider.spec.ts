import { describe, expect, it } from "vitest";
import { StubCoachAiProvider } from "./stub-provider.js";

describe("StubCoachAiProvider", () => {
  const provider = new StubCoachAiProvider();

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
