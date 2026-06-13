import {
  listHealthMetricAggregatesQuerySchema,
  listHealthMetricSnapshotsQuerySchema,
  syncHealthMetricsSchema,
} from "@health/types";
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { ClerkAuthGuard } from "../../auth.guard.js";
import { parseBody, parseQuery } from "../../common/zod.js";
import { CurrentAuth } from "../../current-auth.decorator.js";
import { HealthMetricsService } from "./health-metrics.service.js";
import { VitalsReadService } from "./vitals-read.service.js";

@Controller("health-metrics")
@UseGuards(ClerkAuthGuard)
export class HealthMetricsController {
  constructor(
    private readonly healthMetricsService: HealthMetricsService,
    private readonly vitalsReadService: VitalsReadService,
  ) {}

  @Get("snapshots")
  listSnapshots(@CurrentAuth() auth: ClerkAuthContext, @Query() query: unknown) {
    return this.healthMetricsService.listSnapshots(
      auth,
      parseQuery(listHealthMetricSnapshotsQuerySchema, query),
    );
  }

  @Get("aggregates")
  listAggregates(@CurrentAuth() auth: ClerkAuthContext, @Query() query: unknown) {
    return this.healthMetricsService.listAggregates(
      auth,
      parseQuery(listHealthMetricAggregatesQuerySchema, query),
    );
  }

  @Post("sync")
  syncMetrics(@CurrentAuth() auth: ClerkAuthContext, @Body() body: unknown) {
    return this.healthMetricsService.syncMetrics(
      auth,
      parseBody(syncHealthMetricsSchema, body),
    );
  }

  @Get("ai-context-preview")
  previewAiContext(@CurrentAuth() auth: ClerkAuthContext) {
    return this.healthMetricsService.previewAiContext(auth);
  }

  @Get("sleep")
  getSleepOverview(@CurrentAuth() auth: ClerkAuthContext) {
    return this.vitalsReadService.getSleepOverview(auth);
  }

  @Get("pulse")
  getPulseOverview(@CurrentAuth() auth: ClerkAuthContext) {
    return this.vitalsReadService.getPulseOverview(auth);
  }

  @Get("pulse/workouts/:id")
  getWorkoutHeartRateDetail(
    @CurrentAuth() auth: ClerkAuthContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.vitalsReadService.getWorkoutHeartRateDetail(auth, id);
  }
}
