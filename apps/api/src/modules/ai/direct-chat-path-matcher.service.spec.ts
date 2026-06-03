import { describe, expect, it } from "vitest";
import { normalizeAiBehaviorConfig } from "@health/types";
import { DirectChatPathMatcherService } from "./direct-chat-path-matcher.service.js";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";
import { createDefaultAiBehaviorConfigService } from "./test-ai-behavior-fixtures.js";

describe("DirectChatPathMatcherService", () => {
  it("detects using loaded repo-backed config", () => {
    const service = new DirectChatPathMatcherService(createDefaultAiBehaviorConfigService());

    expect(service.detect("What's my plan for today?")).toEqual({
      kind: "today_summary_read",
      confidence: 0.95,
      routingMethod: "rule_based",
    });
  });

  it("detectWithConfig reflects injected overrides without code changes", () => {
    const service = new DirectChatPathMatcherService(createDefaultAiBehaviorConfigService());
    const customConfig = normalizeAiBehaviorConfig({
      directPaths: {
        confidence: 0.42,
        kinds: [
          {
            kind: "mark_today_workout_done",
            refreshHintsOnExecuted: [],
            matchPatterns: [{ source: "^done now$", flags: "i" }],
            negativePatterns: [],
            requireWorkoutLexeme: false,
          },
        ],
        detectionOrder: ["mark_today_workout_done"],
      },
    } as unknown as Parameters<typeof normalizeAiBehaviorConfig>[0]).directPaths;

    expect(service.detectWithConfig(customConfig, "done now")).toEqual({
      kind: "mark_today_workout_done",
      confidence: 0.42,
      routingMethod: "rule_based",
    });
    expect(service.detect("Mark today's workout done")).not.toEqual({
      kind: "mark_today_workout_done",
      confidence: 0.42,
      routingMethod: "rule_based",
    });
  });

  it("refresh recompiles after config service reload", () => {
    const defaults = createDefaultAiBehaviorConfigService();
    const service = new DirectChatPathMatcherService(defaults);

    const reloaded = new AiBehaviorConfigService({
      config: normalizeAiBehaviorConfig({
        directPaths: { enabled: false },
      } as Parameters<typeof normalizeAiBehaviorConfig>[0]),
      source: "defaults",
      errors: [],
      warnings: [],
    });

    const refreshedService = new DirectChatPathMatcherService(reloaded);
    refreshedService.refresh();

    expect(refreshedService.detect("What is today?")).toBeNull();
    expect(service.detect("What is today?")).not.toBeNull();
  });
});
