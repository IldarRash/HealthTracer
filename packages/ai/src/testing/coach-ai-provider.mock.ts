import { vi } from "vitest";
import type { CoachAiProvider, ProviderCallResult } from "../coach-ai-provider.js";
import type { DomainLlmStepOutputInput } from "@health/types";

/**
 * Creates a fully-typed mock of CoachAiProvider for use in tests.
 *
 * Each method is a vi.fn() that throws "not configured for this test" by default,
 * so tests must explicitly configure the methods they exercise. This prevents
 * accidental reliance on silent stub behavior.
 *
 * Usage:
 *   const mock = createCoachAiProviderMock({
 *     generateRouterDecision: vi.fn().mockResolvedValue({ output: myRouterOutput }),
 *   });
 */
export function createCoachAiProviderMock(
  overrides: Partial<{
    [K in keyof CoachAiProvider]: CoachAiProvider[K];
  }> = {},
): CoachAiProvider {
  const notConfigured = (method: string) =>
    vi.fn().mockImplementation(() => {
      throw new Error(`CoachAiProvider.${method} is not configured for this test`);
    });

  return {
    generateRouterDecision:
      overrides.generateRouterDecision ?? notConfigured("generateRouterDecision"),
    generateDomainStep:
      overrides.generateDomainStep ?? notConfigured("generateDomainStep"),
    generateFinalDecision:
      overrides.generateFinalDecision ?? notConfigured("generateFinalDecision"),
  };
}

// ---------------------------------------------------------------------------
// Convenience wrapper — wraps a domain step output value in a ProviderCallResult
// ---------------------------------------------------------------------------

export function wrapDomainOutput(
  output: DomainLlmStepOutputInput,
): ProviderCallResult<DomainLlmStepOutputInput> {
  return { output };
}
