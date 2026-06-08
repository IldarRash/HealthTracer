/**
 * BodyAnalysisSection spec.
 *
 * Source-level tests (readFileSync + pattern matching) that verify:
 *  - all four async states (loading, error, empty, success) are present
 *  - the safety disclaimer is always rendered
 *  - DsRing, DsTrendStrip, MuscleMap, CoachNotes are wired in
 *  - no clinical/diagnostic framing leaks into user-visible copy
 *  - the section is read-only (no mutation calls)
 *  - TanStack Query + Clerk token fetching patterns are present
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORBIDDEN_LONGEVITY_TERMS } from "../../lib/longevity-ui-state.js";

const src = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "body-analysis-section.tsx",
  ),
  "utf8",
);

// ── Async states ──────────────────────────────────────────────────────

describe("BodyAnalysisSection async states", () => {
  it("has a loading state (aria-busy) with a skeleton", () => {
    expect(src).toContain("isLoading");
    expect(src).toContain("BodyAnalysisLoading");
    expect(src).toContain('aria-busy="true"');
    expect(src).toContain("Skeleton");
  });

  it("has an error state (role=alert)", () => {
    expect(src).toContain("isError");
    expect(src).toContain("BodyAnalysisError");
  });

  it("has an empty state that deep-links to /chat", () => {
    expect(src).toContain("analysis == null");
    expect(src).toContain("BodyAnalysisEmpty");
    expect(src).toContain('href="/chat"');
    expect(src).toContain("emptyAction");
    expect(src).toContain("emptyTitle");
  });

  it("has a success state that renders the full section", () => {
    // Success state renders provenance banner, composition, muscle map, coach notes
    expect(src).toContain("ProvenanceBanner");
    expect(src).toContain("BodyCompositionCard");
    expect(src).toContain("MuscleMapCard");
    expect(src).toContain("CoachNotes");
  });
});

// ── Safety floors ────────────────────────────────────────────────────

describe("BodyAnalysisSection safety floors", () => {
  it("always renders the visual-estimate disclaimer (MedicalNote)", () => {
    expect(src).toContain("MedicalNote");
    expect(src).toContain("disclaimer");
  });

  it("does not expose raw image bytes or photo data in props", () => {
    // No src= attribute for images, no photo props
    expect(src).not.toContain("imageUrl");
    expect(src).not.toContain("photoUrl");
    expect(src).not.toContain("<img");
  });

  it("avoids clinical/diagnostic framing in user-visible copy strings", () => {
    // Extract all quoted strings from the source (not just i18n keys —
    // also direct strings in JSX)
    const matches = src.match(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'/g) ?? [];
    const joinedStrings = matches.join(" ").toLowerCase();

    for (const term of FORBIDDEN_LONGEVITY_TERMS) {
      expect(joinedStrings).not.toContain(term);
    }

    expect(joinedStrings).not.toContain("diagnosis");
    expect(joinedStrings).not.toContain("treatment");
    expect(joinedStrings).not.toContain("medical certainty");
  });
});

// ── Design system atoms ───────────────────────────────────────────────

describe("BodyAnalysisSection uses foundations atoms", () => {
  it("uses DsRing for the three composition rings", () => {
    expect(src).toContain("DsRing");
    // Three ring instances (fat, muscle, water)
    const ringMatches = src.match(/<DsRing/g) ?? [];
    expect(ringMatches.length).toBeGreaterThanOrEqual(3);
  });

  it("uses DsTrendStrip for the 8-week fat% trend with barColor override", () => {
    expect(src).toContain("DsTrendStrip");
    expect(src).toContain("barColor");
    // barColor must be amber for fat% trend (not threshold-based)
    expect(src).toContain("tokens.color.metric.amber");
  });

  it("uses MuscleMap (which wraps BodyFigure front+back)", () => {
    expect(src).toContain("MuscleMap");
  });

  it("uses CoachNotes for the dynamics summary", () => {
    expect(src).toContain("CoachNotes");
    expect(src).toContain("coachNotesLabel");
    expect(src).toContain("coachNotesText");
  });

  it("uses Stat for weight and BMI", () => {
    expect(src).toContain("Stat");
    expect(src).toContain("compositionWeightLabel");
    expect(src).toContain("compositionBmiLabel");
    expect(src).toContain("compositionBmiRange");
  });
});

// ── Read-only constraint ──────────────────────────────────────────────

describe("BodyAnalysisSection is read-only", () => {
  it("does not call any mutation API functions", () => {
    expect(src).not.toContain("useMutation");
    expect(src).not.toContain("useProposalActions");
    expect(src).not.toContain("acceptProposal");
    expect(src).not.toContain("POST");
    expect(src).not.toContain("PATCH");
    expect(src).not.toContain("PUT");
    expect(src).not.toContain("DELETE");
  });

  it("update button routes to /chat, not an inline form", () => {
    expect(src).toContain('href="/chat"');
    expect(src).toContain("updateButton");
    // No form element or submit button for body data
    expect(src).not.toContain("<form");
  });
});

// ── TanStack Query wiring ─────────────────────────────────────────────

describe("BodyAnalysisSection TanStack Query", () => {
  it("uses useQuery with the bodyAnalysisLatest key", () => {
    expect(src).toContain("useQuery");
    expect(src).toContain("bodyAnalysisLatest");
  });

  it("fetches a Clerk token before calling the API", () => {
    expect(src).toContain("getToken");
    expect(src).toContain("getBodyAnalysisLatest");
  });
});

// ── Section identity ──────────────────────────────────────────────────

describe("BodyAnalysisSection identity & accessibility", () => {
  it("uses a <section> element with id=body-analysis", () => {
    expect(src).toContain('<section');
    expect(src).toContain('id="body-analysis"');
  });

  it("has a section heading via sectionTitle", () => {
    expect(src).toContain("sectionTitle");
    expect(src).toContain("BodyAnalysisSectionHeader");
  });
});
