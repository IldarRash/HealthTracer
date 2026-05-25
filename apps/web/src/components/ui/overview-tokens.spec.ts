import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { tokens } from "@health/ui";

const stylesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../app/styles.css"),
  "utf8",
);

describe("overview structured canvas token parity", () => {
  it("defines premium overview semantic tokens in shared package", () => {
    expect(tokens.overview.hero.surface).toBe(tokens.color.surface.heroDark);
    expect(tokens.overview.card.surface).toBe(tokens.color.surface.contentElevated);
    expect(tokens.overview.trend.fill).toBe(tokens.color.coach[500]);
  });

  it("maps overview card surfaces to structured canvas CSS variables", () => {
    expect(stylesSource).toContain("--color-surface-content-elevated");
    expect(stylesSource).toContain("--shadow-card-light");
    expect(stylesSource).toContain("--color-surface-hero-dark");
  });

  it("separates dark hero and light card semantic surfaces", () => {
    expect(tokens.overview.hero.surface).not.toBe(tokens.overview.card.surface);
    expect(tokens.overview.hero.surface).toBe(tokens.color.surface.heroDark);
    expect(tokens.overview.card.surface).toBe(tokens.color.surface.contentElevated);
  });
});
