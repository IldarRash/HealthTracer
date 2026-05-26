import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller.js";
import type { HealthReadinessService } from "./observability/health-readiness.service.js";

describe("HealthController", () => {
  it("returns an ok health response", () => {
    const controller = new HealthController({
      check: vi.fn(),
    } as unknown as HealthReadinessService);

    expect(controller.getHealth()).toEqual({
      service: "api",
      status: "ok",
    });
  });

  it("returns readiness details and sets 503 when checks fail", async () => {
    const readiness = {
      service: "api" as const,
      status: "error" as const,
      checks: [{ name: "clerk_jwks" as const, status: "error" as const }],
    };
    const readinessService = {
      check: vi.fn(async () => readiness),
    } as unknown as HealthReadinessService;
    const controller = new HealthController(readinessService);
    const response = {
      status: vi.fn(),
    };

    const result = await controller.getReadiness(response as never);

    expect(result).toEqual(readiness);
    expect(response.status).toHaveBeenCalledWith(503);
  });
});
