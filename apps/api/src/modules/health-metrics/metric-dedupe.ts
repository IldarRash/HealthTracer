import type { DeviceProvider, HealthMetricType, ProviderMetricRecord } from "@health/types";

export function buildMetricDedupeKey(
  provider: DeviceProvider,
  record: ProviderMetricRecord,
): string {
  if (record.sourceId) {
    return `${provider}:${record.metricType}:${record.sourceId}`;
  }

  const end = record.observedEndAt ?? record.observedAt;
  return `${provider}:${record.metricType}:${record.observedAt}:${end}`;
}

export function toUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUtcDay(date: Date): Date {
  const start = startOfUtcDay(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  const weekday = day.getUTCDay();
  const diff = weekday === 0 ? 6 : weekday - 1;
  return new Date(day.getTime() - diff * 24 * 60 * 60 * 1000);
}

export function endOfUtcWeek(date: Date): Date {
  const start = startOfUtcWeek(date);
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
}

export function defaultPeriodTypeForMetric(metricType: HealthMetricType): "daily" | "weekly" {
  return metricType === "workout" ? "weekly" : "daily";
}
