import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "metrics-workspace.tsx"),
  "utf8",
);

const stylesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../app/styles.css"),
  "utf8",
);

function extractQuotedUserCopy(source: string): string[] {
  const matches = source.match(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g) ?? [];
  return matches.map((match) => match.slice(1, -1));
}

describe("MetricsWorkspace profile embed contracts", () => {
  it("accepts an embedded flag for profile hub embedding", () => {
    expect(workspaceSource).toContain("embedded = false");
    expect(workspaceSource).toContain("{ embedded?: boolean }");
  });

  it("exposes subordinate connection status headings for profile section nesting", () => {
    expect(workspaceSource).toContain('className="training-workspace metrics-workspace"');
    expect(workspaceSource).toContain('const SectionHeading = embedded ? "h3" : "h2"');
    expect(workspaceSource).toContain('const SubsectionHeading = embedded ? "h4" : "h3"');
    expect(workspaceSource).toContain("<SectionHeading>Connection status</SectionHeading>");
    expect(workspaceSource).not.toContain("<h1");
  });

  it("uses less analytics-like aggregate copy when embedded", () => {
    expect(workspaceSource).toContain('{embedded ? "Device aggregates" : "Trend summaries"}');
  });

  it("styles embedded metrics headings for profile readability", () => {
    expect(stylesSource).toMatch(
      /\.profile-hub #data-consent \.metrics-workspace \.metrics-header h3,/,
    );
    expect(stylesSource).toMatch(
      /\.profile-hub #data-consent \.metrics-workspace \.panel h4[\s\S]*font-size:\s*var\(--font-size-lg\)/,
    );
    expect(stylesSource).toMatch(
      /\.profile-hub #data-consent \.metrics-workspace \.metrics-scope-picker/,
    );
  });

  it("avoids clinical score framing in metrics user copy", () => {
    const userCopy = extractQuotedUserCopy(workspaceSource).join(" ").toLowerCase();

    expect(userCopy).not.toContain("health score");
    expect(userCopy).not.toContain("readiness score");
    expect(userCopy).not.toContain("diagnosis");
    expect(userCopy).not.toContain("clinical interpretation");
  });
});
