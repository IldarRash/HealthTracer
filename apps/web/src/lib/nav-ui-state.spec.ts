import { describe, expect, it } from "vitest";
import {
  findSecondaryRoute,
  getNavLinkAriaCurrent,
  isActivePath,
  isNavLinkActive,
  isSecondaryRoute,
  PRIMARY_NAV_LINKS,
  resolveSecondaryRouteWayfinding,
  SECONDARY_ROUTE_LINKS,
} from "./nav-ui-state.js";

describe("nav UI state", () => {
  it("exposes the four approved primary nav tabs only", () => {
    expect(PRIMARY_NAV_LINKS.map((link) => link.labelKey)).toEqual([
      "Nav.chat",
      "Nav.today",
      "Nav.longevity",
      "Nav.profile",
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
    expect(featured[0]?.labelKey).toBe("Nav.chat");
  });

  it("keeps Training, Nutrition, Biomarkers, Sleep, and Pulse as secondary routes outside primary nav", () => {
    expect(SECONDARY_ROUTE_LINKS.map((link) => link.labelKey)).toEqual([
      "Nav.workouts",
      "Nav.nutrition",
      "Nav.biomarkers",
      "Nav.sleep",
      "Nav.pulse",
    ]);
    expect(PRIMARY_NAV_LINKS.some((link) => link.href === "/training")).toBe(false);
    expect(PRIMARY_NAV_LINKS.some((link) => link.href === "/nutrition")).toBe(false);
    expect(PRIMARY_NAV_LINKS.some((link) => link.href === "/biomarkers")).toBe(false);
    expect(PRIMARY_NAV_LINKS.some((link) => link.href === "/sleep")).toBe(false);
    expect(PRIMARY_NAV_LINKS.some((link) => link.href === "/pulse")).toBe(false);
  });

  it("marks the exact route and nested paths as active", () => {
    expect(isActivePath("/longevity", "/longevity")).toBe(true);
    expect(isActivePath("/longevity/trends", "/longevity")).toBe(true);
    expect(isActivePath("/today", "/longevity")).toBe(false);
  });

  it("treats /recipes as alias for nutrition and /billing as alias for profile", () => {
    const nutrition = SECONDARY_ROUTE_LINKS.find((link) => link.href === "/nutrition");
    const profile = PRIMARY_NAV_LINKS.find((link) => link.href === "/profile");

    expect(nutrition).toBeDefined();
    expect(profile).toBeDefined();
    expect(isNavLinkActive("/nutrition", nutrition!)).toBe(true);
    expect(isNavLinkActive("/recipes", nutrition!)).toBe(true);
    expect(isNavLinkActive("/billing", profile!)).toBe(true);
    // Deleted alias routes — /goals, /documents, /metrics, /progress no longer alias any tab.
    expect(isNavLinkActive("/goals", profile!)).toBe(false);
    expect(isNavLinkActive("/documents", profile!)).toBe(false);
    expect(isNavLinkActive("/metrics", profile!)).toBe(false);
  });

  it("resolves secondary routes without highlighting primary tabs", () => {
    expect(isSecondaryRoute("/training")).toBe(true);
    expect(isSecondaryRoute("/nutrition")).toBe(true);
    expect(isSecondaryRoute("/biomarkers")).toBe(true);
    expect(isSecondaryRoute("/biomarkers/vitamin_d")).toBe(true);
    expect(isSecondaryRoute("/longevity")).toBe(false);
    // /progress is a deleted alias route — no longer a secondary route.
    expect(isSecondaryRoute("/progress")).toBe(false);

    const training = findSecondaryRoute("/training");
    expect(training?.labelKey).toBe("Nav.workouts");
  });

  it("resolves secondary route wayfinding with Today as default parent", () => {
    expect(resolveSecondaryRouteWayfinding("/nutrition")).toEqual({
      parent: { href: "/today", labelKey: "Nav.today" },
      current: { labelKey: "Nav.nutrition" },
    });
    expect(resolveSecondaryRouteWayfinding("/training")).toEqual({
      parent: { href: "/today", labelKey: "Nav.today" },
      current: { labelKey: "Nav.workouts" },
    });
    expect(resolveSecondaryRouteWayfinding("/recipes")).toEqual({
      parent: { href: "/today", labelKey: "Nav.today" },
      current: { labelKey: "Nav.nutrition" },
    });
    expect(resolveSecondaryRouteWayfinding("/longevity")).toBeUndefined();
    expect(resolveSecondaryRouteWayfinding("/today")).toBeUndefined();
    // Biomarkers overrides the default parent — it sits under Nutrition.
    expect(resolveSecondaryRouteWayfinding("/biomarkers")).toEqual({
      parent: { href: "/nutrition", labelKey: "Nav.nutrition" },
      current: { labelKey: "Nav.biomarkers" },
    });
    expect(resolveSecondaryRouteWayfinding("/biomarkers/vitamin_d")).toEqual({
      parent: { href: "/nutrition", labelKey: "Nav.nutrition" },
      current: { labelKey: "Nav.biomarkers" },
    });
    expect(resolveSecondaryRouteWayfinding("/profile")).toBeUndefined();
    // Deleted alias routes — no wayfinding for ghost routes.
    expect(resolveSecondaryRouteWayfinding("/progress")).toBeUndefined();
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

  it("resolves nav link aria-current for featured vs active tabs", () => {
    const chat = PRIMARY_NAV_LINKS.find((link) => link.href === "/chat")!;
    const today = PRIMARY_NAV_LINKS.find((link) => link.href === "/today")!;
    const longevity = PRIMARY_NAV_LINKS.find((link) => link.href === "/longevity")!;

    expect(getNavLinkAriaCurrent("/chat", chat)).toBe("page");
    expect(getNavLinkAriaCurrent("/today", today)).toBe("page");
    expect(getNavLinkAriaCurrent("/longevity/trends", longevity)).toBe("page");
    expect(getNavLinkAriaCurrent("/today", chat)).toBeUndefined();
  });
});
