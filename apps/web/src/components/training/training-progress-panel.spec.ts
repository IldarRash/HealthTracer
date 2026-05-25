import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const panelSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "training-progress-panel.tsx"),
  "utf8",
);

describe("TrainingProgressPanel read-only contracts", () => {
  it("collapses weekly review action controls behind advanced tools disclosure", () => {
    expect(panelSource).toContain("ProgressiveDisclosure");
    expect(panelSource).toContain('summary="Advanced weekly review tools"');
    expect(panelSource).toContain("training-progress-tools-disclosure");
    expect(panelSource).toContain("Generate weekly summary");
    expect(panelSource).toContain("Refresh current week");
    expect(panelSource).toContain("Preview adaptation pack");
  });

  it("keeps default view read-only with Longevity and Chat handoffs", () => {
    expect(panelSource).toContain("Read-only on this page");
    expect(panelSource).toContain('href="/longevity"');
    expect(panelSource).toContain('href="/chat"');
    expect(panelSource).toContain("No weekly summary yet");
    expect(panelSource).not.toMatch(
      /EmptyState[\s\S]*action=\{[\s\S]*Generate weekly summary/,
    );
  });

  it("preserves weekly review mutations without plan mutation controls", () => {
    expect(panelSource).toContain("generateWeeklyProgressSummary");
    expect(panelSource).toContain("postWeeklyReview");
    expect(panelSource).toContain("useMutation");
    expect(panelSource).not.toContain("acceptProposal");
    expect(panelSource).not.toContain("applyProposal");
  });
});
