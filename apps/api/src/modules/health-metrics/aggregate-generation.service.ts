import { healthMetricSnapshots } from "@health/db";
import type { HealthMetricType } from "@health/types";
import { Injectable } from "@nestjs/common";
import {
  defaultPeriodTypeForMetric,
  endOfUtcDay,
  endOfUtcWeek,
  startOfUtcDay,
  startOfUtcWeek,
  toUtcDateKey,
} from "./metric-dedupe.js";
import { HealthMetricsRepository } from "./health-metrics.repository.js";

type SnapshotRow = typeof healthMetricSnapshots.$inferSelect;

@Injectable()
export class AggregateGenerationService {
  constructor(private readonly healthMetricsRepository: HealthMetricsRepository) {}

  async refreshForMetricTypes(
    userId: string,
    consentId: string,
    metricTypes: HealthMetricType[],
    anchorDate = new Date(),
  ) {
    const refreshed = [];

    for (const metricType of metricTypes) {
      const periodType = defaultPeriodTypeForMetric(metricType);
      const periodStart =
        periodType === "weekly" ? startOfUtcWeek(anchorDate) : startOfUtcDay(anchorDate);
      const periodEnd =
        periodType === "weekly" ? endOfUtcWeek(anchorDate) : endOfUtcDay(anchorDate);

      const snapshots = await this.healthMetricsRepository.listSnapshotsForPeriod(
        userId,
        metricType,
        periodStart,
        periodEnd,
      );

      const aggregatePayload = buildAggregatePayload(metricType, snapshots, anchorDate);

      if (!aggregatePayload) {
        continue;
      }

      const aggregate = await this.healthMetricsRepository.upsertAggregate({
        userId,
        consentId,
        metricType,
        periodType,
        periodStart: toUtcDateKey(periodStart),
        periodEnd: toUtcDateKey(periodEnd),
        aggregatePayload,
        sourceMetricTypes: [metricType],
      });

      refreshed.push(aggregate);
    }

    return refreshed;
  }
}

function buildAggregatePayload(
  metricType: HealthMetricType,
  snapshots: SnapshotRow[],
  anchorDate: Date,
): Record<string, unknown> | null {
  if (snapshots.length === 0) {
    return null;
  }

  switch (metricType) {
    case "steps":
      return buildStepsAggregate(snapshots, anchorDate);
    case "sleep":
      return buildSleepAggregate(snapshots, anchorDate);
    case "weight":
      return buildWeightAggregate(snapshots, anchorDate);
    case "workout":
      return buildWorkoutAggregate(snapshots);
    case "recovery_input":
      return buildRecoveryAggregate(snapshots);
    default:
      return null;
  }
}

function buildStepsAggregate(snapshots: SnapshotRow[], anchorDate: Date) {
  const totalSteps = snapshots.reduce((sum, snapshot) => {
    const count = Number(snapshot.normalizedPayload.stepCount ?? 0);
    return sum + (Number.isFinite(count) ? count : 0);
  }, 0);

  return {
    totalSteps,
    sevenDayAverageSteps: totalSteps,
    anchorDate: toUtcDateKey(anchorDate),
  };
}

function buildSleepAggregate(snapshots: SnapshotRow[], anchorDate: Date) {
  const totalDurationMinutes = snapshots.reduce((sum, snapshot) => {
    const minutes = Number(snapshot.normalizedPayload.durationMinutes ?? 0);
    return sum + (Number.isFinite(minutes) ? minutes : 0);
  }, 0);

  const latest = snapshots[0];
  const payload = latest?.normalizedPayload ?? {};

  return {
    totalDurationMinutes,
    sleepWindowStart:
      typeof payload.intervalStart === "string" ? payload.intervalStart : null,
    sleepWindowEnd: typeof payload.intervalEnd === "string" ? payload.intervalEnd : null,
    sevenDayAverageMinutes: totalDurationMinutes,
    anchorDate: toUtcDateKey(anchorDate),
  };
}

function buildWeightAggregate(snapshots: SnapshotRow[], anchorDate: Date) {
  const weights = snapshots
    .map((snapshot) => Number(snapshot.normalizedPayload.weightKg))
    .filter((value) => Number.isFinite(value));

  const latestWeightKg = weights[0] ?? null;
  const earliestWeightKg = weights.at(-1) ?? null;
  const weeklyTrendKg =
    latestWeightKg != null && earliestWeightKg != null
      ? Number((latestWeightKg - earliestWeightKg).toFixed(2))
      : null;

  return {
    latestWeightKg,
    weeklyTrendKg,
    anchorDate: toUtcDateKey(anchorDate),
  };
}

function buildWorkoutAggregate(snapshots: SnapshotRow[]) {
  const activityMix: Record<string, number> = {};
  let totalDurationMinutes = 0;

  for (const snapshot of snapshots) {
    const duration = Number(snapshot.normalizedPayload.durationMinutes ?? 0);
    totalDurationMinutes += Number.isFinite(duration) ? duration : 0;

    const activityType = String(snapshot.normalizedPayload.activityType ?? "unknown");
    activityMix[activityType] = (activityMix[activityType] ?? 0) + 1;
  }

  return {
    workoutCount: snapshots.length,
    totalDurationMinutes,
    activityMix,
  };
}

function buildRecoveryAggregate(snapshots: SnapshotRow[]) {
  const latestByType = new Map<string, SnapshotRow>();

  for (const snapshot of snapshots) {
    const inputType = String(snapshot.normalizedPayload.inputType ?? "unknown");
    if (!latestByType.has(inputType)) {
      latestByType.set(inputType, snapshot);
    }
  }

  return {
    inputs: [...latestByType.values()].map((snapshot) => ({
      inputType: snapshot.normalizedPayload.inputType,
      latestValue: snapshot.normalizedPayload.value,
      unit: snapshot.normalizedPayload.unit,
      observedAt: snapshot.observedAt.toISOString(),
    })),
  };
}
