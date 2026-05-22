import { healthMetricAggregates, healthMetricSnapshots } from "@health/db";
import type { HealthMetricAggregate, HealthMetricSnapshot } from "@health/types";

type HealthMetricSnapshotRow = typeof healthMetricSnapshots.$inferSelect;
type HealthMetricAggregateRow = typeof healthMetricAggregates.$inferSelect;

export function toHealthMetricSnapshot(row: HealthMetricSnapshotRow): HealthMetricSnapshot {
  return {
    id: row.id,
    userId: row.userId,
    consentId: row.consentId,
    deviceConnectionId: row.deviceConnectionId,
    metricType: row.metricType,
    provider: row.provider,
    sourceId: row.sourceId,
    dedupeKey: row.dedupeKey,
    observedAt: row.observedAt.toISOString(),
    observedEndAt: row.observedEndAt?.toISOString() ?? null,
    unit: row.unit,
    normalizedPayload: row.normalizedPayload,
    sourceDeviceLabel: row.sourceDeviceLabel,
    ingestedAt: row.ingestedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toHealthMetricAggregate(row: HealthMetricAggregateRow): HealthMetricAggregate {
  return {
    id: row.id,
    userId: row.userId,
    consentId: row.consentId,
    metricType: row.metricType,
    periodType: row.periodType,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    aggregatePayload: row.aggregatePayload,
    sourceMetricTypes: row.sourceMetricTypes,
    calculatedAt: row.calculatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
