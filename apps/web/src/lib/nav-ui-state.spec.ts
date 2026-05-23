import { describe, expect, it } from "vitest";
import { isActivePath, isNavLinkActive, PRIMARY_NAV_LINKS } from "./nav-ui-state.js";

describe("nav UI state", () => {
  it("exposes the approved primary nav labels only", () => {
    expect(PRIMARY_NAV_LINKS.map((link) => link.label)).toEqual([
      "Chat",
      "Today",
      "Workouts",
      "Nutrition",
      "Metrics",
      "Profile",
    ]);
  });

  it("marks the exact route and nested paths as active", () => {
    expect(isActivePath("/training", "/training")).toBe(true);
    expect(isActivePath("/training/session", "/training")).toBe(true);
    expect(isActivePath("/nutrition", "/training")).toBe(false);
  });

  it("treats legacy aliases as active for merged destinations", () => {
    expect(isActivePath("/progress", "/training", ["/progress"])).toBe(true);
    expect(isActivePath("/recipes", "/nutrition", ["/recipes"])).toBe(true);
    expect(isActivePath("/goals", "/profile", ["/goals", "/documents"])).toBe(true);
    expect(isActivePath("/documents", "/profile", ["/goals", "/documents"])).toBe(true);
  });

  it("resolves active state from primary nav link config", () => {
    const workouts = PRIMARY_NAV_LINKS.find((link) => link.href === "/training");
    const profile = PRIMARY_NAV_LINKS.find((link) => link.href === "/profile");

    expect(workouts).toBeDefined();
    expect(profile).toBeDefined();
    expect(isNavLinkActive("/progress", workouts!)).toBe(true);
    expect(isNavLinkActive("/documents", profile!)).toBe(true);
    expect(isNavLinkActive("/chat", profile!)).toBe(false);
  });
});
