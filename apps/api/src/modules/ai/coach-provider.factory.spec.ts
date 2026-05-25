import { afterEach, describe, expect, it, vi } from "vitest";

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
    vi.resetModules();
  });

  it("resolves the configured provider mode from env", async () => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    const { resolveAiCoachProviderMode } = await import("./coach-provider.factory.js");

    expect(resolveAiCoachProviderMode()).toBe("openai");
  });

  it("returns the stub provider by default", async () => {
    const { createCoachAiProvider } = await import("./coach-provider.factory.js");

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

  it("throws a clear error when openai is selected without an API key", async () => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;

    const { createCoachAiProvider, OpenAiCoachProviderMissingKeyError } = await import(
      "./coach-provider.factory.js"
    );

    expect(() => createCoachAiProvider()).toThrow(OpenAiCoachProviderMissingKeyError);
    expect(() => createCoachAiProvider()).toThrow(/OPENAI_API_KEY is not configured/);
  });

  it("returns the OpenAI provider when openai is selected with an API key", async () => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = "sk-test-key";

    const { createCoachAiProvider } = await import("./coach-provider.factory.js");

    const provider = createCoachAiProvider();

    expect(provider.constructor.name).toBe("OpenAiCoachProvider");
  });
});
