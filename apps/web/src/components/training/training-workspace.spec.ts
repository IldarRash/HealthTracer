import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "training-workspace.tsx"),
  "utf8",
);

const progressPanelSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "training-progress-panel.tsx"),
  "utf8",
);

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../app/training/page.tsx"),
  "utf8",
);

describe("TrainingWorkspace read-only contracts", () => {
  it("keeps persistent Chat plan-change notice on active plan views", () => {
    expect(workspaceSource).toContain("ChangeViaChatNotice");
    expect(workspaceSource).toContain('href="/chat"');
  });

  it("routes workout execution to Today without inline mutation controls", () => {
    expect(workspaceSource).toContain("PlanExecutionCallout");
    expect(workspaceSource).toContain("Run workouts from Today");
    expect(workspaceSource).toContain("PlanViewCtaLink");
    expect(workspaceSource).toContain('href="/today"');
    expect(workspaceSource).not.toContain("useMutation");
    expect(workspaceSource).not.toContain("JSON.stringify");
    expect(workspaceSource).not.toContain("proposal-details");
  });

  it("preserves read-only plan display and collapsible revision history", () => {
    expect(workspaceSource).toContain('label="Active plan"');
    expect(workspaceSource).toContain("Training days");
    expect(workspaceSource).toContain("TrainingPlanExerciseItem");
    expect(workspaceSource).toContain("RevisionHistoryCollapsible");
    expect(workspaceSource).toContain("RevisionHistoryItem");
    expect(workspaceSource).toContain("revisionNumber={activeRevision.revisionNumber}");
    expect(workspaceSource).toContain("active={revision.id === activeRevision.id}");
    expect(workspaceSource).toContain('titleId="training-revision-history"');
    expect(workspaceSource).not.toContain('type="checkbox"');
    expect(workspaceSource).toContain("formatPlanRevisionSource");
    expect(workspaceSource).toContain("formatRevisionHistoryMeta");
    expect(workspaceSource).not.toContain("ai_proposal");
  });

  it("embeds weekly progress panel with collapsed review tools", () => {
    expect(workspaceSource).toContain("TrainingProgressPanel");
    expect(progressPanelSource).toContain('summary="Advanced weekly review tools"');
    expect(progressPanelSource).toContain("ProgressiveDisclosure");
  });

  it("uses shared plan view layout classes for structured canvas styling", () => {
    expect(workspaceSource).toContain("PlanViewLayout");
    expect(workspaceSource).toContain("PlanViewGrid");
    expect(workspaceSource).toContain('variant="prominent"');
  });

  it("renders catalog-backed exercise metadata through plan exercise items", () => {
    expect(workspaceSource).toContain("TrainingPlanExerciseItem");
    expect(workspaceSource).not.toContain("useMutation");
    expect(workspaceSource).not.toContain('type="submit"');
  });
});

describe("Training page header copy", () => {
  it("uses Workouts wayfinding title and read-only plan language", () => {
    expect(pageSource).toContain('title="Workouts"');
    expect(pageSource).toContain("Read-only view");
    expect(pageSource).not.toContain("Workouts & Training");
  });
});
