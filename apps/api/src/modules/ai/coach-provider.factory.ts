import type { CoachAiProvider } from "@health/ai";
import type { AiCoachProviderMode, CompiledPromptTemplates } from "@health/types";
import { env } from "../../env.js";
import {
  createOpenAiCoachProvider,
  OpenAiCoachProviderMissingKeyError,
} from "./openai-coach-provider.js";

export function resolveAiCoachProviderMode(): AiCoachProviderMode {
  return env.AI_COACH_PROVIDER;
}

export function createCoachAiProvider(
  promptTemplates?: CompiledPromptTemplates,
): CoachAiProvider {
  if (env.AI_COACH_PROVIDER === "openai") {
    return createOpenAiCoachProvider(
      env.OPENAI_API_KEY,
      env.OPENAI_MODEL,
      {
        router: env.OPENAI_MODEL_ROUTER,
        domain: env.OPENAI_MODEL_DOMAIN,
        decision: env.OPENAI_MODEL_DECISION,
      },
      promptTemplates,
    );
  }

  throw new Error("AI_COACH_PROVIDER must be 'openai'; no stub provider exists.");
}

export { OpenAiCoachProviderMissingKeyError };
