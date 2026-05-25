import { describe, expect, it } from "vitest";
import {
  getAppShellClassNames,
  getAppShellMainClassNames,
  resolveAppShellMainVariant,
  resolveAppShellVariant,
  shouldShowRouteWayfinding,
} from "./shell-ui-state.js";

describe("shell UI state", () => {
  it("uses immersive chat shell only for the chat layout variant", () => {
    expect(resolveAppShellVariant("chat")).toBe("chat");
    expect(resolveAppShellVariant("default")).toBe("default");
    expect(resolveAppShellVariant("dashboard")).toBe("default");
    expect(getAppShellClassNames("chat")).toEqual(["app-shell", "app-shell--chat"]);
    expect(getAppShellClassNames("default")).toEqual(["app-shell"]);
  });

  it("uses structured light canvas for all non-chat layout variants", () => {
    expect(resolveAppShellMainVariant("chat")).toBe("chat");
    expect(resolveAppShellMainVariant("default")).toBe("structured");
    expect(resolveAppShellMainVariant("dashboard")).toBe("structured");
    expect(getAppShellMainClassNames("structured")).toEqual([
      "app-shell__main",
      "app-shell__main--structured",
    ]);
    expect(getAppShellMainClassNames("chat")).toEqual([
      "app-shell__main",
      "app-shell__main--chat",
    ]);
  });

  it("shows secondary wayfinding only on Training and Nutrition routes", () => {
    expect(shouldShowRouteWayfinding("/training")).toBe(true);
    expect(shouldShowRouteWayfinding("/progress")).toBe(true);
    expect(shouldShowRouteWayfinding("/training/session-1")).toBe(true);
    expect(shouldShowRouteWayfinding("/nutrition")).toBe(true);
    expect(shouldShowRouteWayfinding("/recipes")).toBe(true);
    expect(shouldShowRouteWayfinding("/nutrition/meal-plan")).toBe(true);
    expect(shouldShowRouteWayfinding("/today")).toBe(false);
    expect(shouldShowRouteWayfinding("/longevity")).toBe(false);
    expect(shouldShowRouteWayfinding("/profile")).toBe(false);
    expect(shouldShowRouteWayfinding("/goals")).toBe(false);
    expect(shouldShowRouteWayfinding("/documents")).toBe(false);
    expect(shouldShowRouteWayfinding("/metrics")).toBe(false);
    expect(shouldShowRouteWayfinding("/chat")).toBe(false);
  });

  it("maps dashboard layout pages to structured non-chat canvas", () => {
    expect(resolveAppShellVariant("dashboard")).toBe("default");
    expect(resolveAppShellMainVariant("dashboard")).toBe("structured");
  });
});
