import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "today-workspace.tsx"),
  "utf8",
);

const workspaceStart = componentSource.indexOf("export function TodayWorkspace");
const workspaceSource = componentSource.slice(workspaceStart);

describe("TodayWorkspace two-column WHOOP dashboard", () => {
  // ── Layout ──────────────────────────────────────────────────────

  it("renders a two-column grid layout (not a CommandCenter/SectionNav)", () => {
    expect(workspaceSource).not.toContain("CommandCenterLayout");
    expect(workspaceSource).not.toContain("SectionNav");
    expect(workspaceSource).not.toContain("TODAY_SECTIONS");
    // Two-column grid: uses flex with two child divs
    expect(workspaceSource).toContain("flex: \"1.7 1 0\"");
    expect(workspaceSource).toContain("flex: \"1 1 0\"");
  });

  it("has loading and error states (TodayLoading / TodayError)", () => {
    expect(workspaceSource).toContain("dayQuery.isLoading");
    expect(workspaceSource).toContain("dayQuery.isError");
    expect(componentSource).toContain("function TodayLoading");
    expect(componentSource).toContain("function TodayError");
    expect(componentSource).toContain("Loading your day");
  });

  it("has an empty state (EmptyHero) that links to goals and chat", () => {
    expect(componentSource).toContain("function EmptyHero");
    expect(componentSource).toContain("Your day will appear here");
    expect(componentSource).toContain('href="/goals"');
    expect(componentSource).toContain("Create your first goal");
    expect(componentSource).toContain("Ask the coach");
  });

  // ── Recovery band (DayStrip) ─────────────────────────────────────

  it("renders the qualitative recovery band label — not a numeric readiness score", () => {
    expect(componentSource).toContain("function DayStrip");
    expect(componentSource).toContain("well_supported");
    expect(componentSource).toContain("moderate_load");
    expect(componentSource).toContain("prioritize_recovery");
    expect(componentSource).toContain("Solid recovery support");
    expect(componentSource).toContain("data-testid=\"recovery-band-chip\"");
    expect(componentSource).toContain("data-testid=\"recovery-focus-hint\"");
    // No numeric readiness percentage
    expect(componentSource).not.toContain("readinessScore");
    expect(componentSource).not.toContain("readiness_score");
  });

  it("wires DayStrip to the recoveryQuery (not dayQuery)", () => {
    expect(workspaceSource).toContain("<DayStrip");
    expect(workspaceSource).toContain("band={recoveryBand}");
    expect(workspaceSource).toContain("focusMessage={focusMessage}");
    expect(workspaceSource).toContain("isLoading={recoveryQuery.isLoading}");
    expect(workspaceSource).toContain("buildRecoveryFocusView(recoveryContext)");
  });

  // ── Left column cards ────────────────────────────────────────────

  it("renders Movement card (MoveCard) in the left column", () => {
    expect(componentSource).toContain("function MoveCard");
    expect(workspaceSource).toContain("<MoveCard");
    expect(componentSource).toContain("Movement");
    expect(componentSource).toContain("Open workout plan");
    expect(componentSource).toContain("No workout scheduled today");
  });

  it("renders Nutrition + water card (FoodCard) in the left column", () => {
    expect(componentSource).toContain("function FoodCard");
    expect(workspaceSource).toContain("<FoodCard");
    expect(componentSource).toContain("Nutrition today");
    expect(componentSource).toContain("Open nutrition plan");
    // Water segment row
    expect(componentSource).toContain("WATER_SEGMENT_COUNT");
    expect(componentSource).toContain("<SegmentRow");
    expect(componentSource).toContain("Water");
  });

  it("renders Habits card (HabitsCard) in the left column", () => {
    expect(componentSource).toContain("function HabitsCard");
    expect(workspaceSource).toContain("<HabitsCard");
    expect(componentSource).toContain("Habits today");
    expect(componentSource).toContain("Mark habit complete");
    expect(componentSource).toContain("No habits scheduled");
  });

  // ── Right column cards ───────────────────────────────────────────

  it("renders Wellbeing check-in card (CheckinCard) in the right column with MoodDotScale", () => {
    expect(componentSource).toContain("function CheckinCard");
    expect(workspaceSource).toContain("<CheckinCard");
    expect(componentSource).toContain("<MoodDotScale");
    expect(componentSource).toContain("Wellbeing check-in");
    expect(componentSource).toContain("Save check-in");
    // Stress: 3-segment display (Low/Moderate/High)
    expect(componentSource).toContain("Low");
    expect(componentSource).toContain("Moderate");
    expect(componentSource).toContain("High");
  });

  it("renders Reflection card (ReflectCard) in the right column", () => {
    expect(componentSource).toContain("function ReflectCard");
    expect(workspaceSource).toContain("<ReflectCard");
    expect(componentSource).toContain("Save note");
    expect(componentSource).toContain("What went well today");
  });

  it("renders quick-links card at the bottom of the right column", () => {
    expect(workspaceSource).toContain("Weekly workout plan");
    expect(workspaceSource).toContain("Weekly nutrition plan");
    expect(workspaceSource).toContain("Talk to your coach");
    expect(workspaceSource).toContain('href="/training"');
    expect(workspaceSource).toContain('href="/nutrition"');
    expect(workspaceSource).toContain('href="/chat"');
  });

  // ── Crisis support ───────────────────────────────────────────────

  it("elevates crisis support above the column grid when active", () => {
    expect(workspaceSource).toContain("activeCrisisSupport?.shouldShowCrisisSupport");
    expect(workspaceSource).toContain("<CrisisSupportPanel");
    expect(workspaceSource).toContain('titleId="today-crisis-support-title"');
    expect(workspaceSource).toContain("onCrisisSupportChange={setActiveCrisisSupport}");
    // Crisis panel is declared before the two-column grid div
    expect(workspaceSource.indexOf("<CrisisSupportPanel")).toBeLessThan(
      workspaceSource.indexOf("Two-column grid"),
    );
  });

  // ── Progress chip ────────────────────────────────────────────────

  it("shows a task-count progress chip in the top bar", () => {
    expect(workspaceSource).toContain("formatTaskCountChip(adherence)");
    expect(workspaceSource).toContain("All done");
    // No numeric % adherence score in the top bar
    expect(workspaceSource).not.toContain("formatAdherenceScore");
    expect(workspaceSource).not.toContain("HabitAdherenceSummary");
  });

  // ── Per-exercise drill-down (Slice 3) ───────────────────────────────────────

  it("renders ExerciseDrillDown inside MoveCard for started sessions", () => {
    expect(componentSource).toContain("function ExerciseDrillDown");
    expect(componentSource).toContain("shouldShowExerciseDrillDown");
    expect(componentSource).toContain("buildExerciseDrillDownRows");
    expect(componentSource).toContain("buildQuickActionPayload");
  });

  it("MoveCard per-exercise actions use complete and skip — no plan mutations", () => {
    const moveCardEnd = componentSource.indexOf("// ── Nutrition + water card");
    const moveCardRegion = componentSource.slice(
      componentSource.indexOf("function MoveCard"),
      moveCardEnd,
    );
    expect(moveCardRegion).toContain("onComplete");
    expect(moveCardRegion).toContain("onSkip");
    expect(moveCardRegion).toContain("updateWorkoutSessionExercise");
    // No plan mutations
    expect(moveCardRegion).not.toContain("acceptProposal");
    expect(moveCardRegion).not.toContain("applyProposal");
  });

  it("per-exercise updates invalidate Today, Training active, and progress query keys", () => {
    expect(componentSource).toContain("getWorkoutExecutionRefreshQueryKeys");
    expect(componentSource).toContain("invalidateQueries");
  });

  it("session-level Mark done button is preserved alongside the drill-down", () => {
    expect(componentSource).toContain("Mark done");
    expect(componentSource).toContain("workoutItemDone");
  });

  // ── Per-exercise Adjust form (Slice 4) ──────────────────────────────────────

  it("ExerciseDrillDown accepts an onAdjust prop alongside complete/skip", () => {
    const drillDownEnd = componentSource.indexOf("// ── Movement card");
    const drillDownRegion = componentSource.slice(
      componentSource.indexOf("function ExerciseDrillDown"),
      drillDownEnd,
    );
    expect(drillDownRegion).toContain("onAdjust");
    expect(drillDownRegion).toContain("ExerciseFeedbackFormState");
  });

  it("Adjust button renders per non-terminal exercise row and toggles the form", () => {
    const drillDownEnd = componentSource.indexOf("// ── Movement card");
    const drillDownRegion = componentSource.slice(
      componentSource.indexOf("function ExerciseDrillDown"),
      drillDownEnd,
    );
    expect(drillDownRegion).toContain("Adjust");
    expect(drillDownRegion).toContain("adjustOpen");
    expect(drillDownRegion).toContain("handleToggleAdjust");
    expect(drillDownRegion).toContain("aria-expanded");
  });

  it("Adjust form contains all updateWorkoutSessionExerciseSchema fields", () => {
    const drillDownEnd = componentSource.indexOf("// ── Movement card");
    const drillDownRegion = componentSource.slice(
      componentSource.indexOf("function ExerciseDrillDown"),
      drillDownEnd,
    );
    // Status is set implicitly to "adjusted" — not a form field
    expect(drillDownRegion).toContain("actualReps");
    expect(drillDownRegion).toContain("actualWeightKg");
    expect(drillDownRegion).toContain("perceivedEffort");
    expect(drillDownRegion).toContain("perceivedDifficulty");
    expect(drillDownRegion).toContain("notes");
    expect(drillDownRegion).toContain("loadAdjustmentNotes");
    expect(drillDownRegion).toContain("discomfortFlag");
  });

  it("Adjust form is pre-filled via exerciseFeedbackToFormState", () => {
    const drillDownEnd = componentSource.indexOf("// ── Movement card");
    const drillDownRegion = componentSource.slice(
      componentSource.indexOf("function ExerciseDrillDown"),
      drillDownEnd,
    );
    expect(drillDownRegion).toContain("exerciseFeedbackToFormState");
  });

  it("Adjust form Save button is gated by canSubmitExerciseExecutionUpdate", () => {
    const drillDownEnd = componentSource.indexOf("// ── Movement card");
    const drillDownRegion = componentSource.slice(
      componentSource.indexOf("function ExerciseDrillDown"),
      drillDownEnd,
    );
    expect(drillDownRegion).toContain("canSubmitExerciseExecutionUpdate");
    expect(drillDownRegion).toContain("canSaveAdjust");
  });

  it("Adjust form payload uses buildExerciseExecutionUpdatePayload with status=adjusted", () => {
    const moveCardEnd = componentSource.indexOf("// ── Nutrition + water card");
    const moveCardRegion = componentSource.slice(
      componentSource.indexOf("function MoveCard"),
      moveCardEnd,
    );
    expect(moveCardRegion).toContain("buildExerciseExecutionUpdatePayload");
    expect(moveCardRegion).toContain("adjusted");
    expect(moveCardRegion).toContain("handleExerciseAdjust");
  });

  it("Adjust form has accessible labels for all inputs", () => {
    const drillDownEnd = componentSource.indexOf("// ── Movement card");
    const drillDownRegion = componentSource.slice(
      componentSource.indexOf("function ExerciseDrillDown"),
      drillDownEnd,
    );
    // Each input should have an htmlFor label referencing its id
    expect(drillDownRegion).toContain("adjust-reps-");
    expect(drillDownRegion).toContain("adjust-weight-");
    expect(drillDownRegion).toContain("adjust-rpe-");
    expect(drillDownRegion).toContain("adjust-notes-");
    expect(drillDownRegion).toContain("adjust-load-notes-");
    expect(drillDownRegion).toContain("htmlFor");
  });

  it("Adjust form shows error state when submit is attempted with empty form", () => {
    const drillDownEnd = componentSource.indexOf("// ── Movement card");
    const drillDownRegion = componentSource.slice(
      componentSource.indexOf("function ExerciseDrillDown"),
      drillDownEnd,
    );
    expect(drillDownRegion).toContain("adjustError");
    expect(drillDownRegion).toContain('role="alert"');
    expect(drillDownRegion).toContain("Enter at least one value");
  });

  it("Adjust form collapses after successful submit", () => {
    const drillDownEnd = componentSource.indexOf("// ── Movement card");
    const drillDownRegion = componentSource.slice(
      componentSource.indexOf("function ExerciseDrillDown"),
      drillDownEnd,
    );
    // On submit, the form closes by removing the id from adjustOpenIds
    expect(drillDownRegion).toContain("handleAdjustSubmit");
    expect(drillDownRegion).toContain("next.delete(rowId)");
  });

  it("Adjust form same-row query invalidation path (onAdjust triggers invalidation)", () => {
    const moveCardEnd = componentSource.indexOf("// ── Nutrition + water card");
    const moveCardRegion = componentSource.slice(
      componentSource.indexOf("function MoveCard"),
      moveCardEnd,
    );
    // handleExerciseAdjust calls invalidateQueries same as complete/skip
    expect(moveCardRegion).toContain("handleExerciseAdjust");
    expect(moveCardRegion).toContain("getWorkoutExecutionRefreshQueryKeys");
  });

  // ── Wellness language guard ──────────────────────────────────────

  it("never uses diagnostic or medical-certainty language", () => {
    expect(componentSource).not.toMatch(/diagnos/i);
    expect(componentSource).not.toMatch(/medical treatment/i);
    expect(componentSource).not.toMatch(/treat your/i);
  });
});
