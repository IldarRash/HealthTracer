import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCoachAiProvider,
  OpenAiCoachProviderMissingKeyError,
  resolveAiCoachProviderMode,
} from "./coach-provider.factory.js";

const mockEnv = vi.hoisted(() => ({
  AI_COACH_PROVIDER: "stub" as "stub" | "openai",
  OPENAI_API_KEY: undefined as string | undefined,
  OPENAI_MODEL: "gpt-4o-mini",
}));

vi.mock("../../env.js", () => ({
  env: mockEnv,
}));

describe("coach provider factory", () => {
  afterEach(() => {
    mockEnv.AI_COACH_PROVIDER = "stub";
    mockEnv.OPENAI_API_KEY = undefined;
  });

  it("resolves the configured provider mode from env", () => {
    mockEnv.AI_COACH_PROVIDER = "openai";

    expect(resolveAiCoachProviderMode()).toBe("openai");
  });

  it("returns the stub provider by default", async () => {
    const provider = createCoachAiProvider();

    expect(provider.constructor.name).toBe("StubCoachAiProvider");
    await expect(provider.generateCoachResponse({
      userMessage: "Thanks!",
      recentMessages: [],
      coachingContext: {},
    })).resolves.toMatchObject({
      reply: expect.any(String),
    });
  });

  it("throws a clear error when openai is selected without an API key", () => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;

    expect(() => createCoachAiProvider()).toThrow(OpenAiCoachProviderMissingKeyError);
    expect(() => createCoachAiProvider()).toThrow(/OPENAI_API_KEY is not configured/);
  });

  it("returns the OpenAI provider when openai is selected with an API key", () => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = "sk-test-key";

    const provider = createCoachAiProvider();

    expect(provider.constructor.name).toBe("OpenAiCoachProvider");
  });
});
