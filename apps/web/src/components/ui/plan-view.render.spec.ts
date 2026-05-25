import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PLAN_CHANGE_VIA_CHAT_NOTICE,
  formatPlanRevisionTimestamp,
  formatRevisionHistoryCollapsibleSummary,
  planDetailCardClassName,
  planViewCtaClassName,
  planViewPanelClassName,
  revisionBadgeLabel,
} from "../../lib/plan-view-ui-state.js";

const uiDir = dirname(fileURLToPath(import.meta.url));

const planViewSource = readFileSync(join(uiDir, "plan-view.tsx"), "utf8");
const planViewUiStateSource = readFileSync(
  join(uiDir, "../../lib/plan-view-ui-state.ts"),
  "utf8",
);
const stylesSource = readFileSync(join(uiDir, "../../../app/styles.css"), "utf8");
const trainingWorkspaceSource = readFileSync(
  join(uiDir, "../training/training-workspace.tsx"),
  "utf8",
);
const nutritionWorkspaceSource = readFileSync(
  join(uiDir, "../nutrition/nutrition-workspace.tsx"),
  "utf8",
);

describe("Plan view primitive contracts", () => {
  it("defines layout, header, revision badge, and change-via-chat notice", () => {
    expect(planViewSource).toContain("PlanViewLayout");
    expect(planViewSource).toContain("PlanViewGrid");
    expect(planViewSource).toContain("PlanHeader");
    expect(planViewSource).toContain("RevisionBadge");
    expect(planViewSource).toContain("ChangeViaChatNotice");
    expect(planViewSource).toContain('role="note"');
    expect(planViewSource).toContain("PLAN_CHANGE_VIA_CHAT_NOTICE");
    expect(planViewSource).toContain("PLAN_CHANGE_VIA_CHAT_CTA");
    expect(planViewSource).toContain('aria-label={revisionBadgeLabel');
  });

  it("defines week strip, detail cards, facts, and revision history items", () => {
    expect(planViewSource).toContain("PlanWeekStrip");
    expect(planViewSource).toContain("TrendStrip");
    expect(planViewSource).toContain("PlanDetailCard");
    expect(planViewSource).toContain("PlanDetailCardHeader");
    expect(planViewSource).toContain("PlanFacts");
    expect(planViewSource).toContain("RevisionHistoryItem");
    expect(planViewSource).toContain("RevisionHistoryCollapsible");
    expect(planViewSource).toContain("PlanExecutionCallout");
    expect(planViewSource).toContain("PlanViewCtaLink");
    expect(planViewSource).toContain('className={planViewCtaClassName("secondary")}');
  });

  it("keeps presentation tokens separate from domain logic", () => {
    expect(planViewUiStateSource).toContain("PLAN_CHANGE_VIA_CHAT_NOTICE");
    expect(planViewUiStateSource).not.toContain("useQuery");
    expect(planViewUiStateSource).not.toContain("getActiveWorkoutPlan");
    expect(PLAN_CHANGE_VIA_CHAT_NOTICE.toLowerCase()).toContain("read-only");
    expect(PLAN_CHANGE_VIA_CHAT_NOTICE.toLowerCase()).toContain("chat");
  });

  it("maps panel and detail card class tokens for mobile stacking", () => {
    expect(planViewPanelClassName("prominent")).toContain("plan-view__panel--plan");
    expect(planViewPanelClassName("secondary")).toContain("plan-view__panel--history");
    expect(planViewPanelClassName("wide")).toContain("panel-wide");
    expect(planDetailCardClassName(true)).toContain("plan-view__detail-card--active");
    expect(planViewCtaClassName("primary")).toContain("plan-view__cta--primary");
    expect(revisionBadgeLabel(3, true)).toBe("Revision #3 · Active");
    expect(formatPlanRevisionTimestamp("2026-05-25T12:00:00.000Z")).toBeTruthy();
    expect(formatRevisionHistoryCollapsibleSummary(2, 1)).toContain("#1 active");
  });

  it("maps structured plan view styles and responsive stacking", () => {
    expect(stylesSource).toMatch(/\.plan-view__layout[\s\S]*gap:/);
    expect(stylesSource).toMatch(/\.plan-view__header-row[\s\S]*flex-wrap:/);
    expect(stylesSource).toMatch(/@media \(max-width: 899px\)[\s\S]*\.plan-view__header-row/);
    expect(stylesSource).toMatch(/@media \(min-width: 900px\)[\s\S]*grid-template-areas:/);
    expect(stylesSource).toMatch(/\.plan-view__detail-card--active[\s\S]*border-color:/);
    expect(stylesSource).toContain(".plan-view__revision-history-summary");
    expect(stylesSource).toContain(".plan-view__cta--primary");
    expect(stylesSource).toMatch(/@media \(max-width: 899px\)[\s\S]*\.panel-wide/);
  });

  it("contains mobile overflow containment for secondary plan views", () => {
    expect(stylesSource).toMatch(/\.plan-view[\s\S]*min-width:\s*0/);
    expect(stylesSource).toMatch(/\.plan-view__layout > \*[\s\S]*min-width:\s*0/);
    expect(stylesSource).toMatch(/\.plan-view__facts[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(stylesSource).toMatch(/\.plan-view__fact dd[\s\S]*overflow-wrap:\s*break-word/);
    expect(stylesSource).toMatch(/\.plan-view__detail-header strong[\s\S]*overflow-wrap:\s*break-word/);
    expect(stylesSource).toMatch(/@media \(max-width: 480px\)[\s\S]*\.training-progress-panel \.action-row/);
  });

  it("wires training and nutrition workspaces to shared plan view primitives", () => {
    expect(trainingWorkspaceSource).toContain("ChangeViaChatNotice");
    expect(trainingWorkspaceSource).toContain("PlanWeekStrip");
    expect(trainingWorkspaceSource).toContain("buildTrainingWeekStripView");
    expect(trainingWorkspaceSource).toContain("RevisionHistoryCollapsible");
    expect(trainingWorkspaceSource).toContain("PlanViewCtaLink");
    expect(trainingWorkspaceSource).not.toContain("formatTimestamp(");
    expect(nutritionWorkspaceSource).toContain("ChangeViaChatNotice");
    expect(planViewSource).toContain("PLAN_CHANGE_VIA_CHAT_CTA");
    expect(nutritionWorkspaceSource).toContain("PlanFacts");
    expect(nutritionWorkspaceSource).toContain("Log on Today →");
    expect(nutritionWorkspaceSource).toContain("What you've logged today");
    expect(nutritionWorkspaceSource).not.toContain("JSON.stringify");
    expect(nutritionWorkspaceSource).not.toContain("useMutation");
    expect(nutritionWorkspaceSource).not.toContain("Read-only adherence summary");
    expect(nutritionWorkspaceSource).toContain("RevisionHistoryCollapsible");
  });

  it("anchors plan view layout on training-workspace class for light-canvas overrides", () => {
    expect(planViewSource).toContain('"plan-view training-workspace"');
    expect(planViewSource).toContain('"plan-view__layout training-layout"');
    expect(stylesSource).toMatch(
      /\.app-shell__main--structured \.training-workspace \.panel[\s\S]*--color-surface-content-elevated/,
    );
  });

  it("renders revision badge and active history markers from shared primitives", () => {
    expect(planViewSource).toContain("plan-view__revision-badge");
    expect(planViewSource).toContain('aria-label={revisionBadgeLabel');
    expect(planViewSource).toContain('tone="success"');
    expect(planViewSource).toContain('<Badge tone="success">Active</Badge>');
    expect(trainingWorkspaceSource).toContain("revisionNumber={activeRevision.revisionNumber}");
    expect(nutritionWorkspaceSource).toContain("revisionNumber={activeRevision.revisionNumber}");
  });
});
