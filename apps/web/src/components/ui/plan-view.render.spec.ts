import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  formatPlanRevisionSource,
  formatPlanRevisionTimestamp,
  formatRevisionHistoryMeta,
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
  it("retains PlanFacts for exercise catalog details", () => {
    expect(planViewSource).toContain("PlanFacts");
    expect(planViewSource).toContain("plan-view__facts");
    expect(planViewSource).toContain("plan-view__fact");
  });

  it("keeps presentation tokens separate from domain logic", () => {
    expect(planViewUiStateSource).not.toContain("useQuery");
    expect(planViewUiStateSource).not.toContain("getActiveWorkoutPlan");
    expect(planViewUiStateSource).toContain("formatPlanRevisionTimestamp");
    expect(planViewUiStateSource).toContain("formatPlanRevisionSource");
  });

  it("formats timestamps and sources for display", () => {
    expect(formatPlanRevisionTimestamp("2026-05-25T12:00:00.000Z")).toBeTruthy();
    expect(formatPlanRevisionSource("ai_proposal")).toBe("Coach proposal");
    expect(formatPlanRevisionSource("health_tracer_seed")).toBe("Starter plan");
    expect(formatRevisionHistoryMeta("ai_proposal", "2026-05-25T15:30:00.000Z")).toMatch(
      /Coach proposal · .*2026/,
    );
  });

  it("maps structured plan view styles for facts layout", () => {
    expect(stylesSource).toMatch(/\.plan-view__facts[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(stylesSource).toMatch(/\.plan-view__fact dd[\s\S]*overflow-wrap:\s*break-word/);
  });

  it("wires training and nutrition workspaces to dark-world primitives", () => {
    // Training workspace — redesigned to use dark-world primitives
    expect(trainingWorkspaceSource).toContain("ChangeBanner");
    expect(trainingWorkspaceSource).toContain("buildTrainingWeekStripView");
    expect(trainingWorkspaceSource).toContain("RevisionHistoryDark");
    expect(trainingWorkspaceSource).toContain("DailyExecCard");
    expect(trainingWorkspaceSource).not.toContain("formatTimestamp(");
    expect(trainingWorkspaceSource).not.toContain("useMutation");

    // Nutrition workspace — redesigned to use dark-world primitives
    expect(nutritionWorkspaceSource).toContain("ChangeBanner");
    expect(nutritionWorkspaceSource).toContain("RevisionFacts");
    expect(nutritionWorkspaceSource).toContain("RevisionHistoryDark");
    expect(nutritionWorkspaceSource).toContain("DailyExecCard");
    expect(nutritionWorkspaceSource).toContain("Log in Today");
    expect(nutritionWorkspaceSource).not.toContain("JSON.stringify");
    expect(nutritionWorkspaceSource).not.toContain("useMutation");
    expect(nutritionWorkspaceSource).toContain("revisionNumber={activeRevision.revisionNumber}");
  });

  it("confirms dead plan-view components are removed from workspaces", () => {
    expect(trainingWorkspaceSource).not.toContain("PlanViewLayout");
    expect(trainingWorkspaceSource).not.toContain("PlanExecutionCallout");
    expect(trainingWorkspaceSource).not.toContain("ChangeViaChatNotice");
    expect(trainingWorkspaceSource).not.toContain("PlanWeekStrip");
    expect(nutritionWorkspaceSource).not.toContain("PlanViewLayout");
    expect(nutritionWorkspaceSource).not.toContain("ChangeViaChatNotice");
    expect(nutritionWorkspaceSource).not.toContain("PlanExecutionCallout");
  });

  it("confirms revision badge and history are served by dark-world primitives", () => {
    expect(trainingWorkspaceSource).toContain("revisionNumber={activeRevision.revisionNumber}");
    expect(nutritionWorkspaceSource).toContain("revisionNumber={activeRevision.revisionNumber}");
    expect(trainingWorkspaceSource).toContain("RevisionHistoryDark");
    expect(nutritionWorkspaceSource).toContain("RevisionHistoryDark");
  });
});
