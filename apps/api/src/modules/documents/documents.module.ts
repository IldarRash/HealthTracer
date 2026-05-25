import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { HealthMetricsModule } from "../health-metrics/health-metrics.module.js";
import { UsersModule } from "../users/users.module.js";
import { CorrelationsService } from "./correlations.service.js";
import { DocumentSignalsRepository } from "./document-signals.repository.js";
import { DocumentSignalsService } from "./document-signals.service.js";
import { DocumentsController } from "./documents.controller.js";
import { DocumentsRepository } from "./documents.repository.js";
import { DocumentsService } from "./documents.service.js";

@Module({
  imports: [DatabaseModule, UsersModule, HealthMetricsModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsRepository,
    DocumentSignalsRepository,
    DocumentSignalsService,
    CorrelationsService,
    DocumentsService,
  ],
  exports: [
    DocumentsService,
    DocumentSignalsRepository,
    DocumentSignalsService,
    CorrelationsService,
  ],
})
export class DocumentsModule {}
