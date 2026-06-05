import { afterEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  CLERK_JWKS_URL: undefined as string | undefined,
  AI_COACH_PROVIDER: "openai" as const,
  OPENAI_API_KEY: undefined as string | undefined,
  CORS_ORIGINS: undefined as string | undefined,
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/health_tracer",
  DOCUMENT_STORAGE_PATH: ".data/documents",
}));

vi.mock("../env.js", () => ({
  env: mockEnv,
}));

describe("HealthReadinessService", () => {
  afterEach(() => {
    mockEnv.CLERK_JWKS_URL = undefined;
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;
    vi.resetModules();
  });

  it("returns not ready when database connectivity fails", async () => {
    const postgresClient = Object.assign(
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
      { options: {} },
    );

    const { HealthReadinessService } = await import("./health-readiness.service.js");
    const service = new HealthReadinessService(postgresClient as never);
    const readiness = await service.check();

    expect(readiness.status).toBe("error");
    expect(readiness.checks).toContainEqual({
      name: "database_connectivity",
      status: "error",
      message: "Database connection failed",
    });
  });

  it("returns not ready when clerk JWKS is missing", async () => {
    const postgresClient = Object.assign(
      vi.fn(async () => [{ "?column?": 1 }]),
      { options: {} },
    );

    const { HealthReadinessService } = await import("./health-readiness.service.js");
    const service = new HealthReadinessService(postgresClient as never);
    const readiness = await service.check();

    expect(readiness.status).toBe("error");
    expect(readiness.checks).toContainEqual({
      name: "clerk_jwks",
      status: "error",
      message: "CLERK_JWKS_URL is not configured",
    });
  });

  it("returns not ready when openai API key is missing", async () => {
    mockEnv.CLERK_JWKS_URL = "https://clerk.example.com/.well-known/jwks.json";
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = undefined;

    const postgresClient = Object.assign(
      vi.fn(async () => [{ "?column?": 1 }]),
      { options: {} },
    );

    const { HealthReadinessService } = await import("./health-readiness.service.js");
    const service = new HealthReadinessService(postgresClient as never);
    const readiness = await service.check();

    expect(readiness.status).toBe("error");
    expect(readiness.checks).toContainEqual({
      name: "openai_api_key",
      status: "error",
      message: "OPENAI_API_KEY is required for the AI coach provider",
    });
  });

  it("returns ready when static checks and database connectivity pass", async () => {
    mockEnv.CLERK_JWKS_URL = "https://clerk.example.com/.well-known/jwks.json";
    mockEnv.AI_COACH_PROVIDER = "openai";
    mockEnv.OPENAI_API_KEY = "sk-test-key";

    const postgresClient = Object.assign(
      vi.fn(async () => [{ "?column?": 1 }]),
      { options: {} },
    );

    const { HealthReadinessService } = await import("./health-readiness.service.js");
    const service = new HealthReadinessService(postgresClient as never);
    const readiness = await service.check();

    expect(readiness.status).toBe("ok");
    expect(readiness.checks).toContainEqual({
      name: "database_connectivity",
      status: "ok",
    });
  });
});
