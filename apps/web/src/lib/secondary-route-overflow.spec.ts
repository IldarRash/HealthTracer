import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stylesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../app/styles.css"),
  "utf8",
);

describe("secondary route mobile overflow CSS", () => {
  it("clips structured canvas and constrains page content width", () => {
    expect(stylesSource).toMatch(/\.app-shell__main--structured[\s\S]*max-width:\s*100%/);
    expect(stylesSource).toMatch(/\.page-content[\s\S]*min-width:\s*0/);
    expect(stylesSource).toMatch(/\.page-header__title[\s\S]*overflow-wrap:\s*break-word/);
  });

  it("prevents plan panels and revision cards from expanding the viewport", () => {
    expect(stylesSource).toMatch(/\.panel,[\s\S]*\.notice[\s\S]*min-width:\s*0/);
    expect(stylesSource).toMatch(/\.training-revision-card[\s\S]*min-width:\s*0/);
    expect(stylesSource).toMatch(/\.training-revision-header[\s\S]*flex-wrap:\s*wrap/);
    expect(stylesSource).toMatch(/\.training-workspace[\s\S]*min-width:\s*0/);
  });

  it("wraps wide pre blocks inside proposal details", () => {
    expect(stylesSource).toMatch(/\.proposal-details pre[\s\S]*white-space:\s*pre-wrap/);
    expect(stylesSource).toMatch(/\.proposal-details pre[\s\S]*word-break:\s*break-word/);
  });
});
