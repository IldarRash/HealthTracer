import { vi } from "vitest";
import type { LabExtractionOutputInput } from "@health/types";
import type { ProviderCallResult } from "../coach-ai-provider.js";
import type { LabExtractionProvider } from "../lab-extraction-provider.js";

/**
 * Creates a fully-typed mock of LabExtractionProvider for use in tests.
 *
 * Mirrors createCoachAiProviderMock: the method is a vi.fn() that throws
 * "not configured for this test" by default, so tests must explicitly queue
 * the outputs/errors they exercise. This prevents accidental reliance on
 * silent stub behavior.
 *
 * Usage:
 *   const mock = createLabExtractionProviderMock({
 *     extractBiomarkers: vi.fn().mockResolvedValue(wrapLabExtractionOutput(myOutput)),
 *   });
 */
export function createLabExtractionProviderMock(
  overrides: Partial<{
    [K in keyof LabExtractionProvider]: LabExtractionProvider[K];
  }> = {},
): LabExtractionProvider {
  return {
    extractBiomarkers:
      overrides.extractBiomarkers ??
      vi.fn().mockImplementation(() => {
        throw new Error(
          "LabExtractionProvider.extractBiomarkers is not configured for this test",
        );
      }),
  };
}

/** Wraps a lab-extraction output value in a ProviderCallResult. */
export function wrapLabExtractionOutput(
  output: LabExtractionOutputInput,
): ProviderCallResult<LabExtractionOutputInput> {
  return { output };
}
