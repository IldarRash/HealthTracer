import { describe, expect, it } from "vitest";
import {
  buildDefaultAiBehaviorConfig,
  normalizeAiBehaviorConfig,
  type AiBehaviorConfig,
} from "@health/types";
import { ProposalExplainerMatcherService } from "./proposal-explainer-matcher.service.js";
import { AiBehaviorConfigService } from "./ai-behavior-config.service.js";

describe("ProposalExplainerMatcherService", () => {
  it("detects explainer turns from repo-backed config", () => {
    const service = new ProposalExplainerMatcherService(
      new AiBehaviorConfigService({
        config: buildDefaultAiBehaviorConfig(),
        source: "defaults",
        errors: [],
        warnings: [],
      }),
    );

    expect(service.detect("Why this proposal?")).toBe(true);
    expect(service.detect("Why should I train today?")).toBe(false);
  });

  it("fails closed when config positive patterns are invalid regex", () => {
    const service = new ProposalExplainerMatcherService(
      new AiBehaviorConfigService({
        config: normalizeAiBehaviorConfig({
          proposalExplainer: {
            detectionPatterns: {
              positivePatterns: [{ source: "(unclosed", flags: "i" }],
              negativePatterns: [],
            },
          },
        } as unknown as Partial<AiBehaviorConfig>),
        source: "defaults",
        errors: [],
        warnings: [],
      }),
    );

    expect(service.detect("Why this proposal?")).toBe(false);
  });

  it("uses updated detection patterns from config overrides", () => {
    const service = new ProposalExplainerMatcherService(
      new AiBehaviorConfigService({
        config: normalizeAiBehaviorConfig({
          proposalExplainer: {
            detectionPatterns: {
              positivePatterns: [{ source: "\\bconfig-only trigger\\b", flags: "i" }],
              negativePatterns: [],
            },
          },
        } as unknown as Partial<AiBehaviorConfig>),
        source: "file",
        errors: [],
        warnings: [],
      }),
    );

    expect(service.detect("config-only trigger")).toBe(true);
    expect(service.detect("Why this proposal?")).toBe(false);
  });
});
