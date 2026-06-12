/** @vitest-environment node */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RouteWayfindingTrail, type WayfindingTrailDisplay } from "./ui/route-wayfinding-trail.js";
import {
  getNavLinkAriaCurrent,
  PRIMARY_NAV_LINKS,
  resolveSecondaryRouteWayfinding,
} from "../lib/nav-ui-state.js";
import { shouldShowRouteWayfinding } from "../lib/shell-ui-state.js";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...props
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => createElement("a", { href, className, ...props }, children),
}));

function renderShellMarkup(element: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(element);
}

/** Simulate translation resolution (labelKey → human label) for render tests. */
function resolveTrailLabels(trail: ReturnType<typeof resolveSecondaryRouteWayfinding>): WayfindingTrailDisplay | undefined {
  if (!trail) return undefined;
  // Minimal mapping for test assertions — keys are "Nav.xxx".
  const labelMap: Record<string, string> = {
    "Nav.today": "Today",
    "Nav.workouts": "Workouts",
    "Nav.nutrition": "Nutrition",
    "Nav.chat": "Chat",
    "Nav.longevity": "Longevity",
    "Nav.profile": "Profile",
  };
  return {
    parent: { href: trail.parent.href, label: labelMap[trail.parent.labelKey] ?? trail.parent.labelKey },
    current: { label: labelMap[trail.current.labelKey] ?? trail.current.labelKey },
  };
}

describe("Modern Health OS shell render", () => {
  it("mounts wayfinding breadcrumb markup on secondary Training routes", () => {
    const pathname = "/training";
    expect(shouldShowRouteWayfinding(pathname)).toBe(true);

    const trail = resolveSecondaryRouteWayfinding(pathname);
    expect(trail).toBeDefined();

    const displayTrail = resolveTrailLabels(trail);
    expect(displayTrail).toBeDefined();

    const html = renderShellMarkup(
      createElement(RouteWayfindingTrail, { trail: displayTrail! }),
    );

    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('class="route-wayfinding"');
    expect(html).toContain('href="/today"');
    expect(html).toContain("Today");
    expect(html).toContain('class="route-wayfinding__current"');
    expect(html).toContain("Workouts");
    expect(html).toContain('aria-current="page"');
  });

  it("mounts wayfinding breadcrumb markup on secondary Nutrition routes", () => {
    const pathname = "/nutrition";
    expect(shouldShowRouteWayfinding(pathname)).toBe(true);

    const trail = resolveSecondaryRouteWayfinding(pathname);
    expect(trail).toEqual({
      parent: { href: "/today", labelKey: "Nav.today" },
      current: { labelKey: "Nav.nutrition" },
    });

    const displayTrail = resolveTrailLabels(trail);
    const html = renderShellMarkup(
      createElement(RouteWayfindingTrail, { trail: displayTrail! }),
    );

    expect(html).toContain('href="/today"');
    expect(html).toContain("Nutrition");
    expect(html).toContain('aria-current="page"');
  });

  it("does not mount wayfinding for deleted /progress alias route", () => {
    const pathname = "/progress";
    // /progress alias route deleted — wayfinding no longer applies.
    expect(shouldShowRouteWayfinding(pathname)).toBe(false);
    expect(resolveSecondaryRouteWayfinding(pathname)).toBeUndefined();
  });

  it("does not mount wayfinding on primary Today routes", () => {
    const pathname = "/today";
    expect(shouldShowRouteWayfinding(pathname)).toBe(false);
    expect(resolveSecondaryRouteWayfinding(pathname)).toBeUndefined();
  });

  it("applies aria-current to Chat nav link when active", () => {
    const chat = PRIMARY_NAV_LINKS.find((link) => link.href === "/chat")!;
    expect(getNavLinkAriaCurrent("/chat", chat)).toBe("page");
  });

  it("applies aria-current to non-featured tabs when active", () => {
    const longevity = PRIMARY_NAV_LINKS.find((link) => link.href === "/longevity")!;
    const chat = PRIMARY_NAV_LINKS.find((link) => link.href === "/chat")!;

    expect(getNavLinkAriaCurrent("/longevity/insights", longevity)).toBe("page");
    expect(getNavLinkAriaCurrent("/longevity/insights", chat)).toBeUndefined();
  });
});
