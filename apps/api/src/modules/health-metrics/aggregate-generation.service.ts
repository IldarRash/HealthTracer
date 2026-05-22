import { healthMetricSnapshots } from "@health/db";
import type { HealthMetricType } from "@health/types";
import { Injectable } from "@nestjs/common";
import {
  collectObservationPeriods,
  endOfUtcDay,
  startOfUtcDay,
  toUtcDateKey,
  type MetricObservationRecord,
} from "./metric-dedupe.js";
import { HealthMetricsRepository } from "./health-metrics.repository.js";

type SnapshotRow = typeof healthMetricSnapshots.$inferSelect;

@Injectable()
export class AggregateGenerationService {
  constructor(private readonly healthMetricsRepository: HealthMetricsRepository) {}

  async refreshForMetricTypes(
    userId: string,
    consentId: string,
    observationRecords: MetricObservationRecord[],
  ) {
    const periods = collectObservationPeriods(observationRecords);
    const refreshed = [];

    for (const period of periods) {
      const snapshots = await this.healthMetricsRepository.listSnapshotsForPeriod(
        userId,
        period.metricType,
        consentId,
        period.periodStart,
        period.periodEnd,
      );

      const aggregatePayload = await buildAggregatePayload(
        this.healthMetricsRepository,
        userId,
        consentId,
        period.metricType,
        snapshots,
        period.periodEnd,
        period.anchorDate,
      );

      if (!aggregatePayload) {
        continue;
      }

      const aggregate = await this.healthMetricsRepository.upsertAggregate({
        userId,
        consentId,
        metricType: period.metricType,
        periodType: period.periodType,
        periodStart: toUtcDateKey(period.periodStart),
        periodEnd: toUtcDateKey(period.periodEnd),
        aggregatePayload,
        sourceMetricTypes: [period.metricType],
      });

      refreshed.push(aggregate);
    }

    return refreshed;
  }
}

async function buildAggregatePayload(
  repository: HealthMetricsRepository,
  userId: string,
  consentId: string,
  metricType: HealthMetricType,
  snapshots: SnapshotRow[],
  periodEnd: Date,
  anchorDate: Date,
): Promise<Record<string, unknown> | null> {
  if (snapshots.length === 0) {
    return null;
  }

  switch (metricType) {
    case "steps":
      return buildStepsAggregate(
        repository,
        userId,
        consentId,
        snapshots,
        periodEnd,
        anchorDate,
      );
    case "sleep":
      return buildSleepAggregate(
        repository,
        userId,
        consentId,
        snapshots,
        periodEnd,
        anchorDate,
      );
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

async function buildStepsAggregate(
  repository: HealthMetricsRepository,
  userId: string,
  consentId: string,
  snapshots: SnapshotRow[],
  periodEnd: Date,
  anchorDate: Date,
) {
  const totalSteps = snapshots.reduce((sum, snapshot) => {
    const count = Number(snapshot.normalizedPayload.stepCount ?? 0);
    return sum + (Number.isFinite(count) ? count : 0);
  }, 0);

  const sevenDayAverageSteps = await computeSevenDayAverage(
    repository,
    userId,
    consentId,
    "steps",
    periodEnd,
    (snapshot) => Number(snapshot.normalizedPayload.stepCount ?? 0),
  );

  return {
    totalSteps,
    sevenDayAverageSteps,
    anchorDate: toUtcDateKey(anchorDate),
  };
}

async function buildSleepAggregate(
  repository: HealthMetricsRepository,
  userId: string,
  consentId: string,
  snapshots: SnapshotRow[],
  periodEnd: Date,
  anchorDate: Date,
) {
  const totalDurationMinutes = snapshots.reduce((sum, snapshot) => {
    const minutes = Number(snapshot.normalizedPayload.durationMinutes ?? 0);
    return sum + (Number.isFinite(minutes) ? minutes : 0);
  }, 0);

  const latest = snapshots[0];
  const payload = latest?.normalizedPayload ?? {};

  const sevenDayAverageMinutes = await computeSevenDayAverage(
    repository,
    userId,
    consentId,
    "sleep",
    periodEnd,
    (snapshot) => Number(snapshot.normalizedPayload.durationMinutes ?? 0),
  );

  return {
    totalDurationMinutes,
    sleepWindowStart:
      typeof payload.intervalStart === "string" ? payload.intervalStart : null,
    sleepWindowEnd: typeof payload.intervalEnd === "string" ? payload.intervalEnd : null,
    sevenDayAverageMinutes,
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

async function computeSevenDayAverage(
  repository: HealthMetricsRepository,
  userId: string,
  consentId: string,
  metricType: HealthMetricType,
  periodEnd: Date,
  readValue: (snapshot: SnapshotRow) => number,
): Promise<number> {
  const windowEnd = endOfUtcDay(periodEnd);
  const windowStart = startOfUtcDay(
    new Date(windowEnd.getTime() - 6 * 24 * 60 * 60 * 1000),
  );
  const snapshots = await repository.listSnapshotsForPeriod(
    userId,
    metricType,
    consentId,
    windowStart,
    windowEnd,
  );

  const dailyTotals = new Map<string, number>();

  for (const snapshot of snapshots) {
    const value = readValue(snapshot);
    if (!Number.isFinite(value)) {
      continue;
    }

    const dayKey = toUtcDateKey(snapshot.observedAt);
    dailyTotals.set(dayKey, (dailyTotals.get(dayKey) ?? 0) + value);
  }

  if (dailyTotals.size === 0) {
    return 0;
  }

  const total = [...dailyTotals.values()].reduce((sum, value) => sum + value, 0);
  return Number((total / dailyTotals.size).toFixed(2));
}
