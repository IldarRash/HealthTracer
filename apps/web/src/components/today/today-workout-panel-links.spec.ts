import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "today-workspace.tsx"),
  "utf8",
);

// MoveCard is the inlined workout card in the rebuilt two-column workspace.
const moveCardSource = componentSource.slice(
  componentSource.indexOf("function MoveCard"),
  componentSource.indexOf("// ── Nutrition + water card"),
);

describe("MoveCard link regressions", () => {
  it("keeps a read-only Training weekly view link in the movement card", () => {
    expect(moveCardSource).toMatch(/href="\/training"/);
    expect(moveCardSource).toContain("Open workout plan");
  });

  it("routes plan changes to Chat, not an edit form", () => {
    expect(moveCardSource).toContain('href="/chat"');
    expect(moveCardSource).not.toContain("Edit workout plan");
    expect(moveCardSource).not.toContain("Save plan");
  });
});
