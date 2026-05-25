import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PROFILE_HUB_SECTIONS,
  profileHubSectionNavLabel,
} from "./context-hub-ui-state.js";

const stylesSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../app/styles.css"),
  "utf8",
);

describe("context hub structured canvas tokens", () => {
  it("defines scroll-margin for anchored profile sections", () => {
    expect(stylesSource).toMatch(
      /\.context-hub \.context-section-card[\s\S]*scroll-margin-top:/,
    );
    expect(stylesSource).toMatch(
      /\.consent-management-card[\s\S]*scroll-margin-top:/,
    );
  });

  it("styles summary, section, consent, and compact hierarchy cards", () => {
    expect(stylesSource).toMatch(/\.context-summary-card__title/);
    expect(stylesSource).toMatch(/\.consent-management-card[\s\S]*display:\s*grid/);
    expect(stylesSource).toMatch(/\.compact-goal-hierarchy[\s\S]*width:\s*100%/);
    expect(stylesSource).toMatch(/\.context-hub-disclosure__summary-title/);
  });

  it("contains embedded profile hub workspaces and section nav polish", () => {
    expect(stylesSource).toMatch(/\.context-hub\.profile-hub[\s\S]*gap:/);
    expect(stylesSource).toMatch(/\.context-section-card__body[\s\S]*display:\s*grid/);
    expect(stylesSource).toMatch(/\.profile-hub #data-consent \.training-workspace\.metrics-workspace[\s\S]*margin-top:\s*0/);
    expect(stylesSource).toMatch(/\.profile-documents \.documents-workspace[\s\S]*margin-top:\s*0/);
    expect(stylesSource).toMatch(/\.profile-hub \.profile-longevity-bridge[\s\S]*margin-top:\s*0/);
    expect(stylesSource).toMatch(/@media \(max-width: 639px\)[\s\S]*\.profile-hub \.section-nav__link/);
  });

  it("tightens mobile profile section headers and document spacing", () => {
    expect(stylesSource).toMatch(
      /@media \(max-width: 639px\)[\s\S]*\.profile-hub \.profile-section__header[\s\S]*flex-direction:\s*column/,
    );
    expect(stylesSource).toMatch(
      /@media \(max-width: 639px\)[\s\S]*\.profile-hub \.context-section-card__actions \.button[\s\S]*width:\s*100%/,
    );
    expect(stylesSource).toMatch(
      /@media \(max-width: 639px\)[\s\S]*\.profile-documents \.documents-layout[\s\S]*gap:\s*var\(--space-3\)/,
    );
    expect(stylesSource).toMatch(/\.profile-hub #coaching-hierarchy \.compact-goal-hierarchy__intro[\s\S]*display:\s*none/);
  });
});

describe("PROFILE_HUB_SECTIONS anchors", () => {
  it("includes account, goals, personal preferences, data consent, and documents section ids", () => {
    const ids = PROFILE_HUB_SECTIONS.map((section) => section.id);
    expect(ids).toEqual([
      "account",
      "coaching-hierarchy",
      "goals",
      "personal-preferences",
      "data-consent",
      "documents",
    ]);
  });

  it("resolves nav labels for known section ids", () => {
    expect(profileHubSectionNavLabel("account")).toBe("Account");
    expect(profileHubSectionNavLabel("coaching-hierarchy")).toBe("Direction");
    expect(profileHubSectionNavLabel("goals")).toBe("Goals");
    expect(profileHubSectionNavLabel("personal-preferences")).toBe("Personal");
    expect(profileHubSectionNavLabel("data-consent")).toBe("Data & consent");
    expect(profileHubSectionNavLabel("documents")).toBe("Documents");
  });
});
