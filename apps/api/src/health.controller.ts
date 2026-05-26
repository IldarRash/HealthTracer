import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import type { HealthResponse } from "@health/types";
import type { HttpResponse } from "./observability/http.types.js";
import { HealthReadinessService } from "./observability/health-readiness.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly readinessService: HealthReadinessService) {}

  @Get()
  getHealth(): HealthResponse {
    return {
      service: "api",
      status: "ok",
    };
  }

  @Get("ready")
  async getReadiness(@Res({ passthrough: true }) response: HttpResponse) {
    const readiness = await this.readinessService.check();

    if (readiness.status !== "ok") {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return readiness;
  }
}
