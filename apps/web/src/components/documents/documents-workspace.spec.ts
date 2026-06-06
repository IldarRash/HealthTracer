import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "documents-workspace.tsx"),
  "utf8",
);

const stylesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../app/styles.css"),
  "utf8",
);

describe("DocumentsWorkspace embedded profile mode", () => {
  it("accepts an embedded flag for profile hub embedding", () => {
    expect(workspaceSource).toContain("embedded = false");
    expect(workspaceSource).toContain("{ embedded?: boolean }");
  });

  it("shows privacy boundary note instead of duplicate consent card when embedded", () => {
    expect(workspaceSource).toMatch(
      /embedded \?\s*\(\s*<PrivacyBoundaryNote title="Document privacy boundary">/,
    );
    expect(workspaceSource).toContain(
      "Raw document files are stored outside the database. The UI shows metadata, parse status,",
    );
    expect(workspaceSource).toContain(
      "reviewed summaries, and extracted wellness signals—not full document text.",
    );
    expect(workspaceSource).toMatch(
      /:\s*\(\s*<ConsentManagementCard[\s\S]*sectionId="consent"/,
    );
  });

  it("keeps subordinate workspace headings for upload, review, and search", () => {
    expect(workspaceSource).toContain('const SectionHeading = embedded ? "h3" : "h2"');
    expect(workspaceSource).toContain("<SectionHeading>Upload health document</SectionHeading>");
    expect(workspaceSource).toContain("<SectionHeading>Status and review</SectionHeading>");
    expect(workspaceSource).toContain("<SectionHeading>Find document context</SectionHeading>");
  });

  it("demotes detail panel headings when embedded under profile sections", () => {
    expect(workspaceSource).toContain('const SubsectionHeading = embedded ? "h4" : "h3"');
    expect(workspaceSource).toContain('const DetailHeading = embedded ? "h5" : "h4"');
    expect(workspaceSource).toContain("embedded={embedded}");
  });

  it("uses wellness-safe non-clinical summary disclaimer copy", () => {
    expect(workspaceSource).toContain(
      "This summary is wellness-oriented and not a medical interpretation.",
    );
    expect(workspaceSource).toContain("Discuss clinical");
  });
});

describe("ConsentManagementCard CSS contracts", () => {
  it("defines scroll-margin for the consent section anchor", () => {
    expect(stylesSource).toMatch(/\.consent-management-card[\s\S]*scroll-margin-top:/);
  });

  it("lays out the consent card as a grid", () => {
    expect(stylesSource).toMatch(/\.consent-management-card[\s\S]*display:\s*grid/);
  });
});
