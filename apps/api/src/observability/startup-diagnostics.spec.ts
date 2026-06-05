import { afterEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  CLERK_JWKS_URL: undefined as string | undefined,
  AI_COACH_PROVIDER: "openai" as const,
  OPENAI_API_KEY: "super-secret-key" as string | undefined,
  CORS_ORIGINS: undefined as string | undefined,
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/health_tracer",
  DOCUMENT_STORAGE_PATH: ".data/documents",
}));

vi.mock("../env.js", () => ({
  env: mockEnv,
}));

describe("startup diagnostics", () => {
  afterEach(() => {
    mockEnv.CLERK_JWKS_URL = undefined;
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = "super-secret-key";
    mockEnv.CORS_ORIGINS = undefined;
    vi.resetModules();
  });

  it("logs integration status without secret values", async () => {
    mockEnv.CLERK_JWKS_URL = "https://clerk.example.com/.well-known/jwks.json";
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.CORS_ORIGINS = "https://web.example.com";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { logStartupDiagnostics, logListening } = await import("./startup-diagnostics.js");

    logStartupDiagnostics(3000);
    logListening(3000);

    const startupPayload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    const listeningPayload = JSON.parse(String(logSpy.mock.calls[1]?.[0]));
    const serialized = JSON.stringify([startupPayload, listeningPayload]);

    expect(startupPayload).toMatchObject({
      event: "startup.diagnostics",
      port: 3000,
      integrations: {
        clerkJwks: "enabled",
        aiCoachProvider: "openai",
        openai: "enabled",
        corsOrigins: "configured",
      },
    });
    expect(listeningPayload).toMatchObject({
      event: "startup.ready",
      port: 3000,
    });
    expect(serialized).not.toContain("super-secret-key");
    expect(serialized).not.toContain("clerk.example.com");
    expect(serialized).not.toContain("postgres://");

    logSpy.mockRestore();
  });
});
