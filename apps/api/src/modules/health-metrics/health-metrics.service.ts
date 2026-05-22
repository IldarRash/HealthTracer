import type {
  AiMetricsContextSummary,
  HealthMetricAggregate,
  HealthMetricSnapshot,
  ListHealthMetricAggregatesQuery,
  ListHealthMetricSnapshotsQuery,
  SyncHealthMetricsInput,
} from "@health/types";
import { metricTypeToScope } from "@health/types";
import { Injectable } from "@nestjs/common";
import type { ClerkAuthContext } from "../../auth.types.js";
import { UsersService } from "../users/users.service.js";
import { DeviceConnectionsService } from "../device-connections/device-connections.service.js";
import { DeviceConnectionsRepository } from "../device-connections/device-connections.repository.js";
import { AggregateGenerationService } from "./aggregate-generation.service.js";
import {
  toHealthMetricAggregate,
  toHealthMetricSnapshot,
} from "./health-metric.mapper.js";
import { HealthMetricsRepository } from "./health-metrics.repository.js";
import { MetricsAiContextService } from "./metrics-ai-context.service.js";

export interface SyncHealthMetricsResult {
  inserted: HealthMetricSnapshot[];
  skipped: number;
  aggregatesRefreshed: number;
}

@Injectable()
export class HealthMetricsService {
  constructor(
    private readonly healthMetricsRepository: HealthMetricsRepository,
    private readonly deviceConnectionsService: DeviceConnectionsService,
    private readonly deviceConnectionsRepository: DeviceConnectionsRepository,
    private readonly aggregateGenerationService: AggregateGenerationService,
    private readonly metricsAiContextService: MetricsAiContextService,
    private readonly usersService: UsersService,
  ) {}

  async listSnapshots(
    auth: ClerkAuthContext,
    query: ListHealthMetricSnapshotsQuery,
  ): Promise<HealthMetricSnapshot[]> {
    const user = await this.usersService.resolveFromAuth(auth);
    const snapshots = await this.healthMetricsRepository.listSnapshots(user.id, query);

    return snapshots.map(toHealthMetricSnapshot);
  }

  async listAggregates(
    auth: ClerkAuthContext,
    query: ListHealthMetricAggregatesQuery,
  ): Promise<HealthMetricAggregate[]> {
    const user = await this.usersService.resolveFromAuth(auth);
    const aggregates = await this.healthMetricsRepository.listAggregates(user.id, query);

    return aggregates.map(toHealthMetricAggregate);
  }

  async syncMetrics(
    auth: ClerkAuthContext,
    input: SyncHealthMetricsInput,
  ): Promise<SyncHealthMetricsResult> {
    const user = await this.usersService.resolveFromAuth(auth);
    const { connection, consent } =
      await this.deviceConnectionsService.requireActiveConnection(
        user.id,
        input.deviceConnectionId,
      );

    const inserted = [];
    let skipped = 0;
    const metricTypes = new Set<SyncHealthMetricsInput["records"][number]["metricType"]>();

    for (const record of input.records) {
      this.deviceConnectionsService.assertMetricScopeGranted(
        consent.grantedScopes,
        metricTypeToScope(record.metricType),
      );

      const snapshot = await this.healthMetricsRepository.insertSnapshotIfNew({
        userId: user.id,
        consentId: consent.id,
        deviceConnectionId: connection.id,
        provider: connection.provider,
        record: {
          ...record,
          normalizedPayload: this.metricsAiContextService.sanitizeSnapshotPayload(
            record.normalizedPayload,
          ),
        },
      });

      if (snapshot) {
        inserted.push(toHealthMetricSnapshot(snapshot));
        metricTypes.add(record.metricType);
      } else {
        skipped += 1;
      }
    }

    await this.deviceConnectionsRepository.touchLastSync(user.id, connection.id);

    const refreshed = await this.aggregateGenerationService.refreshForMetricTypes(
      user.id,
      consent.id,
      [...metricTypes],
    );

    return {
      inserted,
      skipped,
      aggregatesRefreshed: refreshed.length,
    };
  }

  async previewAiContext(auth: ClerkAuthContext): Promise<AiMetricsContextSummary> {
    const user = await this.usersService.resolveFromAuth(auth);
    return this.metricsAiContextService.buildSummaryForUser(user.id);
  }
}
