import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCoachAiProvider,
  OpenAiCoachProviderMissingKeyError,
  resolveAiCoachProviderMode,
} from "./coach-provider.factory.js";

const mockEnv = vi.hoisted(() => ({
  AI_COACH_PROVIDER: "openai" as const,
  OPENAI_API_KEY: undefined as string | undefined,
  OPENAI_MODEL: "gpt-4o-mini",
}));

vi.mock("../../env.js", () => ({
  env: mockEnv,
}));

describe("coach provider factory", () => {
  afterEach(() => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;
  });

  it("resolves the configured provider mode from env", () => {
    mockEnv.AI_COACH_PROVIDER = "openai";

    expect(resolveAiCoachProviderMode()).toBe("openai");
  });

  it("throws when openai is selected without an API key (fail-closed, A2 closed)", () => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;

    expect(() => createCoachAiProvider()).toThrow(OpenAiCoachProviderMissingKeyError);
    expect(() => createCoachAiProvider()).toThrow(/OPENAI_API_KEY/);
  });

  it("returns the OpenAI provider when openai is selected with an API key", () => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = "sk-test-key";

    const provider = createCoachAiProvider();

    expect(provider.constructor.name).toBe("OpenAiCoachProvider");
  });
});
