import { StubCoachAiProvider, type CoachAiProvider } from "@health/ai";
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
    return createOpenAiCoachProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL, promptTemplates);
  }

  return new StubCoachAiProvider();
}

export { OpenAiCoachProviderMissingKeyError };
