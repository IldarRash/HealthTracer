import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("Nutrition page shell and header", () => {
  it("uses structured layout with read-only Nutrition page header", () => {
    expect(pageSource).toContain("<AppLayout>");
    expect(pageSource).not.toContain('variant="chat"');
    expect(pageSource).toContain("<PageHeader");
    expect(pageSource).toContain('title="Nutrition"');
    expect(pageSource).toContain("Read-only view of your active nutrition plan");
    expect(pageSource).toContain("<PageContent>");
    expect(pageSource).toContain("<NutritionWorkspace />");
  });
});
