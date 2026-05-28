import { describe, expect, it } from "vitest";
import { getCapabilityConfig, resolveDefaultExpectedResponseMode } from "@health/types";
import { createAiPolicyTestStack } from "./test-ai-behavior-fixtures.js";

describe("ResponseModePolicyService", () => {
  const { responseModePolicyService: service } = createAiPolicyTestStack();

  it("prefers route-provided response mode over capability policy", () => {
    expect(
      service.resolve({
        capabilityId: "general",
        routeProvidedMode: "recommendation_with_optional_proposal",
      }),
    ).toBe("recommendation_with_optional_proposal");
  });

  it("resolves response mode from capability policy metadata", () => {
    const config = getCapabilityConfig("adjust_workout");

    expect(service.resolveFromCapabilityPolicy("adjust_workout")).toBe(
      config.responseMetadata?.expectedResponseMode,
    );
    expect(service.resolveFromCapabilityPolicy("adjust_workout")).toBe(
      resolveDefaultExpectedResponseMode(config.mappedAgentIntent),
    );
  });

  it("falls back to mapped-agent default for unknown capability ids", () => {
    const fallbackConfig = getCapabilityConfig("general");

    expect(service.resolveFromCapabilityPolicy("not_a_capability" as "general")).toBe(
      resolveDefaultExpectedResponseMode(fallbackConfig.mappedAgentIntent),
    );
  });

  it("returns a safe general fallback mode", () => {
    expect(service.resolveSafeFallback()).toBe("advice_only");
  });
});
