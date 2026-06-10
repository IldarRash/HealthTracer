import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCoachAiProvider,
  OpenAiCoachProviderMissingKeyError,
  resolveAiCoachProviderMode,
} from "./coach-provider.factory.js";

// ---------------------------------------------------------------------------
// Minimal valid OpenAI responses for request-body inspection
// ---------------------------------------------------------------------------

function makeOpenAiRouterResponse() {
  const body = {
    choices: [{
      message: {
        content: JSON.stringify({
          selectedDomains: [],
          contextNeeds: [],
          directCommand: null,
          safetyFlags: [],
          confidence: 0.8,
        }),
      },
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const mockEnv = vi.hoisted(() => ({
  AI_COACH_PROVIDER: "openai" as const,
  OPENAI_API_KEY: undefined as string | undefined,
  OPENAI_MODEL: "gpt-4o-mini",
  OPENAI_MODEL_ROUTER: undefined as string | undefined,
  OPENAI_MODEL_DOMAIN: undefined as string | undefined,
  OPENAI_MODEL_DECISION: undefined as string | undefined,
}));

vi.mock("../../env.js", () => ({
  env: mockEnv,
}));

describe("coach provider factory", () => {
  afterEach(() => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;
    mockEnv.OPENAI_MODEL = "gpt-4o-mini";
    mockEnv.OPENAI_MODEL_ROUTER = undefined;
    mockEnv.OPENAI_MODEL_DOMAIN = undefined;
    mockEnv.OPENAI_MODEL_DECISION = undefined;
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

  it("uses OPENAI_MODEL as fallback when per-stage overrides are absent", () => {
    mockEnv.OPENAI_API_KEY = "sk-test-key";
    mockEnv.OPENAI_MODEL = "gpt-4o-mini";
    mockEnv.OPENAI_MODEL_ROUTER = undefined;
    mockEnv.OPENAI_MODEL_DOMAIN = undefined;
    mockEnv.OPENAI_MODEL_DECISION = undefined;

    // Should not throw — provider resolves all stages to OPENAI_MODEL
    expect(() => createCoachAiProvider()).not.toThrow();
  });

  it("prefers OPENAI_MODEL_ROUTER over OPENAI_MODEL for the router stage — verified via request body", async () => {
    mockEnv.OPENAI_API_KEY = "sk-test-key";
    mockEnv.OPENAI_MODEL = "gpt-4o-mini";
    mockEnv.OPENAI_MODEL_ROUTER = "gpt-4o";

    const provider = createCoachAiProvider();

    let capturedBody: Record<string, unknown> = {};
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string ?? "{}") as Record<string, unknown>;
      return makeOpenAiRouterResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    await provider.generateRouterDecision({
      originalText: "test",
      normalizedText: "test",
      preprocessor: {},
      attachmentHints: [],
      recentMessageHints: [],
      availableDomains: [],
      safetyGuardrails: [],
      detectedLanguage: "en",
    } as never);

    // Router stage must send the router override model.
    expect(capturedBody["model"]).toBe("gpt-4o");

    vi.restoreAllMocks();
  });

  it("resolves all three stage overrides independently — router stage verified via request body", async () => {
    mockEnv.OPENAI_API_KEY = "sk-test-key";
    mockEnv.OPENAI_MODEL = "gpt-4o-mini";
    mockEnv.OPENAI_MODEL_ROUTER = "gpt-4o";
    mockEnv.OPENAI_MODEL_DOMAIN = "gpt-3.5-turbo";
    mockEnv.OPENAI_MODEL_DECISION = "gpt-4o";

    const provider = createCoachAiProvider();

    let capturedBody: Record<string, unknown> = {};
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string ?? "{}") as Record<string, unknown>;
      return makeOpenAiRouterResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    await provider.generateRouterDecision({
      originalText: "test",
      normalizedText: "test",
      preprocessor: {},
      attachmentHints: [],
      recentMessageHints: [],
      availableDomains: [],
      safetyGuardrails: [],
      detectedLanguage: "en",
    } as never);

    // Router stage sends the router override.
    expect(capturedBody["model"]).toBe("gpt-4o");

    vi.restoreAllMocks();
  });
});
