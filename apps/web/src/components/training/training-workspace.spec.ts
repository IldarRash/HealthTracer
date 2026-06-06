/**
 * training-workspace.spec.ts — structural contracts for the redesigned Workouts screen.
 *
 * The spec uses source-text analysis (no DOM render) to verify:
 *  - read-only invariants (no mutations, chat/today links)
 *  - all 5 UI states are wired (loading / error / empty / done / video)
 *  - dark-world primitives are used (ChangeBanner, DailyExecCard, RevisionFacts, etc.)
 *  - video state manages local state without plan mutation
 *  - TrainingProgressPanel integration is preserved
 *
 * Updated from old plan-view assertions (PlanExecutionCallout, PlanViewLayout, etc.)
 * to match the redesigned dark-world component set.
 */
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
  it("renders ChangeBanner on both done and empty states — no plan edits allowed", () => {
    expect(workspaceSource).toContain("ChangeBanner");
    expect(workspaceSource).toContain('href="/chat"');
    expect(workspaceSource).not.toContain("useMutation");
    expect(workspaceSource).not.toContain("JSON.stringify");
  });

  it("routes workout execution to Today via DailyExecCard and Today links", () => {
    expect(workspaceSource).toContain("DailyExecCard");
    expect(workspaceSource).toContain("Execution happens on Today");
    expect(workspaceSource).toContain('href="/today"');
    expect(workspaceSource).not.toContain("acceptProposal");
    expect(workspaceSource).not.toContain("applyProposal");
  });

  it("shows revision context via RevisionFacts and RevisionHistoryDark", () => {
    expect(workspaceSource).toContain("RevisionFacts");
    expect(workspaceSource).toContain("RevisionHistoryDark");
    expect(workspaceSource).toContain("formatPlanRevisionSource");
    expect(workspaceSource).toContain("formatPlanRevisionTimestamp");
    expect(workspaceSource).not.toContain("ai_proposal");
  });

  it("embeds TrainingProgressPanel for weekly progress section", () => {
    expect(workspaceSource).toContain("TrainingProgressPanel");
    expect(workspaceSource).toContain("WeeklyProgressSection");
    expect(progressPanelSource).toContain('summary="Advanced weekly review tools"');
    expect(progressPanelSource).toContain("ProgressiveDisclosure");
  });

  it("uses dark-world LoadingScreen for the loading state", () => {
    expect(workspaceSource).toContain("LoadingScreen");
    expect(workspaceSource).toContain("Loading your training plan");
    expect(workspaceSource).toContain('layout="plan"');
  });

  it("wires all five states: loading, error, empty, done, video", () => {
    expect(workspaceSource).toContain("isLoading");
    expect(workspaceSource).toContain("isError");
    expect(workspaceSource).toContain("ErrorState");
    expect(workspaceSource).toContain("ActivePlanHeader");
    expect(workspaceSource).toContain("TodaySession");
    expect(workspaceSource).toContain("ExerciseVideo");
    expect(workspaceSource).toContain("selectedExerciseIndex");
  });

  it("manages video view with local state only — no URL or plan mutations", () => {
    expect(workspaceSource).toContain("useState");
    expect(workspaceSource).toContain("setSelectedExerciseIndex");
    expect(workspaceSource).toContain("onBack");
    expect(workspaceSource).not.toContain("useRouter");
    expect(workspaceSource).not.toContain("router.push");
    expect(workspaceSource).not.toContain("useMutation");
  });

  it("renders TodaySession with MediaCard grid and Today deep-link", () => {
    expect(workspaceSource).toContain("MediaCard");
    expect(workspaceSource).toContain("TodaySession");
    expect(workspaceSource).toContain("onOpenExercise");
  });

  it("renders the weekly schedule via WeekList with plan day data", () => {
    expect(workspaceSource).toContain("WeekList");
    expect(workspaceSource).toContain("getWorkoutPlanDayLabel");
    expect(workspaceSource).toContain("getWorkoutPlanDayKey");
  });

  it("includes adaptation pack teaser in WeeklyProgressSection", () => {
    expect(workspaceSource).toContain("WeeklyProgressSection");
    expect(workspaceSource).toContain("Adaptation pack ready to discuss");
  });

  it("ExerciseVideo has back navigation, filmstrip, and honest technique empty state", () => {
    expect(workspaceSource).toContain("ExerciseVideo");
    expect(workspaceSource).toContain("Back to plan");
    expect(workspaceSource).not.toContain("TECHNIQUE_CUES");
    expect(workspaceSource).toContain("Technique guidance coming soon");
    expect(workspaceSource).toContain("PlayBadge");
    expect(workspaceSource).toContain("onSelectExercise");
    expect(workspaceSource).toContain("filmstrip");
  });

  it("CoachNotes renders when plan payload has notes", () => {
    expect(workspaceSource).toContain("CoachNotes");
    expect(workspaceSource).toContain("payload.notes");
  });

  it("avoids diagnosis or treatment language in component copy", () => {
    expect(workspaceSource).not.toMatch(/diagnos/i);
    expect(workspaceSource).not.toMatch(/treatment protocol/i);
    expect(workspaceSource).not.toMatch(/clinical/i);
  });
});

describe("Training page header copy", () => {
  it("uses Workouts wayfinding title and read-only plan language", () => {
    expect(pageSource).toContain('title="Workouts"');
    expect(pageSource).toContain("Read-only view");
    expect(pageSource).not.toContain("Workouts & Training");
  });
});
