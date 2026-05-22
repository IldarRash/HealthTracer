import { healthMetricAggregates, healthMetricSnapshots } from "@health/db";
import type { AiMetricsContextSummary, DeviceProvider, HealthMetricType } from "@health/types";
import { Injectable } from "@nestjs/common";
import { DeviceConnectionsRepository } from "../device-connections/device-connections.repository.js";
import { isConsentActive } from "../device-connections/device-connection.mapper.js";
import { HealthMetricsRepository } from "./health-metrics.repository.js";

type AggregateRow = typeof healthMetricAggregates.$inferSelect;
type SnapshotRow = typeof healthMetricSnapshots.$inferSelect;

const AI_SAFE_METRIC_TYPES = new Set<HealthMetricType>([
  "steps",
  "sleep",
  "weight",
  "workout",
  "recovery_input",
]);

const SNAPSHOT_EXCLUDED_PAYLOAD_KEYS = new Set([
  "stageSummary",
  "rawSamples",
  "heartRateSeries",
  "providerPayload",
]);

@Injectable()
export class MetricsAiContextService {
  constructor(
    private readonly deviceConnectionsRepository: DeviceConnectionsRepository,
    private readonly healthMetricsRepository: HealthMetricsRepository,
  ) {}

  async buildSummaryForUser(userId: string): Promise<AiMetricsContextSummary> {
    const consents = await this.deviceConnectionsRepository.listConsentsByUserId(userId);
    const activeConsentIds = consents
      .filter((consent) => isConsentActive(consent) && consent.allowAiContext)
      .map((consent) => consent.id);

    const [aggregates, snapshots] = await Promise.all([
      this.healthMetricsRepository.listActiveConsentAggregates(userId, activeConsentIds),
      this.healthMetricsRepository.listRecentActiveConsentSnapshots(userId, activeConsentIds, 5),
    ]);

    const consentProviderById = new Map(
      consents.map((consent) => [consent.id, consent.provider as DeviceProvider]),
    );

    const items = [
      ...aggregates
        .filter((aggregate) => AI_SAFE_METRIC_TYPES.has(aggregate.metricType))
        .map((aggregate) =>
          toAggregateSummaryItem(
            aggregate,
            consentProviderById.get(aggregate.consentId) ?? "wearable",
          ),
        ),
      ...snapshots
        .filter((snapshot) => AI_SAFE_METRIC_TYPES.has(snapshot.metricType))
        .map((snapshot) => toSnapshotSummaryItem(snapshot)),
    ];

    return {
      items: items.slice(0, 20),
      generatedAt: new Date().toISOString(),
    };
  }

  sanitizeSnapshotPayload(payload: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (!SNAPSHOT_EXCLUDED_PAYLOAD_KEYS.has(key)) {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

function toAggregateSummaryItem(aggregate: AggregateRow, sourceProvider: DeviceProvider) {
  return {
    metricType: aggregate.metricType,
    label: `${aggregate.metricType} ${aggregate.periodType} summary`,
    summary: summarizeAggregatePayload(aggregate.metricType, aggregate.aggregatePayload),
    periodStart: aggregate.periodStart,
    periodEnd: aggregate.periodEnd,
    freshness: aggregate.calculatedAt.toISOString(),
    sourceProvider,
  };
}

function toSnapshotSummaryItem(snapshot: SnapshotRow) {
  return {
    metricType: snapshot.metricType,
    label: `Recent ${snapshot.metricType} snapshot`,
    summary: summarizeSnapshotPayload(snapshot.metricType, snapshot.normalizedPayload),
    periodStart: snapshot.observedAt.toISOString().slice(0, 10),
    periodEnd: (snapshot.observedEndAt ?? snapshot.observedAt).toISOString().slice(0, 10),
    freshness: snapshot.ingestedAt.toISOString(),
    sourceProvider: snapshot.provider,
  };
}

function summarizeAggregatePayload(
  metricType: HealthMetricType,
  payload: Record<string, unknown>,
): string {
  switch (metricType) {
    case "steps":
      return `Daily steps total ${payload.totalSteps ?? 0}.`;
    case "sleep":
      return `Sleep duration ${payload.totalDurationMinutes ?? 0} minutes.`;
    case "weight":
      return payload.latestWeightKg != null
        ? `Latest weight ${payload.latestWeightKg} kg.`
        : "No recent weight aggregate.";
    case "workout":
      return `${payload.workoutCount ?? 0} workouts, ${payload.totalDurationMinutes ?? 0} total minutes.`;
    case "recovery_input":
      return "Recent recovery input summary available.";
    default:
      return "Synced wellness metric summary.";
  }
}

function summarizeSnapshotPayload(
  metricType: HealthMetricType,
  payload: Record<string, unknown>,
): string {
  switch (metricType) {
    case "steps":
      return `Steps count ${payload.stepCount ?? 0}.`;
    case "sleep":
      return `Sleep duration ${payload.durationMinutes ?? 0} minutes.`;
    case "weight":
      return `Weight ${payload.weightKg ?? "unknown"} kg.`;
    case "workout":
      return `${payload.activityType ?? "Workout"} for ${payload.durationMinutes ?? 0} minutes.`;
    case "recovery_input":
      return `${payload.inputType ?? "Recovery"} input recorded.`;
    default:
      return "Recent synced wellness snapshot.";
  }
}
