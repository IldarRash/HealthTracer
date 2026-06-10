/**
 * Eyebrow atom — source-level contract assertions.
 *
 * Checks spec compliance: typography values, token usage, prop surface,
 * deduplication (no other workspace-local Eyebrow implementations).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const uiDir = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(uiDir, "..");

const eyebrowSrc = readFileSync(join(uiDir, "eyebrow.tsx"), "utf8");
const indexSrc = readFileSync(join(uiDir, "index.ts"), "utf8");
const todayWorkspaceSrc = readFileSync(join(componentsDir, "today/today-workspace.tsx"), "utf8");
const profileWorkspaceSrc = readFileSync(join(componentsDir, "profile/profile-workspace.tsx"), "utf8");
const onboardingWorkspaceSrc = readFileSync(join(componentsDir, "onboarding/onboarding-workspace.tsx"), "utf8");

describe("Eyebrow atom contracts", () => {
  it("exports Eyebrow and EyebrowProps", () => {
    expect(eyebrowSrc).toContain("export function Eyebrow");
    expect(eyebrowSrc).toContain("export type EyebrowProps");
  });

  it("applies fontSize 11, fontWeight 700, letterSpacing 1.2, textTransform uppercase", () => {
    expect(eyebrowSrc).toContain("fontSize: 11");
    expect(eyebrowSrc).toContain("fontWeight: 700");
    expect(eyebrowSrc).toContain("letterSpacing: 1.2");
    expect(eyebrowSrc).toContain('textTransform: "uppercase"');
  });

  it("defaults to tokens.color.light.mut2 in light world", () => {
    expect(eyebrowSrc).toContain("tokens.color.light.mut2");
  });

  it("uses tokens.color.dark.mut when dark=true", () => {
    expect(eyebrowSrc).toContain("tokens.color.dark.mut");
  });

  it("imports tokens from @health/ui", () => {
    expect(eyebrowSrc).toContain('@health/ui"');
    expect(eyebrowSrc).toContain("tokens");
  });

  it("accepts color, dark, style, className, aria-hidden props", () => {
    expect(eyebrowSrc).toContain("color?:");
    expect(eyebrowSrc).toContain("dark?:");
    expect(eyebrowSrc).toContain("style?:");
    expect(eyebrowSrc).toContain("className?:");
    expect(eyebrowSrc).toContain('"aria-hidden"?:');
  });

  it("is re-exported from ui/index.ts", () => {
    expect(indexSrc).toContain("Eyebrow");
    expect(indexSrc).toContain("EyebrowProps");
  });
});

describe("Eyebrow deduplication — no local inline copies remain", () => {
  it("today-workspace has no local Eyebrow function definition", () => {
    expect(todayWorkspaceSrc).not.toContain("function Eyebrow(");
  });

  it("profile-workspace has no local Eyebrow function definition", () => {
    expect(profileWorkspaceSrc).not.toContain("function Eyebrow(");
  });

  it("today-workspace imports Eyebrow from the shared atom", () => {
    expect(todayWorkspaceSrc).toContain('from "../ui/eyebrow"');
  });

  it("profile-workspace imports Eyebrow from the shared atom", () => {
    expect(profileWorkspaceSrc).toContain('from "../ui/eyebrow"');
  });

  it("onboarding-workspace StepEyebrow uses the Eyebrow atom", () => {
    expect(onboardingWorkspaceSrc).toContain("Eyebrow");
    expect(onboardingWorkspaceSrc).toContain('<Eyebrow');
    expect(onboardingWorkspaceSrc).toContain("onboarding-step__eyebrow");
  });
});
