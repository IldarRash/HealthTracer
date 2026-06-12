import { afterEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  CLERK_JWKS_URL: undefined as string | undefined,
  AI_COACH_PROVIDER: "openai" as const,
  OPENAI_API_KEY: undefined as string | undefined,
  OPENAI_MODEL: "gpt-4o-mini",
  OPENAI_MODEL_ROUTER: undefined as string | undefined,
  OPENAI_MODEL_DOMAIN: undefined as string | undefined,
  OPENAI_MODEL_DECISION: undefined as string | undefined,
  CORS_ORIGINS: undefined as string | undefined,
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/health_tracer",
}));

vi.mock("../env.js", () => ({
  env: mockEnv,
}));

describe("config diagnostics", () => {
  afterEach(() => {
    mockEnv.CLERK_JWKS_URL = undefined;
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;
    mockEnv.CORS_ORIGINS = undefined;
    vi.resetModules();
  });

  it("reports integration enablement without secret values", async () => {
    mockEnv.CLERK_JWKS_URL = "https://clerk.example.com/.well-known/jwks.json";
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = "super-secret-key";
    mockEnv.CORS_ORIGINS = "https://web.example.com";

    const { getConfigDiagnostics } = await import("./config-diagnostics.js");
    const diagnostics = getConfigDiagnostics();
    const serialized = JSON.stringify(diagnostics);

    expect(diagnostics).toEqual({
      clerkJwks: "enabled",
      aiCoachProvider: "openai",
      openai: "enabled",
      openaiModels: {
        router: "gpt-4o-mini",
        domain: "gpt-4o-mini",
        decision: "gpt-4o-mini",
      },
      corsOrigins: "configured",
      documentStorage: "configured",
      databaseUrl: "configured",
    });
    expect(serialized).not.toContain("super-secret-key");
    expect(serialized).not.toContain("clerk.example.com");
  });

  it("flags missing Clerk JWKS configuration in readiness checks", async () => {
    const { getStaticReadinessChecks } = await import("./config-diagnostics.js");
    const checks = getStaticReadinessChecks();

    expect(checks).toContainEqual({
      name: "clerk_jwks",
      status: "error",
      message: "CLERK_JWKS_URL is not configured",
    });
  });

  it("flags missing OpenAI API key in readiness checks (unconditional — A2 closed)", async () => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;

    const { getStaticReadinessChecks } = await import("./config-diagnostics.js");
    const checks = getStaticReadinessChecks();

    expect(checks).toContainEqual({
      name: "openai_api_key",
      status: "error",
      message: "OPENAI_API_KEY is required for the AI coach provider",
    });
  });

  it("reports openai as misconfigured when API key is missing", async () => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;

    const { getConfigDiagnostics } = await import("./config-diagnostics.js");
    const diagnostics = getConfigDiagnostics();

    expect(diagnostics.openai).toBe("misconfigured");
    expect(diagnostics.aiCoachProvider).toBe("openai");
  });

  it("reports per-stage model overrides in openaiModels (Slice 4)", async () => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = "sk-test";
    mockEnv.OPENAI_MODEL = "gpt-4o-mini";
    mockEnv.OPENAI_MODEL_ROUTER = "gpt-4o";
    mockEnv.OPENAI_MODEL_DOMAIN = undefined;
    mockEnv.OPENAI_MODEL_DECISION = "gpt-4o";

    const { getConfigDiagnostics } = await import("./config-diagnostics.js");
    const diagnostics = getConfigDiagnostics();

    expect(diagnostics.openaiModels).toEqual({
      router: "gpt-4o",
      domain: "gpt-4o-mini",
      decision: "gpt-4o",
    });
  });

  it("falls back all stages to OPENAI_MODEL when no per-stage overrides are set", async () => {
    mockEnv.OPENAI_MODEL = "gpt-4o-mini";
    mockEnv.OPENAI_MODEL_ROUTER = undefined;
    mockEnv.OPENAI_MODEL_DOMAIN = undefined;
    mockEnv.OPENAI_MODEL_DECISION = undefined;

    const { getConfigDiagnostics } = await import("./config-diagnostics.js");
    const diagnostics = getConfigDiagnostics();

    expect(diagnostics.openaiModels).toEqual({
      router: "gpt-4o-mini",
      domain: "gpt-4o-mini",
      decision: "gpt-4o-mini",
    });
  });
});
