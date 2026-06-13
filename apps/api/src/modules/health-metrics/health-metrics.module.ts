import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersModule } from "../users/users.module.js";
import { DeviceConnectionsModule } from "../device-connections/device-connections.module.js";
import { AggregateGenerationService } from "./aggregate-generation.service.js";
import { HealthMetricsController } from "./health-metrics.controller.js";
import { HealthMetricsRepository } from "./health-metrics.repository.js";
import { HealthMetricsService } from "./health-metrics.service.js";
import { MetricsAiContextService } from "./metrics-ai-context.service.js";
import { VitalsReadService } from "./vitals-read.service.js";

@Module({
  imports: [DatabaseModule, UsersModule, DeviceConnectionsModule],
  controllers: [HealthMetricsController],
  providers: [
    HealthMetricsRepository,
    AggregateGenerationService,
    MetricsAiContextService,
    HealthMetricsService,
    VitalsReadService,
  ],
  exports: [HealthMetricsService, MetricsAiContextService, HealthMetricsRepository],
})
export class HealthMetricsModule {}
