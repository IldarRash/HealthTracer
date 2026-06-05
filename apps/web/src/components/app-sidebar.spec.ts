import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRIMARY_NAV_LINKS, SECONDARY_ROUTE_LINKS } from "../lib/nav-ui-state.js";
import { shouldHidePrimaryNavDuringOnboarding } from "../lib/onboarding-ui-state.js";

const sidebarSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "app-sidebar.tsx"),
  "utf8",
);

describe("AppSidebar information architecture", () => {
  it("renders all four primary nav tabs and both secondary plan links", () => {
    expect(sidebarSource).toContain("PRIMARY_NAV_LINKS");
    expect(sidebarSource).toContain("SECONDARY_ROUTE_LINKS");
    expect(PRIMARY_NAV_LINKS).toHaveLength(4);
    expect(SECONDARY_ROUTE_LINKS).toHaveLength(2);
  });

  it("includes chat, today, longevity, profile, dumbbell, and fork icon mappings", () => {
    expect(sidebarSource).toContain('"/chat": "chat"');
    expect(sidebarSource).toContain('"/today": "today"');
    expect(sidebarSource).toContain('"/longevity": "longevity"');
    expect(sidebarSource).toContain('"/profile": "profile"');
    expect(sidebarSource).toContain('"/training": "dumbbell"');
    expect(sidebarSource).toContain('"/nutrition": "fork"');
  });

  it("shows the app brand name — not the mockup rename", () => {
    expect(sidebarSource).toContain("AI Health Coach");
    expect(sidebarSource).not.toContain("Health Tracer");
  });

  it("preserves the onboarding gate hint", () => {
    expect(shouldHidePrimaryNavDuringOnboarding(false)).toBe(true);
    expect(shouldHidePrimaryNavDuringOnboarding(undefined)).toBe(true);
    expect(shouldHidePrimaryNavDuringOnboarding(true)).toBe(false);
    expect(sidebarSource).toContain("shouldHidePrimaryNavDuringOnboarding");
    expect(sidebarSource).toContain("Complete onboarding to unlock navigation");
    expect(sidebarSource).toContain("hidePrimaryNav ?");
  });

  it("keeps Clerk UserButton for account actions", () => {
    expect(sidebarSource).toContain("UserButton");
  });

  it("does not contain secondary routes in primary nav area", () => {
    // secondary nav is rendered separately, not mixed into primary
    expect(sidebarSource).toContain("app-sidebar__nav-group");
    expect(sidebarSource).toContain("Plans · view");
  });
});
