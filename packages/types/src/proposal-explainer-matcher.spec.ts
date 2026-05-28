import { describe, expect, it } from "vitest";
import {
  buildDefaultAiBehaviorConfig,
  normalizeAiBehaviorConfig,
  type AiBehaviorConfig,
} from "./ai-behavior-config.js";
import {
  compileProposalExplainerMatcher,
  detectProposalExplainerRequestFromConfig,
} from "./proposal-explainer-matcher.js";

describe("proposal explainer matcher", () => {
  it("detects explicit proposal explanation requests from default config", () => {
    const config = buildDefaultAiBehaviorConfig().proposalExplainer;

    expect(detectProposalExplainerRequestFromConfig(config, "Why this proposal?")).toBe(true);
    expect(detectProposalExplainerRequestFromConfig(config, "Why should I train today?")).toBe(
      false,
    );
  });

  it("respects config pattern overrides without code changes", () => {
    const config = normalizeAiBehaviorConfig({
      proposalExplainer: {
        detectionPatterns: {
          positivePatterns: [{ source: "\\bcustom explainer trigger\\b", flags: "i" }],
          negativePatterns: [],
        },
      },
    } as unknown as Partial<AiBehaviorConfig>).proposalExplainer;

    expect(detectProposalExplainerRequestFromConfig(config, "custom explainer trigger")).toBe(
      true,
    );
    expect(detectProposalExplainerRequestFromConfig(config, "Why this proposal?")).toBe(false);
  });

  it("fails closed when positive patterns are invalid regex", () => {
    const matcher = compileProposalExplainerMatcher(
      normalizeAiBehaviorConfig({
        proposalExplainer: {
          detectionPatterns: {
            positivePatterns: [{ source: "(unclosed", flags: "i" }],
            negativePatterns: [],
          },
        },
      } as unknown as Partial<AiBehaviorConfig>).proposalExplainer,
    );

    expect(matcher.positivePatterns).toEqual([]);
    expect(matcher.detect("Why this proposal?")).toBe(false);
  });
});
