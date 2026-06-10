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
    // --layout-nav-height removed; replaced with 4.5rem inline in scroll-margin-top rules
    expect(stylesSource).not.toContain("--layout-nav-height:");
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

  it("sets box-sizing border-box on the sidebar for true 244px width", () => {
    expect(stylesSource).toMatch(/\.app-sidebar[\s\S]*box-sizing:\s*border-box/);
  });

  it("uses 100dvh for app shell height with 100vh fallback", () => {
    expect(stylesSource).toMatch(/\.app-shell[\s\S]*height:\s*100vh/);
    expect(stylesSource).toMatch(/\.app-shell[\s\S]*height:\s*100dvh/);
  });

  it("defines 1023.98px responsive breakpoint hiding the desktop sidebar", () => {
    expect(stylesSource).toContain("max-width: 1023.98px");
    expect(stylesSource).toMatch(
      /@media \(max-width: 1023\.98px\)[\s\S]*\.app-shell > \.app-sidebar[\s\S]*display:\s*none/,
    );
    expect(stylesSource).toMatch(
      /@media \(max-width: 1023\.98px\)[\s\S]*\.app-shell__mobile-bar[\s\S]*display:\s*flex/,
    );
  });

  it("defines drawer styles for mobile navigation overlay", () => {
    expect(stylesSource).toContain(".app-shell__drawer-root");
    expect(stylesSource).toMatch(/\.app-shell__drawer-root[\s\S]*position:\s*fixed/);
    expect(stylesSource).toContain(".app-shell__drawer");
    expect(stylesSource).toMatch(/\.app-shell__drawer[\s\S]*animation:\s*drawer-in/);
    expect(stylesSource).toContain("@keyframes drawer-in");
    expect(stylesSource).toMatch(/prefers-reduced-motion[\s\S]*\.app-shell__drawer[\s\S]*animation:\s*none/);
  });
});
