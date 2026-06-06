import { describe, expect, it } from "vitest";
import {
  formatPlanRevisionSource,
  formatPlanRevisionTimestamp,
  formatRevisionHistoryMeta,
} from "./plan-view-ui-state.js";

describe("plan-view-ui-state", () => {
  it("formats revision timestamps for display", () => {
    expect(formatPlanRevisionTimestamp("2026-05-25T15:30:00.000Z")).toMatch(/2026/);
  });

  it("humanizes plan revision source labels for display", () => {
    expect(formatPlanRevisionSource("ai_proposal")).toBe("Coach proposal");
    expect(formatPlanRevisionSource("health_tracer_seed")).toBe("Starter plan");
    expect(formatPlanRevisionSource("manual_update")).toBe("Manual Update");
  });

  it("formats revision history meta with humanized source and timestamp", () => {
    expect(formatRevisionHistoryMeta("ai_proposal", "2026-05-25T15:30:00.000Z")).toMatch(
      /Coach proposal · .*2026/,
    );
  });
});
