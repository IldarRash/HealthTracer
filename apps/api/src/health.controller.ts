import { Controller, Get } from "@nestjs/common";
import type { HealthResponse } from "@health/types";

@Controller("health")
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return {
      service: "api",
      status: "ok",
    };
  }
}
