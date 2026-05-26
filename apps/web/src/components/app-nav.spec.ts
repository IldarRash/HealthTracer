import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRIMARY_NAV_LINKS } from "../lib/nav-ui-state.js";
import { shouldHidePrimaryNavDuringOnboarding } from "../lib/onboarding-ui-state.js";

const navSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "app-nav.tsx"),
  "utf8",
);
const navLinksSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "app-nav-links.ts"),
  "utf8",
);

describe("AppNav information architecture", () => {
  it("renders only the four approved primary tabs", () => {
    expect(navLinksSource).toContain("PRIMARY_NAV_LINKS.map");
    expect(navLinksSource).not.toContain("SECONDARY_ROUTE_LINKS");
    expect(navSource).not.toContain("SECONDARY_ROUTE_LINKS");
    expect(PRIMARY_NAV_LINKS).toHaveLength(4);
  });

  it("keeps Chat visually dominant through the featured nav treatment", () => {
    expect(navLinksSource).toContain("getNavLinkClassNames");
    expect(navLinksSource).toContain("getNavLinkAriaCurrent");
    expect(navSource).toContain('className="app-nav app-nav--coach"');
    expect(navSource).toContain('aria-label="Main navigation"');
    expect(navSource).toContain("AppNavLinks");
  });

  it("does not overload primary nav with secondary route links", () => {
    expect(navSource).not.toContain("/training");
    expect(navSource).not.toContain("/nutrition");
    expect(navSource).not.toContain("/recipes");
    expect(navSource).not.toContain("/progress");
  });

  it("hides primary navigation until onboarding is complete", () => {
    expect(shouldHidePrimaryNavDuringOnboarding(false)).toBe(true);
    expect(shouldHidePrimaryNavDuringOnboarding(undefined)).toBe(true);
    expect(shouldHidePrimaryNavDuringOnboarding(true)).toBe(false);
    expect(navSource).toContain("shouldHidePrimaryNavDuringOnboarding");
    expect(navSource).toContain("Complete onboarding to unlock navigation");
    expect(navSource).toContain("hidePrimaryNav ?");
    expect(navSource).toContain("AppNavLinks pathname={pathname}");
  });
});
