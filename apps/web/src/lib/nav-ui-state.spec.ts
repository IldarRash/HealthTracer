import { describe, expect, it } from "vitest";
import { isActivePath, isNavLinkActive, PRIMARY_NAV_LINKS } from "./nav-ui-state.js";

describe("nav UI state", () => {
  it("exposes the approved primary nav labels only", () => {
    expect(PRIMARY_NAV_LINKS.map((link) => link.label)).toEqual([
      "Chat",
      "Today",
      "Longevity",
      "Workouts",
      "Nutrition",
      "Profile",
    ]);
  });

  it("marks the exact route and nested paths as active", () => {
    expect(isActivePath("/longevity", "/longevity")).toBe(true);
    expect(isActivePath("/longevity/trends", "/longevity")).toBe(true);
    expect(isActivePath("/today", "/longevity")).toBe(false);
  });

  it("treats legacy aliases as active for destination tabs", () => {
    const workouts = PRIMARY_NAV_LINKS.find((link) => link.href === "/training");
    const nutrition = PRIMARY_NAV_LINKS.find((link) => link.href === "/nutrition");
    const profile = PRIMARY_NAV_LINKS.find((link) => link.href === "/profile");

    expect(workouts).toBeDefined();
    expect(nutrition).toBeDefined();
    expect(profile).toBeDefined();
    expect(isNavLinkActive("/training", workouts!)).toBe(true);
    expect(isNavLinkActive("/progress", workouts!)).toBe(true);
    expect(isNavLinkActive("/nutrition", nutrition!)).toBe(true);
    expect(isNavLinkActive("/recipes", nutrition!)).toBe(true);
    expect(isNavLinkActive("/goals", profile!)).toBe(true);
    expect(isNavLinkActive("/documents", profile!)).toBe(true);
    expect(isNavLinkActive("/metrics", profile!)).toBe(true);
  });

  it("resolves active state from primary nav link config", () => {
    const workouts = PRIMARY_NAV_LINKS.find((link) => link.href === "/training");
    const profile = PRIMARY_NAV_LINKS.find((link) => link.href === "/profile");

    expect(workouts).toBeDefined();
    expect(profile).toBeDefined();
    expect(isNavLinkActive("/training", workouts!)).toBe(true);
    expect(isNavLinkActive("/documents", profile!)).toBe(true);
    expect(isNavLinkActive("/chat", profile!)).toBe(false);
  });

  it("highlights Longevity only for its route and nested paths", () => {
    const chat = PRIMARY_NAV_LINKS.find((link) => link.href === "/chat");
    const today = PRIMARY_NAV_LINKS.find((link) => link.href === "/today");
    const longevity = PRIMARY_NAV_LINKS.find((link) => link.href === "/longevity");

    expect(chat).toBeDefined();
    expect(today).toBeDefined();
    expect(longevity).toBeDefined();
    expect(isNavLinkActive("/longevity", longevity!)).toBe(true);
    expect(isNavLinkActive("/longevity/insights", longevity!)).toBe(true);
    expect(isNavLinkActive("/longevity", chat!)).toBe(false);
    expect(isNavLinkActive("/longevity", today!)).toBe(false);
    expect(isNavLinkActive("/today", longevity!)).toBe(false);
    expect(isNavLinkActive("/training", longevity!)).toBe(false);
    expect(isNavLinkActive("/nutrition", longevity!)).toBe(false);
  });
});
