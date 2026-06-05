/** @vitest-environment node */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RouteWayfindingTrail } from "./ui/route-wayfinding-trail.js";
import {
  getNavLinkAriaCurrent,
  getNavLinkClassNames,
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

describe("Modern Health OS shell render", () => {
  it("mounts wayfinding breadcrumb markup on secondary Training routes", () => {
    const pathname = "/training";
    expect(shouldShowRouteWayfinding(pathname)).toBe(true);

    const trail = resolveSecondaryRouteWayfinding(pathname);
    expect(trail).toBeDefined();

    const html = renderShellMarkup(
      createElement(RouteWayfindingTrail, { trail: trail! }),
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
      parent: { href: "/today", label: "Today" },
      current: { label: "Nutrition" },
    });

    const html = renderShellMarkup(
      createElement(RouteWayfindingTrail, { trail: trail! }),
    );

    expect(html).toContain('href="/today"');
    expect(html).toContain("Nutrition");
    expect(html).toContain('aria-current="page"');
  });

  it("mounts Workouts wayfinding for legacy progress alias routes", () => {
    const pathname = "/progress";
    expect(shouldShowRouteWayfinding(pathname)).toBe(true);

    const trail = resolveSecondaryRouteWayfinding(pathname);
    expect(trail?.current.label).toBe("Workouts");

    const html = renderShellMarkup(
      createElement(RouteWayfindingTrail, { trail: trail! }),
    );

    expect(html).toContain("Workouts");
    expect(html).toContain('href="/today"');
  });

  it("does not mount wayfinding on primary Today routes", () => {
    const pathname = "/today";
    expect(shouldShowRouteWayfinding(pathname)).toBe(false);
    expect(resolveSecondaryRouteWayfinding(pathname)).toBeUndefined();
  });

  it("applies featured treatment to Chat nav link class tokens", () => {
    const chat = PRIMARY_NAV_LINKS.find((link) => link.href === "/chat")!;
    const classes = getNavLinkClassNames("/chat", chat);
    expect(classes).toContain("app-nav__link--featured");
    expect(classes).not.toContain("app-nav__link--active");
    expect(getNavLinkAriaCurrent("/chat", chat)).toBe("page");
  });

  it("applies active class and aria-current to non-featured tabs", () => {
    const longevity = PRIMARY_NAV_LINKS.find((link) => link.href === "/longevity")!;
    const chat = PRIMARY_NAV_LINKS.find((link) => link.href === "/chat")!;

    const longevityClasses = getNavLinkClassNames("/longevity/insights", longevity);
    expect(longevityClasses).toContain("app-nav__link--active");
    expect(getNavLinkAriaCurrent("/longevity/insights", longevity)).toBe("page");

    const chatClasses = getNavLinkClassNames("/longevity/insights", chat);
    expect(chatClasses).not.toContain("app-nav__link--active");
    expect(chatClasses).toContain("app-nav__link--featured");
  });
});
