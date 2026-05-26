import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "onboarding-workspace.tsx"),
  "utf8",
);

describe("OnboardingWorkspace source behavior", () => {
  it("does not expose a visible save-and-continue-later control", () => {
    expect(workspaceSource).not.toMatch(/save\s*&\s*continue\s*later/i);
    expect(workspaceSource).not.toMatch(/save\s+and\s+continue\s+later/i);
    expect(workspaceSource).not.toContain("Save later");
  });

  it("keeps silent draft persistence and clears draft after successful submit", () => {
    expect(workspaceSource).toContain("writeOnboardingDraftToStorage");
    expect(workspaceSource).toContain("readOnboardingDraftFromStorage");
    expect(workspaceSource).toContain("clearOnboardingDraftFromStorage");
    expect(workspaceSource).not.toContain("Save &");
  });

  it("submits onboarding through buildOnboardingPayload and completeOnboarding", () => {
    expect(workspaceSource).toContain("buildOnboardingPayload(draft)");
    expect(workspaceSource).toContain("completeOnboarding(token, payload)");
    expect(workspaceSource).toContain('birthDate');
    expect(workspaceSource).toContain('heightCm');
    expect(workspaceSource).toContain('baselineWeightKg');
  });
});
