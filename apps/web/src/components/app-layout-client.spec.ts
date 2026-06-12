import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const layoutClientSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "app-layout-client.tsx"),
  "utf8",
);

describe("AppLayoutClient shell wiring", () => {
  it("delegates shell variant, main variant, and wayfinding to shell UI state", () => {
    expect(layoutClientSource).toContain('import type { AppLayoutVariant } from "../lib/shell-ui-state"');
    expect(layoutClientSource).toContain("resolveAppShellMainVariant");
    expect(layoutClientSource).toContain("resolveAppShellVariant");
    expect(layoutClientSource).toContain("shouldShowRouteWayfinding");
    expect(layoutClientSource).toContain("<AppShell variant={shellVariant}");
    expect(layoutClientSource).toContain("<AppShellMain variant={mainVariant}>");
    expect(layoutClientSource).toContain("{showWayfinding ? <RouteWayfinding /> : null}");
  });

  it("does not branch on dashboard or secondary-route main variants in the client", () => {
    expect(layoutClientSource).not.toContain('variant === "dashboard"');
    expect(layoutClientSource).not.toContain("isSecondaryRoute");
  });

  it("wires per-route data-theme from shell UI state", () => {
    expect(layoutClientSource).toContain("resolveRouteTheme");
    expect(layoutClientSource).toContain("data-theme={routeTheme}");
  });

  it("uses sidebar instead of top header nav", () => {
    expect(layoutClientSource).toContain("AppSidebar");
    expect(layoutClientSource).not.toContain("AppShellHeader");
    // AppNav without further suffix (i.e., no <AppNav /> top-nav component — AppNavDrawer is mobile)
    expect(layoutClientSource).not.toMatch(/<AppNav\s*\//);
    expect(layoutClientSource).not.toMatch(/<AppNav\s*>/);
  });

  it("manages drawer open state with useState", () => {
    expect(layoutClientSource).toContain("useState");
    expect(layoutClientSource).toContain("navOpen");
    expect(layoutClientSource).toContain("setNavOpen");
  });

  it("closes drawer on pathname change via useEffect", () => {
    expect(layoutClientSource).toContain("useEffect");
    expect(layoutClientSource).toContain("setNavOpen(false)");
    expect(layoutClientSource).toContain("[pathname]");
  });

  it("renders AppMobileBar and conditional AppNavDrawer", () => {
    expect(layoutClientSource).toContain("AppMobileBar");
    expect(layoutClientSource).toContain("AppNavDrawer");
    expect(layoutClientSource).toContain("{navOpen && (");
  });

  it("renders AppSidebar in both the static sidebar and the drawer", () => {
    const sidebarMatches = (layoutClientSource.match(/<AppSidebar/g) ?? []).length;
    expect(sidebarMatches).toBeGreaterThanOrEqual(2);
  });
});
