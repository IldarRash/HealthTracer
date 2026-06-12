import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { DeviceConnectionsModule } from "../device-connections/device-connections.module.js";
import { HealthMetricsModule } from "../health-metrics/health-metrics.module.js";
import { TodayModule } from "../today/today.module.js";
import { UsersModule } from "../users/users.module.js";
import { WorkoutsModule } from "../workouts/workouts.module.js";
import { RecoveryAiContextService } from "./recovery-ai-context.service.js";
import { RecoveryCheckInsRepository } from "./recovery-check-ins.repository.js";
import { RecoveryContextRepository } from "./recovery-context.repository.js";
import { RecoveryContextService } from "./recovery-context.service.js";
import { RecoveryController } from "./recovery.controller.js";
import { RecoverySignalCollectorService } from "./recovery-signal-collector.service.js";

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    TodayModule,
    WorkoutsModule,
    DeviceConnectionsModule,
    HealthMetricsModule,
  ],
  controllers: [RecoveryController],
  providers: [
    RecoveryCheckInsRepository,
    RecoveryContextRepository,
    RecoverySignalCollectorService,
    RecoveryContextService,
    RecoveryAiContextService,
  ],
  exports: [RecoveryContextService, RecoveryAiContextService, RecoveryCheckInsRepository],
})
export class RecoveryModule {}
