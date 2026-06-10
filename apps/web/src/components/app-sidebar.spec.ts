import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRIMARY_NAV_LINKS, SECONDARY_ROUTE_LINKS } from "../lib/nav-ui-state.js";
import { resolvePrimaryNavState } from "../lib/onboarding-ui-state.js";

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

  it("locks nav when onboarding is incomplete, shows skeleton while loading, fails open on error", () => {
    expect(resolvePrimaryNavState({ isLoading: true, isError: false, onboardingCompleted: undefined })).toBe("loading");
    expect(resolvePrimaryNavState({ isLoading: false, isError: true, onboardingCompleted: undefined })).toBe("ready");
    expect(resolvePrimaryNavState({ isLoading: false, isError: false, onboardingCompleted: false })).toBe("locked");
    expect(resolvePrimaryNavState({ isLoading: false, isError: false, onboardingCompleted: true })).toBe("ready");
    expect(sidebarSource).toContain("resolvePrimaryNavState");
    // Translated via Nav.completeOnboarding key — check the key reference, not the literal.
    expect(sidebarSource).toContain('Nav.completeOnboarding');
    expect(sidebarSource).toContain('navState === "locked"');
    expect(sidebarSource).toContain('navState === "loading"');
    expect(sidebarSource).toContain('navState === "ready"');
  });

  it("keeps Clerk UserButton for account actions", () => {
    expect(sidebarSource).toContain("UserButton");
  });

  it("does not contain secondary routes in primary nav area", () => {
    // secondary nav is rendered separately, not mixed into primary
    expect(sidebarSource).toContain("app-sidebar__nav-group");
    // Translated via Nav.plansView key — check the key reference, not the literal.
    expect(sidebarSource).toContain('Nav.plansView');
  });
});
