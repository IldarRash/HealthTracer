import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("Today page header", () => {
  it("uses command-center copy without adherence tracking wording", () => {
    expect(pageSource).toContain('title="Today"');
    expect(pageSource).toContain(
      'description="Your daily command center — plan, check-ins, and optional coaching feedback."',
    );
    expect(pageSource).not.toMatch(/track adherence/i);
    expect(pageSource).not.toMatch(/adherence/i);
  });
});
