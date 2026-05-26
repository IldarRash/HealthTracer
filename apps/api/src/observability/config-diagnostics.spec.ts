import { afterEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  CLERK_JWKS_URL: undefined as string | undefined,
  AI_COACH_PROVIDER: "stub" as "stub" | "openai",
  OPENAI_API_KEY: undefined as string | undefined,
  CORS_ORIGINS: undefined as string | undefined,
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/health_tracer",
  DOCUMENT_STORAGE_PATH: ".data/documents",
}));

vi.mock("../env.js", () => ({
  env: mockEnv,
}));

describe("config diagnostics", () => {
  afterEach(() => {
    mockEnv.CLERK_JWKS_URL = undefined;
    mockEnv.AI_COACH_PROVIDER = "stub";
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

  it("flags missing OpenAI configuration when openai provider is selected", async () => {
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;

    const { getStaticReadinessChecks } = await import("./config-diagnostics.js");
    const checks = getStaticReadinessChecks();

    expect(checks).toContainEqual({
      name: "openai_api_key",
      status: "error",
      message: "OPENAI_API_KEY is required when AI_COACH_PROVIDER=openai",
    });
  });
});
