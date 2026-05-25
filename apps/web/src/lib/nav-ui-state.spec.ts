import { describe, expect, it } from "vitest";
import {
  findSecondaryRoute,
  isActivePath,
  isNavLinkActive,
  isSecondaryRoute,
  PRIMARY_NAV_LINKS,
  SECONDARY_ROUTE_LINKS,
} from "./nav-ui-state.js";

describe("nav UI state", () => {
  it("exposes the four approved primary nav tabs only", () => {
    expect(PRIMARY_NAV_LINKS.map((link) => link.label)).toEqual([
      "Chat",
      "Today",
      "Longevity",
      "Profile",
    ]);
    expect(PRIMARY_NAV_LINKS.map((link) => link.href)).toEqual([
      "/chat",
      "/today",
      "/longevity",
      "/profile",
    ]);
  });

  it("keeps Training and Nutrition as secondary routes outside primary nav", () => {
    expect(SECONDARY_ROUTE_LINKS.map((link) => link.label)).toEqual([
      "Workouts",
      "Nutrition",
    ]);
    expect(PRIMARY_NAV_LINKS.some((link) => link.href === "/training")).toBe(false);
    expect(PRIMARY_NAV_LINKS.some((link) => link.href === "/nutrition")).toBe(false);
  });

  it("marks the exact route and nested paths as active", () => {
    expect(isActivePath("/longevity", "/longevity")).toBe(true);
    expect(isActivePath("/longevity/trends", "/longevity")).toBe(true);
    expect(isActivePath("/today", "/longevity")).toBe(false);
  });

  it("treats legacy aliases as active for secondary and profile routes", () => {
    const workouts = SECONDARY_ROUTE_LINKS.find((link) => link.href === "/training");
    const nutrition = SECONDARY_ROUTE_LINKS.find((link) => link.href === "/nutrition");
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

  it("resolves secondary routes without highlighting primary tabs", () => {
    expect(isSecondaryRoute("/training")).toBe(true);
    expect(isSecondaryRoute("/progress")).toBe(true);
    expect(isSecondaryRoute("/nutrition")).toBe(true);
    expect(isSecondaryRoute("/longevity")).toBe(false);

    const training = findSecondaryRoute("/training");
    expect(training?.label).toBe("Workouts");
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
