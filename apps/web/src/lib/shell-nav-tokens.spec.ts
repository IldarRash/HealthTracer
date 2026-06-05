import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../app/styles.css"),
  "utf8",
);

describe("shell and nav design tokens", () => {
  it("defines layout tokens used by the app shell", () => {
    expect(stylesSource).toContain("--layout-shell-max:");
    expect(stylesSource).toContain("--layout-content-max:");
    expect(stylesSource).toContain("--layout-chat-max:");
    expect(stylesSource).toContain("--layout-nav-height:");
  });

  it("maps chat and structured shell surfaces to semantic colors", () => {
    expect(stylesSource).toContain(".app-shell--chat");
    expect(stylesSource).toMatch(/\.app-shell--chat[\s\S]*background:\s*var\(--color-surface-card\)/);
    expect(stylesSource).toContain(".app-shell__main--structured");
    expect(stylesSource).toMatch(
      /\.app-shell__main--structured[\s\S]*background:\s*var\(--color-surface-content\)/,
    );
    expect(stylesSource).toContain(".app-shell__main--chat");
    expect(stylesSource).toMatch(/\.app-shell__main--chat[\s\S]*padding:\s*0/);
  });

  it("keeps keyboard focus styles on sidebar nav and wayfinding links", () => {
    expect(stylesSource).toContain(".app-sidebar__nav-item:focus-visible");
    expect(stylesSource).toContain(".route-wayfinding__link:focus-visible");
  });

  it("contains overflow containment for structured shell and secondary wayfinding", () => {
    expect(stylesSource).toMatch(/\.app-shell__main--structured[\s\S]*overflow-x:\s*clip/);
    expect(stylesSource).toMatch(/\.route-wayfinding[\s\S]*min-width:\s*0/);
    expect(stylesSource).toMatch(/\.route-wayfinding__link[\s\S]*overflow-wrap:\s*anywhere/);
  });
});
