import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("Biomarkers page shell and header", () => {
  it("uses structured layout with the translated Biomarkers page header", () => {
    expect(pageSource).toContain("<AppLayout>");
    expect(pageSource).not.toContain('variant="chat"');
    expect(pageSource).toContain("<PageHeader");
    expect(pageSource).toContain('getTranslations("Biomarkers")');
    expect(pageSource).toContain('title={t("title")}');
    expect(pageSource).toContain('description={t("description")}');
    expect(pageSource).toContain("<PageContent>");
    expect(pageSource).toContain("<BiomarkersWorkspace />");
  });
});
