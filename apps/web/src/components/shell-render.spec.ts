/** @vitest-environment node */

import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppNavLinks } from "./app-nav-links.js";
import { RouteWayfindingTrail } from "./ui/route-wayfinding-trail.js";
import { resolveSecondaryRouteWayfinding } from "../lib/nav-ui-state.js";
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

function renderShellMarkup(element: ReactElement): string {
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

  it("applies featured treatment to Chat without the non-featured active class", () => {
    const html = renderShellMarkup(createElement(AppNavLinks, { pathname: "/chat" }));

    expect(html).toMatch(
      /href="\/chat"[^>]*class="[^"]*app-nav__link--featured[^"]*"[^>]*aria-current="page"/,
    );
    expect(html).not.toContain("app-nav__link--active");
  });

  it("applies active class and aria-current to non-featured tabs", () => {
    const html = renderShellMarkup(
      createElement(AppNavLinks, { pathname: "/longevity/insights" }),
    );

    expect(html).toMatch(
      /href="\/longevity"[^>]*class="[^"]*app-nav__link--active[^"]*"[^>]*aria-current="page"/,
    );
    expect(html).not.toMatch(/href="\/chat"[^>]*app-nav__link--active/);
    expect(html).toContain('class="app-nav__link app-nav__link--featured"');
  });
});
