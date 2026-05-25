import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "wellbeing-check-in-card.tsx"),
  "utf8",
);

describe("WellbeingCheckInCard crisis support on Today", () => {
  it("renders crisis support in-card only when parent delegation is disabled", () => {
    expect(componentSource).toContain("resolveWellbeingCrisisPreview({ moodScore, note })");
    expect(componentSource).toContain("resolveWellbeingCrisisDisplay(crisisPreview, serverCrisisSupport)");
    expect(componentSource).toContain("shouldRenderWellbeingCrisisInCard({");
    expect(componentSource).toContain("delegateToParent: onCrisisSupportChange != null");
    expect(componentSource).toMatch(
      /showCrisisInCard[\s\S]*?<CrisisSupportPanel copy=\{crisisDisplay\.copy!\} \/>/,
    );
  });

  it("delegates live and saved crisis support to parent when callback is provided", () => {
    expect(componentSource).toContain("onCrisisSupportChange?:");
    expect(componentSource).toContain("resolveWellbeingCrisisForParent({");
    expect(componentSource).toContain("persistedCheckIn: existingCheckIn");
  });

  it("uses stable primitive dependencies for parent crisis delegation effect", () => {
    expect(componentSource).toContain(
      "preview: resolveWellbeingCrisisPreview({ moodScore, note })",
    );

    const crisisDelegationSection = componentSource.slice(
      componentSource.indexOf("onCrisisSupportChange("),
      componentSource.indexOf("const canSave"),
    );

    expect(crisisDelegationSection).toContain("moodScore");
    expect(crisisDelegationSection).toContain("note");
    expect(crisisDelegationSection).not.toContain("crisisPreview,");
  });

  it("stores server crisis evaluation after save for persistent display", () => {
    expect(componentSource).toContain("setServerCrisisSupport(data.crisisSupport)");
  });

  it("keeps crisis panel above the check-in form content", () => {
    const crisisIndex = componentSource.indexOf("<CrisisSupportPanel");
    const formIndex = componentSource.indexOf('className="wellbeing-check-in-form"');

    expect(crisisIndex).toBeGreaterThan(-1);
    expect(formIndex).toBeGreaterThan(crisisIndex);
  });
});
