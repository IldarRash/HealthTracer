import { describe, expect, it } from "vitest";
import {
  PLAN_CHANGE_VIA_CHAT_CTA,
  PLAN_CHANGE_VIA_CHAT_NOTICE,
  formatPlanRevisionSource,
  formatPlanRevisionTimestamp,
  formatRevisionHistoryCollapsibleSummary,
  formatRevisionHistoryMeta,
  planDetailCardClassName,
  planViewCtaClassName,
  planViewPanelClassName,
  revisionBadgeLabel,
} from "./plan-view-ui-state.js";

describe("plan-view-ui-state", () => {
  it("defines read-only plan change notice without automatic update language", () => {
    expect(PLAN_CHANGE_VIA_CHAT_NOTICE).toContain("read-only");
    expect(PLAN_CHANGE_VIA_CHAT_NOTICE).toContain("proposal");
    expect(PLAN_CHANGE_VIA_CHAT_NOTICE.toLowerCase()).not.toContain("automatically");
    expect(PLAN_CHANGE_VIA_CHAT_CTA).toBe("Change this plan in Chat →");
  });

  it("maps panel variants to shared training layout hooks", () => {
    expect(planViewPanelClassName("prominent")).toContain("training-plan-panel");
    expect(planViewPanelClassName("secondary")).toContain("training-history-panel");
    expect(planViewPanelClassName("wide")).toContain("panel-wide");
  });

  it("maps active revision detail cards and badge labels", () => {
    expect(planDetailCardClassName(false)).not.toContain("--active");
    expect(planDetailCardClassName(true)).toContain("active");
    expect(revisionBadgeLabel(2, false)).toBe("Revision #2");
    expect(revisionBadgeLabel(2, true)).toBe("Revision #2 · Active");
  });

  it("formats revision timestamps for display", () => {
    expect(formatPlanRevisionTimestamp("2026-05-25T15:30:00.000Z")).toMatch(/2026/);
  });

  it("maps CTA hierarchy classes for Today vs Chat actions", () => {
    expect(planViewCtaClassName("primary")).toContain("plan-view__cta--primary");
    expect(planViewCtaClassName("secondary")).toContain("plan-view__cta--secondary");
  });

  it("summarizes revision history for collapsible disclosure", () => {
    expect(formatRevisionHistoryCollapsibleSummary(0)).toBe("No earlier revisions");
    expect(formatRevisionHistoryCollapsibleSummary(1, 2)).toBe("1 plan revision · #2 active");
    expect(formatRevisionHistoryCollapsibleSummary(3, 4)).toBe("3 plan revisions · #4 active");
    expect(formatRevisionHistoryCollapsibleSummary(2)).toBe("2 plan revisions");
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
