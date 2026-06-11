import { describe, expect, it } from "vitest";
import {
  formatPlanRevisionSource,
  formatPlanRevisionTimestamp,
  formatRevisionHistoryMeta,
  formatRevisionReason,
} from "./plan-view-ui-state.js";

describe("plan-view-ui-state", () => {
  it("formats revision timestamps as date-only (no time/comma truncation)", () => {
    const ts = formatPlanRevisionTimestamp("2026-05-25T15:30:00.000Z");
    expect(ts).toMatch(/2026/);
    // Must not include a time component (colon in time part)
    expect(ts).not.toMatch(/\d:\d/);
  });

  it("humanizes plan revision source labels for display", () => {
    expect(formatPlanRevisionSource("ai_proposal")).toBe("Coach proposal");
    expect(formatPlanRevisionSource("health_tracer_seed")).toBe("Starter plan");
    expect(formatPlanRevisionSource("manual_update")).toBe("Manual Update");
  });

  it("formats revision history meta with humanized source and date-only timestamp", () => {
    expect(formatRevisionHistoryMeta("ai_proposal", "2026-05-25T15:30:00.000Z")).toMatch(
      /Coach proposal · .*2026/,
    );
  });

  it("formatRevisionReason falls back for empty or duplicate reasons", () => {
    // Empty reason → fallback
    expect(formatRevisionReason("", null, 1)).toBe("Initial plan");
    expect(formatRevisionReason("   ", null, 2)).toBe("Plan updated by your coach");
    // First revision with reason
    expect(formatRevisionReason("Coach built initial plan", null, 1)).toBe("Coach built initial plan");
    // Duplicate of previous → fallback
    expect(formatRevisionReason("Same reason", "Same reason", 3)).toBe("Plan updated by your coach");
    // Different from previous → use it
    expect(formatRevisionReason("Added cardio days", "Initial plan", 2)).toBe("Added cardio days");
  });
});
