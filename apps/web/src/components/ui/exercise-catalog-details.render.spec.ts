import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const uiDir = dirname(fileURLToPath(import.meta.url));

const catalogDetailsSource = readFileSync(
  join(uiDir, "exercise-catalog-details.tsx"),
  "utf8",
);
const detailLineListSource = readFileSync(join(uiDir, "detail-line-list.tsx"), "utf8");
const stylesSource = readFileSync(join(uiDir, "../../../app/styles.css"), "utf8");

describe("Exercise catalog UI primitives", () => {
  it("exposes accessible catalog metadata regions and safety notes", () => {
    expect(catalogDetailsSource).toContain('role="region"');
    expect(catalogDetailsSource).toContain('aria-label="Exercise catalog details"');
    expect(catalogDetailsSource).toContain("PlanFacts");
    expect(catalogDetailsSource).toContain('role="note"');
    expect(catalogDetailsSource).toContain('role="status"');
    expect(catalogDetailsSource).toContain('aria-live="polite"');
    expect(catalogDetailsSource).toContain('className="section-label"');
    expect(catalogDetailsSource).toContain("Safety notes");
  });

  it("defines shared detail line list styling", () => {
    expect(detailLineListSource).toContain("detail-line-list");
    expect(stylesSource).toContain(".detail-line-list");
  });
});
