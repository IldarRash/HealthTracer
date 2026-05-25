import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LONGEVITY_TERMS } from "../../lib/longevity-ui-state.js";
import { PROFILE_HUB_SECTIONS } from "../../lib/context-hub-ui-state.js";

const dashboardSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "profile-dashboard.tsx"),
  "utf8",
);

const hierarchySource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "coaching-hierarchy-summary.tsx"),
  "utf8",
);

const contextHubSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../ui/context-hub.tsx"),
  "utf8",
);

function extractQuotedUserCopy(source: string): string[] {
  const matches = source.match(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g) ?? [];
  return matches.map((match) => match.slice(1, -1));
}

describe("ProfileDashboard context hub structure", () => {
  it("uses section navigation with profile hub anchors", () => {
    expect(dashboardSource).toContain("PROFILE_HUB_SECTIONS");
    expect(dashboardSource).toContain('<SectionNav sections={PROFILE_HUB_SECTIONS} ariaLabel="Profile sections" />');
    expect(dashboardSource).toContain("useProfileHubHashScroll");
    expect(dashboardSource).toContain("<ContextHubLayout>");
    expect(dashboardSource).toContain("<ProfileSummaryCard");
  });

  it("defines account, direction, goals, personal, data consent, and documents sections", () => {
    expect(dashboardSource).toContain('sectionId="coaching-hierarchy"');
    expect(dashboardSource).toContain('sectionId="goals"');
    expect(dashboardSource).toContain('sectionId="personal-preferences"');
    expect(dashboardSource).toContain('sectionId="data-consent"');
    expect(dashboardSource).toContain('sectionId="documents"');
    expect(dashboardSource).toContain("Edit in Chat");
    expect(dashboardSource).toContain("Update in Chat");
    expect(dashboardSource).toContain("<GoalsWorkspace />");
    expect(dashboardSource).toContain('<DocumentsWorkspace embedded />');
    expect(dashboardSource).toContain("<MetricsWorkspace embedded />");
  });

  it("does not render weekly analytics or coaching snapshot grids", () => {
    expect(dashboardSource).not.toContain("DashboardGrid");
    expect(dashboardSource).not.toContain("computeWeeklyConsistency");
    expect(dashboardSource).not.toContain("summarizeWorkoutAdherence");
    expect(dashboardSource).not.toContain("summarizeRecentProposals");
    expect(dashboardSource).not.toContain("Coaching snapshot");
    expect(dashboardSource).not.toContain("Weekly consistency");
    expect(dashboardSource).not.toContain("Workout adherence");
    expect(dashboardSource).not.toContain("Recent coach activity");
    expect(dashboardSource).not.toContain("<ContextHubDisclosure");
  });

  it("bridges analytics to Longevity instead of inline dashboard metrics", () => {
    expect(dashboardSource).toContain('className="profile-longevity-bridge"');
    expect(dashboardSource).toContain('href="/longevity"');
    expect(dashboardSource).toContain("Open Longevity →");
  });

  it("embeds metrics and documents inside context section cards", () => {
    expect(dashboardSource).toContain('sectionId="data-consent"');
    expect(dashboardSource).toContain('className="profile-documents"');
    expect(dashboardSource).toContain("<MetricsWorkspace embedded />");
    expect(dashboardSource).toContain('<DocumentsWorkspace embedded />');
  });

  it("lists coach notes once in the personal preferences section", () => {
    expect(dashboardSource).toContain("Coach notes");
    expect(dashboardSource).toContain("coachingNotes");
    expect(dashboardSource.match(/<dt>Coach notes<\/dt>/g)).toHaveLength(1);
    expect(dashboardSource).not.toContain("Personal context");
  });

  it("aligns section nav anchors with rendered profile hub sections", () => {
    const navIds = PROFILE_HUB_SECTIONS.map((section) => section.id);

    expect(navIds).toEqual([
      "account",
      "coaching-hierarchy",
      "goals",
      "personal-preferences",
      "data-consent",
      "documents",
    ]);

    for (const sectionId of navIds) {
      if (sectionId === "account") {
        expect(contextHubSource).toContain('id="account"');
        continue;
      }

      expect(dashboardSource).toContain(`sectionId="${sectionId}"`);
    }
  });

  it("avoids clinical score framing in profile user copy", () => {
    const userCopy = extractQuotedUserCopy(dashboardSource).join(" ").toLowerCase();

    for (const term of FORBIDDEN_LONGEVITY_TERMS) {
      expect(userCopy).not.toContain(term);
    }

    expect(userCopy).not.toContain("coaching snapshot");
    expect(userCopy).not.toContain("recovery score");
  });
});

describe("CoachingHierarchySummaryPanel compact hierarchy", () => {
  it("uses compact hierarchy panel without duplicated personal context", () => {
    expect(hierarchySource).toContain("<CompactGoalHierarchyPanel");
    expect(hierarchySource).not.toContain("<ContextHubDisclosure");
    expect(hierarchySource).not.toContain("Personal context");
    expect(hierarchySource).not.toContain("Preferences, constraints, and coach notes");
  });
});
