import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../app/styles.css"),
  "utf8",
);

describe("command center structured canvas tokens", () => {
  it("defines section navigation focus and touch targets", () => {
    expect(stylesSource).toMatch(/\.section-nav__link[\s\S]*outline:/);
    expect(stylesSource).toMatch(/\.section-nav__link[\s\S]*min-height:/);
  });

  it("maps canvas state messages to light structured surfaces", () => {
    expect(stylesSource).toMatch(
      /\.state-message--canvas[\s\S]*background:\s*var\(--color-surface-content-muted\)/,
    );
    expect(stylesSource).toMatch(
      /\.state-message--canvas-compact[\s\S]*padding:\s*var\(--space-4\)/,
    );
  });

  it("styles priority and compact domain cards on light canvas", () => {
    expect(stylesSource).toMatch(
      /\.action-priority-card[\s\S]*background:\s*var\(--color-surface-content-elevated\)/,
    );
    expect(stylesSource).toMatch(/\.domain-card[\s\S]*border-radius:\s*var\(--radius-md\)/);
    expect(stylesSource).toMatch(/\.disclosure__summary[\s\S]*cursor:\s*pointer/);
  });
});
