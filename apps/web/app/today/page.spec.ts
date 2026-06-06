import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("Today page", () => {
  it("mounts the workspace inside the app shell without adherence tracking wording", () => {
    // New design: page is a thin server component that mounts AppShellMain + TodayWorkspace
    // (no PageHeader with title/description props).
    expect(pageSource).toContain("AppShellMain");
    expect(pageSource).toContain("TodayWorkspace");
    expect(pageSource).not.toMatch(/track adherence/i);
    expect(pageSource).not.toMatch(/adherence/i);
  });
});
