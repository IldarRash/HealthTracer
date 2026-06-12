import type { LabExtractionProvider } from "@health/ai";
import { OpenAiLabExtractionProvider } from "./openai-lab-extraction-provider.js";

export interface LabExtractionEnv {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL: string;
  OPENAI_MODEL_LAB_EXTRACTION?: string;
}

/**
 * Builds the lab-extraction provider from env values.
 *
 * Unlike the chat pipeline's coach-provider factory (which throws), a missing
 * OPENAI_API_KEY returns null here: extraction then fails with the typed
 * `llm_unavailable` failure per report instead of crashing the API at boot.
 *
 * Model resolution: OPENAI_MODEL_LAB_EXTRACTION when set, else OPENAI_MODEL.
 */
export function createLabExtractionProviderFromEnv(
  env: LabExtractionEnv,
): LabExtractionProvider | null {
  if (!env.OPENAI_API_KEY?.trim()) {
    return null;
  }

  return new OpenAiLabExtractionProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL_LAB_EXTRACTION?.trim() || env.OPENAI_MODEL,
  });
}
