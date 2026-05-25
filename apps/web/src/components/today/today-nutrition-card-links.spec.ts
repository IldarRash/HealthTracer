import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "today-nutrition-card.tsx"),
  "utf8",
);

describe("TodayNutritionCard link regressions", () => {
  it("keeps nutrition context read-only and routes plan changes to Chat", () => {
    expect(componentSource).toContain('href="/nutrition"');
    expect(componentSource).toContain('href="/chat"');
    expect(componentSource).toContain("Ask the coach to adjust this plan");
    expect(componentSource).not.toContain("Edit nutrition plan");
    expect(componentSource).not.toContain("Save plan");
  });
});
