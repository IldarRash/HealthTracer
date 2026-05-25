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

function sectionBetween(startMarker: string, endMarker: string): string {
  const start = workspaceSource.indexOf(startMarker);
  const end = workspaceSource.indexOf(endMarker, start + startMarker.length);
  return workspaceSource.slice(start, end === -1 ? undefined : end);
}

describe("TodayWorkspace command-center structure", () => {
  it("defines primary section navigation in Plan → Check-ins → Details order", () => {
    expect(componentSource).toContain('const TODAY_SECTIONS = [');
    expect(componentSource).toMatch(
      /TODAY_SECTIONS[\s\S]*?id: "today-plan"[\s\S]*?id: "today-check-ins"[\s\S]*?id: "today-details"/,
    );
    expect(workspaceSource).toContain('<SectionNav sections={TODAY_SECTIONS} ariaLabel="Today sections" />');
  });

  it("uses task-count hero copy instead of adherence percentage metrics", () => {
    const heroSection = sectionBetween('className="today-hero"', 'className="today-next-action"');

    expect(heroSection).toContain("formatTaskCountChip(adherence)");
    expect(heroSection).toContain("formatAdherenceSummary(adherence)");
    expect(heroSection).not.toContain("formatAdherenceScore");
    expect(heroSection).not.toContain("metric=");
    expect(heroSection).not.toMatch(/\d+%/);
    expect(componentSource).not.toContain("HabitAdherenceSummary");
  });

  it("wires next-action resolution and defers check-in priority while queries load", () => {
    expect(workspaceSource).toContain("resolveTodayNextAction({");
    expect(workspaceSource).toMatch(
      /hasWellbeingCheckIn[\s\S]*?wellbeingQuery\.isLoading \|\| wellbeingQuery\.isError[\s\S]*?null/,
    );
    expect(workspaceSource).toMatch(
      /hasRecoveryCheckIn[\s\S]*?recoveryQuery\.isLoading \|\| recoveryQuery\.isError[\s\S]*?null/,
    );
    expect(workspaceSource).toContain("href={`#${nextAction.anchorId}`}");
    expect(workspaceSource).toContain("{nextAction.ctaLabel} →");
  });

  it("applies smart disclosure defaults from today UI state helpers", () => {
    expect(workspaceSource).toContain('shouldExpandTodayPlanSection("movement"');
    expect(workspaceSource).toContain('shouldExpandTodayPlanSection("nutrition"');
    expect(workspaceSource).toContain('shouldExpandTodayPlanSection("habits"');
    expect(workspaceSource).toContain("shouldExpandTodayCheckInsSection({");
    expect(workspaceSource).toContain("wellbeingCheckInIndicatesCrisisSupport(");
    expect(workspaceSource).toContain("wellbeingIndicatesCrisisSupport");
    expect(workspaceSource).toContain("shouldExpandTodayDetailsSection(nextAction)");
    expect(workspaceSource).toContain("buildTodayDisclosureResetKey(");

    const planPanel = sectionBetween('id="today-plan"', 'id="today-check-ins"');
    expect(planPanel).toMatch(/key=\{buildTodayDisclosureResetKey\("movement"/);
    expect(planPanel).toMatch(/defaultOpen=\{expandMovement\}/);
    expect(planPanel).toMatch(/key=\{buildTodayDisclosureResetKey\("nutrition"/);
    expect(planPanel).toMatch(/defaultOpen=\{expandNutrition\}/);
    expect(planPanel).toMatch(/key=\{buildTodayDisclosureResetKey\("habits"/);
    expect(planPanel).toMatch(/defaultOpen=\{expandHabits\}/);

    const checkInsPanel = sectionBetween('id="today-check-ins"', 'id="today-details"');
    expect(checkInsPanel).toMatch(/key=\{buildTodayDisclosureResetKey\("check-ins"/);
    expect(checkInsPanel).toMatch(/defaultOpen=\{expandCheckIns\}/);
    expect(checkInsPanel).toContain('<h2 id="today-check-ins-heading">Recovery and wellbeing</h2>');

    const detailsPanel = sectionBetween('id="today-details"', "</CommandCenterLayout>");
    expect(detailsPanel).toMatch(/key=\{buildTodayDisclosureResetKey\("details"/);
    expect(detailsPanel).toMatch(/defaultOpen=\{expandDetails\}/);
    expect(detailsPanel).toContain(
      '<h2 id="today-details-heading">Reflection and recent history</h2>',
    );
    expect(detailsPanel).toContain('<h3 id="today-reflection-heading">How did today go?</h3>');
    expect(detailsPanel).toContain('<h3 id="today-history-heading">Past 7 days</h3>');
  });

  it("keeps active crisis support visible outside collapsed check-ins", () => {
    const checkInsPanel = sectionBetween('id="today-check-ins"', 'id="today-details"');

    expect(checkInsPanel).toContain("activeCrisisSupport?.shouldShowCrisisSupport");
    expect(checkInsPanel).toContain('titleId="today-crisis-support-title"');
    expect(checkInsPanel).toContain("<CrisisSupportPanel");
    expect(checkInsPanel).toContain("onCrisisSupportChange={setActiveCrisisSupport}");
    expect(workspaceSource).toContain("setActiveCrisisSupport(null)");
    expect(checkInsPanel.indexOf("<CrisisSupportPanel")).toBeLessThan(
      checkInsPanel.indexOf("ProgressiveDisclosure"),
    );
  });

  it("uses unique section heading ids for aria targets", () => {
    expect(workspaceSource.match(/id="today-details-heading"/g)?.length).toBe(1);
    expect(workspaceSource.match(/id="today-check-ins-heading"/g)?.length).toBe(1);
    expect(workspaceSource.match(/id="today-reflection-heading"/g)?.length).toBe(1);
    expect(workspaceSource.match(/id="today-history-heading"/g)?.length).toBe(1);
    expect(workspaceSource.match(/<h2 id="today-reflection-heading"/g)?.length ?? 0).toBe(0);
  });

  it("keeps major daily actions reachable in section anchors", () => {
    expect(workspaceSource).toContain('id="today-movement"');
    expect(workspaceSource).toContain('id="today-nutrition"');
    expect(workspaceSource).toContain('id="today-habits"');
    expect(workspaceSource).toContain('id="today-reflection"');
    expect(workspaceSource).toContain('id="today-history"');

    expect(workspaceSource).toContain("<TodayWorkoutPanel");
    expect(workspaceSource).toContain("<TodayNutritionCard");
    expect(workspaceSource).toContain("<WellbeingCheckInCard");
    expect(workspaceSource).toContain("<RecoveryCheckInCard");
    expect(workspaceSource).toContain("Mark habit complete");
    expect(workspaceSource).toContain("Save feedback");
    expect(workspaceSource).toContain("formatHistoryTaskCountBadge(entry)");
    expect(workspaceSource).toContain("historyEntrySummaryLabel(entry)");
  });

  it("preserves wellness safety copy for check-ins and reflection", () => {
    expect(workspaceSource).toContain(
      "Recovery and wellbeing snapshots for coaching — not medical assessments.",
    );
    expect(workspaceSource).toContain(
      "Optional wellness context for your coach — energy, difficulty, or a short note.",
    );
    expect(workspaceSource).not.toMatch(/diagnos/i);
    expect(workspaceSource).not.toMatch(/medical treatment/i);
  });

  it("uses canvas loading and error states for the day query", () => {
    expect(workspaceSource).toContain("dayQuery.isLoading");
    expect(workspaceSource).toContain('<CanvasLoadingState title="Loading your day…" />');
    expect(workspaceSource).toContain("dayQuery.isError");
    expect(workspaceSource).toContain('<CanvasErrorState');
    expect(workspaceSource).toContain("<CommandCenterLayout");
  });
});
