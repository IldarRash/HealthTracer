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
    expect(layoutClientSource).not.toContain("AppNav");
  });
});
