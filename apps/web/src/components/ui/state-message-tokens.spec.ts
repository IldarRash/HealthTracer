import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../app/styles.css"),
  "utf8",
);

describe("state message structured contrast tokens", () => {
  it("maps empty and loading tones to readable structured surfaces", () => {
    expect(stylesSource).toMatch(
      /\.state-message--empty[\s\S]*background:\s*var\(--color-surface-inset\)/,
    );
    expect(stylesSource).toMatch(
      /\.state-message--loading[\s\S]*background:\s*var\(--color-surface-card\)/,
    );
    expect(stylesSource).toMatch(
      /\.state-message__description[\s\S]*color:\s*var\(--color-text-muted\)/,
    );
  });

  it("maps error tone to semantic status colors for title contrast", () => {
    expect(stylesSource).toMatch(
      /\.state-message--error[\s\S]*background:\s*var\(--color-status-error-bg\)/,
    );
    expect(stylesSource).toMatch(
      /\.state-message--error[\s\S]*border-color:\s*var\(--color-status-error-border\)/,
    );
    expect(stylesSource).toMatch(
      /\.state-message--error \.state-message__title[\s\S]*color:\s*var\(--color-status-error-text\)/,
    );
  });
});
