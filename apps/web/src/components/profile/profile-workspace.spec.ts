import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LONGEVITY_TERMS } from "../../lib/longevity-ui-state.js";

const workspaceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "profile-workspace.tsx"),
  "utf8",
);

/** Read en.json to verify translation values, not just keys. */
const enMessages = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../messages/en.json"),
    "utf8",
  ),
) as Record<string, unknown>;

function getNestedValue(obj: Record<string, unknown>, keyPath: string): unknown {
  return keyPath.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function extractQuotedUserCopy(source: string): string[] {
  const matches = source.match(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g) ?? [];
  return matches.map((match) => match.slice(1, -1));
}

// ── Layout ─────────────────────────────────────────────────────────

describe("ProfileWorkspace layout", () => {
  it("is a two-column flex layout", () => {
    expect(workspaceSource).toContain("profile-left-col");
    expect(workspaceSource).toContain("profile-right-col");
    expect(workspaceSource).toContain("flex: ");
    expect(workspaceSource).toContain("1 1 0");
  });

  it("renders left column with account header, goal hierarchy, and personal context", () => {
    expect(workspaceSource).toContain("<AccountHeaderCard");
    expect(workspaceSource).toContain("<GoalHierarchyCard");
    expect(workspaceSource).toContain("<PersonalContextCard");
  });

  it("renders right column with documents, devices, and subscription cards", () => {
    expect(workspaceSource).toContain("<DocumentsCard");
    expect(workspaceSource).toContain("<DevicesCard");
    expect(workspaceSource).toContain("<SubscriptionSummaryCard");
  });

  it("has loading, error, and success branches", () => {
    expect(workspaceSource).toContain("<ProfileLoading");
    expect(workspaceSource).toContain("<ProfileError");
    // success branch: returns the two-column layout
    expect(workspaceSource).toContain("profile-left-col");
  });

  it("does not use the old ContextHubLayout or SectionNav", () => {
    expect(workspaceSource).not.toContain("ContextHubLayout");
    expect(workspaceSource).not.toContain("SectionNav");
    expect(workspaceSource).not.toContain("PROFILE_HUB_SECTIONS");
    expect(workspaceSource).not.toContain("useProfileHubHashScroll");
    expect(workspaceSource).not.toContain("ContextSectionCard");
    expect(workspaceSource).not.toContain("ProfileSummaryCard");
    expect(workspaceSource).not.toContain("ProfileDashboard");
  });
});

// ── Account header ─────────────────────────────────────────────────

describe("AccountHeaderCard", () => {
  it("never renders raw Clerk user id as the display name", () => {
    // Guard must reject bare user_… ids (e.g. user_3E5BHAfzaXYJ3R5FEqz7) as well
    // as the dev-email form user_…@clerk.local.
    expect(workspaceSource).toContain("isRawClerkId");
    // Covers both /^user_[A-Za-z0-9]+$/ and @clerk.local forms
    expect(workspaceSource).toContain("user_");
    expect(workspaceSource).toContain("@clerk.local");
    // Falls back to email, then neutral label — never the bare id
    expect(workspaceSource).toContain("user.email");
    // The fallback label key is in the source
    expect(workspaceSource).toContain("account.yourAccount");
    // The en.json value is the expected string
    expect(getNestedValue(enMessages, "Profile.account.yourAccount")).toBe("Your account");
    // The raw Clerk id string "user_…" must never be used as-is as the display name
    expect(workspaceSource).not.toMatch(/safeDisplayName\s*=\s*userId/);
  });

  it("shows the plan chip derived from subscription tier", () => {
    expect(workspaceSource).toContain("<PlanChip");
    expect(workspaceSource).toContain("tier.toUpperCase()");
  });

  it("renders initials avatar, not a real avatar URL", () => {
    expect(workspaceSource).toContain("initials");
    // No src= or img tag for avatar
    expect(workspaceSource).not.toContain("<img");
  });
});

// ── Goal hierarchy ─────────────────────────────────────────────────

describe("GoalHierarchyCard", () => {
  it("renders the quarterly goal with a star icon", () => {
    expect(workspaceSource).toContain('name="star"');
    expect(workspaceSource).toContain("activeQuarterlyGoal.title");
    // Translation key is present
    expect(workspaceSource).toContain("quarterlyGoal");
    expect(getNestedValue(enMessages, "Profile.goals.quarterlyGoal")).toBe("Quarterly goal");
  });

  it("renders weekly focus goals with domain icons and chevron", () => {
    expect(workspaceSource).toContain("weeklyFocus.map");
    expect(workspaceSource).toContain('name="chevR"');
    expect(workspaceSource).toContain("goalDomainIcon");
    expect(workspaceSource).toContain("weeklyGoals");
    expect(getNestedValue(enMessages, "Profile.goals.weeklyGoals")).toBe("Weekly goals");
  });

  it("shows an empty state when no hierarchy content", () => {
    expect(workspaceSource).toContain("hasCoachingHierarchySummary");
    expect(workspaceSource).toContain("noActiveGoals");
    expect(getNestedValue(enMessages, "Profile.goals.noActiveGoals")).toContain("No active goals");
  });

  it("shows the direction subhead when direction is set", () => {
    expect(workspaceSource).toContain("formatHierarchyDirection");
    expect(workspaceSource).toContain('"direction"');
    expect(getNestedValue(enMessages, "Profile.goals.direction")).toBe("Direction");
  });
});

// ── Personal context ───────────────────────────────────────────────

describe("PersonalContextCard", () => {
  it("renders activity level and training experience from profile", () => {
    expect(workspaceSource).toContain("activityLevelLabel");
    expect(workspaceSource).toContain("trainingExperienceLabel");
    expect(workspaceSource).toContain('"activityLevel"');
    expect(workspaceSource).toContain('"trainingExperience"');
    expect(getNestedValue(enMessages, "Profile.personalContext.activityLevel")).toBe("Activity level");
    expect(getNestedValue(enMessages, "Profile.personalContext.trainingExperience")).toBe("Training experience");
  });

  it("does NOT render age or equipment fields (no backend contract)", () => {
    // Only check user-visible label strings for these unbacked fields
    expect(workspaceSource).not.toContain('"Age"');
    expect(workspaceSource).not.toContain('"Equipment"');
    expect(workspaceSource).not.toContain("Возраст");
    expect(workspaceSource).not.toContain("Оборудование");
  });

  it("renders preference and constraint chips", () => {
    expect(workspaceSource).toContain("<PrefChip");
    expect(workspaceSource).toContain("profile.preferences.map");
    expect(workspaceSource).toContain("profile.constraints.map");
  });

  it("renders coaching notes when present", () => {
    expect(workspaceSource).toContain("coachingNotes");
    expect(workspaceSource).toContain('"coachNotes"');
    expect(getNestedValue(enMessages, "Profile.personalContext.coachNotes")).toBe("Coach notes");
  });
});

// ── Documents card ─────────────────────────────────────────────────

describe("DocumentsCard", () => {
  it("wraps DocumentsWorkspace embedded without modifying its logic", () => {
    expect(workspaceSource).toContain("<DocumentsWorkspace embedded />");
  });

  it("has the amber accent (Documents card chrome)", () => {
    expect(workspaceSource).toContain("accent={M.amber}");
    expect(workspaceSource).toContain('"title"');
    expect(getNestedValue(enMessages, "Profile.documents.title")).toBe("Health documents");
    // CardHead passes icon="doc"
    expect(workspaceSource).toContain('icon="doc"');
  });

  it("shows the wellness/privacy framing copy", () => {
    expect(workspaceSource).toContain('"privacyNotice"');
    const notice = getNestedValue(enMessages, "Profile.documents.privacyNotice") as string;
    expect(notice).toContain("Visible only to you");
    expect(notice).toContain("explicit consent");
    expect(notice).toContain("not for");
  });

  it("has the shield icon in the disclaimer", () => {
    expect(workspaceSource).toContain('name="shield"');
  });
});

// ── Devices card (disabled placeholder) ───────────────────────────

describe("DevicesCard", () => {
  it("renders device rows as disabled Toggle switches", () => {
    expect(workspaceSource).toContain("disabled");
    expect(workspaceSource).toContain("<Toggle");
    // comingSoon key used for "Coming soon" copy
    expect(workspaceSource).toContain("comingSoon");
    expect(getNestedValue(enMessages, "Common.comingSoon")).toBe("Coming soon");
  });

  it("does not wire any device connection mutations", () => {
    expect(workspaceSource).not.toContain("connectDevice");
    expect(workspaceSource).not.toContain("grantDeviceConsent");
    expect(workspaceSource).not.toContain("listDeviceConnections");
  });
});

// ── Subscription summary card ──────────────────────────────────────

describe("SubscriptionSummaryCard", () => {
  it("renders the tier label", () => {
    expect(workspaceSource).toContain("freePlan");
    expect(workspaceSource).toContain("proPlan");
    expect(getNestedValue(enMessages, "Profile.subscription.freePlan")).toBe("Free plan");
    expect(getNestedValue(enMessages, "Profile.subscription.proPlan")).toBe("Pro plan");
    expect(workspaceSource).toContain("subscription.tier");
  });

  it("shows AI messages remaining from entitlement", () => {
    expect(workspaceSource).toContain("aiMessagesRemaining");
    expect(workspaceSource).toContain("unlimitedMessages");
    expect(workspaceSource).toContain("messagesRemaining");
    expect(getNestedValue(enMessages, "Profile.subscription.unlimitedMessages")).toBe("Unlimited AI messages");
    expect(getNestedValue(enMessages, "Profile.subscription.messagesRemaining")).toContain("AI messages remaining today");
  });

  it("links to /billing, not duplicating the full pricing UI", () => {
    expect(workspaceSource).toContain('href="/billing"');
    // No pricing table copy
    expect(workspaceSource).not.toContain("monthly");
    expect(workspaceSource).not.toContain("annual");
    expect(workspaceSource).not.toContain("pricing");
  });
});

// ── Anchors for redirect routes ────────────────────────────────────

describe("hash anchor ids for redirect routes", () => {
  it("has #goals anchor for /goals→/profile#goals redirect", () => {
    expect(workspaceSource).toContain('id="goals"');
  });

  it("has #documents anchor for /documents→/profile#documents redirect", () => {
    expect(workspaceSource).toContain('id="documents"');
  });

  it("has #data-consent anchor for /metrics→/profile#data-consent redirect", () => {
    expect(workspaceSource).toContain('id="data-consent"');
  });
});

// ── Wellness language ──────────────────────────────────────────────

describe("wellness language guard", () => {
  it("avoids clinical/diagnostic framing in user-visible copy", () => {
    const userCopy = extractQuotedUserCopy(workspaceSource).join(" ").toLowerCase();

    for (const term of FORBIDDEN_LONGEVITY_TERMS) {
      expect(userCopy).not.toContain(term);
    }

    expect(userCopy).not.toContain("diagnosis");
    expect(userCopy).not.toContain("treatment");
    expect(userCopy).not.toContain("medical certainty");
  });
});
