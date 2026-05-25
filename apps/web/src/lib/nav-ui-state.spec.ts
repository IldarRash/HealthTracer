import { describe, expect, it } from "vitest";
import {
  findSecondaryRoute,
  getNavLinkAriaCurrent,
  getNavLinkClassNames,
  isActivePath,
  isNavLinkActive,
  isSecondaryRoute,
  PRIMARY_NAV_LINKS,
  resolveSecondaryRouteWayfinding,
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

  it("marks Chat as the sole featured primary tab", () => {
    const featured = PRIMARY_NAV_LINKS.filter((link) => link.featured === true);
    expect(featured).toHaveLength(1);
    expect(featured[0]?.href).toBe("/chat");
    expect(featured[0]?.label).toBe("Chat");
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

  it("resolves secondary route wayfinding with Today as parent", () => {
    expect(resolveSecondaryRouteWayfinding("/nutrition")).toEqual({
      parent: { href: "/today", label: "Today" },
      current: { label: "Nutrition" },
    });
    expect(resolveSecondaryRouteWayfinding("/training")).toEqual({
      parent: { href: "/today", label: "Today" },
      current: { label: "Workouts" },
    });
    expect(resolveSecondaryRouteWayfinding("/progress")).toEqual({
      parent: { href: "/today", label: "Today" },
      current: { label: "Workouts" },
    });
    expect(resolveSecondaryRouteWayfinding("/recipes")).toEqual({
      parent: { href: "/today", label: "Today" },
      current: { label: "Nutrition" },
    });
    expect(resolveSecondaryRouteWayfinding("/longevity")).toBeUndefined();
    expect(resolveSecondaryRouteWayfinding("/today")).toBeUndefined();
    expect(resolveSecondaryRouteWayfinding("/profile")).toBeUndefined();
    expect(resolveSecondaryRouteWayfinding("/metrics")).toBeUndefined();
    expect(resolveSecondaryRouteWayfinding("/goals")).toBeUndefined();
    expect(resolveSecondaryRouteWayfinding("/documents")).toBeUndefined();
  });

  it("does not treat profile alias routes as secondary plan views", () => {
    expect(isSecondaryRoute("/goals")).toBe(false);
    expect(isSecondaryRoute("/documents")).toBe(false);
    expect(isSecondaryRoute("/metrics")).toBe(false);
    expect(findSecondaryRoute("/goals")).toBeUndefined();
  });

  it("activates Chat only on chat routes", () => {
    const chat = PRIMARY_NAV_LINKS.find((link) => link.href === "/chat");
    expect(chat).toBeDefined();
    expect(isNavLinkActive("/chat", chat!)).toBe(true);
    expect(isNavLinkActive("/chat/thread-1", chat!)).toBe(true);
    expect(isNavLinkActive("/today", chat!)).toBe(false);
    expect(isNavLinkActive("/training", chat!)).toBe(false);
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

  it("resolves nav link aria-current and class tokens for featured vs active tabs", () => {
    const chat = PRIMARY_NAV_LINKS.find((link) => link.href === "/chat")!;
    const today = PRIMARY_NAV_LINKS.find((link) => link.href === "/today")!;
    const longevity = PRIMARY_NAV_LINKS.find((link) => link.href === "/longevity")!;

    expect(getNavLinkAriaCurrent("/chat", chat)).toBe("page");
    expect(getNavLinkClassNames("/chat", chat)).toEqual([
      "app-nav__link",
      "app-nav__link--featured",
    ]);

    expect(getNavLinkAriaCurrent("/today", today)).toBe("page");
    expect(getNavLinkClassNames("/today", today)).toEqual([
      "app-nav__link",
      "app-nav__link--active",
    ]);

    expect(getNavLinkAriaCurrent("/longevity/trends", longevity)).toBe("page");
    expect(getNavLinkClassNames("/longevity/trends", longevity)).toEqual([
      "app-nav__link",
      "app-nav__link--active",
    ]);

    expect(getNavLinkAriaCurrent("/today", chat)).toBeUndefined();
    expect(getNavLinkClassNames("/today", chat)).toEqual([
      "app-nav__link",
      "app-nav__link--featured",
    ]);
  });
});
