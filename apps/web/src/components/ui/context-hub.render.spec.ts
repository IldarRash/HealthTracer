import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const contextHubSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "context-hub.tsx"),
  "utf8",
);

describe("ContextHub source contracts", () => {
  it("defines layout, summary, section, consent, and hierarchy wrappers", () => {
    expect(contextHubSource).toContain("ContextHubLayout");
    expect(contextHubSource).toContain("ProfileSummaryCard");
    expect(contextHubSource).toContain("ContextSectionCard");
    expect(contextHubSource).toContain("ConsentManagementCard");
    expect(contextHubSource).toContain("CompactGoalHierarchyPanel");
    expect(contextHubSource).toContain("ContextHubDisclosure");
  });

  it("wires accessible section anchors and labelled headings", () => {
    expect(contextHubSource).toContain('id="account"');
    expect(contextHubSource).toContain("sectionId");
    expect(contextHubSource).toContain("aria-labelledby={headingId}");
    expect(contextHubSource).toContain('sectionId = "consent"');
    expect(contextHubSource).toContain("PrivacyBoundaryNote");
  });

  it("reuses command-center section navigation", () => {
    expect(contextHubSource).toContain('export { SectionNav }');
    expect(contextHubSource).toContain("ProgressiveDisclosure");
  });
});
