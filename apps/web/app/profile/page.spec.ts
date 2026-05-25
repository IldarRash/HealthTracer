import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("Profile page shell", () => {
  it("uses dashboard layout variant and context hub dashboard", () => {
    expect(pageSource).toContain('<AppLayout variant="dashboard">');
    expect(pageSource).toContain("<ProfileDashboard />");
    expect(pageSource).not.toContain('variant="chat"');
  });

  it("describes the profile hub without analytics dashboard framing", () => {
    expect(pageSource).toContain('title="Profile"');
    expect(pageSource).toContain(
      "Your account, coaching profile, goals, device data and consent, and health documents in one hub.",
    );
    expect(pageSource).not.toMatch(/coaching snapshot/i);
    expect(pageSource).not.toMatch(/weekly consistency/i);
    expect(pageSource).not.toMatch(/health score/i);
  });
});
