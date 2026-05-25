import { StubCoachAiProvider, type CoachAiProvider } from "@health/ai";
import type { AiCoachProviderMode } from "@health/types";
import { env } from "../../env.js";
import {
  createOpenAiCoachProvider,
  OpenAiCoachProviderMissingKeyError,
} from "./openai-coach-provider.js";

export function resolveAiCoachProviderMode(): AiCoachProviderMode {
  return env.AI_COACH_PROVIDER;
}

export function createCoachAiProvider(): CoachAiProvider {
  if (env.AI_COACH_PROVIDER === "openai") {
    return createOpenAiCoachProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
  }

  return new StubCoachAiProvider();
}

export { OpenAiCoachProviderMissingKeyError };
