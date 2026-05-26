import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module.js";
import { GlobalExceptionFilter } from "./global-exception.filter.js";
import { HealthReadinessService } from "./health-readiness.service.js";
import { RequestLoggingInterceptor } from "./request-logging.interceptor.js";

@Module({
  imports: [DatabaseModule],
  providers: [
    HealthReadinessService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
  exports: [HealthReadinessService],
})
export class ObservabilityModule {}
