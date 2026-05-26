import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const uiDir = dirname(fileURLToPath(import.meta.url));

const privacySource = readFileSync(join(uiDir, "privacy.tsx"), "utf8");
const stylesSource = readFileSync(join(uiDir, "../../../app/styles.css"), "utf8");

describe("Privacy UI primitive contracts", () => {
  it("defines interactive consent checklist with labeled checkbox ids", () => {
    expect(privacySource).toContain("ConsentScopeChecklist");
    expect(privacySource).toContain('type="checkbox"');
    expect(privacySource).toContain("htmlFor={inputId}");
    expect(privacySource).toContain("consent-scope-checklist");
    expect(privacySource).toContain('legend className="form-label"');
  });

  it("defines accessible file input trigger with sr-only label", () => {
    expect(privacySource).toContain("FileInputTrigger");
    expect(privacySource).toContain('className="sr-only"');
    expect(privacySource).toContain("aria-describedby={hintId}");
    expect(privacySource).toContain("aria-controls={inputId}");
  });

  it("styles consent checklist consistently with profile documents", () => {
    expect(stylesSource).toContain(".documents-consent-options,");
    expect(stylesSource).toContain(".consent-scope-checklist");
    expect(stylesSource).toContain(".file-input-trigger");
  });
});
