import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("Profile page shell", () => {
  it("uses dashboard layout variant and profile workspace", () => {
    expect(pageSource).toContain('<AppLayout variant="dashboard">');
    expect(pageSource).toContain("<ProfileWorkspace />");
    expect(pageSource).not.toContain('variant="chat"');
  });

  it("does not surface the old context hub dashboard", () => {
    expect(pageSource).not.toContain("ProfileDashboard");
    expect(pageSource).not.toContain("ContextHubLayout");
    expect(pageSource).not.toContain("PageHeader");
    expect(pageSource).not.toMatch(/coaching snapshot/i);
    expect(pageSource).not.toMatch(/weekly consistency/i);
    expect(pageSource).not.toMatch(/health score/i);
  });
});
