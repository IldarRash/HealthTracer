import type { LabExtractionOutputInput } from "@health/types";
import type { ProviderCallResult } from "./coach-ai-provider.js";

/**
 * Request for the dedicated lab-extraction LLM stage.
 *
 * `documentText` is ephemeral: it exists only for the duration of the provider
 * call and must NEVER be persisted or logged. Failure reasons downstream are
 * fixed strings precisely so no fragment of the document can leak into them.
 */
export interface LabExtractionRequest {
  documentText: string;
}

/**
 * Dedicated provider for extracting biomarker readings from parsed lab-report
 * text. This pipeline is OUT-OF-BAND from the chat fan-out — it is deliberately
 * a separate interface so `CoachAiProvider`'s exactly-three-methods invariant
 * stays untouched.
 *
 * The provider returns the structured output as Zod *input*
 * (`LabExtractionOutputInput`); the calling service owns the
 * `labExtractionOutputSchema` parse (typed `llm_invalid_output` failure) and
 * all per-reading catalog/plausibility/safety validation.
 */
export interface LabExtractionProvider {
  extractBiomarkers(
    request: LabExtractionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderCallResult<LabExtractionOutputInput>>;
}
