import { vi } from "vitest";
import type { CoachAiProvider } from "../coach-ai-provider.js";

/**
 * Creates a fully-typed mock of CoachAiProvider for use in tests.
 *
 * Each method is a vi.fn() that throws "not configured for this test" by default,
 * so tests must explicitly configure the methods they exercise. This prevents
 * accidental reliance on silent stub behavior.
 *
 * Usage:
 *   const mock = createCoachAiProviderMock({
 *     generateRouterDecision: vi.fn().mockResolvedValue(myRouterOutput),
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
    generateAgentLoopStep:
      overrides.generateAgentLoopStep ?? notConfigured("generateAgentLoopStep"),
    generateCoachResponse:
      overrides.generateCoachResponse ?? notConfigured("generateCoachResponse"),
    generateRouterDecision:
      overrides.generateRouterDecision ?? notConfigured("generateRouterDecision"),
    generateDomainStep:
      overrides.generateDomainStep ?? notConfigured("generateDomainStep"),
    generateFinalDecision:
      overrides.generateFinalDecision ?? notConfigured("generateFinalDecision"),
  };
}
