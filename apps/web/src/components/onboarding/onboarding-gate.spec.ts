import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const gateSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "onboarding-gate.tsx"),
  "utf8",
);

describe("OnboardingGate source behavior", () => {
  it("passes through children for unauthenticated users", () => {
    expect(gateSource).toContain("if (!isLoaded || !isSignedIn) {");
    expect(gateSource).toMatch(/if \(!isLoaded \|\| !isSignedIn\) \{\s*return <>\{children\}<\/>;/);
  });

  it("blocks signed-in users when user state fails to load", () => {
    expect(gateSource).toContain("if (userStateQuery.isError) {");
    expect(gateSource).toContain('<ErrorState');
    expect(gateSource).toContain('title="Unable to load your account"');
    expect(gateSource).not.toMatch(
      /if \(userStateQuery\.isError\) \{\s*return <>\{children\}<\/>;/,
    );
  });

  it("keeps onboarding redirect guards for loaded user state", () => {
    expect(gateSource).toContain("shouldRedirectToOnboarding(pathname, onboardingCompleted)");
    expect(gateSource).toContain("shouldRedirectFromOnboarding(pathname, onboardingCompleted)");
    expect(gateSource).toContain('title="Redirecting to onboarding…"');
    expect(gateSource).toContain('title="Opening your coach…"');
  });
});
