import { describe, expect, it } from "vitest";
import {
  messageUnderstandingOutputSchema,
  messageUnderstandingResultSchema,
} from "./message-understanding.js";
import {
  buildBoundedMessageUnderstandingCoachSummary,
  buildBoundedMessageUnderstandingMetadata,
  resolveSupplementaryContextSlicesFromUnderstanding,
} from "./message-understanding-routing.js";

describe("message understanding routing", () => {
  it("never maps health_documents needs into supplementary slices", () => {
    const slices = resolveSupplementaryContextSlicesFromUnderstanding(
      ["health_documents", "today_summary"],
      { type: "general_chat", depth: "small", timeRange: "7d" },
    );

    expect(slices).toEqual([
      {
        type: "daily_checkin",
        depth: "small",
        timeRange: "7d",
        includeDocuments: false,
      },
    ]);
  });

  it("builds bounded agent metadata without raw user content", () => {
    const metadata = buildBoundedMessageUnderstandingMetadata({
      ran: true,
      result: messageUnderstandingResultSchema.parse({
        output: messageUnderstandingOutputSchema.parse({
          signals: ["question", "wellness_check_in"],
          entities: [{ kind: "food", value: "secret meal name" }],
          capabilityHints: [{ capabilityId: "adjust_nutrition", confidence: 0.77 }],
          complexity: "moderate",
          directCommand: { detected: false },
          safetyFlags: ["fatigue"],
          needsContext: [],
          confidence: 0.79,
        }),
        source: "llm",
        validationErrors: [],
      }),
    });

    expect(metadata).toMatchObject({
      ran: true,
      source: "llm",
      confidence: 0.79,
      signals: ["question", "wellness_check_in"],
      capabilityHints: [{ capabilityId: "adjust_nutrition", confidence: 0.77 }],
      complexity: "moderate",
    });
    expect(metadata).not.toHaveProperty("entities");
  });

  it("builds bounded coach summary for provider context without proposals", () => {
    const summary = buildBoundedMessageUnderstandingCoachSummary({
      ran: true,
      result: messageUnderstandingResultSchema.parse({
        output: messageUnderstandingOutputSchema.parse({
          signals: ["question", "request_change"],
          entities: [{ kind: "food", value: "a".repeat(120) }],
          capabilityHints: [
            { capabilityId: "adjust_nutrition", confidence: 0.77, rationale: "ignore me" },
          ],
          complexity: "moderate",
          directCommand: { detected: false },
          safetyFlags: ["fatigue"],
          needsContext: ["active_nutrition_plan"],
          confidence: 0.79,
        }),
        source: "llm",
        validationErrors: [],
      }),
    });

    expect(summary).toMatchObject({
      source: "llm",
      confidence: 0.79,
      signals: ["question", "request_change"],
      capabilityHints: [{ capabilityId: "adjust_nutrition", confidence: 0.77 }],
      complexity: "moderate",
      needsContext: ["active_nutrition_plan"],
      safetyFlags: ["fatigue"],
    });
    expect(summary?.entities?.[0]?.value.length).toBeLessThanOrEqual(80);
    expect(summary).not.toHaveProperty("directCommand");
    expect(summary).not.toHaveProperty("validationErrors");
  });
});
